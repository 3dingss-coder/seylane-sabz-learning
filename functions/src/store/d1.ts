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
  type OpTrace,
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

/**
 * DDL batch, run at most once per D1 binding per isolate (shared by the store and blob store).
 *
 * The promise is shared by every request in the isolate, so each caller waits on it with a timer of
 * its own: if the request that started it is cancelled, later callers fail fast and retry fresh.
 * State transitions are identity-guarded: a stale attempt that settles late (success or failure)
 * can never delete or replace the entry that a newer attempt has since put there. The DDL is
 * `IF NOT EXISTS`, so two attempts overlapping is harmless.
 */
export function ensureD1Schema(db: D1Database): Promise<void> {
  const start = (): Promise<void> => {
    const promise: Promise<void> = db
      .batch(D1_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)))
      .then(
        () => undefined,
        (err: unknown) => {
          if (schemaReady.get(db) === promise) schemaReady.delete(db);
          throw err;
        },
      );
    schemaReady.set(db, promise);
    return promise;
  };
  const shared = schemaReady.get(db) ?? start();
  return withTimeout(shared, D1_CALL_TIMEOUT_MS * 2, 'D1 schema').catch((err) => {
    if (schemaReady.get(db) === shared) schemaReady.delete(db);
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
 * Automatically creates tables and seeds initial catalog/demo data on first request.
 */
const MAX_ROW_JSON = 1_800_000;

/**
 * Time limits. They are nested on purpose, not equal:
 *   request budget (cloudflare-worker.ts)  >  D1 call  >  transaction queue wait  >  call queue wait
 * Values are provisional: no production latency measurements were available when they were chosen.
 * Check `queueWaitMs` / `d1DurationMs` in the progress log lines after deploy and tune from those.
 *
 * The queues below are a courtesy (they keep one request from opening a 7th D1 connection and
 * reduce conflicts). They are NOT what makes transactions correct: a waiter that gives up on a
 * predecessor may overlap with it, and a predecessor's D1 call may still finish late. Correctness
 * comes from the compare-and-swap commit in `runTransaction`, which works across isolates.
 */
/** One D1 call (and the one-time init). A stalled call must fail instead of waiting for the runtime. */
export const D1_CALL_TIMEOUT_MS = 15_000;
/** How long a D1 call waits behind earlier calls before it stops waiting and goes ahead. */
export const D1_QUEUE_WAIT_MS = 5_000;
/** How long a transaction waits behind earlier transactions before it goes ahead. */
export const D1_TX_QUEUE_WAIT_MS = 10_000;
/** A transaction that keeps losing the optimistic-concurrency check gives up after this many runs. */
export const D1_MAX_TX_ATTEMPTS = 6;

const GET_MANY_CHUNK = 90;

interface SharedState {
  /** True once init succeeded: the hot path then skips the init wait and its timer. */
  ready: boolean;
  initPromise: Promise<void> | null;
  /** Serializes whole transactions (tail of the chain). Per isolate, shared by all requests. */
  queue: Promise<void>;
  /** D1 allows 6 connections per invocation and runs one query at a time. Serialize SQL. */
  io: Promise<void>;
}

export class D1Store implements DocStore {
  /**
   * All mutable state lives here so that per-request views (`scoped`) share it instead of shadowing
   * it. Every wait on this state is bounded by a timer owned by the waiter (see lib/bounded.ts).
   */
  private readonly shared: SharedState = {
    ready: false,
    initPromise: null,
    queue: Promise.resolve(),
    io: Promise.resolve(),
  };
  private trace: OpTrace | null = null;

  constructor(
    private readonly db: D1Database,
    private readonly seedSnapshot?: Record<string, Record<string, Data>>,
  ) {}

  /** A view of this store that records one request's queue wait and D1 time into `trace`. */
  scoped(trace: OpTrace): D1Store {
    const view = Object.create(this) as D1Store;
    view.trace = trace;
    return view;
  }

  async ensureReady(): Promise<void> {
    const s = this.shared;
    if (s.ready) return;
    let init = s.initPromise;
    if (!init) {
      // `initialize()` is idempotent (IF NOT EXISTS, INSERT OR IGNORE, upserted markers), so if an
      // abandoned attempt and a fresh one overlap, or the abandoned one finishes late, the database
      // ends up in the same valid state. All state changes are identity-guarded for that reason.
      const promise: Promise<void> = withTimeout(
        this.initialize(),
        D1_CALL_TIMEOUT_MS * 2,
        'D1 init',
      ).then(
        () => {
          s.ready = true;
        },
        (err: unknown) => {
          if (s.initPromise === promise) s.initPromise = null;
          throw err;
        },
      );
      s.initPromise = promise;
      init = promise;
    }
    // The init promise belongs to whichever request started it. If that request was cancelled the
    // promise (and the timer that guards it) never settle, so this caller waits with its own timer
    // and, on expiry, clears the stale promise (only if it is still the same one) so the next
    // request starts a fresh init.
    try {
      await withTimeout(init, D1_CALL_TIMEOUT_MS * 2, 'D1 init wait');
    } catch (err) {
      if (s.initPromise === init) s.initPromise = null;
      throw err;
    }
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

  /**
   * Run one D1 call at a time so a Promise.all of reads cannot open a 7th connection.
   *
   * Lifecycle: take a gate → wait (bounded, own timer) for the previous gate → refuse to START if
   * the request deadline has passed → run the call under its own time limit → release the gate in
   * `finally`. A waiter that gives up on a predecessor proceeds anyway (see the note on the
   * constants); that is safe for reads and for compare-and-swap commits, and plain upserts are
   * last-writer-wins regardless of any queue.
   *
   * `commit: true` marks the single call that makes a transaction durable. It is never cut short by
   * the request deadline (a commit that was already sent cannot be recalled, so the caller waits for
   * its real outcome, up to the per-call limit), but it is also never STARTED after the deadline.
   */
  private async enqueue<T>(
    fn: () => Promise<T>,
    op = 'call',
    opts: { commit?: boolean } = {},
  ): Promise<T> {
    const s = this.shared;
    const trace = this.trace;
    const prev = s.io;
    const gate = createGate();
    s.io = gate.promise;
    const started = { at: 0 };
    try {
      this.assertWithinDeadline(op);
      const remaining = this.remainingMs();
      const wait = await waitSettled(prev, Math.min(D1_QUEUE_WAIT_MS, Math.max(1, remaining)));
      if (trace) {
        trace.queueWaitMs += wait.waitedMs;
        if (wait.timedOut) trace.queueTimeouts++;
      }
      if (wait.timedOut) logStore('queue_wait_timeout', { op, waitedMs: wait.waitedMs }, trace);
      this.assertWithinDeadline(op);
      const limit = opts.commit
        ? D1_CALL_TIMEOUT_MS
        : Math.max(1, Math.min(D1_CALL_TIMEOUT_MS, this.remainingMs()));
      started.at = Date.now();
      return await withTimeout(fn(), limit, `D1 ${op}`, {
        onLate: (o) => {
          if (trace) trace.lateCompletions++;
          logStore(
            'd1_late_completion',
            { op, ok: o.ok, lateMs: o.lateMs, commit: Boolean(opts.commit) },
            trace,
          );
        },
      });
    } catch (err) {
      if (err instanceof DeadlineError && err.kind === 'timeout') {
        if (trace) trace.d1Timeouts++;
        logStore('d1_call_timeout', { op, ms: err.ms, commit: Boolean(opts.commit) }, trace);
      }
      throw err;
    } finally {
      if (trace && started.at) {
        trace.d1DurationMs += Date.now() - started.at;
        trace.d1Calls++;
      }
      gate.release();
    }
  }

  private remainingMs(): number {
    const at = this.trace?.deadlineAtMs;
    return at === null || at === undefined ? Number.POSITIVE_INFINITY : at - Date.now();
  }

  /** Refuses to start new D1 work once this request's deadline has passed. */
  private assertWithinDeadline(op: string): void {
    if (this.remainingMs() <= 0) {
      logStore('deadline_before_start', { op }, this.trace);
      throw new DeadlineError(`D1 ${op}`, 0, 'deadline');
    }
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

  /** The stored JSON text of one document (or null). The exact text is what commits compare against. */
  private async readRawRow(p: string): Promise<string | null> {
    const { col, id } = splitPath(p);
    const row = await this.enqueue(
      () =>
        this.db
          .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
          .bind(col, id)
          .first<{ data: string }>(),
      'tx_read',
    );
    return row ? row.data : null;
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

  async purgeExpired(collection: string, beforeIso: string, limit: number): Promise<number> {
    await this.ensureReady();
    const n = Math.max(1, Math.min(1000, Math.floor(limit)));
    const res = await this.enqueue(() =>
      this.db
        .prepare(
          `DELETE FROM docs WHERE rowid IN (
             SELECT rowid FROM docs
             WHERE col = ?1 AND json_extract(data, '$.expireAt') < ?2
             LIMIT ${n})`,
        )
        .bind(collection, beforeIso)
        .run(),
    );
    return Number(res.meta?.changes ?? 0);
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

  /**
   * Optimistic transaction, correct across isolates.
   *
   * Reads go through `tx.get`, which remembers the exact JSON text it saw (or "absent"). Writes are
   * buffered. At commit, ONE `db.batch` (a single D1 transaction) first runs a guard per document
   * that was read, which raises an error unless that document still holds exactly the text we read,
   * and then applies every write. If any guard fails the whole batch is rolled back and the callback
   * is run again on fresh data. Consequences:
   *   - two writers in different isolates can never both commit from the same snapshot, so no
   *     increment is lost and an Idempotency-Key stored in the same document is applied once;
   *   - a predecessor that was abandoned and finishes late either commits first (and we then retry
   *     on top of it) or loses its guard; it can never overwrite newer state;
   *   - all writes of the transaction are atomic (previously they were applied one by one).
   * `tx.query` results are NOT guarded (no phantom protection); callers that need it must also
   * `create` a deterministic document, which IS guarded (see startAttempt).
   * The callback may run more than once, so it must not have side effects outside `tx`.
   */
  async runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R> {
    const s = this.shared;
    const trace = this.trace;
    // Courtesy queue (bounded wait, gate released in `finally`); not relied on for correctness.
    const prev = s.queue;
    const gate = createGate();
    s.queue = gate.promise;
    try {
      this.assertWithinDeadline('transaction');
      const wait = await waitSettled(
        prev,
        Math.min(D1_TX_QUEUE_WAIT_MS, Math.max(1, this.remainingMs())),
      );
      if (trace) {
        trace.queueWaitMs += wait.waitedMs;
        if (wait.timedOut) trace.queueTimeouts++;
      }
      if (wait.timedOut) logStore('tx_queue_wait_timeout', { waitedMs: wait.waitedMs }, trace);
      for (let attempt = 1; ; attempt++) {
        this.assertWithinDeadline('transaction attempt');
        const out = await this.attemptTransaction(fn);
        if (out.committed) return out.result;
        if (trace) trace.txRetries++;
        logStore('tx_conflict_retry', { attempt }, trace);
        if (attempt >= D1_MAX_TX_ATTEMPTS) throw new StoreBusyError(attempt);
        await sleep(Math.min(200, 5 * 2 ** attempt + Math.floor(Math.random() * 10)));
      }
    } finally {
      gate.release();
    }
  }

  private async attemptTransaction<R>(
    fn: (tx: TxOps) => Promise<R>,
  ): Promise<{ committed: true; result: R } | { committed: false }> {
    await this.ensureReady();
    /** path → JSON text at read time (null = the document did not exist). */
    const reads = new Map<string, string | null>();
    const pending: Array<{
      path: string;
      mode: 'set' | 'merge' | 'create' | 'update';
      data: Input;
    }> = [];
    const queue = (path: string, mode: 'set' | 'merge' | 'create' | 'update', data: Input) => {
      pending.push({ path, mode, data });
    };
    const tx: TxOps = {
      get: async <T>(p: string) => {
        const raw = await this.readRawRow(p);
        // Two reads of one path that disagree mean the snapshot is not consistent: start over.
        if (reads.has(p) && reads.get(p) !== raw) throw new TxConflictSignal();
        reads.set(p, raw);
        return raw === null ? null : parseRow<T>(splitPath(p).id, raw);
      },
      query: async <T>(q: QuerySpec) => this.runQuery<T>(q),
      set: (p, d, o) => queue(p, o?.merge ? 'merge' : 'set', d),
      create: (p, d) => queue(p, 'create', d),
      update: (p, d) => queue(p, 'update', d),
    };

    let result: R;
    try {
      result = await fn(tx);
    } catch (e) {
      if (e instanceof TxConflictSignal) return { committed: false };
      throw e;
    }
    if (!pending.length) return { committed: true, result };

    const now = new Date().toISOString();
    /** What each written path will contain after the writes so far (a later write builds on it). */
    const projected = new Map<string, string | null>();
    const current = async (p: string): Promise<string | null> => {
      if (projected.has(p)) return projected.get(p) ?? null;
      if (!reads.has(p)) reads.set(p, await this.readRawRow(p)); // guarded below
      return reads.get(p) ?? null;
    };
    const parseData = (raw: string): Data => {
      const parsed = JSON.parse(raw) as Data;
      if (typeof parsed.expireAt === 'string') parsed.expireAt = new Date(parsed.expireAt);
      return parsed;
    };
    const upsert = `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`;
    const writes: D1PreparedStatement[] = [];
    for (const w of pending) {
      const { col, id } = splitPath(w.path);
      const grp = col.split('/').pop() ?? col;
      const clean = toPlainData(w.data);
      if (w.mode === 'set') {
        const json = this.rowJson(w.path, clean);
        writes.push(this.db.prepare(upsert).bind(col, id, grp, json, now));
        projected.set(w.path, json);
      } else if (w.mode === 'merge') {
        const existing = await current(w.path);
        const next = existing === null ? clean : toPlainData(deepMerge(parseData(existing), clean));
        const json = this.rowJson(w.path, next);
        writes.push(this.db.prepare(upsert).bind(col, id, grp, json, now));
        projected.set(w.path, json);
      } else if (w.mode === 'update') {
        const existing = await current(w.path);
        if (existing === null) throw new StoreNotFoundError(w.path);
        const next = toPlainData(applyUpdate(parseData(existing), clean));
        const json = this.rowJson(w.path, next);
        writes.push(
          this.db
            .prepare('UPDATE docs SET data = ?3, updated_at = ?4 WHERE col = ?1 AND id = ?2')
            .bind(col, id, json, now),
        );
        projected.set(w.path, json);
      } else {
        const existing = await current(w.path);
        if (existing !== null) throw new StoreConflictError(w.path);
        const json = this.rowJson(w.path, clean);
        writes.push(
          this.db
            .prepare(
              'INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)',
            )
            .bind(col, id, grp, json, now),
        );
        projected.set(w.path, json);
      }
    }

    const guards = [...reads].map(([p, raw]) => this.guardStatement(p, raw));
    try {
      await this.enqueue(() => this.db.batch([...guards, ...writes]), 'tx_commit', {
        commit: true,
      });
    } catch (e) {
      if (isGuardFailure(e)) return { committed: false };
      throw e;
    }
    return { committed: true, result };
  }

  /**
   * A statement that fails the whole batch (and so rolls it back) unless `path` still holds exactly
   * the JSON text we read (or still does not exist). `json('!')` is the failure: it raises
   * "malformed JSON". The CASE sits INSIDE the json() argument so SQLite cannot hoist the failing
   * call out as a constant.
   */
  private guardStatement(path: string, raw: string | null): D1PreparedStatement {
    const { col, id } = splitPath(path);
    return raw === null
      ? this.db
          .prepare(
            `SELECT json(CASE WHEN NOT EXISTS (SELECT 1 FROM docs WHERE col = ?1 AND id = ?2)
               THEN '1' ELSE '!' END) AS ok`,
          )
          .bind(col, id)
      : this.db
          .prepare(
            `SELECT json(CASE WHEN EXISTS (SELECT 1 FROM docs WHERE col = ?1 AND id = ?2 AND data = ?3)
               THEN '1' ELSE '!' END) AS ok`,
          )
          .bind(col, id, raw);
  }
}

/** Internal: a transaction read two different versions of one document. */
class TxConflictSignal extends Error {
  constructor() {
    super('transaction snapshot changed');
    this.name = 'TxConflictSignal';
  }
}

/** The optimistic commit lost its guard check on every attempt: too many concurrent writers. */
export class StoreBusyError extends Error {
  constructor(readonly attempts: number) {
    super(`transaction conflicted ${attempts} times`);
    this.name = 'StoreBusyError';
  }
}

function isGuardFailure(e: unknown): boolean {
  return /malformed JSON/i.test(e instanceof Error ? e.message : String(e));
}

/** Waiter-owned sleep (a timer created by the request that is waiting). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStore(event: string, fields: Record<string, unknown>, trace: OpTrace | null): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      msg: 'd1-store',
      event,
      requestId: trace?.requestId ?? null,
      ...fields,
    }),
  );
}
