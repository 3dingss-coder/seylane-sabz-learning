import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../src/domain/types';
import type { Doc } from '../src/store/types';
import { DeadlineError } from '../src/lib/bounded';
import { recordProgress } from '../src/services/learning';
import { register } from '../src/services/users';
import { D1Store, D1_CALL_TIMEOUT_MS } from '../src/store/d1';
import type { D1Database } from '../src/store/d1';
import { createSqliteD1, withFaults, type FaultAction } from './support/sqlite-d1';
import { buildFixture, createCtx, type Fixture, type TestCtx } from './support/ctx';

/**
 * Adversarial cases for the progress path. "Isolate" below means a separate D1Store over the SAME
 * database: separate in-memory queues and init state, shared durable state.
 *
 * MODELLED, NOT VERIFIED IN CLOUDFLARE: the SQLite emulator reproduces D1's documented contract
 * (atomic batch, rollback on failed statement). Real D1 latency, ordering across isolates and the
 * exact error text of the guard are NOT measured here; they must be watched in production logs.
 */

let seq = 7_000_000;
let hooks: Array<(kind: string, sql: string) => FaultAction> = [];
const hookFor = (i: number) => (kind: string, sql: string) => hooks[i]?.(kind, sql) ?? 'ok';

interface World {
  ctx: TestCtx;
  fx: Fixture;
  raw: D1Database;
  stores: D1Store[];
  user(): Promise<Doc<User>>;
  beat(
    storeIdx: number,
    user: Doc<User>,
    delta: number,
    key: string,
    opts?: { deadlineAtMs?: number | null },
  ): Promise<{ playedSeconds: number; duplicate: boolean }>;
  played(user: Doc<User>): Promise<number>;
  events(user: Doc<User>): Promise<number>;
}

async function world(isolates = 2): Promise<World> {
  hooks = [];
  const ctx = await createCtx();
  const raw = createSqliteD1();
  const stores = Array.from(
    { length: isolates },
    (_, i) => new D1Store(withFaults(raw, { before: hookFor(i) })),
  );
  ctx.deps.store = stores[0] as D1Store;
  const fx = await buildFixture(ctx, { sections: 2, durationSec: 300 });
  const sec = fx.sections[0]?.id ?? '';
  const user = async () => {
    seq++;
    const u = await register(
      ctx.deps,
      { name: `کاربر ${seq}`, identifier: `0913${seq}`, password: 'pass1234' },
      'marketer',
      { teamId: null, brandIds: [] },
    );
    const doc = await (stores[0] as D1Store).get<User>(`users/${u.id}`);
    if (!doc) throw new Error('user not stored');
    return doc;
  };
  const beat: World['beat'] = (i, u, delta, key, o = {}) => {
    const deps = { ...ctx.deps, store: stores[i] as D1Store };
    return recordProgress(deps, u, sec, { positionSec: 10, playedDeltaSec: delta }, key, {
      skipBudget: true,
      requestId: `adv-${i}-${key}`,
      deadlineAtMs: o.deadlineAtMs ?? null,
    });
  };
  const played = async (u: Doc<User>) =>
    (await (stores[0] as D1Store).get<{ playedSeconds: number }>(`section_progress/${u.id}_${sec}`))
      ?.playedSeconds ?? 0;
  const events = async (u: Doc<User>) =>
    (
      await (stores[0] as D1Store).query({
        collection: 'playback_events',
        where: [['userId', '==', u.id]],
      })
    ).length;
  return { ctx, fx, raw, stores, user, beat, played, events };
}

beforeEach(() => {
  hooks = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('cross-isolate idempotency and lost updates (durable, D1-side)', () => {
  it('same Idempotency-Key from two isolates concurrently is applied exactly once', async () => {
    const w = await world();
    const u = await w.user();
    const rs = await Promise.all([
      ...Array.from({ length: 6 }, () => w.beat(0, u, 10, 'same-key')),
      ...Array.from({ length: 6 }, () => w.beat(1, u, 10, 'same-key')),
    ]);
    expect(rs.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await w.played(u)).toBe(10);
    expect(await w.events(u)).toBe(1);
  });

  it('different keys from two isolates: no lost increments, one event per accepted delta', async () => {
    const w = await world();
    const u = await w.user();
    await Promise.all(Array.from({ length: 20 }, (_, i) => w.beat(i % 2, u, 1, `k-${i}`)));
    expect(await w.played(u)).toBe(20);
    expect(await w.events(u)).toBe(20);
  });
});

describe('late predecessor cannot overwrite newer state', () => {
  it('A commit is held, B commits, then A lands late: A is rejected by the guard, B stays', async () => {
    const w = await world();
    const u = await w.user();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    hooks[0] = (kind, sql) => {
      if (!held && kind === 'batch' && sql.includes('json(CASE')) {
        held = true;
        return { holdUntil: gate };
      }
      return 'ok';
    };
    const a = w.beat(0, u, 5, 'late-a').then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(held).toBe(true);
    const b = await w.beat(1, u, 7, 'late-b');
    expect(b.playedSeconds).toBe(7);
    release(); // A's commit now reaches D1 AFTER B's
    const ra = await a;
    // A's stale guard fails, A re-reads B's state and applies its own delta ON TOP: 7 + 5, never 5.
    expect(ra.ok).toBe(true);
    expect(await w.played(u)).toBe(12);
    expect(await w.events(u)).toBe(2);
  });
});

describe('deadline: an error response never hides a continuing mutation', () => {
  it('deadline passed BEFORE the commit: nothing is written, retry applies exactly once', async () => {
    const w = await world();
    const u = await w.user();
    await expect(w.beat(0, u, 5, 'dl-1', { deadlineAtMs: Date.now() - 1 })).rejects.toBeInstanceOf(
      DeadlineError,
    );
    expect(await w.played(u)).toBe(0);
    expect(await w.events(u)).toBe(0);
    const retry = await w.beat(0, u, 5, 'dl-1');
    expect(retry.duplicate).toBe(false);
    expect(await w.played(u)).toBe(5);
  });

  it('commit times out (outcome unknown) and lands late: retry with the same key is a no-op', async () => {
    const w = await world();
    const u = await w.user();
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    hooks[0] = (kind, sql) => {
      if (!held && kind === 'batch' && sql.includes('json(CASE')) {
        held = true;
        return { holdUntil: gate };
      }
      return 'ok';
    };
    const a = w.beat(0, u, 5, 'unk-1');
    const settled = expect(a).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 100);
    await settled; // caller was told: error (503)
    release(); // ...but the mutation lands afterwards
    await vi.advanceTimersByTimeAsync(50);
    expect(await w.played(u)).toBe(5);
    const retry = await w.beat(1, u, 5, 'unk-1');
    expect(retry.duplicate).toBe(true);
    expect(await w.played(u)).toBe(5);
    expect(await w.events(u)).toBe(1);
  });
});

describe('one-time init: A starts and disappears, B waits and times out, C starts fresh, A completes late', () => {
  it('A lands late; C (fresh init) is unaffected and the store stays healthy', async () => {
    vi.useFakeTimers();
    const raw = createSqliteD1();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let batches = 0;
    // The first DDL batch (A's) is held, then lands late; every later batch runs normally.
    const store = new D1Store(
      withFaults(raw, {
        before: (kind) => (kind === 'batch' && batches++ === 0 ? { holdUntil: gate } : 'ok'),
      }),
    );
    void store.ensureReady().catch(() => undefined); // A
    const b = store.ensureReady(); // B
    const bOutcome = expect(b).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(60_000);
    await bOutcome;
    await expect(store.ensureReady()).resolves.toBeUndefined(); // C starts fresh and succeeds
    release(); // A completes late
    await vi.advanceTimersByTimeAsync(50);
    await expect(store.ensureReady()).resolves.toBeUndefined(); // still healthy
    await store.set('probe/p1', { n: 1 });
    expect((await store.get<{ n: number }>('probe/p1'))?.n).toBe(1);
  });
});
