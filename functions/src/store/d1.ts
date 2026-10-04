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
export class D1Store implements DocStore {
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: D1Database,
    private readonly seedSnapshot?: Record<string, Record<string, Data>>,
  ) {}

  async ensureReady(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    await this.db.batch(D1_SCHEMA_STATEMENTS.map((sql) => this.db.prepare(sql)));

    if (!this.seedSnapshot) return;
    const existing = await this.db
      .prepare('SELECT id FROM docs WHERE col = ?1 LIMIT 1')
      .bind('brands')
      .first<{ id: string }>();
    if (existing) {
      // Additive and optional: a problem here must never keep the whole app from starting.
      // Nothing is marked as applied on failure, so the next cold start simply tries again.
      try {
        await this.seedMissingMentorGuides();
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
   * Existing D1 databases are not re-seeded with the full catalog snapshot. Still, additive
   * mentor guides shipped in a new Worker snapshot must reach those databases. Import only
   * missing guide rows, never overwrite admin-authored guides, and remap a seeded brand ID by
   * exact brand name/Latin name when the live catalog uses a different ID.
   */
  private async seedMissingMentorGuides(): Promise<void> {
    const snapshotGuides = this.seedSnapshot?.mentor_guides;
    if (!snapshotGuides) return;

    const version = mentorGuideSnapshotVersion(snapshotGuides);
    const applied = await this.db
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
    const row = await this.db
      .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
      .bind(col, id)
      .first<{ data: string }>();
    if (!row) return null;
    const parsed = JSON.parse(row.data) as Data;
    if (typeof parsed.expireAt === 'string') parsed.expireAt = new Date(parsed.expireAt);
    return parsed;
  }

  private async read<T>(p: string): Promise<Doc<T> | null> {
    const { col, id } = splitPath(p);
    const row = await this.db
      .prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2')
      .bind(col, id)
      .first<{ data: string }>();
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
      const res = await this.db
        .prepare(
          'INSERT OR IGNORE INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)',
        )
        .bind(col, id, grp, JSON.stringify(clean), now)
        .run();
      if (!res.meta?.changes) throw new StoreConflictError(p);
      return;
    }

    if (mode === 'update') {
      const existing = await this.readRaw(col, id);
      if (!existing) throw new StoreNotFoundError(p);
      const next = toPlainData(applyUpdate(existing, clean));
      await this.db
        .prepare('UPDATE docs SET data = ?3, updated_at = ?4 WHERE col = ?1 AND id = ?2')
        .bind(col, id, JSON.stringify(next), now)
        .run();
      return;
    }

    let next = clean;
    if (mode === 'merge') {
      const existing = await this.readRaw(col, id);
      if (existing) next = toPlainData(deepMerge(existing, clean));
    }

    await this.db
      .prepare(
        `INSERT INTO docs (col, id, grp, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .bind(col, id, grp, JSON.stringify(next), now)
      .run();
  }

  private async runQuery<T>(q: QuerySpec): Promise<Doc<T>[]> {
    const stmt = q.group
      ? this.db
          .prepare("SELECT id, data FROM docs WHERE grp = ?1 AND col LIKE '%/%'")
          .bind(q.collection)
      : this.db.prepare('SELECT id, data FROM docs WHERE col = ?1').bind(q.collection);
    const res = await stmt.all<{ id: string; data: string }>();
    let rows: Array<Data & { id: string }> = (res.results ?? []).map((r) =>
      parseRow<Data>(r.id, r.data),
    );
    for (const w of q.where ?? []) rows = rows.filter((r) => matches(r, w));
    const order = q.orderBy ?? [];
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
    return Promise.all(paths.map((p) => this.read<T>(p)));
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
    await this.db.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(col, id).run();
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
            .bind(col, id, grp, JSON.stringify(clean), now),
        );
      }
    }
    const CHUNK = 80;
    for (let i = 0; i < nonMerge.length; i += CHUNK) {
      await this.db.batch(nonMerge.slice(i, i + CHUNK));
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
