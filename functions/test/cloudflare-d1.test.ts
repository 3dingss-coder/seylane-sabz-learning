import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/store/d1';
import type { Data } from '../src/store/types';
import { buildCloudflareDeps, createFetchHandler } from '../src/web-handler';

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

const snapshotPath = path.resolve(__dirname, '..', 'lib', 'seed-snapshot.json');
const seedSnapshot: Record<string, Record<string, Data>> | undefined = fs.existsSync(snapshotPath)
  ? (JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Record<string, Record<string, Data>>)
  : undefined;

describe('Cloudflare D1 + Web Fetch Handler', () => {
  it('auto-migrates schema, auto-seeds snapshot, and persists data & sessions across cold starts', async () => {
    const db = createSqliteD1();

    // Instance 1 (first cold start: creates tables + seeds catalog)
    const deps1 = await buildCloudflareDeps({ DB: db, APP_ENV: 'prod' }, seedSnapshot);
    const handler1 = createFetchHandler(deps1);

    // 1. Health check reports d1 backend
    const healthRes = await handler1(new Request('https://learn.pages.dev/v1/health'));
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as {
      data: { status: string; backend: string; env: string };
    };
    expect(healthJson.data.status).toBe('ok');
    expect(healthJson.data.backend).toBe('d1');

    // 2. Register a new user in D1
    const regRes = await handler1(
      new Request('https://learn.pages.dev/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'کاربر کلودفلر',
          identifier: '09359998877',
          password: 'pass1234',
        }),
      }),
    );
    expect(regRes.status).toBe(201);
    const regData = (await regRes.json()) as {
      data: { idToken: string; refreshToken: string; user: { id: string; phone: string } };
    };
    expect(regData.data.user.phone).toBe('09359998877');

    // 3. Simulate a serverless cold start (new Worker isolate with the same D1 database)
    const deps2 = await buildCloudflareDeps({ DB: db, APP_ENV: 'prod' }, seedSnapshot);
    const handler2 = createFetchHandler(deps2);

    // Refresh token issued by Instance 1 works on Instance 2 because signing secret & user live in D1
    const refreshRes = await handler2(
      new Request('https://learn.pages.dev/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: regData.data.refreshToken }),
      }),
    );
    expect(refreshRes.status).toBe(200);
    const refreshed = (await refreshRes.json()) as { data: { idToken: string } };

    const meRes = await handler2(
      new Request('https://learn.pages.dev/v1/me', {
        headers: { Authorization: `Bearer ${refreshed.data.idToken}` },
      }),
    );
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as { data: { name: string } };
    expect(meJson.data.name).toBe('کاربر کلودفلر');

    // 4. Phone-only login works even when APP_ENV=prod on Cloudflare D1
    const phoneLoginRes = await handler2(
      new Request('https://learn.pages.dev/v1/auth/demo-phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '09359998877' }),
      }),
    );
    expect(phoneLoginRes.status).toBe(200);
  });

  it('stores and serves uploaded media blobs in D1 with Range support', async () => {
    const db = createSqliteD1();
    const deps = await buildCloudflareDeps({ DB: db, APP_ENV: 'dev' }, seedSnapshot);

    // Create a minimal valid PNG header (16 bytes)
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);
    await deps.blob.put('brands/custom/logo.png', Buffer.from(pngBytes), 'image/png');

    // Read via public catalog URL on a fresh cold-start handler
    const deps2 = await buildCloudflareDeps({ DB: db, APP_ENV: 'dev' }, seedSnapshot);
    const handler2 = createFetchHandler(deps2);

    const pubRes = await handler2(
      new Request('https://learn.pages.dev/v1/files/public/brands/custom/logo.png'),
    );
    expect(pubRes.status).toBe(200);
    expect(pubRes.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await pubRes.arrayBuffer())).toEqual(pngBytes);

    // Range request returns 206 Partial Content
    const signedUrl = await deps2.blob.signedReadUrl('brands/custom/logo.png', 3600);
    const rangeRes = await handler2(
      new Request(`https://learn.pages.dev${signedUrl}`, {
        headers: { Range: 'bytes=0-3' },
      }),
    );
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get('content-range')).toBe('bytes 0-3/16');
    expect(new Uint8Array(await rangeRes.arrayBuffer())).toEqual(pngBytes.subarray(0, 4));

    // Built-in catalog asset not in D1 redirects 302 to /catalog/...
    const fallbackRes = await handler2(
      new Request('https://learn.pages.dev/v1/files/public/brands/dafi/logo.png'),
    );
    expect(fallbackRes.status).toBe(302);
    expect(fallbackRes.headers.get('location')).toBe('/catalog/brands/dafi/logo.png');
  });

  it('stores large blobs in small staged batches and leaves no staging rows behind', async () => {
    const db = createSqliteD1();
    const deps = await buildCloudflareDeps({ DB: db, APP_ENV: 'dev' }, seedSnapshot);

    // 3 MB -> 12 chunks of 256 KB -> two staged batches + one atomic swap.
    const big = Buffer.alloc(3 * 1024 * 1024);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff;
    await deps.blob.put('media/video/big.mp4', big, 'video/mp4');

    const stat = await deps.blob.stat('media/video/big.mp4');
    expect(stat?.size).toBe(big.length);
    const mid = await deps.blob.readRange('media/video/big.mp4', 1_000_000, 1_000_099);
    expect(Buffer.compare(mid, big.subarray(1_000_000, 1_000_100))).toBe(0);

    // Overwriting with a smaller file replaces every old chunk.
    const small = Buffer.alloc(300 * 1024, 9);
    await deps.blob.put('media/video/big.mp4', small, 'video/mp4');
    expect((await deps.blob.stat('media/video/big.mp4'))?.size).toBe(small.length);
    const tail = await deps.blob.readRange(
      'media/video/big.mp4',
      small.length - 10,
      small.length - 1,
    );
    expect(Buffer.compare(tail, small.subarray(small.length - 10))).toBe(0);

    const leftovers = await db
      .prepare("SELECT COUNT(*) AS c FROM blob_chunks WHERE path LIKE '%__up-%'")
      .first<{ c: number }>('c');
    expect(Number(leftovers)).toBe(0);
    const chunks = await db
      .prepare('SELECT COUNT(*) AS c FROM blob_chunks WHERE path = ?1')
      .bind('media/video/big.mp4')
      .first<{ c: number }>('c');
    expect(Number(chunks)).toBe(2);
  });
});
