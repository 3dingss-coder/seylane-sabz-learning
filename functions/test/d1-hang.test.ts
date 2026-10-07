import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  D1_IO_WAIT_MS,
  D1_TX_WAIT_MS,
  D1Store,
  type D1Database,
  type D1PreparedStatement,
} from '../src/store/d1';

const never = () => new Promise<never>(() => undefined);

/**
 * A D1 stand-in whose calls can be made to hang forever — exactly what a request that was
 * cancelled mid-query leaves behind for the next request in the same isolate.
 */
function stubD1() {
  const control = { hangFirst: 0, hangBatchFirst: 0, reads: 0, batches: 0 };
  const stmt = (sql: string): D1PreparedStatement => {
    const self = {
      sql,
      bind: () => self,
      first: async () => {
        control.reads++;
        if (control.hangFirst > 0) {
          control.hangFirst--;
          return never();
        }
        return { data: JSON.stringify({ n: 1 }) };
      },
      all: async () => ({ results: [], success: true, meta: {} }),
      run: async () => ({ success: true, meta: { changes: 1 } }),
    };
    return self as unknown as D1PreparedStatement;
  };
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async () => {
      control.batches++;
      if (control.hangBatchFirst > 0) {
        control.hangBatchFirst--;
        return never();
      }
      return [];
    },
  } as unknown as D1Database;
  return { db, control };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('D1Store survives a request that was cancelled mid-flight', () => {
  it('a hung query does not freeze later queries (they run after the deadline)', async () => {
    const { db, control } = stubD1();
    const store = new D1Store(db);
    await store.ensureReady();
    control.hangFirst = 1;
    void store.get('things/a'); // request A: its D1 call never completes
    const b = store.get<{ n: number }>('things/b'); // request B, same isolate
    let settled = false;
    void b.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(D1_IO_WAIT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(b).resolves.toMatchObject({ n: 1 });
  });

  it('a transaction that never finishes does not freeze later transactions', async () => {
    const { db } = stubD1();
    const store = new D1Store(db);
    await store.ensureReady();
    void store.runTransaction(async () => never()); // cancelled while holding the tx lock
    const b = store.runTransaction(async () => 'done');
    await vi.advanceTimersByTimeAsync(D1_TX_WAIT_MS);
    await expect(b).resolves.toBe('done');
  });

  it('cold start: a request that never finished initialising does not block the next one', async () => {
    const { db, control } = stubD1();
    control.hangBatchFirst = 1; // the first request's DDL batch never returns
    const store = new D1Store(db);
    void store.ensureReady(); // request A
    await expect(store.ensureReady()).resolves.toBeUndefined(); // request B does its own init
    expect(control.batches).toBe(2);
    await store.ensureReady(); // now cached: no further DDL
    expect(control.batches).toBe(2);
  });
});
