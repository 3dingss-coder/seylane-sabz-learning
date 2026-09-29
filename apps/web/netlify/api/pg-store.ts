import { randomBytes } from 'node:crypto';
import { getDatabase } from '@netlify/database';
import {
  applyUpdate,
  cmp,
  deepMerge,
  getField,
  matches,
  splitPath,
} from '../../../../functions/src/store/memory';
import {
  StoreConflictError,
  StoreNotFoundError,
  type Data,
  type Doc,
  type DocStore,
  type Input,
  type QuerySpec,
  type TxOps,
} from '../../../../functions/src/store/types';

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}
interface Client extends Queryable {
  release(): void;
}
type Row = { id: string; data: Data };

/** Serializes writers (same isolation the in-memory store gives). */
const LOCK_KEY = 7_302_114;

/** JSON round-trip: Dates become ISO strings, like the Firestore adapter returns them. */
const toJson = (v: unknown): Data => JSON.parse(JSON.stringify(v)) as Data;

/**
 * DocStore on Netlify Database (Postgres). Documents live in one JSONB table (db/schema.ts);
 * filtering/ordering reuses the in-memory store's Firestore-like semantics, with simple
 * equality filters pushed down to Postgres via JSONB containment.
 */
export class PgStore implements DocStore {
  private get pool() {
    return getDatabase().pool as unknown as Queryable & { connect(): Promise<Client> };
  }

  private async read<T>(db: Queryable, p: string): Promise<Doc<T> | null> {
    const { col, id } = splitPath(p);
    const { rows } = await db.query('SELECT data FROM docs WHERE col = $1 AND id = $2', [col, id]);
    const row = rows[0] as { data: Data } | undefined;
    return row ? ({ ...row.data, id } as Doc<T>) : null;
  }

  private async write(
    db: Queryable,
    p: string,
    data: Input,
    mode: 'set' | 'merge' | 'create' | 'update',
  ) {
    const { col, id } = splitPath(p);
    const clean = toJson(data);
    delete clean.id;
    let next = clean;
    if (mode === 'create') {
      const res = await db.query(
        'INSERT INTO docs (col, id, grp, data) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [col, id, col.split('/').pop(), clean],
      );
      if (!res.rowCount) throw new StoreConflictError(p);
      return;
    }
    if (mode === 'merge' || mode === 'update') {
      const existing = await this.read<Data>(db, p);
      if (existing) delete (existing as Data).id;
      if (mode === 'update') {
        if (!existing) throw new StoreNotFoundError(p);
        next = toJson(applyUpdate(existing, clean));
      } else if (existing) next = deepMerge(existing, clean);
    }
    await db.query(
      `INSERT INTO docs (col, id, grp, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [col, id, col.split('/').pop(), next],
    );
  }

  private async runQuery<T>(db: Queryable, q: QuerySpec): Promise<Doc<T>[]> {
    const params: unknown[] = [q.collection];
    let sql = q.group
      ? "SELECT id, data FROM docs WHERE grp = $1 AND col LIKE '%/%'"
      : 'SELECT id, data FROM docs WHERE col = $1';
    const eq: Data = {};
    for (const [field, op, value] of q.where ?? []) {
      if (
        op === '==' &&
        field !== '__id__' &&
        !field.includes('.') &&
        ['string', 'number', 'boolean'].includes(typeof value)
      )
        eq[field] = value;
    }
    if (Object.keys(eq).length) {
      params.push(eq);
      sql += ' AND data @> $2';
    }
    const { rows } = await db.query(sql, params);
    let docs = (rows as Row[]).map((r) => ({ ...r.data, id: r.id }));
    for (const w of q.where ?? []) docs = docs.filter((r) => matches(r, w));
    const order = q.orderBy ?? [];
    if (order.length) {
      docs.sort((a, b) => {
        for (const [f, dir] of order) {
          const c = cmp(getField(a, f), getField(b, f));
          if (c !== 0) return dir === 'asc' ? c : -c;
        }
        return a.id < b.id ? -1 : 1;
      });
    }
    if (q.limit !== undefined) docs = docs.slice(0, q.limit);
    return docs as Doc<T>[];
  }

  /** Runs `fn` in a transaction holding the global writer lock. */
  private async locked<R>(fn: (db: Queryable) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async get<T>(p: string) {
    return this.read<T>(this.pool, p);
  }
  async getMany<T>(paths: string[]) {
    return Promise.all(paths.map((p) => this.read<T>(this.pool, p)));
  }
  async query<T>(q: QuerySpec) {
    return this.runQuery<T>(this.pool, q);
  }
  async set(p: string, data: Input, opts?: { merge?: boolean }) {
    if (opts?.merge) await this.locked((db) => this.write(db, p, data, 'merge'));
    else await this.write(this.pool, p, data, 'set');
  }
  async create(p: string, data: Input) {
    await this.write(this.pool, p, data, 'create');
  }
  async update(p: string, data: Input) {
    await this.locked((db) => this.write(db, p, data, 'update'));
  }
  async delete(p: string) {
    const { col, id } = splitPath(p);
    await this.pool.query('DELETE FROM docs WHERE col = $1 AND id = $2', [col, id]);
  }
  async increment(p: string, field: string, by: number) {
    await this.locked(async (db) => {
      const cur = await this.read<Data>(db, p);
      const prev = cur ? Number(getField(cur, field) ?? 0) : 0;
      await this.write(db, p, { [field]: prev + by }, cur ? 'update' : 'merge');
    });
  }
  newId() {
    return randomBytes(10).toString('base64url').replace(/[-_]/g, 'x').slice(0, 20);
  }
  async batchSet(items: Array<{ path: string; data: Input; merge?: boolean }>) {
    await this.locked(async (db) => {
      for (const it of items) await this.write(db, it.path, it.data, it.merge ? 'merge' : 'set');
    });
  }

  runTransaction<R>(fn: (tx: TxOps) => Promise<R>): Promise<R> {
    return this.locked(async (db) => {
      const writes: Array<() => Promise<void>> = [];
      const tx: TxOps = {
        get: (p) => this.read(db, p),
        query: (q) => this.runQuery(db, q),
        set: (p, d, o) => writes.push(() => this.write(db, p, d, o?.merge ? 'merge' : 'set')),
        create: (p, d) => writes.push(() => this.write(db, p, d, 'create')),
        update: (p, d) => writes.push(() => this.write(db, p, d, 'update')),
      };
      const result = await fn(tx);
      for (const w of writes) await w();
      return result;
    });
  }
}
