import { randomBytesBase64Url } from '../lib/crypto';
import { applyUpdate, cmp, deepMerge, getField, matches, splitPath } from './helpers';
import {
  StoreConflictError,
  StoreNotFoundError,
  type Data,
  type Doc,
  type DocStore,
  type Input,
  type QuerySpec,
  type TxOps,
} from './types';

export interface D1Meta {
  changes?: number;
  duration?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export const D1_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS docs (
    col TEXT NOT NULL,
    id TEXT NOT NULL,
    grp TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (col, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_docs_grp ON docs (grp)`,
  `CREATE TABLE IF NOT EXISTS blobs (
    path TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS blob_chunks (
    path TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (path, idx)
  )`,
] as const;

const schemaReady = new WeakMap<object, Promise<void>>();

/** Records that the schema was verified for this D1 binding, so nobody repeats the DDL batch. */
function markSchemaReady(db: D1Database): void {
  schemaReady.set(db, Promise.resolve());
}

/** DDL batch, run at most once per D1 binding per isolate (shared by the store and blob store). */
export function ensureD1Schema(db: D1Database): Promise<void> {
  let p = schemaReady.get(db);
  if (!p) {
    p = db
      .batch(D1_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)))
      .then(() => undefined)
      .catch((err) => {
        schemaReady.delete(db);
        throw err;
      });
    schemaReady.set(db, p);
  }
  return p;
}

function toPlainData(v: Input): Data {
  const out = JSON.parse(JSON.stringify(v)) as Data;
  delete out.id;
  return out;
}

function parseRow<T>(id: string, raw: string): Doc<T> {
  const parsed = JSON.parse(raw) as Data;
  if (typeof parsed.expireAt === 'string') parsed.expireAt = new Date(parsed.expireAt);
  return { ...parsed, id } as Doc<T>;
}

function normalizeCatalogName(value: unknown): string {
  return typeof value === 'string'
    ? value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\u064b-\u065f\u0670ـ]/g, '')
        .replace(/[\u200c\s\-_]+/g, ' ')
        .trim()
    : '';
}

/** Deterministic lightweight fingerprint so D1 applies each additive guide snapshot once. */
function mentorGuideSnapshotVersion(snapshot: Record<string, Data>): string {
  const source = Object.keys(snapshot)
    .sort()
    .map((id) => `${id}:${JSON.stringify(snapshot[id])}`)
    .join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Cloudflare D1 (SQLite at the edge) implementation of DocStore.
 * Automatically creates tables and seeds initial catalog/demo data on first request.
 */
const MAX_ROW_JSON = 1_800_000;

/**
 * Upper bound for one D1 call / the one-time init. A stalled call must fail fast: the queue and
 * the init promise are shared by every request in an isolate, so one call that never settles would
 * otherwise freeze them all until the runtime cancels the Worker ("code had hung").
 */
export const D1_CALL_TIMEOUT_MS = 15_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
const GET_MANY_CHUNK = 90;

export class D1Store implements DocStore {
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** D1 allows 6 connections per invocation and runs one query at a time. Serialize SQL. */
  private io: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: D1Database,
    private readonly seedSnapshot?: Record<string, Record<string, Data>>,
  ) {}

  async ensureReady(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = withTimeout(this.initialize(), D1_CALL_TIMEOUT_MS * 2, 'D1 init').catch(
        (err) => {
          this.initPromise = null;
          throw err;
        },
      );
    }
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    // ONE D1 round trip on a cold start: the schema DDL plus the two reads the seeding decision
    // needs (was the catalog seeded? which mentor-guide snapshot version was applied?).
    const ddl = D1_SCHEMA_STATEMENTS.map((sql) => this.db.prepare(sql));
    if (!this.seedSnapshot) {
      await this.db.batch(ddl);
      markSchemaReady(this.db);
      return;
    }
    const probes = [
      this.db.prepare('SELECT id FROM docs WHERE col = ?1 LIMIT 1').bind('brands'),
      this.db
        .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
        .bind('knowledge_meta', 'mentor_guides_seed_version'),
    ];
    const res = await this.db.batch<{ id?: string; data?: string }>([...ddl, ...probes]);
    markSchemaReady(this.db);
    const existing = res[ddl.length]?.results?.[0];
    const marker = res[ddl.length + 1]?.results?.[0];
    if (existing) {
      // Additive and optional: a problem here must never keep the whole app from starting.
      // Nothing is marked as applied on failure, so the next cold start simply tries again.
      try {
        await this.seedMissingMentorGuides(marker?.data ?? null);
      } catch (err) {
        console.warn(
          `[d1] mentor guide seeding skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    const now = new Date().toISOString();
    const stmts: D1PreparedStatement[] = [];
    for (const [col, docs] of Object.entries(this.seedSnapshot)) {
      if (!docs || typeof docs !== 'object') continue;
      const grp = col.split('/').pop() ?? col;
      for (const [id, row] of Object.entries(docs)) {
        if (!row || typeof row !== 'object') continue;
        const clean = toPlainData(row);
        stmts.push(
          this.db
            .prepare(
              'INSERT OR IGNORE INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)',
            )
            .bind(col, id, grp, JSON.stringify(clean), now),
        );
      }
    }
    const CHUNK = 80;
    for (let i = 0; i < stmts.length; i += CHUNK) {
      await this.db.batch(stmts.slice(i, i + CHUNK));
    }
  }

  /** Run one D1 call at a time so a Promise.all of reads cannot open a 7th connection. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.io.then(
      () => withTimeout(fn(), D1_CALL_TIMEOUT_MS, 'D1 call'),
      () => withTimeout(fn(), D1_CALL_TIMEOUT_MS, 'D1 call'),
    );
    this.io = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Existing D1 databases are not re-seeded with the full catalog snapshot. Still, additive
   * mentor guides shipped in a new Worker snapshot must reach those databases. Import only
   * missing guide rows, never overwrite admin-authored guides, and remap a seeded brand ID by
   * exact brand name/Latin name when the live catalog uses a different ID.
   */
  private async seedMissingMentorGuides(appliedData?: string | null): Promise<void> {
    const snapshotGuides = this.seedSnapshot?.mentor_guides;
    if (!snapshotGuides) return;

    const version = mentorGuideSnapshotVersion(snapshotGuides);
    const applied =
      appliedData !== undefined
        ? appliedData === null
          ? null
          : { data: appliedData }
        : await this.db
            .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
            .bind('knowledge_meta', 'mentor_guides_seed_version')
            .first<{ data: string }>();
    if (applied) {
      try {
        if ((JSON.parse(applied.data) as { version?: string }).version === version) return;
      } catch {
        // Replace malformed migration marker below and try the safe INSERT OR IGNORE again.
      }
    }

    const [brandResult, guideResult] = await Promise.all([
      this.db.prepare('SELECT id, data FROM docs WHERE col = ?1').bind('brands').all<{
        id: string;
        data: string;
      }>(),
      this.db.prepare('SELECT id FROM docs WHERE col = ?1').bind('mentor_guides').all<{
        id: string;
      }>(),
    ]);
    const liveBrands = (brandResult.results ?? []).map((row) => ({
      id: row.id,
      data: JSON.parse(row.data) as Record<string, unknown>,
    }));
    const liveBrandIds = new Set(liveBrands.map((row) => row.id));
    const existingGuideIds = new Set((guideResult.results ?? []).map((row) => row.id));
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    for (const [seedDocId, seedGuide] of Object.entries(snapshotGuides)) {
      if (!seedGuide || typeof seedGuide !== 'object' || existingGuideIds.has(seedDocId)) continue;
      const guide = seedGuide as Record<string, unknown>;
      const kind = guide.kind;
      if (kind === 'global' || seedDocId === 'global') {
        statements.push(this.mentorGuideInsert(seedDocId, guide, now));
        continue;
      }
      if (kind !== 'brand') continue;

      const sourceTargetId =
        typeof guide.targetId === 'string'
          ? guide.targetId
          : seedDocId.slice(seedDocId.indexOf(':') + 1);
      if (!sourceTargetId || sourceTargetId === seedDocId) continue;

      const targetId = liveBrandIds.has(sourceTargetId)
        ? sourceTargetId
        : this.matchLiveBrandId(sourceTargetId, guide, liveBrands);
      if (!targetId) {
        console.warn(
          `[d1] skipping seeded brand mentor guide ${seedDocId}: no unambiguous live catalog match`,
        );
        continue;
      }

      const docId = `brand:${targetId}`;
      if (existingGuideIds.has(docId)) continue;
      statements.push(this.mentorGuideInsert(docId, { ...guide, kind, targetId }, now));
    }

    const results = statements.length ? await this.db.batch(statements) : [];
    const inserted = results.some((result) => (result.meta?.changes ?? 0) > 0);
    if (inserted) {
      // Guide changes need an incremental knowledge-index rebuild before retrieval.
      const dirty = JSON.stringify({ at: now });
      await this.db
        .prepare(
          `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        )
        .bind('knowledge_meta', 'dirty', 'knowledge_meta', dirty, now)
        .run();
    }

    // One small persistent version marker prevents scanning the catalog on every isolate.
    const marker = JSON.stringify({ version });
    await this.db
      .prepare(
        `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .bind('knowledge_meta', 'mentor_guides_seed_version', 'knowledge_meta', marker, now)
      .run();
  }

  private matchLiveBrandId(
    sourceTargetId: string,
    guide: Record<string, unknown>,
    liveBrands: Array<{ id: string; data: Record<string, unknown> }>,
  ): string {
    const sourceBrand = this.seedSnapshot?.brands?.[sourceTargetId] as
      Record<string, unknown> | undefined;
    const titleHint = typeof guide.title === 'string' ? guide.title.split(/[|｜]/, 1)[0] : '';
    const sourceNames = [sourceBrand?.name, sourceBrand?.nameLatin, titleHint]
      .map(normalizeCatalogName)
      .filter(Boolean);
    if (!sourceNames.length) return '';

    const matches = liveBrands.filter((row) =>
      [row.data.name, row.data.nameLatin]
        .map(normalizeCatalogName)
        .some((name) => name && sourceNames.includes(name)),
    );
    const match = matches.length === 1 ? matches[0] : undefined;
    return match?.id ?? '';
  }

  private mentorGuideInsert(
    id: string,
    guide: Record<string, unknown>,
    now: string,
  ): D1PreparedStatement {
    const clean = toPlainData(guide);
    return this.db
      .prepare(
        'INSERT OR IGNORE INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      )
      .bind('mentor_guides', id, 'mentor_guides', JSON.stringify(clean), now);
  }

  private async readRaw(col: string, id: string): Promise<Data | null> {
    const row = await this.enqueue(() =>
      this.db
        .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
        .bind(col, id)
        .first<{ data: string }>(),
    );
    if (!row) return null;
    const parsed = JSON.parse(row.data) as Data;
    if (typeof parsed.expireAt === 'string') parsed.expireAt = new Date(parsed.expireAt);
    return parsed;
  }

  private async read<T>(p: string): Promise<Doc<T> | null> {
    const { col, id } = splitPath(p);
    const row = await this.enqueue(() =>
      this.db
        .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
        .bind(col, id)
        .first<{ data: string }>(),
    );
    return row ? parseRow<T>(id, row.data) : null;
  }

  private async write(
    p: string,
    data: Input,
    mode: 'set' | 'merge' | 'create' | 'update',
  ): Promise<void> {
    const { col, id } = splitPath(p);
    const grp = col.split('/').pop() ?? col;
    const now = new Date().toISOString();
    const clean = toPlainData(data);

    if (mode === 'create') {
      const json = this.rowJson(p, clean);
      const res = await this.enqueue(() =>
        this.db
          .prepare(
            'INSERT OR IGNORE INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)',
          )
          .bind(col, id, grp, json, now)
          .run(),
      );
      if (!res.meta?.changes) throw new StoreConflictError(p);
      return;
    }

    if (mode === 'update') {
      const existing = await this.readRaw(col, id);
      if (!existing) throw new StoreNotFoundError(p);
      const next = toPlainData(applyUpdate(existing, clean));
      const json = this.rowJson(p, next);
      await this.enqueue(() =>
        this.db
          .prepare('UPDATE docs SET data = ?3, updated_at = ?4 WHERE col = ?1 AND id = ?2')
          .bind(col, id, json, now)
          .run(),
      );
      return;
    }

    let next = clean;
    if (mode === 'merge') {
      const existing = await this.readRaw(col, id);
      if (existing) next = toPlainData(deepMerge(existing, clean));
    }

    const json = this.rowJson(p, next);
    await this.enqueue(() =>
      this.db
        .prepare(
          `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        )
        .bind(col, id, grp, json, now)
        .run(),
    );
  }

  /** Stay under D1's 2 MB row limit. Bound JSON is what the Worker actually stores. */
  private rowJson(path: string, data: Data): string {
    const json = JSON.stringify(data);
    if (json.length > MAX_ROW_JSON) {
      throw new Error(`Document ${path} is too large for Cloudflare D1`);
    }
    return json;
  }

  private async runQuery<T>(q: QuerySpec): Promise<Doc<T>[]> {
    const binds: unknown[] = [q.collection];
    const extra: string[] = [];
    for (const [field, op, value] of q.where ?? []) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) continue;
      if (op === '==' && typeof value === 'string') {
        binds.push(value);
        extra.push(`json_extract(data, '$.${field}') = ?${binds.length}`);
      } else if (op === '==' && value === null) {
        extra.push(`(json_extract(data, '$.${field}') IS NULL)`);
      }
    }
    const tail = extra.length ? ` AND ${extra.join(' AND ')}` : '';
    const pushedAll = (q.where ?? []).every(
      (w) => w[1] === '==' && (typeof w[2] === 'string' || w[2] === null),
    );
    const order = q.orderBy ?? [];
    const limit =
      pushedAll && q.limit !== undefined ? Math.max(0, Math.min(1000, Math.floor(q.limit))) : null;
    const orderSql =
      pushedAll && order.length === 1 && order[0]?.[0] === 'createdAt'
        ? ` ORDER BY json_extract(data, '$.createdAt') ${order[0][1] === 'asc' ? 'ASC' : 'DESC'}`
        : '';
    const limitSql = limit !== null && orderSql ? ` LIMIT ${limit}` : '';
    const sql = q.group
      ? `SELECT id, data FROM docs WHERE grp = ?1 AND col LIKE '%/%'${tail}${orderSql}${limitSql}`
      : `SELECT id, data FROM docs WHERE col = ?1${tail}${orderSql}${limitSql}`;
    const res = await this.enqueue(() =>
      this.db
        .prepare(sql)
        .bind(...binds)
        .all<{ id: string; data: string }>(),
    );
    let rows: Array<Data & { id: string }> = (res.results ?? []).map((r) =>
      parseRow<Data>(r.id, r.data),
    );
    for (const w of q.where ?? []) rows = rows.filter((r) => matches(r, w));
    if (order.length) {
      rows.sort((a, b) => {
        for (const [f, dir] of order) {
          const c = cmp(getField(a, f), getField(b, f));
          if (c !== 0) return dir === 'asc' ? c : -c;
        }
        return a.id < b.id ? -1 : 1;
      });
    }
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    return rows as Doc<T>[];
  }

  async get<T>(p: string): Promise<Doc<T> | null> {
    await this.ensureReady();
    return this.read<T>(p);
  }

  async getMany<T>(paths: string[]): Promise<Array<Doc<T> | null>> {
    await this.ensureReady();
    if (!paths.length) return [];
    const groups = new Map<string, string[]>();
    for (const p of paths) {
      const { col, id } = splitPath(p);
      const ids = groups.get(col) ?? [];
      ids.push(id);
      groups.set(col, ids);
    }
    const found = new Map<string, Doc<T>>();
    for (const [col, ids] of groups) {
      const uniq = [...new Set(ids)];
      for (let i = 0; i < uniq.length; i += GET_MANY_CHUNK) {
        const chunk = uniq.slice(i, i + GET_MANY_CHUNK);
        const marks = chunk.map((_, n) => `?${n + 2}`).join(', ');
        const res = await this.enqueue(() =>
          this.db
            .prepare(`SELECT id, data FROM docs WHERE col = ?1 AND id IN (${marks})`)
            .bind(col, ...chunk)
            .all<{ id: string; data: string }>(),
        );
        for (const row of res.results ?? [])
          found.set(`${col}/${row.id}`, parseRow<T>(row.id, row.data));
      }
    }
    return paths.map((p) => found.get(p) ?? null);
  }

  async query<T>(q: QuerySpec): Promise<Doc<T>[]> {
    await this.ensureReady();
    return this.runQuery<T>(q);
  }

  async set(p: string, data: Input, opts?: { merge?: boolean }): Promise<void> {
    await this.ensureReady();
    await this.write(p, data, opts?.merge ? 'merge' : 'set');
  }

  async create(p: string, data: Input): Promise<void> {
    await this.ensureReady();
    await this.write(p, data, 'create');
  }

  async update(p: string, data: Input): Promise<void> {
    await this.ensureReady();
    await this.write(p, data, 'update');
  }

  async delete(p: string): Promise<void> {
    await this.ensureReady();
    const { col, id } = splitPath(p);
    await this.enqueue(() =>
      this.db.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(col, id).run(),
    );
  }

  async increment(p: string, field: string, by: number): Promise<void> {
    await this.ensureReady();
    const cur = await this.read<Data>(p);
    const prev = cur ? Number(getField(cur, field) ?? 0) : 0;
    await this.write(p, { [field]: prev + by }, cur ? 'update' : 'merge');
  }

  newId(): string {
    return randomBytesBase64Url(15).replace(/[-_]/g, 'x').slice(0, 20);
  }

  async batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>): Promise<void> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const nonMerge: D1PreparedStatement[] = [];
    for (const it of items) {
      if (it.merge) {
        await this.write(it.path, it.data, 'merge');
      } else {
        const { col, id } = splitPath(it.path);
        const grp = col.split('/').pop() ?? col;
        const clean = toPlainData(it.data);
        nonMerge.push(
          this.db
            .prepare(
              `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            )
            .bind(col, id, grp, this.rowJson(it.path, clean), now),
        );
      }
    }
    const CHUNK = 80;
    for (let i = 0; i < nonMerge.length; i += CHUNK) {
      const slice = nonMerge.slice(i, i + CHUNK);
      await this.enqueue(() => this.db.batch(slice));
    }
  }

  runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R> {
    const run = async () => {
      await this.ensureReady();
      const writes: Array<() => Promise<void>> = [];
      const tx: TxOps = {
        get: async <T>(p: string) => this.read<T>(p),
        query: async <T>(q: QuerySpec) => this.runQuery<T>(q),
        set: (p, d, o) => writes.push(() => this.write(p, d, o?.merge ? 'merge' : 'set')),
        create: (p, d) => writes.push(() => this.write(p, d, 'create')),
        update: (p, d) => writes.push(() => this.write(p, d, 'update')),
      };
      const result = await fn(tx);
      for (const w of writes) await w();
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
