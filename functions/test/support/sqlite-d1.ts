import { createRequire } from 'node:module';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/store/d1';

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

export { createSqliteD1 };

export type FaultAction = 'ok' | 'throw' | 'hang' | { delayMs: number };
export interface FaultHooks {
  /** Called before every D1 statement/batch; return what should happen to it. */
  before(kind: 'first' | 'all' | 'run' | 'batch', sql: string): FaultAction;
}

/** Wraps a D1 database so individual calls can be slowed, failed or made to never resolve. */
export function withFaults(db: D1Database, hooks: FaultHooks): D1Database {
  const apply = async <T>(
    kind: 'first' | 'all' | 'run' | 'batch',
    sql: string,
    call: () => Promise<T>,
  ): Promise<T> => {
    const action = hooks.before(kind, sql);
    if (action === 'throw') throw new Error('injected D1 failure');
    if (action === 'hang') return new Promise<T>(() => {});
    if (typeof action === 'object') await new Promise((r) => setTimeout(r, action.delayMs));
    return call();
  };
  const wrap = (stmt: D1PreparedStatement, sql: string): D1PreparedStatement =>
    ({
      sql,
      bind: (...values: unknown[]) => wrap(stmt.bind(...values), sql),
      first: (col?: string) => apply('first', sql, () => stmt.first(col)),
      all: () => apply('all', sql, () => stmt.all()),
      run: () => apply('run', sql, () => stmt.run()),
    }) as unknown as D1PreparedStatement;
  return {
    prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: (statements) => apply('batch', '', () => db.batch(statements.map((s) => s))),
  };
}
