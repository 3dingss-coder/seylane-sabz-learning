import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../src/domain/types';
import type { Doc } from '../src/store/types';
import { DeadlineError } from '../src/lib/bounded';
import { recordProgress } from '../src/services/learning';
import { register } from '../src/services/users';
import { D1Store, D1_CALL_TIMEOUT_MS } from '../src/store/d1';
import { buildCloudflareDeps } from '../src/web-handler';
import { createSqliteD1, withFaults, type FaultAction } from './support/sqlite-d1';
import { buildFixture, createCtx, type Fixture, type TestCtx } from './support/ctx';

/**
 * End-to-end behaviour of POST /me/sections/:id/progress (recordProgress) on the real D1Store over
 * SQLite, with faults injected at the D1 boundary. The guarantee under test: every request ends as
 * success, a controlled failure or a controlled timeout, and nothing left behind blocks the next one.
 */

let phoneSeq = 5_000_000;
let hook: (kind: string, sql: string) => FaultAction = () => 'ok';

interface Env {
  ctx: TestCtx;
  fx: Fixture;
  store: D1Store;
  marketer(): Promise<Doc<User>>;
  beat(
    user: Doc<User>,
    sectionId: string,
    delta: number,
    key?: string,
  ): Promise<{ percent: number; playedSeconds: number; duplicate: boolean }>;
}

async function setup(): Promise<Env> {
  hook = () => 'ok';
  const ctx = await createCtx();
  const store = new D1Store(withFaults(createSqliteD1(), { before: (k, s) => hook(k, s) }));
  ctx.deps.store = store;
  const fx = await buildFixture(ctx, { sections: 3, durationSec: 300 });
  const marketer = async () => {
    phoneSeq++;
    const u = await register(
      ctx.deps,
      { name: `کاربر ${phoneSeq}`, identifier: `0912${phoneSeq}`, password: 'pass1234' },
      'marketer',
      { teamId: null, brandIds: [] },
    );
    const doc = await store.get<User>(`users/${u.id}`);
    if (!doc) throw new Error('user not stored');
    return doc;
  };
  const beat = (user: Doc<User>, sectionId: string, delta: number, key?: string) =>
    recordProgress(ctx.deps, user, sectionId, { positionSec: 10, playedDeltaSec: delta }, key, {
      skipBudget: true,
      requestId: `test-${Math.random().toString(36).slice(2, 8)}`,
    });
  return { ctx, fx, store, marketer, beat };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

afterEach(() => {
  vi.useRealTimers();
  hook = () => 'ok';
});

describe('concurrency: no deadlock, no lost updates', () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });

  for (const n of [1, 5, 20, 50, 100]) {
    it(`${n} concurrent beats, same user + same section: all succeed, nothing is lost`, async () => {
      const u = await env.marketer();
      const sec = env.fx.sections[0]?.id ?? '';
      const t0 = Date.now();
      const times: number[] = [];
      const results = await Promise.all(
        Array.from({ length: n }, async (_, i) => {
          const s = Date.now();
          const r = await env.beat(u, sec, 1, `same-${n}-${i}`);
          times.push(Date.now() - s);
          return r;
        }),
      );
      const total = Date.now() - t0;
      expect(results).toHaveLength(n);
      // Concurrent beats of one user conflict on the guarded commit and retry: every second is accounted for.
      const final = await env.store.get<{ playedSeconds: number }>(
        `section_progress/${u.id}_${sec}`,
      );
      expect(final?.playedSeconds).toBe(n);
      console.info(
        `[concurrency same-section n=${n}] total=${total}ms p50=${pct(times, 50)}ms p95=${pct(times, 95)}ms p99=${pct(times, 99)}ms errors=0`,
      );
    });

    it(`${n} concurrent beats, different users + sections: all succeed`, async () => {
      const users = await Promise.all(Array.from({ length: n }, () => env.marketer()));
      const t0 = Date.now();
      const times: number[] = [];
      let errors = 0;
      await Promise.all(
        users.map(async (u, i) => {
          const s = Date.now();
          try {
            await env.beat(u, env.fx.sections[i % 3]?.id ?? '', 2, `diff-${n}-${i}`);
          } catch {
            errors++;
          }
          times.push(Date.now() - s);
        }),
      );
      expect(errors).toBe(0);
      console.info(
        `[concurrency different n=${n}] total=${Date.now() - t0}ms p50=${pct(times, 50)}ms p95=${pct(times, 95)}ms p99=${pct(times, 99)}ms errors=${errors}`,
      );
    });
  }
});

describe('failure injection on the progress path', () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
    vi.useFakeTimers();
  });

  /** The progress commit is one guarded D1 batch (progress doc + playback event, atomically). */
  const isProgressCommit = (kind: string, sql: string) =>
    kind === 'batch' && sql.includes('json(CASE');

  it('A. slow D1 (below the limit): the request still succeeds and the queue stays usable', async () => {
    const u = await env.marketer();
    const sec = env.fx.sections[0]?.id ?? '';
    let slowed = false;
    hook = (kind, sql) => {
      if (!slowed && isProgressCommit(kind, sql)) {
        slowed = true;
        return { delayMs: 3_000 };
      }
      return 'ok';
    };
    const slow = env.beat(u, sec, 5, 'a-1');
    await vi.advanceTimersByTimeAsync(3_100);
    expect((await slow).playedSeconds).toBe(5);
    expect((await env.beat(u, sec, 5, 'a-2')).playedSeconds).toBe(10);
  });

  it('B. D1 throws: controlled error, queue released, next request succeeds', async () => {
    const u = await env.marketer();
    const sec = env.fx.sections[0]?.id ?? '';
    let threw = false;
    hook = (kind, sql) => {
      if (!threw && isProgressCommit(kind, sql)) {
        threw = true;
        return 'throw';
      }
      return 'ok';
    };
    await expect(env.beat(u, sec, 5, 'b-1')).rejects.toThrow(/injected D1 failure/);
    expect((await env.beat(u, sec, 5, 'b-2')).duplicate).toBe(false);
  });

  it('C. D1 never resolves: bounded timeout, cleanup, next request succeeds', async () => {
    const u = await env.marketer();
    const sec = env.fx.sections[0]?.id ?? '';
    let hung = false;
    hook = (kind, sql) => {
      if (!hung && isProgressCommit(kind, sql)) {
        hung = true;
        return 'hang';
      }
      return 'ok';
    };
    const stuck = env.beat(u, sec, 5, 'c-1');
    const outcome = expect(stuck).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 100);
    await outcome;
    const next = env.beat(u, sec, 5, 'c-2');
    await vi.advanceTimersByTimeAsync(10);
    expect((await next).duplicate).toBe(false);
  });

  it('D. A commit hangs: A ends as a bounded timeout, B and C (same section) are not blocked', async () => {
    const a = await env.marketer();
    const b = await env.marketer();
    const c = await env.marketer();
    const sec = env.fx.sections[0]?.id ?? '';
    let hung = false;
    hook = (kind, sql) => {
      if (!hung && isProgressCommit(kind, sql)) {
        hung = true;
        return 'hang';
      }
      return 'ok';
    };
    const pa = env.beat(a, sec, 5, 'd-a');
    const aDone = expect(pa).rejects.toBeInstanceOf(DeadlineError);
    const pb = env.beat(b, sec, 5, 'd-b');
    const pc = env.beat(c, sec, 5, 'd-c');
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 500);
    await aDone;
    expect((await pb).duplicate).toBe(false);
    expect((await pc).duplicate).toBe(false);
  });
});

describe('isolation between users', () => {
  it("one user's hung commit does not delay other users at all", async () => {
    const env = await setup();
    vi.useFakeTimers();
    const slowUser = await env.marketer();
    const otherUser = await env.marketer();
    const sec = env.fx.sections[0]?.id ?? '';
    let hung = false;
    hook = (kind, sql) => {
      if (!hung && kind === 'batch' && sql.includes('json(CASE')) {
        hung = true;
        return 'hang';
      }
      return 'ok';
    };
    void env.beat(slowUser, sec, 5, 'iso-slow').catch(() => undefined);
    // Let the slow user reach (and hang on) its commit before the other user starts.
    await vi.advanceTimersByTimeAsync(20);
    expect(hung).toBe(true);
    const other = env.beat(otherUser, sec, 5, 'iso-other');
    let settled = false;
    void other.then(
      () => (settled = true),
      () => (settled = true),
    );
    // There is no cross-request queue: the other user finishes while the first commit is still hung.
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
    expect((await other).duplicate).toBe(false);
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 100);
  });
});

describe('idempotency', () => {
  it('a repeated Idempotency-Key never double-counts, sequentially or concurrently', async () => {
    const env = await setup();
    const u = await env.marketer();
    const sec = env.fx.sections[0]?.id ?? '';
    const first = await env.beat(u, sec, 10, 'dup-1');
    const again = await env.beat(u, sec, 10, 'dup-1');
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    const burst = await Promise.all(
      Array.from({ length: 10 }, () => env.beat(u, sec, 10, 'dup-2')),
    );
    expect(burst.filter((r) => !r.duplicate)).toHaveLength(1);
    const final = await env.store.get<{ playedSeconds: number }>(`section_progress/${u.id}_${sec}`);
    expect(final?.playedSeconds).toBe(20); // dup-1 once + dup-2 once
    const events = await env.store.query({
      collection: 'playback_events',
      where: [['userId', '==', u.id]],
    });
    expect(events).toHaveLength(2);
  });
});

describe('no silent in-memory fallback', () => {
  it('refuses to start without a D1 binding unless explicitly allowed', async () => {
    await expect(buildCloudflareDeps({ APP_ENV: 'prod' })).rejects.toThrow(
      /D1 binding "DB" is missing/,
    );
    const deps = await buildCloudflareDeps({ APP_ENV: 'dev', ALLOW_MEMORY_STORE: 'on' });
    expect(deps.store).toBeDefined();
  });
});
