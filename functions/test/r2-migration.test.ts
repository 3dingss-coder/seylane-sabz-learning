import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareBlobStore, type R2BucketLike } from '../src/blob/cloudflare';
import {
  D1_CALL_TIMEOUT_MS,
  type D1Database,
  type D1PreparedStatement,
  type D1Result,
} from '../src/store/d1';

interface SqliteStatement {
  get(...params: Array<string | number | null>): Record<string, unknown> | undefined;
  all(...params: Array<string | number | null>): unknown[];
  run(...params: Array<string | number | null>): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
}

const requireSqlite = createRequire(__filename);
afterEach(() => vi.useRealTimers());
const { DatabaseSync } = requireSqlite('node:sqlite') as {
  DatabaseSync: new (location: string) => SqliteDatabase;
};

/**
 * Wraps Node's built-in SQLite (`node:sqlite`) in Cloudflare's `D1Database` interface
 * so we can test the exact SQL queries, batching, auto-seeding, and blob chunking locally.
 */
function createSqliteD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');

  const makeStmt = (sql: string, bound: unknown[] = []): D1PreparedStatement => {
    // Convert ?1, ?2 positional parameters to standard ? for node:sqlite if needed
    const prepareAndRun = () => {
      const stmt = sqlite.prepare(sql);
      return stmt;
    };
    return {
      bind(...values: unknown[]): D1PreparedStatement {
        return makeStmt(sql, values);
      },
      async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
        const stmt = prepareAndRun();
        const row = stmt.get(...(bound as Array<string | number | null>)) as
          Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        const stmt = prepareAndRun();
        const rows = stmt.all(...(bound as Array<string | number | null>)) as T[];
        return { results: rows, success: true, meta: { rows_read: rows.length } };
      },
      async run(): Promise<D1Result> {
        const stmt = prepareAndRun();
        const info = stmt.run(...(bound as Array<string | number | null>));
        return {
          success: true,
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
    };
  };

  return {
    prepare(query: string): D1PreparedStatement {
      return makeStmt(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN');
      try {
        const out: D1Result<T>[] = [];
        for (const s of statements) {
          out.push((await s.run()) as D1Result<T>);
        }
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

class FakeR2 implements R2BucketLike {
  objects = new Map<string, { data: Uint8Array; contentType: string }>();
  async put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    o?: {
      httpMetadata?: { contentType?: string };
      onlyIf?: { etagDoesNotMatch?: string };
    },
  ) {
    if (o?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    const data = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.objects.set(key, { data, contentType: o?.httpMetadata?.contentType ?? '' });
    return { size: data.byteLength };
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.data.byteLength, httpMetadata: { contentType: o.contentType } } : null;
  }
  async get(key: string, o?: { range?: { offset: number; length: number } }) {
    const obj = this.objects.get(key);
    if (!obj) return null;
    const data = o?.range
      ? obj.data.slice(o.range.offset, o.range.offset + o.range.length)
      : obj.data;
    return {
      size: obj.data.byteLength,
      httpMetadata: { contentType: obj.contentType },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }),
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    };
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

function need(r2: FakeR2, key: string) {
  const o = r2.objects.get(key);
  if (!o) throw new Error(`missing ${key}`);
  return o;
}

function bytesOf(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed + (i >> 8)) & 255;
  return out;
}

async function setup(purge: boolean) {
  const db = createSqliteD1();
  const r2 = new FakeR2();
  const store = new CloudflareBlobStore('secret', { db, r2, purgeAfterMigrate: purge });
  // Legacy files: written while NO R2 bucket was bound (they sit in D1).
  const legacy = new CloudflareBlobStore('secret', { db });
  const small = bytesOf(600_000, 1); // 3 chunks of 256 KB
  const big = bytesOf(20 * 1024 * 1024 + 123, 2); // > 16 MB -> multipart path
  await legacy.put('media/audio/small.mp4', small, 'audio/mp4');
  await legacy.put('media/video/big.mp4', big, 'video/mp4');
  await legacy.put('uploads/m1/0', bytesOf(1000, 3), 'application/octet-stream');
  return { db, r2, store, small, big };
}

describe('D1 -> R2 media move', () => {
  it('bounds a stalled R2 stat without pretending the read completed', async () => {
    vi.useFakeTimers();
    const r2 = new FakeR2();
    r2.head = () => new Promise(() => {});
    const store = new CloudflareBlobStore('secret', { r2 });
    const pending = store.stat('media/video/stalled.mp4');
    const result = expect(pending).rejects.toThrow(/R2 blob stat timed out/);
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 1);
    await result;
  });

  it('gives same-millisecond same-size D1 rewrites distinct purge-guard versions', async () => {
    const db = createSqliteD1();
    const writer = new CloudflareBlobStore('secret', { db, now: () => 123_456 });
    await writer.put('media/audio/versioned.mp4', bytesOf(1024, 1), 'audio/mp4');
    const first = await db
      .prepare('SELECT updated_at FROM blobs WHERE path = ?1')
      .bind('media/audio/versioned.mp4')
      .first<{ updated_at: string }>();
    await writer.put('media/audio/versioned.mp4', bytesOf(1024, 2), 'audio/mp4');
    const second = await db
      .prepare('SELECT updated_at FROM blobs WHERE path = ?1')
      .bind('media/audio/versioned.mp4')
      .first<{ updated_at: string }>();
    expect(first?.updated_at).toContain(new Date(123_456).toISOString());
    expect(second?.updated_at).toContain(new Date(123_456).toISOString());
    expect(second?.updated_at).not.toBe(first?.updated_at);
  });

  it('writes new files to R2 but keeps resumable-upload staging parts in D1', async () => {
    const db = createSqliteD1();
    const r2 = new FakeR2();
    const store = new CloudflareBlobStore('secret', { db, r2 });
    await store.put('products/p1/main.jpg', bytesOf(5000, 9), 'image/jpeg');
    await store.put('uploads/m2/0', bytesOf(5000, 9), 'application/octet-stream');
    expect(r2.objects.has('products/p1/main.jpg')).toBe(true);
    expect(r2.objects.has('uploads/m2/0')).toBe(false);
    expect((await store.stat('uploads/m2/0'))?.size).toBe(5000);
    const rng = await store.readRange('products/p1/main.jpg', 10, 19);
    expect(Array.from(rng)).toEqual(Array.from(bytesOf(5000, 9).subarray(10, 20)));
  });

  it('keeps serving not-yet-moved files from D1 while R2 is bound', async () => {
    const { store, small } = await setup(false);
    expect((await store.stat('media/audio/small.mp4'))?.size).toBe(small.byteLength);
    const part = await store.readRange('media/audio/small.mp4', 300_000, 300_099);
    expect(Array.from(part)).toEqual(Array.from(small.subarray(300_000, 300_100)));
    const whole = await store.read('media/audio/small.mp4');
    expect(whole?.data.byteLength).toBe(small.byteLength);
  });

  it('conditionally copies small files and retains large D1 files without safe multipart preconditions', async () => {
    const { db, r2, store, small } = await setup(false);
    const res = await store.migrateToObjectStorage({ maxFiles: 10, maxBytes: 100 * 1024 * 1024 });
    expect(res).toMatchObject({ moved: 1, failed: 1, purged: 0, remaining: 2 });
    expect(
      Buffer.compare(Buffer.from(need(r2, 'media/audio/small.mp4').data), Buffer.from(small)),
    ).toBe(0);
    expect(r2.objects.has('media/video/big.mp4')).toBe(false);
    expect((await store.stat('media/video/big.mp4'))?.size).toBe(20 * 1024 * 1024 + 123);
    expect(r2.objects.has('uploads/m1/0')).toBe(false);
    const left = await db.prepare('SELECT COUNT(*) AS n FROM blobs').first<{ n: number }>();
    expect(Number(left?.n)).toBe(3);
  });

  it('never overwrites or purges D1 when a same-size R2 object contains different bytes', async () => {
    const { db, r2, store, small } = await setup(true);
    const corrupt = bytesOf(small.byteLength, 99);
    await r2.put('media/audio/small.mp4', corrupt, { httpMetadata: { contentType: 'audio/mp4' } });

    const res = await store.migrateToObjectStorage({ maxFiles: 1 });
    expect(res).toMatchObject({ moved: 0, failed: 1, purged: 0, remaining: 2 });
    expect(
      Buffer.compare(Buffer.from(need(r2, 'media/audio/small.mp4').data), Buffer.from(corrupt)),
    ).toBe(0);
    const retained = await db
      .prepare('SELECT path FROM blobs WHERE path = ?1')
      .bind('media/audio/small.mp4')
      .first<{ path: string }>();
    expect(retained?.path).toBe('media/audio/small.mp4');
  });

  it('uses R2 conditional PUT when an object appears after HEAD and keeps the D1 source', async () => {
    const { db, r2, store, small } = await setup(false);
    const concurrent = bytesOf(small.byteLength, 99);
    const originalHead = r2.head.bind(r2);
    let injected = false;
    r2.head = async (key) => {
      const before = await originalHead(key);
      if (key === 'media/audio/small.mp4' && !injected) {
        injected = true;
        r2.objects.set(key, { data: concurrent, contentType: 'audio/mp4' });
      }
      return before;
    };

    const res = await store.migrateToObjectStorage({ maxFiles: 1 });
    expect(res).toMatchObject({ moved: 0, failed: 1, purged: 0, remaining: 2 });
    expect(
      Buffer.compare(Buffer.from(need(r2, 'media/audio/small.mp4').data), Buffer.from(concurrent)),
    ).toBe(0);
    expect(
      (
        await db
          .prepare('SELECT path FROM blobs WHERE path = ?1')
          .bind('media/audio/small.mp4')
          .first<{ path: string }>()
      )?.path,
    ).toBe('media/audio/small.mp4');
  });

  it('with purge on, removes only the verified small D1 copy and retains the unsafe large file', async () => {
    const { db, r2, store, small } = await setup(true);
    const res = await store.migrateToObjectStorage({ maxFiles: 10, maxBytes: 100 * 1024 * 1024 });
    expect(res).toMatchObject({ moved: 1, purged: 1, failed: 1, remaining: 1 });
    const rows = await db.prepare('SELECT path FROM blobs').all<{ path: string }>();
    expect((rows.results ?? []).map((r) => r.path).sort()).toEqual([
      'media/video/big.mp4',
      'uploads/m1/0',
    ]);
    const again = await store.read('media/audio/small.mp4');
    expect(Buffer.compare(Buffer.from(again?.data ?? new Uint8Array()), Buffer.from(small))).toBe(
      0,
    );
    expect(r2.objects.size).toBe(1);
    const idle = await store.migrateToObjectStorage();
    expect(idle).toMatchObject({ moved: 0, remaining: 1 });
  });

  it('migrates in bounded batches and never loses a file when R2 fails', async () => {
    const { r2, store } = await setup(true);
    const first = await store.migrateToObjectStorage({ maxFiles: 1 });
    expect(first?.moved).toBe(1);
    expect(first?.remaining).toBe(1);
    const real = r2.put.bind(r2);
    r2.put = async () => {
      throw new Error('R2 down');
    };
    const failed = await store.migrateToObjectStorage({ maxFiles: 5 });
    expect(failed).toMatchObject({ moved: 0, failed: 1, purged: 0, remaining: 1 });
    r2.put = real;
  });

  it('is a no-op without an R2 bucket', async () => {
    const store = new CloudflareBlobStore('secret', { db: createSqliteD1() });
    expect(await store.migrateToObjectStorage()).toBeNull();
  });

  it('logs repeated runs while preserving large files whose R2 multipart write cannot be conditional', async () => {
    const { db, r2, store, small } = await setup(false);
    // Repeated manual runs verify the already-copied small file and keep the large D1 source.
    for (let i = 0; i < 4; i++) await store.migrateToObjectStorage({ maxFiles: 1 });
    expect(
      Buffer.compare(Buffer.from(need(r2, 'media/audio/small.mp4').data), Buffer.from(small)),
    ).toBe(0);
    expect(r2.objects.has('media/video/big.mp4')).toBe(false);
    const last = await store.migrateToObjectStorage({ maxFiles: 1 });
    expect(last).toMatchObject({ moved: 0, verified: 1, failed: 1, remaining: 2 });
    const log = await db
      .prepare('SELECT status, COUNT(*) AS n FROM blob_migration_log GROUP BY status')
      .all<{ status: string; n: number }>();
    const by = Object.fromEntries((log.results ?? []).map((r) => [r.status, Number(r.n)]));
    expect(by['copied-and-verified']).toBe(1);
    expect(by.failed).toBe(4);
    expect(by.run).toBe(5);
  });
});
