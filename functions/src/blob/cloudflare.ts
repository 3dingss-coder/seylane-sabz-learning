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

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
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
    } = {},
  ) {}

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
    if (this.opts.r2) {
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
    if (this.opts.r2) {
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
    if (this.opts.r2) {
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

  async readRange(p: string, start: number, end: number): Promise<Buffer> {
    const file = await this.read(p);
    if (!file) throw new Error(`Blob not found: ${p}`);
    return toBufferLike(file.data.subarray(start, end + 1));
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

  async delete(p: string): Promise<void> {
    if (this.opts.r2) {
      await this.opts.r2.delete(p);
      return;
    }
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
