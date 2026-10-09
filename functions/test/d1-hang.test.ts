import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1Store, ensureD1Schema } from '../src/store/d1';
import type { D1Database } from '../src/store/d1';

/**
 * Reproduction of the production "Worker code hung" mechanism.
 *
 * D1Store keeps isolate-wide promise chains (`io`, `queue`, `initPromise`). In a Worker, a request
 * that is cancelled mid-call (client disconnect → "Network connection lost") takes its pending D1
 * promise AND its own timeout timer with it: neither ever settles/fires. Any later request that
 * awaits that shared chain has nothing left in its own event loop, and the runtime reports
 * "Worker code hung".
 *
 * `abandonedRequest()` models exactly that: the D1 call never settles and the timer registered by
 * the call's own timeout never fires.
 */

const originalSetTimeout = globalThis.setTimeout;
let dropTimers = 0;

/** Must run AFTER vi.useFakeTimers(): it wraps the fake setTimeout, not the real one. */
function installTimerDropper() {
  const fakeSetTimeout = globalThis.setTimeout as unknown as (...a: unknown[]) => unknown;
  globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (dropTimers > 0) {
      dropTimers--;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return fakeSetTimeout(fn, ms, ...rest) as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
}

/** D1 stub: call #0 is the abandoned request's call (never settles, its timer is dropped). */
function stubDb(opts: { abandonFirst?: boolean } = {}): { db: D1Database; calls: () => number } {
  let calls = 0;
  const db = {
    prepare: () => ({
      bind() {
        return this;
      },
      first: () => {
        if (opts.abandonFirst && calls++ === 0) {
          dropTimers = 1; // the very next setTimeout belongs to the dead request
          return new Promise(() => {});
        }
        return Promise.resolve({ data: '{"a":1}' });
      },
      all: async () => ({ results: [], success: true }),
      run: async () => ({ success: true, meta: { changes: 1 } }),
    }),
    batch: async () => [],
  } as unknown as D1Database;
  return { db, calls: () => calls };
}

/** Resolves 'settled' if `p` settles within `ms` of fake time, otherwise 'HUNG'. */
async function settlesWithin(p: Promise<unknown>, ms: number): Promise<'settled' | 'HUNG'> {
  let done = false;
  void p.then(
    () => (done = true),
    () => (done = true),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return done ? 'settled' : 'HUNG';
}

beforeEach(() => {
  vi.useFakeTimers();
  installTimerDropper();
});
afterEach(() => {
  dropTimers = 0;
  vi.useRealTimers();
  globalThis.setTimeout = originalSetTimeout;
});

describe('REPRO: a cancelled request must not hang unrelated requests', () => {
  it('io chain: a read queued behind an abandoned D1 call still settles', async () => {
    const { db } = stubDb({ abandonFirst: true });
    const store = new D1Store(db) as unknown as { readRaw(c: string, i: string): Promise<unknown> };
    void store.readRaw('users', 'dead-request').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1);
    const later = store.readRaw('users', 'live-request');
    expect(await settlesWithin(later, 10 * 60_000)).toBe('settled');
  });

  it('transaction queue: runTransaction behind an abandoned transaction still settles', async () => {
    const { db } = stubDb({ abandonFirst: true });
    const store = new D1Store(db);
    void store.runTransaction(async (tx) => tx.get('section_progress/dead')).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1);
    const later = store.runTransaction(async (tx) => tx.get('section_progress/live'));
    expect(await settlesWithin(later, 10 * 60_000)).toBe('settled');
  });
});

describe('REPRO: shared one-time init promises survive an abandoned starter', () => {
  /** batch #0 is the abandoned request's DDL batch: never settles, and its timers are dead. */
  function dbWithAbandonedFirstBatch(): D1Database {
    let batches = 0;
    return {
      prepare: () => ({
        bind() {
          return this;
        },
      }),
      batch: () => (batches++ === 0 ? new Promise(() => {}) : Promise.resolve([])),
    } as unknown as D1Database;
  }

  it('D1Store.ensureReady: later requests fail fast, then a fresh init succeeds', async () => {
    const store = new D1Store(dbWithAbandonedFirstBatch());
    dropTimers = 2; // both timers the starting request registers synchronously
    void store.ensureReady().catch(() => undefined);
    const later = store.ensureReady();
    const rejected = expect(later).rejects.toThrow(/timed out/);
    expect(await settlesWithin(later, 10 * 60_000)).toBe('settled');
    await rejected;
    await expect(store.ensureReady()).resolves.toBeUndefined();
  });

  it('ensureD1Schema (blob store): same recovery', async () => {
    const db = dbWithAbandonedFirstBatch();
    dropTimers = 1;
    void ensureD1Schema(db).catch(() => undefined);
    const later = ensureD1Schema(db);
    const rejected = expect(later).rejects.toThrow(/timed out/);
    expect(await settlesWithin(later, 10 * 60_000)).toBe('settled');
    await rejected;
    await expect(ensureD1Schema(db)).resolves.toBeUndefined();
  });
});

describe('request deadline scope', () => {
  it('bounds only the progress heartbeat; uploads and AI routes keep their own limits', async () => {
    const { progressDeadlineMs, PROGRESS_BUDGET_MS } = await import('../src/cloudflare-worker');
    expect(progressDeadlineMs('POST', '/v1/me/sections/seed-pkg-formi-s1/progress', 1000)).toBe(
      1000 + PROGRESS_BUDGET_MS,
    );
    expect(progressDeadlineMs('GET', '/v1/me/sections/seed-pkg-formi-s1/progress')).toBeNull();
    expect(progressDeadlineMs('PUT', '/v1/uploads/abc')).toBeNull();
    expect(progressDeadlineMs('POST', '/v1/me/mentor/ask')).toBeNull();
  });
});
