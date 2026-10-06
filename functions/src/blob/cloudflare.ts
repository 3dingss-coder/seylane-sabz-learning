import {
  base64ToBytes,
  base64UrlToString,
  bytesToBase64,
  hmacSha256Base64Url,
  stringToBase64Url,
  timingSafeEqualStr,
} from '../lib/crypto';
import { createPlaceholderMp4 } from '../lib/media';
import type { D1Database, D1PreparedStatement } from '../store/d1';
import { D1_SCHEMA_STATEMENTS } from '../store/d1';
import type { LocalTicket } from './local';
import type { BlobStore, UploadTicket } from './types';

export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  httpMetadata?: { contentType?: string };
}

export interface R2MultipartUploadLike {
  uploadPart(partNumber: number, value: ArrayBuffer | Uint8Array): Promise<unknown>;
  complete(parts: unknown[]): Promise<unknown>;
  abort(): Promise<void>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
  createMultipartUpload?(
    key: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2MultipartUploadLike>;
}

/** Resumable-upload staging parts always live in D1 (they are composed there, then moved). */
const STAGING_PREFIX = 'uploads/';
const isStaging = (p: string) => p.startsWith(STAGING_PREFIX);
/** R2 multipart parts must all have the same size (except the last) and be >= 5 MiB. */
const R2_PART_BYTES = 8 * 1024 * 1024;
/** Files up to this size are copied D1 -> R2 with a single put; bigger ones stream in parts. */
const SINGLE_PUT_MAX = 16 * 1024 * 1024;
/** Upper bound of R2 lookups per run (stays well under the Worker subrequest limit). */
const MAX_HEAD_CHECKS = 30;

export interface MigrateResult {
  moved: number;
  /** Files whose verified R2 copy already existed (not counted against the batch limits). */
  verified: number;
  bytes: number;
  purged: number;
  failed: number;
  remaining: number;
}

/** 256 KB raw binary per row (~341 KB base64), safely under D1's 1 MB SQL statement limit. */
const CHUNK_BYTES = 256 * 1024;

function toBufferLike(u8: Uint8Array): Buffer {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  return u8 as unknown as Buffer;
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.byteLength;
  }
  return out;
}

/**
 * Cloudflare BlobStore implementation.
 * Uses R2 if an R2Bucket binding is provided, otherwise stores blobs chunked in Cloudflare D1
 * (100% free tier without requiring a credit card on Cloudflare), with an in-memory fallback.
 */
export class CloudflareBlobStore implements BlobStore {
  private initPromise: Promise<void> | null = null;
  private mem = new Map<string, { data: Uint8Array; contentType: string }>();

  constructor(
    private readonly secret: string,
    private readonly opts: {
      db?: D1Database;
      r2?: R2BucketLike;
      now?: () => number;
      /** Delete the D1 copy once the R2 copy is verified (env R2_MIGRATE_PURGE=on). */
      purgeAfterMigrate?: boolean;
    } = {},
  ) {}

  /** True when this path is stored in R2 (everything except resumable-upload staging parts). */
  private useR2(p: string): boolean {
    return Boolean(this.opts.r2) && !isStaging(p);
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private async ensureD1(): Promise<D1Database | null> {
    const db = this.opts.db;
    if (!db) return null;
    if (!this.initPromise) {
      this.initPromise = db
        .batch(D1_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)))
        .then(() => undefined)
        .catch((err) => {
          this.initPromise = null;
          throw err;
        });
    }
    await this.initPromise;
    return db;
  }

  signTicket(t: LocalTicket): string {
    const body = stringToBase64Url(JSON.stringify(t));
    const sig = hmacSha256Base64Url(this.secret, body);
    return `${body}.${sig}`;
  }

  verifyTicket(token: string, op: LocalTicket['op']): LocalTicket | null {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = hmacSha256Base64Url(this.secret, body);
    if (!timingSafeEqualStr(sig, expected)) return null;
    try {
      const t = JSON.parse(base64UrlToString(body)) as LocalTicket;
      if (t.op !== op || t.exp < this.now()) return null;
      return t;
    } catch {
      return null;
    }
  }

  async put(p: string, data: Uint8Array, contentType: string): Promise<void> {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (this.opts.r2 && this.useR2(p)) {
      await this.opts.r2.put(p, bytes, { httpMetadata: { contentType } });
      return;
    }
    const db = await this.ensureD1();
    if (!db) {
      this.mem.set(p, { data: new Uint8Array(bytes), contentType });
      return;
    }
    const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / CHUNK_BYTES));
    const nowIso = new Date(this.now()).toISOString();
    const upsertBlob = () =>
      db
        .prepare(
          `INSERT INTO blobs (path, content_type, size, chunk_count, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (path) DO UPDATE SET
             content_type = excluded.content_type,
             size = excluded.size,
             chunk_count = excluded.chunk_count,
             updated_at = excluded.updated_at`,
        )
        .bind(p, contentType, bytes.byteLength, chunkCount, nowIso);
    if (chunkCount <= 8) {
      // Up to 2 MB: ONE atomic batch (a single database call).
      const stmts: D1PreparedStatement[] = [
        db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(p),
      ];
      for (let idx = 0; idx < chunkCount; idx++) {
        const slice = bytes.subarray(idx * CHUNK_BYTES, (idx + 1) * CHUNK_BYTES);
        stmts.push(
          db
            .prepare('INSERT INTO blob_chunks (path, idx, data) VALUES (?1, ?2, ?3)')
            .bind(p, idx, bytesToBase64(slice)),
        );
      }
      stmts.push(upsertBlob());
      await db.batch(stmts);
      return;
    }
    // Large files used to go to D1 in ONE batch (tens of MB) and failed. Now: write chunks to a
    // staging path in small batches, then swap atomically in a final batch, so a failure at any
    // point never leaves a half-written file under the real path.
    const stage = `${p}.__up-${Math.random().toString(36).slice(2, 10)}`;
    const PER_BATCH = 8;
    try {
      for (let from = 0; from < chunkCount; from += PER_BATCH) {
        const stmts: D1PreparedStatement[] = [];
        for (let idx = from; idx < Math.min(chunkCount, from + PER_BATCH); idx++) {
          const slice = bytes.subarray(idx * CHUNK_BYTES, (idx + 1) * CHUNK_BYTES);
          stmts.push(
            db
              .prepare('INSERT INTO blob_chunks (path, idx, data) VALUES (?1, ?2, ?3)')
              .bind(stage, idx, bytesToBase64(slice)),
          );
        }
        await db.batch(stmts);
      }
      await db.batch([
        db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(p),
        db.prepare('UPDATE blob_chunks SET path = ?1 WHERE path = ?2').bind(p, stage),
        db
          .prepare(
            `INSERT INTO blobs (path, content_type, size, chunk_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (path) DO UPDATE SET
               content_type = excluded.content_type,
               size = excluded.size,
               chunk_count = excluded.chunk_count,
               updated_at = excluded.updated_at`,
          )
          .bind(p, contentType, bytes.byteLength, chunkCount, nowIso),
      ]);
    } catch (e) {
      await db
        .prepare('DELETE FROM blob_chunks WHERE path = ?1')
        .bind(stage)
        .run()
        .catch(() => {});
      throw e;
    }
  }

  async createUploadUrl(p: string, contentType: string, maxBytes: number): Promise<UploadTicket> {
    const exp = this.now() + 15 * 60_000;
    const token = this.signTicket({ p, ct: contentType, max: maxBytes, exp, op: 'put' });
    return {
      url: `/v1/uploads/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(exp).toISOString(),
    };
  }

  async stat(p: string): Promise<{ size: number; contentType: string } | null> {
    if (this.opts.r2 && this.useR2(p)) {
      const head = await this.opts.r2.head(p);
      if (head) {
        return {
          size: head.size,
          contentType: head.httpMetadata?.contentType ?? 'application/octet-stream',
        };
      }
    }
    const db = await this.ensureD1();
    if (db) {
      const row = await db
        .prepare('SELECT size, content_type FROM blobs WHERE path = ?1')
        .bind(p)
        .first<{ size: number; content_type: string }>();
      if (row) {
        return { size: Number(row.size), contentType: row.content_type };
      }
    } else {
      const item = this.mem.get(p);
      if (item) return { size: item.data.byteLength, contentType: item.contentType };
    }
    if (p.startsWith('media/audio/seed-media-') || p.startsWith('media/video/seed-media-')) {
      const isAudio = p.startsWith('media/audio/');
      const buf = createPlaceholderMp4(isAudio, isAudio ? 420 : 540);
      return { size: buf.length, contentType: isAudio ? 'audio/mp4' : 'video/mp4' };
    }
    return null;
  }

  async read(p: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (this.opts.r2 && this.useR2(p)) {
      const obj = await this.opts.r2.get(p);
      if (obj) {
        return {
          data: new Uint8Array(await obj.arrayBuffer()),
          contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
        };
      }
    }
    const db = await this.ensureD1();
    if (db) {
      const meta = await db
        .prepare('SELECT content_type FROM blobs WHERE path = ?1')
        .bind(p)
        .first<{ content_type: string }>();
      if (meta) {
        const chunks = await db
          .prepare('SELECT data FROM blob_chunks WHERE path = ?1 ORDER BY idx ASC')
          .bind(p)
          .all<{ data: string }>();
        const buffers = (chunks.results ?? []).map((c) => base64ToBytes(c.data));
        return {
          data: concatBytes(buffers),
          contentType: meta.content_type || 'application/octet-stream',
        };
      }
    } else {
      const item = this.mem.get(p);
      if (item) return { data: item.data, contentType: item.contentType };
    }
    if (p.startsWith('media/audio/seed-media-') || p.startsWith('media/video/seed-media-')) {
      const isAudio = p.startsWith('media/audio/');
      return {
        data: createPlaceholderMp4(isAudio, isAudio ? 420 : 540),
        contentType: isAudio ? 'audio/mp4' : 'video/mp4',
      };
    }
    return null;
  }

  /** Chunk size of a stored blob (256 KB for app uploads, other sizes for imported files). */
  private chunkSizes = new Map<string, number>();

  private async chunkSizeOf(db: D1Database, p: string, size: number, count: number) {
    if (count <= 1) return Math.max(1, size);
    const key = `${p}:${size}:${count}`;
    const hit = this.chunkSizes.get(key);
    if (hit) return hit;
    const row = await db
      .prepare(
        'SELECT length(data) AS l, substr(data, -2) AS t FROM blob_chunks WHERE path = ?1 AND idx = 0',
      )
      .bind(p)
      .first<{ l: number; t: string }>();
    if (!row) return 0;
    const pad = row.t.endsWith('==') ? 2 : row.t.endsWith('=') ? 1 : 0;
    const decoded = (Number(row.l) / 4) * 3 - pad;
    this.chunkSizes.set(key, decoded);
    return decoded;
  }

  async readRange(p: string, start: number, end: number): Promise<Buffer> {
    if (this.opts.r2 && this.useR2(p) && end >= start) {
      try {
        // Only the requested window is read from R2 (videos seek with Range requests).
        const obj = await this.opts.r2.get(p, {
          range: { offset: start, length: end - start + 1 },
        });
        if (obj) return toBufferLike(new Uint8Array(await obj.arrayBuffer()));
      } catch {
        // fall through to the D1 copy (not migrated yet)
      }
    }
    const db = await this.ensureD1();
    if (db) {
      const meta = await db
        .prepare('SELECT size, chunk_count FROM blobs WHERE path = ?1')
        .bind(p)
        .first<{ size: number; chunk_count: number }>();
      if (meta) {
        const size = Number(meta.size);
        const last = Math.min(end, size - 1);
        if (start > last) return toBufferLike(new Uint8Array(0));
        const cs = await this.chunkSizeOf(db, p, size, Number(meta.chunk_count));
        if (cs > 0) {
          const firstIdx = Math.floor(start / cs);
          const lastIdx = Math.floor(last / cs);
          const rows = await db
            .prepare(
              'SELECT data FROM blob_chunks WHERE path = ?1 AND idx BETWEEN ?2 AND ?3 ORDER BY idx ASC',
            )
            .bind(p, firstIdx, lastIdx)
            .all<{ data: string }>();
          const joined = concatBytes((rows.results ?? []).map((c) => base64ToBytes(c.data)));
          const offset = start - firstIdx * cs;
          return toBufferLike(joined.subarray(offset, offset + (last - start + 1)));
        }
      }
    }
    const file = await this.read(p);
    if (!file) throw new Error(`Blob not found: ${p}`);
    return toBufferLike(file.data.subarray(start, end + 1));
  }

  private static likePrefix(prefix: string): string {
    return `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }

  async listStored(prefix: string): Promise<Array<{ path: string; size: number }> | null> {
    const db = await this.ensureD1();
    if (!db) return null;
    const rows = await db
      .prepare(
        `SELECT b.path AS path, b.size AS size FROM blobs b
         WHERE b.path LIKE ?1 ESCAPE '\\'
           AND b.chunk_count = (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = b.path)`,
      )
      .bind(CloudflareBlobStore.likePrefix(prefix))
      .all<{ path: string; size: number }>();
    return (rows.results ?? []).map((r) => ({ path: r.path, size: Number(r.size) }));
  }

  async composeParts(
    parts: Array<{ path: string; size: number }>,
    dest: string,
    contentType: string,
  ): Promise<boolean | null> {
    const db = await this.ensureD1();
    if (!db || parts.length === 0) return null;
    const bases: number[] = [];
    let chunks = 0;
    let total = 0;
    parts.forEach((part, i) => {
      if (i < parts.length - 1 && part.size % CHUNK_BYTES !== 0)
        throw new Error(`Part ${i} is not a multiple of the chunk size`);
      bases.push(chunks);
      chunks += Math.max(1, Math.ceil(part.size / CHUNK_BYTES));
      total += part.size;
    });
    // 1) clear any leftovers under the destination (a previous failed attempt)
    await db.batch([db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(dest)]);
    // 2) move each part's rows under `dest` (re-keying only; the data is not copied or re-read)
    const PER_BATCH = 16;
    for (let from = 0; from < parts.length; from += PER_BATCH) {
      const stmts: D1PreparedStatement[] = [];
      for (let i = from; i < Math.min(parts.length, from + PER_BATCH); i++) {
        stmts.push(
          db
            .prepare('UPDATE blob_chunks SET path = ?1, idx = idx + ?2 WHERE path = ?3')
            .bind(dest, bases[i], parts[i]?.path),
        );
      }
      await db.batch(stmts);
    }
    // 3) only now does the file become visible
    await db.batch([
      db
        .prepare(
          `INSERT INTO blobs (path, content_type, size, chunk_count, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (path) DO UPDATE SET
             content_type = excluded.content_type,
             size = excluded.size,
             chunk_count = excluded.chunk_count,
             updated_at = excluded.updated_at`,
        )
        .bind(dest, contentType, total, chunks, new Date(this.now()).toISOString()),
      ...parts.map((part) => db.prepare('DELETE FROM blobs WHERE path = ?1').bind(part.path)),
    ]);
    return true;
  }

  async deletePrefix(prefix: string): Promise<boolean | null> {
    const db = await this.ensureD1();
    if (!db) return null;
    const like = CloudflareBlobStore.likePrefix(prefix);
    await db.batch([
      db.prepare("DELETE FROM blob_chunks WHERE path LIKE ?1 ESCAPE '\\'").bind(like),
      db.prepare("DELETE FROM blobs WHERE path LIKE ?1 ESCAPE '\\'").bind(like),
    ]);
    return true;
  }

  async signedReadUrl(p: string, ttlSec: number): Promise<string> {
    const token = this.signTicket({
      p,
      ct: '',
      max: 0,
      exp: this.now() + ttlSec * 1000,
      op: 'get',
    });
    return `/v1/files/signed/${token}`;
  }

  async publicUrl(p: string): Promise<string> {
    return `/v1/files/public/${p.split('/').map(encodeURIComponent).join('/')}`;
  }

  /**
   * One bounded batch of the D1 -> R2 move (run from the 15-minute cron until nothing is left).
   * For each stored file: read it back from D1, write it to R2, verify the size, and only then —
   * when `purgeAfterMigrate` is on — delete the D1 rows. Reads already prefer R2 and fall back
   * to D1, so files keep working at every step. Staging parts (`uploads/`) are never moved.
   */
  async migrateToObjectStorage(
    o: { maxFiles?: number; maxBytes?: number } = {},
  ): Promise<MigrateResult | null> {
    const r2 = this.opts.r2;
    if (!r2) return null;
    const db = await this.ensureD1();
    if (!db) return null;
    const maxFiles = o.maxFiles ?? 6;
    const maxBytes = o.maxBytes ?? 48 * 1024 * 1024;
    const purge = Boolean(this.opts.purgeAfterMigrate);
    const out: MigrateResult = {
      moved: 0,
      verified: 0,
      bytes: 0,
      purged: 0,
      failed: 0,
      remaining: 0,
    };
    const log = async (path: string, size: number, status: string, detail = '') => {
      try {
        await db
          .prepare(
            'INSERT INTO blob_migration_log (ts, path, size, status, detail) VALUES (?1, ?2, ?3, ?4, ?5)',
          )
          .bind(Date.now(), path, size, status, detail.slice(0, 300))
          .run();
      } catch {
        // the log must never break the migration
      }
    };
    try {
      await db
        .prepare(
          'CREATE TABLE IF NOT EXISTS blob_migration_log (ts INTEGER NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL, detail TEXT)',
        )
        .run();
      await db
        .prepare('DELETE FROM blob_migration_log WHERE ts < ?1')
        .bind(Date.now() - 14 * 24 * 3600 * 1000)
        .run();
    } catch {
      // logging is best-effort
    }

    const rows = await db
      .prepare(
        `SELECT path, content_type, size, chunk_count FROM blobs
         WHERE path NOT LIKE 'uploads/%'
           AND chunk_count = (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = blobs.path)
         ORDER BY size ASC LIMIT 200`,
      )
      .all<{ path: string; content_type: string; size: number; chunk_count: number }>();
    const todo = rows.results ?? [];

    let checks = 0;
    for (const row of todo) {
      if (out.moved + out.failed >= maxFiles || checks >= MAX_HEAD_CHECKS) break;
      const size = Number(row.size);
      try {
        const contentType = row.content_type || 'application/octet-stream';
        checks++;
        const head = await r2.head(row.path);
        if (head && head.size === size) {
          // Already copied and size-verified earlier: does not use up this run's batch.
          out.verified++;
        } else {
          if (out.bytes > 0 && out.bytes + size > maxBytes) continue;
          if (size <= SINGLE_PUT_MAX) {
            const chunks = await db
              .prepare('SELECT data FROM blob_chunks WHERE path = ?1 ORDER BY idx ASC')
              .bind(row.path)
              .all<{ data: string }>();
            const whole = concatBytes((chunks.results ?? []).map((c) => base64ToBytes(c.data)));
            if (whole.byteLength !== size) throw new Error('size mismatch while reading D1');
            await r2.put(row.path, whole, { httpMetadata: { contentType } });
          } else {
            await this.copyLargeToR2(db, r2, row.path, size, Number(row.chunk_count), contentType);
          }
          const after = await r2.head(row.path);
          if (!after || after.size !== size) throw new Error('R2 copy failed verification');
          out.moved++;
          out.bytes += size;
          await log(row.path, size, 'copied');
        }
        if (purge) {
          await db.batch([
            db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(row.path),
            db.prepare('DELETE FROM blobs WHERE path = ?1').bind(row.path),
          ]);
          out.purged++;
          await log(row.path, size, 'purged');
        }
      } catch (err) {
        out.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[blob:migrate] ${row.path} skipped: ${msg}`);
        await log(row.path, size, 'failed', msg);
      }
    }

    const left = await db
      .prepare("SELECT COUNT(*) AS n FROM blobs WHERE path NOT LIKE 'uploads/%'")
      .first<{ n: number }>();
    out.remaining = Number(left?.n ?? 0);
    await log('-', out.bytes, 'run', JSON.stringify(out));
    return out;
  }

  /** Streams a big D1 blob into an R2 multipart upload (fixed 8 MiB parts, bounded memory). */
  private async copyLargeToR2(
    db: D1Database,
    r2: R2BucketLike,
    p: string,
    size: number,
    chunkCount: number,
    contentType: string,
  ): Promise<void> {
    if (!r2.createMultipartUpload) throw new Error('R2 multipart upload unavailable');
    const upload = await r2.createMultipartUpload(p, { httpMetadata: { contentType } });
    const done: unknown[] = [];
    try {
      let pending: Uint8Array[] = [];
      let pendingBytes = 0;
      let total = 0;
      const flush = async (final: boolean) => {
        while (pendingBytes >= R2_PART_BYTES || (final && pendingBytes > 0)) {
          const joined = concatBytes(pending);
          const take = Math.min(R2_PART_BYTES, joined.byteLength);
          done.push(await upload.uploadPart(done.length + 1, joined.slice(0, take)));
          const rest = joined.subarray(take);
          pending = rest.byteLength ? [rest] : [];
          pendingBytes = rest.byteLength;
        }
      };
      const PER_QUERY = 8;
      for (let from = 0; from < chunkCount; from += PER_QUERY) {
        const res = await db
          .prepare(
            'SELECT data FROM blob_chunks WHERE path = ?1 AND idx >= ?2 AND idx < ?3 ORDER BY idx ASC',
          )
          .bind(p, from, from + PER_QUERY)
          .all<{ data: string }>();
        for (const c of res.results ?? []) {
          const bytes = base64ToBytes(c.data);
          pending.push(bytes);
          pendingBytes += bytes.byteLength;
          total += bytes.byteLength;
        }
        await flush(false);
      }
      await flush(true);
      if (total !== size) throw new Error('size mismatch while streaming D1 -> R2');
      await upload.complete(done);
    } catch (err) {
      await upload.abort().catch(() => {});
      throw err;
    }
  }

  async delete(p: string): Promise<void> {
    if (this.opts.r2 && this.useR2(p)) await this.opts.r2.delete(p);
    const db = await this.ensureD1();
    if (db) {
      await db.batch([
        db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(p),
        db.prepare('DELETE FROM blobs WHERE path = ?1').bind(p),
      ]);
    } else {
      this.mem.delete(p);
    }
  }
}
