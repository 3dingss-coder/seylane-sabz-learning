import { createRequire } from 'node:module';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/store/d1';

/**
 * A D1 emulator on Node's built-in SQLite, for tests.
 *
 * MODELLED, NOT MEASURED: this reproduces D1's contract as documented (every statement runs to
 * completion on its own; a `batch()` is one atomic transaction that rolls back entirely if any
 * statement fails), not Cloudflare's latency, ordering across connections, or error text. Anything
 * that depends on the real service must still be checked against the real service.
 */

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

type Bound = Array<string | number | null>;
type StmtKind = 'first' | 'all' | 'run';

interface EmuStatement extends D1PreparedStatement {
  sql: string;
  bound: Bound;
}

/** Creates an empty in-memory D1. All statements and batches are serialized, like one D1 connection. */
export function createSqliteD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  let chain: Promise<unknown> = Promise.resolve();
  /** Runs `fn` after everything queued before it, so a batch can never interleave with anything. */
  const exclusive = <T>(fn: () => T): Promise<T> => {
    const run = chain.then(fn);
    chain = run.catch(() => undefined);
    return run;
  };

  const execSync = (sql: string, bound: Bound, kind: StmtKind): unknown => {
    const stmt = sqlite.prepare(sql);
    if (kind === 'first') return stmt.get(...bound) ?? null;
    if (kind === 'all') {
      const rows = stmt.all(...bound);
      return { results: rows, success: true, meta: { rows_read: rows.length } };
    }
    const info = stmt.run(...bound);
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  };

  const makeStmt = (sql: string, bound: Bound = []): EmuStatement => {
    const stmt = {
      sql,
      bound,
      bind: (...values: unknown[]) => makeStmt(sql, values as Bound),
      first: (colName?: string) =>
        exclusive(() => {
          const row = execSync(sql, bound, 'first') as Record<string, unknown> | null;
          if (!row) return null;
          return colName ? (row[colName] ?? null) : row;
        }),
      all: () => exclusive(() => execSync(sql, bound, 'all')),
      run: () => exclusive(() => execSync(sql, bound, 'run')),
    };
    return stmt as unknown as EmuStatement;
  };

  return {
    prepare: (query: string) => makeStmt(query),
    batch: <T = unknown>(statements: D1PreparedStatement[]) =>
      exclusive(() => {
        sqlite.exec('BEGIN');
        try {
          const out = statements.map((s) => {
            const raw = unwrap(s) as EmuStatement;
            const isSelect = /^\s*select\b/i.test(raw.sql);
            return execSync(raw.sql, raw.bound, isSelect ? 'all' : 'run') as D1Result<T>;
          });
          sqlite.exec('COMMIT');
          return out;
        } catch (e) {
          sqlite.exec('ROLLBACK');
          throw e;
        }
      }),
  };
}

export type FaultAction =
  | 'ok'
  | 'throw'
  /** Never settles and never executes (a call whose request was cancelled). */
  | 'hang'
  /** Waits `delayMs` of (fake or real) time, then executes. */
  | { delayMs: number }
  /** Waits until the promise resolves, THEN executes: a slow call whose effect lands late. */
  | { holdUntil: Promise<unknown> };

export type CallKind = 'first' | 'all' | 'run' | 'batch';

export interface FaultHooks {
  /** Called before every D1 call; return what should happen to it. */
  before(kind: CallKind, sql: string): FaultAction;
}

const INNER = Symbol('inner');
const unwrap = (s: D1PreparedStatement): D1PreparedStatement =>
  (s as unknown as { [INNER]?: D1PreparedStatement })[INNER] ?? s;

/** Wraps a D1 database so individual calls can be slowed, failed, held, or made to never resolve. */
export function withFaults(db: D1Database, hooks: FaultHooks): D1Database {
  const apply = async <T>(kind: CallKind, sql: string, call: () => Promise<T>): Promise<T> => {
    const action = hooks.before(kind, sql);
    if (action === 'throw') throw new Error('injected D1 failure');
    if (action === 'hang') return new Promise<T>(() => {});
    if (typeof action === 'object') {
      if ('delayMs' in action) await new Promise((r) => setTimeout(r, action.delayMs));
      else await action.holdUntil;
    }
    return call();
  };
  const wrap = (stmt: D1PreparedStatement, sql: string): D1PreparedStatement =>
    ({
      [INNER]: stmt,
      sql,
      bind: (...values: unknown[]) => wrap(stmt.bind(...values), sql),
      first: (col?: string) => apply('first', sql, () => stmt.first(col)),
      all: () => apply('all', sql, () => stmt.all()),
      run: () => apply('run', sql, () => stmt.run()),
    }) as unknown as D1PreparedStatement;
  return {
    prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: (statements) =>
      apply(
        'batch',
        statements.map((s) => (s as unknown as { sql?: string }).sql ?? '').join(';'),
        () => db.batch(statements.map(unwrap)),
      ),
  };
}
