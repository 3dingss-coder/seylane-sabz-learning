import {
  base64ToBytes,
  base64UrlToString,
  bytesToBase64,
  hmacSha256Base64Url,
  randomBytesBase64Url,
  stringToBase64Url,
  timingSafeEqualStr,
} from '../lib/crypto';
import { withTimeout } from '../lib/bounded';
import { createPlaceholderMp4 } from '../lib/media';
import type { D1Database, D1PreparedStatement } from '../store/d1';
import { D1_CALL_TIMEOUT_MS, ensureD1Schema, withD1CallTimeout } from '../store/d1';
import type { LocalTicket } from './local';
import type { BlobStore, UploadTicket } from './types';

export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Cloudflare R2 exposes a stream, allowing bounded-memory byte-for-byte verification. */
  body?: ReadableStream<Uint8Array> | null;
  size: number;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      /** Cloudflare R2 precondition; `*` protects migration from overwriting any existing object. */
      onlyIf?: { etagDoesNotMatch?: string };
    },
  ): Promise<unknown | null>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
}

/** Resumable-upload staging parts always live in D1 (they are copied to a hidden stage, then swapped). */
const STAGING_PREFIX = 'uploads/';
const isStaging = (p: string) => p.startsWith(STAGING_PREFIX);
/** Files up to this size can use R2's conditional single-PUT API during migration. */
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

/** One bounded D1 operation; the deadline does not cancel a late mutation. */
function boundedD1Call<T>(label: string, operation: () => Promise<T>): Promise<T> {
  return withD1CallTimeout(Promise.resolve().then(operation), label);
}

/** R2 calls use the existing per-call D1 wall-time budget; a timeout is not cancellation. */
function boundedR2Call<T>(label: string, operation: () => Promise<T>): Promise<T> {
  return withTimeout(Promise.resolve().then(operation), D1_CALL_TIMEOUT_MS, label);
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

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Internal blob CAS marker: the random suffix prevents same-millisecond overwrites sharing a version. */
function blobVersionStamp(now: number): string {
  return `${new Date(now).toISOString()}#${randomBytesBase64Url(12)}`;
}

/**
 * Cloudflare BlobStore implementation.
 * Uses R2 when bound, otherwise D1. The in-memory fallback is only for non-production tests/local
 * use; buildCloudflareDeps rejects a production Worker without the required D1 binding.
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
      this.initPromise = ensureD1Schema(db).catch((err) => {
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
      const r2 = this.opts.r2;
      await boundedR2Call('R2 blob put', () => r2.put(p, bytes, { httpMetadata: { contentType } }));
      return;
    }
    const db = await this.ensureD1();
    if (!db) {
      this.mem.set(p, { data: new Uint8Array(bytes), contentType });
      return;
    }
    const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / CHUNK_BYTES));
    const nowIso = blobVersionStamp(this.now());
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
      await boundedD1Call('D1 blob put batch', () => db.batch(stmts));
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
        await boundedD1Call('D1 blob staging batch', () => db.batch(stmts));
      }
      await boundedD1Call('D1 blob stage swap', () =>
        db.batch([
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
        ]),
      );
    } catch (e) {
      try {
        await boundedD1Call('D1 failed upload stage cleanup', () =>
          db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(stage).run(),
        );
      } catch (cleanupErr) {
        console.warn(
          '[blob] failed to clean an abandoned D1 upload stage',
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        );
      }
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
      const r2 = this.opts.r2;
      const head = await boundedR2Call('R2 blob stat', () => r2.head(p));
      if (head) {
        return {
          size: head.size,
          contentType: head.httpMetadata?.contentType ?? 'application/octet-stream',
        };
      }
    }
    const db = await this.ensureD1();
    if (db) {
      const row = await withD1CallTimeout(
        db
          .prepare(
            `SELECT b.size, b.content_type FROM blobs b
             WHERE b.path = ?1
               AND b.chunk_count = (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = b.path)
               AND COALESCE((SELECT MIN(idx) FROM blob_chunks c WHERE c.path = b.path), -1) = 0
               AND COALESCE((SELECT MAX(idx) FROM blob_chunks c WHERE c.path = b.path), -1) = b.chunk_count - 1`,
          )
          .bind(p)
          .first<{ size: number; content_type: string }>(),
        'D1 blob stat',
      );
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
      const r2 = this.opts.r2;
      const obj = await boundedR2Call('R2 blob read', () => r2.get(p));
      if (obj) {
        const data = await boundedR2Call('R2 blob body read', () => obj.arrayBuffer());
        return {
          data: new Uint8Array(data),
          contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
        };
      }
    }
    const db = await this.ensureD1();
    if (db) {
      const meta = await withD1CallTimeout(
        db
          .prepare('SELECT content_type FROM blobs WHERE path = ?1')
          .bind(p)
          .first<{ content_type: string }>(),
        'D1 blob metadata read',
      );
      if (meta) {
        const chunks = await withD1CallTimeout(
          db
            .prepare('SELECT data FROM blob_chunks WHERE path = ?1 ORDER BY idx ASC')
            .bind(p)
            .all<{ data: string }>(),
          'D1 blob chunks read',
        );
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
    const row = await withD1CallTimeout(
      db
        .prepare(
          'SELECT length(data) AS l, substr(data, -2) AS t FROM blob_chunks WHERE path = ?1 AND idx = 0',
        )
        .bind(p)
        .first<{ l: number; t: string }>(),
      'D1 blob chunk-size read',
    );
    if (!row) return 0;
    const pad = row.t.endsWith('==') ? 2 : row.t.endsWith('=') ? 1 : 0;
    const decoded = (Number(row.l) / 4) * 3 - pad;
    this.chunkSizes.set(key, decoded);
    return decoded;
  }

  async readRange(p: string, start: number, end: number): Promise<Uint8Array> {
    if (this.opts.r2 && this.useR2(p) && end >= start) {
      try {
        // Only the requested window is read from R2 (videos seek with Range requests).
        const r2 = this.opts.r2;
        const obj = await boundedR2Call('R2 blob range read', () =>
          r2.get(p, { range: { offset: start, length: end - start + 1 } }),
        );
        if (obj) {
          const data = await boundedR2Call('R2 blob range body read', () => obj.arrayBuffer());
          return new Uint8Array(data);
        }
      } catch (err) {
        console.warn(
          '[blob] R2 range read failed; falling back to D1',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    const db = await this.ensureD1();
    if (db) {
      const meta = await withD1CallTimeout(
        db
          .prepare('SELECT size, chunk_count FROM blobs WHERE path = ?1')
          .bind(p)
          .first<{ size: number; chunk_count: number }>(),
        'D1 blob range metadata read',
      );
      if (meta) {
        const size = Number(meta.size);
        const last = Math.min(end, size - 1);
        if (start > last) return new Uint8Array(0);
        const cs = await this.chunkSizeOf(db, p, size, Number(meta.chunk_count));
        if (cs > 0) {
          const firstIdx = Math.floor(start / cs);
          const lastIdx = Math.floor(last / cs);
          const rows = await withD1CallTimeout(
            db
              .prepare(
                'SELECT data FROM blob_chunks WHERE path = ?1 AND idx BETWEEN ?2 AND ?3 ORDER BY idx ASC',
              )
              .bind(p, firstIdx, lastIdx)
              .all<{ data: string }>(),
            'D1 blob range chunks read',
          );
          const joined = concatBytes((rows.results ?? []).map((c) => base64ToBytes(c.data)));
          const offset = start - firstIdx * cs;
          return joined.subarray(offset, offset + (last - start + 1));
        }
      }
    }
    const file = await this.read(p);
    if (!file) throw new Error(`Blob not found: ${p}`);
    return file.data.subarray(start, end + 1);
  }

  private static likePrefix(prefix: string): string {
    return `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }

  async listStored(prefix: string): Promise<Array<{ path: string; size: number }> | null> {
    const db = await this.ensureD1();
    if (!db) return null;
    const rows = await boundedD1Call('D1 stored-blob listing', () =>
      db
        .prepare(
          `SELECT b.path AS path, b.size AS size FROM blobs b
           WHERE b.path LIKE ?1 ESCAPE '\\'
             AND b.chunk_count = (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = b.path)`,
        )
        .bind(CloudflareBlobStore.likePrefix(prefix))
        .all<{ path: string; size: number }>(),
    );
    return (rows.results ?? []).map((r) => ({ path: r.path, size: Number(r.size) }));
  }

  async composeParts(
    parts: Array<{ path: string; size: number }>,
    dest: string,
    contentType: string,
  ): Promise<boolean | null> {
    const db = await this.ensureD1();
    if (!db || parts.length === 0) return null;
    if (parts.length > 64 || dest.startsWith(STAGING_PREFIX))
      throw new Error('Invalid D1 upload composition target or part count.');

    const bases: number[] = [];
    let chunkCount = 0;
    let total = 0;
    const partPaths = new Set<string>();
    parts.forEach((part, i) => {
      if (
        !part.path.startsWith(STAGING_PREFIX) ||
        part.path.startsWith('uploads/_compose/') ||
        part.path === dest ||
        partPaths.has(part.path) ||
        !Number.isSafeInteger(part.size) ||
        part.size <= 0
      ) {
        throw new Error('Invalid D1 upload composition part.');
      }
      partPaths.add(part.path);
      if (i < parts.length - 1 && part.size % CHUNK_BYTES !== 0)
        throw new Error(`Part ${i} is not a multiple of the chunk size`);
      bases.push(chunkCount);
      chunkCount += Math.max(1, Math.ceil(part.size / CHUNK_BYTES));
      total += part.size;
    });

    type ComposedMeta = {
      size: number;
      chunk_count: number;
      actual_count: number;
      min_idx: number | null;
      max_idx: number | null;
    };
    const completeDestination = async (): Promise<boolean> => {
      const row = await boundedD1Call('D1 compose destination check', () =>
        db
          .prepare(
            `SELECT b.size, b.chunk_count, COUNT(c.idx) AS actual_count,
                    MIN(c.idx) AS min_idx, MAX(c.idx) AS max_idx
             FROM blobs b LEFT JOIN blob_chunks c ON c.path = b.path
             WHERE b.path = ?1 GROUP BY b.path`,
          )
          .bind(dest)
          .first<ComposedMeta>(),
      );
      return Boolean(
        row &&
        Number(row.size) === total &&
        Number(row.chunk_count) === chunkCount &&
        Number(row.actual_count) === chunkCount &&
        Number(row.min_idx) === 0 &&
        Number(row.max_idx) === chunkCount - 1,
      );
    };

    // A prior request may have committed the final atomic swap but timed out before returning.
    if (await completeDestination()) return true;

    const placeholders = parts.map((_, i) => `?${i + 1}`).join(', ');
    const metadata = await boundedD1Call('D1 compose part metadata', () =>
      db
        .prepare(
          `SELECT path, size, chunk_count, updated_at FROM blobs WHERE path IN (${placeholders})`,
        )
        .bind(...parts.map((part) => part.path))
        .all<{
          path: string;
          size: number;
          chunk_count: number;
          updated_at: string;
        }>(),
    );
    const versions = new Map((metadata.results ?? []).map((row) => [row.path, row]));
    const snapshots: Array<{
      path: string;
      size: number;
      chunks: number;
      updatedAt: string;
    }> = [];
    for (const part of parts) {
      const version = versions.get(part.path);
      const expectedChunks = Math.max(1, Math.ceil(part.size / CHUNK_BYTES));
      if (
        !version ||
        Number(version.size) !== part.size ||
        Number(version.chunk_count) !== expectedChunks ||
        typeof version.updated_at !== 'string'
      ) {
        if (await completeDestination()) return true;
        throw new Error(`D1 upload part changed or is incomplete: ${part.path}`);
      }
      snapshots.push({
        path: part.path,
        size: part.size,
        chunks: expectedChunks,
        updatedAt: version.updated_at,
      });
    }

    // Copy (do not move) source parts to one deterministic hidden staging path in a single D1
    // batch. The sources remain available if either this call or the final swap times out; the
    // next retry clears and rebuilds this staging path. Each SELECT is guarded by the source
    // version and a complete, contiguous chunk set, so a concurrent part PUT cannot be half-read.
    const stage = `uploads/_compose/${stringToBase64Url(dest)}`;
    const copyStatements: D1PreparedStatement[] = [
      db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(stage),
    ];
    for (let i = 0; i < snapshots.length; i++) {
      const part = snapshots[i];
      if (!part) throw new Error('D1 upload composition snapshot is incomplete.');
      copyStatements.push(
        db
          .prepare(
            `INSERT INTO blob_chunks (path, idx, data)
             SELECT ?1, idx + ?2, data FROM blob_chunks
             WHERE path = ?3 AND EXISTS (
               SELECT 1 FROM blobs b
               WHERE b.path = ?3 AND b.updated_at = ?4 AND b.size = ?5 AND b.chunk_count = ?6
                 AND (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = b.path) = ?6
                 AND COALESCE((SELECT MIN(idx) FROM blob_chunks c WHERE c.path = b.path), -1) = 0
                 AND COALESCE((SELECT MAX(idx) FROM blob_chunks c WHERE c.path = b.path), -1) = ?6 - 1
             )`,
          )
          .bind(stage, bases[i], part.path, part.updatedAt, part.size, part.chunks),
      );
    }
    const copied = await boundedD1Call('D1 compose staging batch', () => db.batch(copyStatements));
    const copyComplete = snapshots.every(
      (part, i) => Number(copied[i + 1]?.meta?.changes ?? 0) === part.chunks,
    );
    if (!copyComplete) {
      if (await completeDestination()) return true;
      throw new Error('D1 upload composition source changed while staging; retry the upload.');
    }

    const token = blobVersionStamp(this.now());
    const stageIsComplete = `(
      (SELECT COUNT(*) FROM blob_chunks WHERE path = ?2) = ?3
      AND COALESCE((SELECT MIN(idx) FROM blob_chunks WHERE path = ?2), -1) = 0
      AND COALESCE((SELECT MAX(idx) FROM blob_chunks WHERE path = ?2), -1) = ?3 - 1
    )`;
    const destIsComplete = `(
      (SELECT COUNT(*) FROM blob_chunks WHERE path = ?1) = ?4
      AND COALESCE((SELECT MIN(idx) FROM blob_chunks WHERE path = ?1), -1) = 0
      AND COALESCE((SELECT MAX(idx) FROM blob_chunks WHERE path = ?1), -1) = ?4 - 1
    )`;
    const safeDest = `EXISTS (
      SELECT 1 FROM blobs b WHERE b.path = ?1 AND b.updated_at = ?2
        AND b.size = ?3 AND b.chunk_count = ?4
        AND (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = b.path) = b.chunk_count
        AND COALESCE((SELECT MIN(idx) FROM blob_chunks c WHERE c.path = b.path), -1) = 0
        AND COALESCE((SELECT MAX(idx) FROM blob_chunks c WHERE c.path = b.path), -1) = b.chunk_count - 1
    )`;
    const partMarks = parts.map((_, i) => `?${i + 5}`).join(', ');
    await boundedD1Call('D1 compose final swap', () =>
      db.batch([
        // The guard keeps an existing destination untouched if a concurrent composer consumed or
        // replaced the shared stage path before this atomic batch starts.
        db
          .prepare(`DELETE FROM blob_chunks WHERE path = ?1 AND ${stageIsComplete}`)
          .bind(dest, stage, chunkCount),
        db
          .prepare(`UPDATE blob_chunks SET path = ?1 WHERE path = ?2 AND ${stageIsComplete}`)
          .bind(dest, stage, chunkCount),
        db
          .prepare(
            `INSERT INTO blobs (path, content_type, size, chunk_count, updated_at)
             SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${destIsComplete}
             ON CONFLICT (path) DO UPDATE SET
               content_type = excluded.content_type,
               size = excluded.size,
               chunk_count = excluded.chunk_count,
               updated_at = excluded.updated_at`,
          )
          .bind(dest, contentType, total, chunkCount, token),
        // Only a verified destination from this exact swap permits cleanup of resumable parts.
        db
          .prepare(`DELETE FROM blob_chunks WHERE path IN (${partMarks}) AND ${safeDest}`)
          .bind(dest, token, total, chunkCount, ...parts.map((part) => part.path)),
        db
          .prepare(`DELETE FROM blobs WHERE path IN (${partMarks}) AND ${safeDest}`)
          .bind(dest, token, total, chunkCount, ...parts.map((part) => part.path)),
      ]),
    );
    if (await completeDestination()) return true;
    throw new Error('D1 upload composition did not produce a complete destination.');
  }

  async deletePrefix(prefix: string): Promise<boolean | null> {
    const db = await this.ensureD1();
    if (!db) return null;
    const like = CloudflareBlobStore.likePrefix(prefix);
    await boundedD1Call('D1 blob prefix deletion', () =>
      db.batch([
        db.prepare("DELETE FROM blob_chunks WHERE path LIKE ?1 ESCAPE '\\'").bind(like),
        db.prepare("DELETE FROM blobs WHERE path LIKE ?1 ESCAPE '\\'").bind(like),
      ]),
    );
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

  /** Stream the R2 object and compare it byte-for-byte with bounded D1 chunk batches. */
  private async verifyR2MatchesD1(
    db: D1Database,
    r2: R2BucketLike,
    path: string,
    size: number,
    chunkCount: number,
  ): Promise<boolean> {
    const object = await boundedR2Call('R2 migration verification read', () => r2.get(path));
    if (!object || object.size !== size) return false;
    const reader = object.body?.getReader();
    // Production R2 bodies are streams. A bounded fallback supports small adapters/tests only.
    if (!reader && size > SINGLE_PUT_MAX) return false;
    const wholeObject = reader
      ? null
      : new Uint8Array(
          await boundedR2Call('R2 migration verification body', () => object.arrayBuffer()),
        );
    if (wholeObject && wholeObject.byteLength !== size) return false;

    let streamChunk: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let streamOffset = 0;
    let wholeOffset = 0;
    const readExpectedLength = async (length: number): Promise<Uint8Array> => {
      if (!reader) {
        const source = wholeObject;
        if (!source) return new Uint8Array(0);
        const slice = source.subarray(wholeOffset, wholeOffset + length);
        wholeOffset += slice.byteLength;
        return slice;
      }
      const out = new Uint8Array(length);
      let written = 0;
      while (written < length) {
        if (streamOffset >= streamChunk.byteLength) {
          const next = await boundedR2Call('R2 migration verification stream', () => reader.read());
          if (next.done || !next.value) return out.subarray(0, written);
          streamChunk = next.value;
          streamOffset = 0;
        }
        const take = Math.min(length - written, streamChunk.byteLength - streamOffset);
        out.set(streamChunk.subarray(streamOffset, streamOffset + take), written);
        written += take;
        streamOffset += take;
      }
      return out;
    };

    let total = 0;
    let from = 0;
    const batchSize = 8;
    while (from < chunkCount) {
      const rows = await boundedD1Call('D1 migration verification chunks', () =>
        db
          .prepare(
            'SELECT idx, data FROM blob_chunks WHERE path = ?1 ORDER BY idx ASC LIMIT ?2 OFFSET ?3',
          )
          .bind(path, batchSize, from)
          .all<{ idx: number; data: string }>(),
      );
      const chunks = rows.results ?? [];
      if (!chunks.length) return false;
      for (let i = 0; i < chunks.length; i++) if (Number(chunks[i]?.idx) !== from + i) return false;
      const expected = concatBytes(chunks.map((chunk) => base64ToBytes(chunk.data)));
      const actual = await readExpectedLength(expected.byteLength);
      if (!sameBytes(actual, expected)) return false;
      total += expected.byteLength;
      from += chunks.length;
    }
    if (from !== chunkCount || total !== size) return false;

    if (!reader) return wholeObject !== null && wholeOffset === wholeObject.byteLength;
    if (streamOffset < streamChunk.byteLength) return false;
    const tail = await boundedR2Call('R2 migration verification stream end', () => reader.read());
    return tail.done && !tail.value?.byteLength;
  }

  /**
   * One bounded batch of the D1 -> R2 move (run manually only after reviewing storage state).
   * For each stored file: read it back from D1, write it to R2, verify every byte, and only then —
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
        await boundedD1Call('D1 blob migration log write', () =>
          db
            .prepare(
              'INSERT INTO blob_migration_log (ts, path, size, status, detail) VALUES (?1, ?2, ?3, ?4, ?5)',
            )
            .bind(Date.now(), path, size, status, detail.slice(0, 300))
            .run(),
        );
      } catch (err) {
        console.warn(
          `[blob:migrate] migration log write failed for ${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };
    try {
      await boundedD1Call('D1 migration log schema', () =>
        db
          .prepare(
            'CREATE TABLE IF NOT EXISTS blob_migration_log (ts INTEGER NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL, detail TEXT)',
          )
          .run(),
      );
      await boundedD1Call('D1 migration log retention', () =>
        db
          .prepare('DELETE FROM blob_migration_log WHERE ts < ?1')
          .bind(Date.now() - 14 * 24 * 3600 * 1000)
          .run(),
      );
    } catch (err) {
      console.warn(
        `[blob:migrate] migration log setup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const rows = await boundedD1Call('D1 migration candidates', () =>
      db
        .prepare(
          `SELECT path, content_type, size, chunk_count, updated_at FROM blobs
           WHERE path NOT LIKE 'uploads/%'
             AND chunk_count = (SELECT COUNT(*) FROM blob_chunks c WHERE c.path = blobs.path)
           ORDER BY size ASC LIMIT 200`,
        )
        .all<{
          path: string;
          content_type: string;
          size: number;
          chunk_count: number;
          updated_at: string;
        }>(),
    );
    const todo = rows.results ?? [];

    let checks = 0;
    for (const row of todo) {
      if (out.moved + out.failed >= maxFiles || checks >= MAX_HEAD_CHECKS) break;
      const size = Number(row.size);
      try {
        const contentType = row.content_type || 'application/octet-stream';
        checks++;
        const head = await boundedR2Call('R2 migration HEAD', () => r2.head(row.path));
        if (head) {
          // Never overwrite an existing object during migration: it may be a newer admin upload.
          if (head.size !== size) {
            out.failed++;
            await log(
              row.path,
              size,
              'conflict',
              'existing R2 size differs from D1; both copies retained',
            );
            continue;
          }
          if (!(await this.verifyR2MatchesD1(db, r2, row.path, size, Number(row.chunk_count)))) {
            out.failed++;
            await log(
              row.path,
              size,
              'conflict',
              'existing R2 bytes differ from D1; both copies retained',
            );
            continue;
          }
          out.verified++;
        } else {
          if (out.bytes > 0 && out.bytes + size > maxBytes) continue;
          if (size > SINGLE_PUT_MAX) {
            // Workers R2 multipart complete() has no conditional-write parameter. Writing after a
            // HEAD miss could overwrite a concurrent admin upload, so retain this D1 source.
            throw new Error(
              `Safe migration is unavailable for objects over ${SINGLE_PUT_MAX} bytes: R2 multipart completion is not conditional.`,
            );
          }
          const chunks = await boundedD1Call('D1 migration source chunks', () =>
            db
              .prepare('SELECT idx, data FROM blob_chunks WHERE path = ?1 ORDER BY idx ASC')
              .bind(row.path)
              .all<{ idx: number; data: string }>(),
          );
          const list = chunks.results ?? [];
          if (list.length !== Number(row.chunk_count)) throw new Error('D1 chunk count mismatch');
          for (let i = 0; i < list.length; i++)
            if (Number(list[i]?.idx) !== i) throw new Error('D1 chunk index mismatch');
          const whole = concatBytes(list.map((chunk) => base64ToBytes(chunk.data)));
          if (whole.byteLength !== size) throw new Error('size mismatch while reading D1');
          const created = await boundedR2Call('R2 conditional migration put', () =>
            r2.put(row.path, whole, {
              httpMetadata: { contentType },
              onlyIf: { etagDoesNotMatch: '*' },
            }),
          );
          if (created === null) {
            out.failed++;
            await log(
              row.path,
              size,
              'conflict',
              'R2 object appeared after HEAD; conditional PUT prevented overwrite and D1 was retained',
            );
            continue;
          }
          const after = await boundedR2Call('R2 migration copy HEAD', () => r2.head(row.path));
          if (!after || after.size !== size) throw new Error('R2 copy size verification failed');
          if (!(await this.verifyR2MatchesD1(db, r2, row.path, size, Number(row.chunk_count))))
            throw new Error('R2 copy failed byte-for-byte verification');
          out.moved++;
          out.bytes += size;
          await log(row.path, size, 'copied-and-verified');
        }
        if (purge) {
          const current = await boundedD1Call('D1 migration purge guard read', () =>
            db
              .prepare('SELECT size, chunk_count, updated_at FROM blobs WHERE path = ?1')
              .bind(row.path)
              .first<{ size: number; chunk_count: number; updated_at: string }>(),
          );
          if (
            !current ||
            Number(current.size) !== size ||
            Number(current.chunk_count) !== Number(row.chunk_count) ||
            current.updated_at !== row.updated_at
          ) {
            out.failed++;
            await log(
              row.path,
              size,
              'conflict',
              'D1 source changed during verification; source retained',
            );
            continue;
          }
          const deleted = await boundedD1Call('D1 conditional migration purge', () =>
            db.batch([
              db
                .prepare(
                  `DELETE FROM blob_chunks WHERE path = ?1 AND EXISTS (
                     SELECT 1 FROM blobs WHERE path = ?1 AND size = ?2 AND chunk_count = ?3 AND updated_at = ?4
                   )`,
                )
                .bind(row.path, size, Number(row.chunk_count), row.updated_at),
              db
                .prepare(
                  'DELETE FROM blobs WHERE path = ?1 AND size = ?2 AND chunk_count = ?3 AND updated_at = ?4',
                )
                .bind(row.path, size, Number(row.chunk_count), row.updated_at),
            ]),
          );
          if (Number(deleted[1]?.meta?.changes ?? 0) !== 1) {
            out.failed++;
            await log(
              row.path,
              size,
              'conflict',
              'conditional D1 cleanup did not match the verified source',
            );
            continue;
          }
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

    const left = await boundedD1Call('D1 migration remaining count', () =>
      db
        .prepare("SELECT COUNT(*) AS n FROM blobs WHERE path NOT LIKE 'uploads/%'")
        .first<{ n: number }>(),
    );
    out.remaining = Number(left?.n ?? 0);
    await log('-', out.bytes, 'run', JSON.stringify(out));
    return out;
  }

  async delete(p: string): Promise<void> {
    if (this.opts.r2 && this.useR2(p)) {
      const r2 = this.opts.r2;
      await boundedR2Call('R2 blob delete', () => r2.delete(p));
    }
    const db = await this.ensureD1();
    if (db) {
      await boundedD1Call('D1 blob delete', () =>
        db.batch([
          db.prepare('DELETE FROM blob_chunks WHERE path = ?1').bind(p),
          db.prepare('DELETE FROM blobs WHERE path = ?1').bind(p),
        ]),
      );
    } else {
      this.mem.delete(p);
    }
  }
}
