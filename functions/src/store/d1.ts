import { createGate, DeadlineError, waitSettled, withTimeout } from '../lib/bounded';
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
  type TransactionOptions,
  type TxOps,
  userTransactionScope,
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
  `CREATE TABLE IF NOT EXISTS d1_tx_clock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    owner TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO d1_tx_clock (id, version, owner) VALUES (1, 0, '')`,
  `CREATE TABLE IF NOT EXISTS d1_tx_scopes (
    scope TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    owner TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits (reset_at)`,
] as const;

const schemaReady = new WeakMap<object, Promise<void>>();

/** Records that the schema was verified for this D1 binding, so nobody repeats the DDL batch. */
function markSchemaReady(db: D1Database): void {
  schemaReady.set(db, Promise.resolve());
}

/** DDL batch, run at most once per D1 binding per isolate (shared by the store and blob store). */
export function ensureD1Schema(db: D1Database): Promise<void> {
  let shared = schemaReady.get(db);
  if (!shared) {
    const work = withD1CallTimeout(
      db.batch(D1_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql))).then(() => undefined),
      'D1 schema',
    );
    shared = work.catch((err) => {
      if (schemaReady.get(db) === shared) schemaReady.delete(db);
      throw err;
    });
    schemaReady.set(db, shared);
  }
  const waiter = shared;
  return withTimeout(waiter, D1_CALL_TIMEOUT_MS, 'D1 schema wait').catch((err) => {
    if (schemaReady.get(db) === waiter) schemaReady.delete(db);
    throw err;
  });
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
 * Creates missing tables and seeds a non-demo catalog snapshot only on a fresh database.
 */
const MAX_ROW_JSON = 1_800_000;

/** Existing hard deadline for one D1 operation. Time spent queued is charged against this cap. */
export const D1_CALL_TIMEOUT_MS = 15_000;
/** Bounded courtesy wait before proceeding past a stuck per-store SQL predecessor. */
export const D1_QUEUE_WAIT_MS = 5_000;
/** Per-scope transaction wait; expiry permits CAS-protected overlap, not an unsafe write. */
export const D1_TX_QUEUE_WAIT_MS = 10_000;
export const D1_INIT_TIMEOUT_MS = D1_CALL_TIMEOUT_MS * 2;
const GLOBAL_TRANSACTION_QUEUE = 'global';

/** Bound direct D1 calls from adapters that sit beside D1Store (for example blob range reads). */
export function withD1CallTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return withTimeout(work, D1_CALL_TIMEOUT_MS, label);
}

const GET_MANY_CHUNK = 90;
const MAX_TRANSACTION_RETRIES = 8;
type D1Write = { path: string; data: Input; mode: 'set' | 'merge' | 'create' | 'update' };

export class D1Store implements DocStore {
  private initPromise: Promise<void> | null = null;
  private readonly transactionQueues = new Map<string, Promise<unknown>>();
  private readonly ensuredScopes = new Set<string>();
  /** Bounded isolate-local SQL gate; atomic D1 guards remain the cross-isolate correctness boundary. */
  private io: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: D1Database,
    private readonly seedSnapshot?: Record<string, Record<string, Data>>,
  ) {}

  async ensureReady(): Promise<void> {
    if (!this.initPromise) {
      const init = this.initialize();
      this.initPromise = init;
      void init.catch(() => {
        if (this.initPromise === init) this.initPromise = null;
      });
    }
    const init = this.initPromise;
    try {
      // Each caller has its own timer. If a starter is abandoned, a later request can time out
      // independently and clear only the exact stale promise it waited on.
      await withTimeout(init, D1_INIT_TIMEOUT_MS, 'D1 init wait');
    } catch (err) {
      if (this.initPromise === init) this.initPromise = null;
      throw err;
    }
  }

  private async initialize(): Promise<void> {
    const ddl = D1_SCHEMA_STATEMENTS.map((sql) => this.db.prepare(sql));
    if (!this.seedSnapshot) {
      await this.enqueue(() => this.db.batch(ddl), 'schema-init');
      markSchemaReady(this.db);
      return;
    }
    const probes = [
      this.db.prepare('SELECT col, id FROM docs LIMIT 1'),
      this.db
        .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
        .bind('knowledge_meta', 'mentor_guides_seed_version'),
      this.db
        .prepare('SELECT id FROM docs WHERE col = ?1 AND id = ?2')
        .bind('knowledge_meta', 'catalog_snapshot_seed_version'),
      this.db
        .prepare('SELECT id FROM docs WHERE col = ?1 AND id = ?2')
        .bind('knowledge_meta', 'catalog_snapshot_seed_in_progress'),
    ];
    const res = await this.enqueue(
      () => this.db.batch<{ col?: string; id?: string; data?: string }>([...ddl, ...probes]),
      'schema-probe',
    );
    markSchemaReady(this.db);
    const anyData = res[ddl.length]?.results?.[0];
    const guideMarker = res[ddl.length + 1]?.results?.[0];
    const catalogComplete = res[ddl.length + 2]?.results?.[0];
    const catalogInProgress = res[ddl.length + 3]?.results?.[0];

    // Existing databases are never filled from the full catalog snapshot. A fresh install is marked
    // before writes begin and gets an idempotent retry if a prior cold start stopped part-way.
    if (!catalogComplete && (!anyData || catalogInProgress)) {
      await this.seedCatalogSnapshot();
    }

    if (anyData || catalogComplete || catalogInProgress || !this.seedSnapshot) {
      // Additive and optional: guide seeding must not take a live database offline. User-authored
      // guides are never overwritten, and no catalog/user row is deleted by this path.
      try {
        await this.seedMissingMentorGuides(guideMarker?.data ?? null);
      } catch (err) {
        console.warn(
          `[d1] mentor guide seeding skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async seedCatalogSnapshot(): Promise<void> {
    const now = new Date().toISOString();
    const progress = JSON.stringify({ startedAt: now });
    await this.enqueue(
      () =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO docs (col, id, grp, data, updated_at)
             VALUES ('knowledge_meta', 'catalog_snapshot_seed_in_progress', 'knowledge_meta', ?1, ?2)`,
          )
          .bind(progress, now)
          .run(),
      'catalog-seed-start',
    );

    const stmts: D1PreparedStatement[] = [];
    for (const [col, docs] of Object.entries(this.seedSnapshot ?? {})) {
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
      const batch = stmts.slice(i, i + CHUNK);
      await this.enqueue(() => this.db.batch(batch), 'catalog-seed-chunk');
    }

    // Commit the completion marker only after every snapshot chunk has succeeded.
    await this.enqueue(
      () =>
        this.db.batch([
          this.db
            .prepare(
              `INSERT INTO docs (col, id, grp, data, updated_at) VALUES ('knowledge_meta', 'catalog_snapshot_seed_version', 'knowledge_meta', ?1, ?2)
               ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            )
            .bind(JSON.stringify({ completedAt: now }), now),
          this.db
            .prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2')
            .bind('knowledge_meta', 'catalog_snapshot_seed_in_progress'),
        ]),
      'catalog-seed-complete',
    );
  }

  /**
   * Best-effort per-store SQL gate. The wait and operation are bounded by the existing 15s call
   * budget; after a stuck predecessor's 5s courtesy window, proceed because every mutating D1
   * batch is guarded atomically. Timing out a batch does not cancel a late commit.
   */
  private enqueue<T>(fn: () => Promise<T>, operation = 'call'): Promise<T> {
    const previous = this.io;
    const gate = createGate();
    this.io = gate.promise;
    const started = Date.now();

    return (async () => {
      try {
        const wait = await waitSettled(previous, D1_QUEUE_WAIT_MS);
        if (wait.timedOut) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              msg: 'd1-store',
              event: 'queue_wait_timeout',
              operation,
              waitedMs: wait.waitedMs,
            }),
          );
        }
        const remainingMs = D1_CALL_TIMEOUT_MS - (Date.now() - started);
        if (remainingMs <= 0) throw new DeadlineError(`D1 ${operation}`, D1_CALL_TIMEOUT_MS);
        return await withTimeout(Promise.resolve().then(fn), remainingMs, `D1 ${operation}`);
      } catch (err) {
        if (err instanceof DeadlineError) {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'd1-store',
              event: 'call_timeout',
              operation,
              ms: D1_CALL_TIMEOUT_MS,
            }),
          );
        }
        throw err;
      } finally {
        gate.release();
        if (this.io === gate.promise) this.io = Promise.resolve();
      }
    })();
  }

  private async ensureScope(scope: string): Promise<void> {
    if (this.ensuredScopes.has(scope)) return;
    await this.enqueue(() =>
      this.db
        .prepare("INSERT OR IGNORE INTO d1_tx_scopes (scope, version, owner) VALUES (?1, 0, '')")
        .bind(scope)
        .run(),
    );
    this.ensuredScopes.add(scope);
  }

  private async transactionVersion(scope?: string): Promise<number> {
    if (scope !== undefined) {
      await this.ensureScope(scope);
      const row = await this.enqueue(() =>
        this.db
          .prepare('SELECT version FROM d1_tx_scopes WHERE scope = ?1')
          .bind(scope)
          .first<{ version: number }>(),
      );
      if (!row) throw new Error(`D1 transaction scope is missing: ${scope}`);
      return Number(row.version);
    }
    const row = await this.enqueue(() =>
      this.db.prepare('SELECT version FROM d1_tx_clock WHERE id = 1').first<{ version: number }>(),
    );
    if (!row)
      throw new Error('D1 transaction clock is missing; schema initialization did not complete.');
    return Number(row.version);
  }

  /**
   * Each mutation advances either the global clock or one caller-selected scope clock. Scoped
   * transactions allow independent user partitions to commit without invalidating each other.
   */
  private async guardedBatch(
    expectedVersion: number | null,
    statements: (owner: string) => D1PreparedStatement[],
    scope?: string,
  ): Promise<D1Result[]> {
    const owner = this.newId();
    let guard: D1PreparedStatement;
    if (scope !== undefined) {
      await this.ensureScope(scope);
      guard =
        expectedVersion === null
          ? this.db
              .prepare('UPDATE d1_tx_scopes SET version = version + 1, owner = ?1 WHERE scope = ?2')
              .bind(owner, scope)
          : this.db
              .prepare(
                'UPDATE d1_tx_scopes SET version = version + 1, owner = ?1 WHERE scope = ?2 AND version = ?3',
              )
              .bind(owner, scope, expectedVersion);
    } else {
      guard =
        expectedVersion === null
          ? this.db
              .prepare('UPDATE d1_tx_clock SET version = version + 1, owner = ?1 WHERE id = 1')
              .bind(owner)
          : this.db
              .prepare(
                'UPDATE d1_tx_clock SET version = version + 1, owner = ?1 WHERE id = 1 AND version = ?2',
              )
              .bind(owner, expectedVersion);
    }
    return this.enqueue(() => this.db.batch([guard, ...statements(owner)]));
  }

  private transactionOwnerClause(scope: string | undefined, firstParam: number): string {
    if (scope === undefined)
      return `EXISTS (SELECT 1 FROM d1_tx_clock WHERE id = 1 AND owner = ?${firstParam})`;
    return `EXISTS (SELECT 1 FROM d1_tx_scopes WHERE scope = ?${firstParam} AND owner = ?${firstParam + 1})`;
  }

  private transactionOwnerBinds(owner: string, scope?: string): unknown[] {
    return scope === undefined ? [owner] : [scope, owner];
  }

  /** User documents are changed by both direct writes and user-scoped transactions. */
  private scopeForPath(path: string): string | undefined {
    const { col, id } = splitPath(path);
    return col === 'users' ? userTransactionScope(id) : undefined;
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
        : await this.enqueue(
            () =>
              this.db
                .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
                .bind('knowledge_meta', 'mentor_guides_seed_version')
                .first<{ data: string }>(),
            'guides-marker-read',
          );
    if (applied) {
      try {
        if ((JSON.parse(applied.data) as { version?: string }).version === version) return;
      } catch {
        // Replace malformed migration marker below and try the safe INSERT OR IGNORE again.
      }
    }

    const [brandResult, guideResult] = await Promise.all([
      this.enqueue(
        () =>
          this.db.prepare('SELECT id, data FROM docs WHERE col = ?1').bind('brands').all<{
            id: string;
            data: string;
          }>(),
        'guides-brand-scan',
      ),
      this.enqueue(
        () =>
          this.db.prepare('SELECT id FROM docs WHERE col = ?1').bind('mentor_guides').all<{
            id: string;
          }>(),
        'guides-existing-scan',
      ),
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

    const results = statements.length
      ? await this.enqueue(() => this.db.batch(statements), 'guides-seed')
      : [];
    const inserted = results.some((result) => (result.meta?.changes ?? 0) > 0);
    if (inserted) {
      // Guide changes need an incremental knowledge-index rebuild before retrieval.
      const dirty = JSON.stringify({ at: now });
      await this.enqueue(
        () =>
          this.db
            .prepare(
              `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            )
            .bind('knowledge_meta', 'dirty', 'knowledge_meta', dirty, now)
            .run(),
        'guides-dirty-marker',
      );
    }

    // One small persistent version marker prevents scanning the catalog on every isolate.
    const marker = JSON.stringify({ version });
    await this.enqueue(
      () =>
        this.db
          .prepare(
            `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
          )
          .bind('knowledge_meta', 'mentor_guides_seed_version', 'knowledge_meta', marker, now)
          .run(),
      'guides-version-marker',
    );
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
    const scope = this.scopeForPath(p);
    const grp = col.split('/').pop() ?? col;
    const now = new Date().toISOString();
    const clean = toPlainData(data);

    if (mode === 'set' || mode === 'create') {
      const json = this.rowJson(p, clean);
      const ownerClause = this.transactionOwnerClause(scope, 6);
      const sql =
        mode === 'create'
          ? `INSERT OR IGNORE INTO docs (col, id, grp, data, updated_at)
             SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${ownerClause}`
          : `INSERT INTO docs (col, id, grp, data, updated_at)
             SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${ownerClause}
             ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`;
      const result = await this.guardedBatch(
        null,
        (owner) => [
          this.db
            .prepare(sql)
            .bind(col, id, grp, json, now, ...this.transactionOwnerBinds(owner, scope)),
        ],
        scope,
      );
      if (mode === 'create' && !result[1]?.meta?.changes) throw new StoreConflictError(p);
      return;
    }

    for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt++) {
      const version = await this.transactionVersion(scope);
      const existing = await this.readRaw(col, id);
      if (mode === 'update' && !existing) {
        if ((await this.transactionVersion(scope)) !== version) continue;
        throw new StoreNotFoundError(p);
      }
      const next =
        mode === 'update'
          ? toPlainData(applyUpdate(existing as Data, clean))
          : existing
            ? toPlainData(deepMerge(existing, clean))
            : clean;
      const json = this.rowJson(p, next);
      const ownerClause = this.transactionOwnerClause(scope, 6);
      const result = await this.guardedBatch(
        version,
        (owner) => [
          this.db
            .prepare(
              `INSERT INTO docs (col, id, grp, data, updated_at)
               SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${ownerClause}
               ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            )
            .bind(col, id, grp, json, now, ...this.transactionOwnerBinds(owner, scope)),
        ],
        scope,
      );
      if (!result[0]?.meta?.changes) continue;
      return;
    }
    throw new Error('D1 write conflicted too many times; no data was committed.');
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
    const comparableOps = new Set(['==', '<', '<=', '>', '>=']);
    for (const [field, op, value] of q.where ?? []) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) continue;
      if (op === '==' && value === null) {
        extra.push(`(json_extract(data, '$.${field}') IS NULL)`);
      } else if (
        comparableOps.has(op) &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        binds.push(value);
        extra.push(`json_extract(data, '$.${field}') ${op} ?${binds.length}`);
      }
    }
    const tail = extra.length ? ` AND ${extra.join(' AND ')}` : '';
    const pushedAll = (q.where ?? []).every(
      ([field, op, value]) =>
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(field) &&
        ((op === '==' &&
          (typeof value === 'string' || typeof value === 'number' || value === null)) ||
          (['<', '<=', '>', '>='].includes(op) &&
            (typeof value === 'string' || typeof value === 'number'))),
    );
    const order = q.orderBy ?? [];
    const limit =
      pushedAll && q.limit !== undefined ? Math.max(0, Math.min(1000, Math.floor(q.limit))) : null;
    const orderSql =
      pushedAll && order.length === 1 && order[0]?.[0] === 'createdAt'
        ? ` ORDER BY json_extract(data, '$.createdAt') ${order[0][1] === 'asc' ? 'ASC' : 'DESC'}`
        : '';
    const limitSql =
      limit !== null && (!order.length || orderSql.length > 0) ? ` LIMIT ${limit}` : '';
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

  private async commitTransaction(
    version: number,
    writes: D1Write[],
    scope: string | undefined,
    readCache: Map<string, Doc<unknown> | null>,
  ): Promise<boolean> {
    if ((await this.transactionVersion(scope)) !== version) return false;

    const draft = new Map<string, Data | null>();
    try {
      for (const write of writes) {
        const { col, id } = splitPath(write.path);
        let current: Data | null;
        if (draft.has(write.path)) {
          current = draft.get(write.path) ?? null;
        } else if (readCache.has(write.path)) {
          const cached = readCache.get(write.path);
          current = cached ? toPlainData(cached) : null;
        } else if (write.mode === 'set') {
          // An unconditional overwrite does not need to read the previous row.
          current = null;
        } else {
          current = await this.readRaw(col, id);
        }

        if (write.mode === 'create') {
          if (current) throw new StoreConflictError(write.path);
          draft.set(write.path, toPlainData(write.data));
        } else if (write.mode === 'update') {
          if (!current) throw new StoreNotFoundError(write.path);
          draft.set(write.path, toPlainData(applyUpdate(current, toPlainData(write.data))));
        } else if (write.mode === 'merge') {
          draft.set(
            write.path,
            current
              ? toPlainData(deepMerge(current, toPlainData(write.data)))
              : toPlainData(write.data),
          );
        } else {
          draft.set(write.path, toPlainData(write.data));
        }
      }
    } catch (err) {
      // A concurrent writer can make an update/create appear invalid after this callback read.
      // In that case retry from a fresh snapshot; report business conflicts only on a stable one.
      if ((await this.transactionVersion(scope)) !== version) return false;
      throw err;
    }

    const now = new Date().toISOString();
    const rows = [...draft.entries()].map(([path, data]) => {
      if (!data) throw new Error(`Invalid empty transaction write for ${path}`);
      const { col, id } = splitPath(path);
      return {
        col,
        id,
        grp: col.split('/').pop() ?? col,
        json: this.rowJson(path, data),
      };
    });
    const ownerClause = this.transactionOwnerClause(scope, 6);
    const result = await this.guardedBatch(
      version,
      (owner) =>
        rows.map(({ col, id, grp, json }) =>
          this.db
            .prepare(
              `INSERT INTO docs (col, id, grp, data, updated_at)
               SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${ownerClause}
               ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            )
            .bind(col, id, grp, json, now, ...this.transactionOwnerBinds(owner, scope)),
        ),
      scope,
    );
    return Number(result[0]?.meta?.changes ?? 0) === 1;
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
    const scope = this.scopeForPath(p);
    const ownerClause = this.transactionOwnerClause(scope, 3);
    await this.guardedBatch(
      null,
      (owner) => [
        this.db
          .prepare(`DELETE FROM docs WHERE col = ?1 AND id = ?2 AND ${ownerClause}`)
          .bind(col, id, ...this.transactionOwnerBinds(owner, scope)),
      ],
      scope,
    );
  }

  async increment(p: string, field: string, by: number): Promise<void> {
    await this.runTransaction(
      async (tx) => {
        const current = await tx.get<Data>(p);
        const previous = current ? Number(getField(current, field) ?? 0) : 0;
        tx.set(p, { [field]: previous + by }, { merge: true });
      },
      { scope: this.scopeForPath(p) },
    );
  }

  newId(): string {
    return randomBytesBase64Url(15).replace(/[-_]/g, 'x').slice(0, 20);
  }

  async batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>): Promise<void> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const nonMerge: Array<{ col: string; id: string; grp: string; json: string }> = [];
    for (const it of items) {
      if (it.merge) {
        await this.write(it.path, it.data, 'merge');
      } else {
        const { col, id } = splitPath(it.path);
        if (col === 'users') {
          await this.write(it.path, it.data, 'set');
          continue;
        }
        nonMerge.push({
          col,
          id,
          grp: col.split('/').pop() ?? col,
          json: this.rowJson(it.path, toPlainData(it.data)),
        });
      }
    }
    const CHUNK = 80;
    for (let i = 0; i < nonMerge.length; i += CHUNK) {
      const slice = nonMerge.slice(i, i + CHUNK);
      const ownerClause = this.transactionOwnerClause(undefined, 6);
      await this.guardedBatch(null, (owner) =>
        slice.map(({ col, id, grp, json }) =>
          this.db
            .prepare(
              `INSERT INTO docs (col, id, grp, data, updated_at)
               SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${ownerClause}
               ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            )
            .bind(col, id, grp, json, now, owner),
        ),
      );
    }
  }

  runTransaction<R>(fn: (tx: TxOps) => Promise<R>, options?: TransactionOptions): Promise<R> {
    const scope = options?.scope;
    if (scope !== undefined && (!scope.trim() || scope.length > 256))
      return Promise.reject(
        new Error('D1 transaction scope must be 1–256 non-whitespace characters.'),
      );
    const run = async () => {
      await this.ensureReady();
      for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt++) {
        const version = await this.transactionVersion(scope);
        const writes: D1Write[] = [];
        const readCache = new Map<string, Doc<unknown> | null>();
        const tx: TxOps = {
          get: async <T>(p: string) => {
            if (!readCache.has(p)) readCache.set(p, await this.read<T>(p));
            return readCache.get(p) as Doc<T> | null;
          },
          query: async <T>(q: QuerySpec) => {
            const rows = await this.runQuery<T>(q);
            if (!q.group) for (const row of rows) readCache.set(`${q.collection}/${row.id}`, row);
            return rows;
          },
          set: (p, data, opts) =>
            writes.push({ path: p, data, mode: opts?.merge ? 'merge' : 'set' }),
          create: (p, data) => writes.push({ path: p, data, mode: 'create' }),
          update: (p, data) => writes.push({ path: p, data, mode: 'update' }),
        };
        const result = await fn(tx);
        if (!writes.length) return result;
        if (await this.commitTransaction(version, writes, scope, readCache)) return result;
      }
      throw new Error('D1 transaction conflicted too many times; no data was committed.');
    };
    const queueKey = scope === undefined ? GLOBAL_TRANSACTION_QUEUE : `scope:${scope}`;
    const previous = this.transactionQueues.get(queueKey) ?? Promise.resolve();
    const gate = createGate();
    this.transactionQueues.set(queueKey, gate.promise);
    return (async () => {
      const wait = await waitSettled(previous, D1_TX_QUEUE_WAIT_MS);
      if (wait.timedOut) {
        console.warn(
          JSON.stringify({
            level: 'warn',
            msg: 'd1-store',
            event: 'transaction_queue_timeout',
            waitedMs: wait.waitedMs,
          }),
        );
      }
      try {
        // If the predecessor was abandoned, CAS remains the correctness boundary when we proceed.
        return await run();
      } finally {
        gate.release();
        if (this.transactionQueues.get(queueKey) === gate.promise)
          this.transactionQueues.delete(queueKey);
      }
    })();
  }
}
