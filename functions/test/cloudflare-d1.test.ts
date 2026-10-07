import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { completeLibraryUpload, startLibraryUpload } from '../src/services/media-library';
import { fakeMp4 } from './support/ctx';
import { D1Store, type D1Database, type D1PreparedStatement, type D1Result } from '../src/store/d1';
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
      sql,
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
    } as unknown as D1PreparedStatement;
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
          const isSelect = /^\s*select\b/i.test((s as unknown as { sql?: string }).sql ?? '');
          out.push((isSelect ? await s.all() : await s.run()) as D1Result<T>);
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

describe('Cloudflare D1 store limits', () => {
  it('loads many documents in one query and keeps a long Persian guide', async () => {
    const db = createSqliteD1();
    let prepares = 0;
    const counting: D1Database = {
      prepare(sql: string) {
        prepares++;
        return db.prepare(sql);
      },
      batch: (statements) => db.batch(statements),
    };
    const store = new D1Store(counting);
    await store.set('products/a', { name: 'کرم الف', brandId: 'brand-1', archived: false });
    await store.set('products/b', { name: 'کرم ب', brandId: 'brand-1', archived: false });
    await store.set('chat_messages/1', {
      userId: 'u1',
      role: 'user',
      text: 'مزیت این محصول چیست',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    await store.set('chat_messages/2', {
      userId: 'u2',
      role: 'user',
      text: 'پیام کاربر دیگر',
      createdAt: '2026-10-01T00:00:01.000Z',
    });
    prepares = 0;
    const rows = await store.getMany<{ name: string }>([
      'products/b',
      'products/missing',
      'products/a',
    ]);
    expect(rows.map((r) => r?.id ?? null)).toEqual(['b', null, 'a']);
    expect(prepares).toBe(1);

    const mine = await store.query<{ userId: string }>({
      collection: 'chat_messages',
      where: [['userId', '==', 'u1']],
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.userId).toBe('u1');

    const document = 'مزیت تأییدشدهٔ محصول. '.repeat(4000);
    await store.set('mentor_guides/product:a', {
      kind: 'product',
      targetId: 'a',
      document,
      summary: 'خلاصهٔ رفتار',
      enabled: true,
    });
    const back = await store.get<{ document: string }>('mentor_guides/product:a');
    expect(back?.document).toBe(document);
    expect(new TextEncoder().encode(JSON.stringify(back)).length).toBeGreaterThan(20_000);
  });
});

describe('Cloudflare D1 + Web Fetch Handler', () => {
  it('keeps the app starting when mentor guide seeding fails, and retries on the next start', async () => {
    const db = createSqliteD1();
    await new D1Store(db).ensureReady();
    await db
      .prepare('INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind('brands', 'broken-brand', 'brands', '{not valid json', '2026-10-04T00:00:00.000Z')
      .run();
    const snapshot: Record<string, Record<string, Data>> = {
      mentor_guides: {
        'brand:broken-brand': {
          kind: 'brand',
          targetId: 'broken-brand',
          title: 'راهنما',
          summary: 'x',
        },
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const store = new D1Store(db, snapshot);
      await expect(store.ensureReady()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
      // The store still works, and no "already applied" marker was written.
      await store.set('probe/1', { ok: true });
      expect(await store.get('probe/1')).toMatchObject({ ok: true });
      expect(await store.get('knowledge_meta/mentor_guides_seed_version')).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('adds missing mentor guides to an existing D1, remaps brand IDs by exact name, and preserves admin guides', async () => {
    const db = createSqliteD1();
    await new D1Store(db).ensureReady();
    const putDoc = (collection: string, id: string, data: Record<string, unknown>) =>
      db
        .prepare('INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(collection, id, collection, JSON.stringify(data), '2026-10-04T00:00:00.000Z');
    await db.batch([
      putDoc('brands', 'live-zen-id', { name: 'زِن', nameLatin: 'Zen' }),
      putDoc('brands', 'live-formi-id', { name: 'فورمی', nameLatin: 'Formi' }),
      putDoc('brands', 'brand-b9jgxnnlhx', { name: 'دارت', nameLatin: 'Dart' }),
      putDoc('mentor_guides', 'global', {
        kind: 'global',
        targetId: null,
        title: 'راهنمای مدیر',
        summary: 'محتوای تنظیم‌شده توسط مدیر',
      }),
      putDoc('mentor_guides', 'brand:brand-b9jgxnnlhx', {
        kind: 'brand',
        targetId: 'brand-b9jgxnnlhx',
        title: 'راهنمای مدیر برای دارت',
        summary: 'محتوای مدیر',
      }),
    ]);

    const snapshot: Record<string, Record<string, Data>> = {
      brands: {
        'brand-sb-zen': { name: 'زِن', nameLatin: 'Zen' },
        'brand-sb-formi': { name: 'فورمی', nameLatin: 'Formi' },
      },
      mentor_guides: {
        global: {
          kind: 'global',
          targetId: null,
          title: 'راهنمای تازه',
          summary: 'این راهنمای global نباید محتوای مدیر را بازنویسی کند.',
        },
        'brand:brand-sb-zen': {
          kind: 'brand',
          targetId: 'brand-sb-zen',
          title: 'زن | روغن بدن Zen',
          summary: 'دانش محصول زن',
        },
        'brand:brand-sb-formi': {
          kind: 'brand',
          targetId: 'brand-sb-formi',
          title: 'فورمی | ست آبرسان',
          summary: 'دانش محصول فورمی',
        },
        'brand:brand-b9jgxnnlhx': {
          kind: 'brand',
          targetId: 'brand-b9jgxnnlhx',
          title: 'دارت | Filler Shot',
          summary: 'دانش محصول دارت',
        },
      },
    };

    const migrated = new D1Store(db, snapshot);
    await migrated.ensureReady();
    expect(
      (await migrated.get<{ summary: string }>('mentor_guides/brand:live-zen-id'))?.summary,
    ).toBe('دانش محصول زن');
    expect(
      (await migrated.get<{ summary: string }>('mentor_guides/brand:live-formi-id'))?.summary,
    ).toBe('دانش محصول فورمی');
    expect(
      (await migrated.get<{ summary: string }>('mentor_guides/brand:brand-b9jgxnnlhx'))?.summary,
    ).toBe('محتوای مدیر');
    expect((await migrated.get<{ summary: string }>('mentor_guides/global'))?.summary).toBe(
      'محتوای تنظیم‌شده توسط مدیر',
    );
    expect(await migrated.get('knowledge_meta/dirty')).not.toBeNull();

    await new D1Store(db, snapshot).ensureReady();
    const guides = await db
      .prepare('SELECT id FROM docs WHERE col = ?1 ORDER BY id')
      .bind('mentor_guides')
      .all<{ id: string }>();
    expect(guides.results?.map((row) => row.id)).toEqual([
      'brand:brand-b9jgxnnlhx',
      'brand:live-formi-id',
      'brand:live-zen-id',
      'global',
    ]);
  });

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
      new Request('https://learn.pages.dev/v1/auth/phone-login', {
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

  it('readRange fetches only the needed chunks and supports non-256KB chunk sizes', async () => {
    const db = createSqliteD1();
    const deps = await buildCloudflareDeps({ DB: db, APP_ENV: 'dev' }, seedSnapshot);
    const data = Buffer.alloc(1_000_000);
    for (let i = 0; i < data.length; i++) data[i] = (i * 13 + 5) & 0xff;

    await deps.blob.put('media/audio/a.m4a', data, 'audio/mp4'); // 256 KB chunks
    // Same bytes, but stored the way the REST import script does it: 64 KB chunks.
    const SMALL = 64 * 1024;
    const n = Math.ceil(data.length / SMALL);
    const stmts = [];
    for (let i = 0; i < n; i++)
      stmts.push(
        db
          .prepare('INSERT INTO blob_chunks (path, idx, data) VALUES (?1, ?2, ?3)')
          .bind(
            'media/audio/b.m4a',
            i,
            data.subarray(i * SMALL, (i + 1) * SMALL).toString('base64'),
          ),
      );
    stmts.push(
      db
        .prepare(
          "INSERT INTO blobs (path, content_type, size, chunk_count, updated_at) VALUES (?1, 'audio/mp4', ?2, ?3, 'x')",
        )
        .bind('media/audio/b.m4a', data.length, n),
    );
    await db.batch(stmts);

    for (const path of ['media/audio/a.m4a', 'media/audio/b.m4a']) {
      for (const [start, end] of [
        [0, 63],
        [65_530, 65_545],
        [262_140, 262_150],
        [500_000, 700_000],
        [999_990, 999_999],
        [999_990, 5_000_000],
      ] as const) {
        const got = await deps.blob.readRange(path, start, end);
        expect(Buffer.compare(got, data.subarray(start, Math.min(end, data.length - 1) + 1))).toBe(
          0,
        );
      }
    }
  });

  it('composes uploaded parts inside the database, with a handful of queries and no leftovers', async () => {
    const db = createSqliteD1();
    const deps = await buildCloudflareDeps({ DB: db, APP_ENV: 'dev' }, seedSnapshot);
    const MB = 1024 * 1024;
    const total = 5 * MB + 12_345; // 6 parts of 1 MB, last one short
    const data = Buffer.alloc(total);
    for (let i = 0; i < total; i++) data[i] = (i * 7 + 3) & 0xff;
    const parts: Array<{ path: string; size: number }> = [];
    for (let i = 0; i * MB < total; i++) {
      const slice = data.subarray(i * MB, Math.min(total, (i + 1) * MB));
      await deps.blob.put(`uploads/m1/${i}`, slice, 'video/mp4');
      parts.push({ path: `uploads/m1/${i}`, size: slice.length });
    }
    await deps.blob.put('uploads/other/0', Buffer.alloc(10), 'video/mp4');

    const listed = await deps.blob.listStored?.('uploads/m1/');
    expect(listed?.map((p) => p.size).sort()).toEqual(parts.map((p) => p.size).sort());

    const ok = await deps.blob.composeParts?.(parts, 'media/video/m1.mp4', 'video/mp4');
    expect(ok).toBe(true);
    expect((await deps.blob.stat('media/video/m1.mp4'))?.size).toBe(total);
    const all = await deps.blob.readRange('media/video/m1.mp4', 0, total - 1);
    expect(Buffer.compare(all, data)).toBe(0);
    const edge = await deps.blob.readRange('media/video/m1.mp4', MB - 5, MB + 5);
    expect(Buffer.compare(edge, data.subarray(MB - 5, MB + 6))).toBe(0);

    // part rows were re-keyed, not copied: nothing is left under uploads/m1, other uploads untouched
    expect((await deps.blob.listStored?.('uploads/m1/'))?.length).toBe(0);
    expect((await deps.blob.listStored?.('uploads/other/'))?.length).toBe(1);
    expect(await deps.blob.deletePrefix?.('uploads/other/')).toBe(true);
    expect((await deps.blob.listStored?.('uploads/other/'))?.length).toBe(0);

    // a part that is not a whole number of chunks cannot be composed
    await deps.blob.put('uploads/bad/0', Buffer.alloc(300_000), 'video/mp4');
    await deps.blob.put('uploads/bad/1', Buffer.alloc(10), 'video/mp4');
    await expect(
      deps.blob.composeParts?.(
        [
          { path: 'uploads/bad/0', size: 300_000 },
          { path: 'uploads/bad/1', size: 10 },
        ],
        'media/video/bad.mp4',
        'video/mp4',
      ),
    ).rejects.toThrow();
  });

  it('uploads a 38 MB video through the library flow within the free-plan call budget', async () => {
    const real = createSqliteD1();
    let calls = 0;
    let inBatch = false;
    const wrap = (st: D1PreparedStatement): D1PreparedStatement =>
      new Proxy(st, {
        get(t, k, r) {
          const v = Reflect.get(t, k, r);
          if (typeof v !== 'function') return v;
          if (k === 'bind') return (...a: unknown[]) => wrap(v.apply(t, a));
          if (['first', 'all', 'run', 'raw'].includes(String(k)))
            return (...a: unknown[]) => {
              if (!inBatch) calls++;
              return v.apply(t, a);
            };
          return v.bind(t);
        },
      });
    const db: D1Database = {
      prepare: (q) => wrap(real.prepare(q)),
      batch: async (stmts) => {
        calls++;
        inBatch = true;
        try {
          return await real.batch(stmts);
        } finally {
          inBatch = false;
        }
      },
    };
    const deps = await buildCloudflareDeps({ DB: db, APP_ENV: 'dev' }, seedSnapshot);
    const MB = 1024 * 1024;
    const size = 38 * MB + 779_803;
    const body = Buffer.concat([fakeMp4(451), Buffer.alloc(size - fakeMp4(451).length, 7)]);
    const actor = { id: 'u-admin', role: 'admin' as const };

    const { mediaId, totalParts } = await startLibraryUpload(deps, actor, {
      kind: 'video',
      fileName: 'big.mp4',
      mime: 'video/mp4',
      sizeBytes: body.length,
    });
    expect(totalParts).toBe(39);
    for (let i = 0; i < totalParts; i++) {
      calls = 0;
      await deps.blob.put(
        `uploads/${mediaId}/${i}`,
        body.subarray(i * MB, (i + 1) * MB),
        'video/mp4',
      );
      expect(calls).toBeLessThanOrEqual(2); // one part per request: 1 database call
    }

    calls = 0;
    const item = await completeLibraryUpload(deps, actor, mediaId, { durationSec: 451 });
    expect(calls).toBeLessThan(40); // the free plan allows 50 per request
    expect(item.sizeBytes).toBe(body.length);
    const stored = await deps.blob.readRange(
      `media/video/${mediaId}.mp4`,
      body.length - 100,
      body.length - 1,
    );
    expect(Buffer.compare(stored, body.subarray(body.length - 100))).toBe(0);
    expect((await deps.blob.listStored?.(`uploads/${mediaId}/`))?.length).toBe(0);
    const leftovers = await real
      .prepare("SELECT COUNT(*) AS c FROM blob_chunks WHERE path LIKE 'uploads/%'")
      .first<{ c: number }>('c');
    expect(Number(leftovers)).toBe(0);
  }, 15_000);

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

  it('cold start on an already-seeded database costs a single D1 round trip', async () => {
    const real = createSqliteD1();
    await new D1Store(real, seedSnapshot).ensureReady(); // first boot seeds the catalog
    await new D1Store(real, seedSnapshot).ensureReady(); // second boot records the guide-seed marker

    let calls = 0;
    let inBatch = false;
    const counted: D1Database = {
      prepare: (sql) => {
        const st = real.prepare(sql);
        const wrap = (stmt: D1PreparedStatement): D1PreparedStatement => ({
          bind: (...v) => wrap(stmt.bind(...v)),
          first: (...a) => {
            if (!inBatch) calls++;
            return (stmt.first as (...x: unknown[]) => Promise<never>)(...a);
          },
          all: () => {
            if (!inBatch) calls++;
            return stmt.all();
          },
          run: () => {
            if (!inBatch) calls++;
            return stmt.run();
          },
          ...({ sql } as object),
        });
        return wrap(st);
      },
      batch: async (stmts) => {
        calls++;
        inBatch = true;
        try {
          return await real.batch(stmts);
        } finally {
          inBatch = false;
        }
      },
    };
    await new D1Store(counted, seedSnapshot).ensureReady();
    expect(calls).toBe(1);
  });
});
