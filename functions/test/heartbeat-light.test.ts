import { describe, expect, it } from 'vitest';
import type { User } from '../src/domain/types';
import type { Doc } from '../src/store/types';
import { recordProgress } from '../src/services/learning';
import { register } from '../src/services/users';
import { D1Store } from '../src/store/d1';
import { createSqliteD1, withFaults } from './support/sqlite-d1';
import { buildFixture, createCtx } from './support/ctx';

/** The hot heartbeat path must stay cheap: warm beats reuse shared data and skip presence writes. */
async function setup() {
  const calls: string[] = [];
  const ctx = await createCtx();
  const store = new D1Store(
    withFaults(createSqliteD1(), { before: (_k, sql) => (calls.push(sql), 'ok') }),
  );
  ctx.deps.store = store;
  const fx = await buildFixture(ctx, { sections: 2, durationSec: 300 });
  const u = await register(
    ctx.deps,
    { name: 'کاربر', identifier: '09120001111', password: 'pass1234' },
    'marketer',
    { teamId: null, brandIds: [] },
  );
  const user = (await store.get<User>(`users/${u.id}`)) as Doc<User>;
  const sectionId = fx.sections[0]?.id ?? '';
  const beat = (delta = 10) =>
    recordProgress(
      ctx.deps,
      user,
      sectionId,
      { positionSec: 10, playedDeltaSec: delta },
      undefined,
      {
        skipBudget: true,
        requestId: 't',
      },
    );
  return { ctx, store, user, beat, calls };
}

const count = async (store: D1Store, col: string, name?: string) =>
  (await store.query<{ name?: string }>({ collection: col })).filter(
    (e) => !name || e.name === name,
  ).length;

describe('lighter heartbeat', () => {
  it('a warm beat makes fewer D1 calls than a cold one, and at most 8', async () => {
    const { ctx, beat, calls } = await setup();
    let n0 = calls.length;
    await beat();
    const cold = calls.length - n0;
    ctx.advance(10_000);
    n0 = calls.length;
    await beat();
    const warm = calls.length - n0;
    expect(warm).toBeLessThan(cold);
    expect(warm).toBeLessThanOrEqual(8);
  });

  it('records presence once per 5 min, not on every beat', async () => {
    const { ctx, store, beat } = await setup();
    const before = await count(store, 'analytics_events', 'playback_heartbeat');
    for (let i = 0; i < 6; i++) {
      await beat();
      ctx.advance(10_000);
    }
    expect(await count(store, 'analytics_events', 'playback_heartbeat')).toBe(before + 1);
    ctx.advance(5 * 60_000);
    await beat();
    expect(await count(store, 'analytics_events', 'playback_heartbeat')).toBe(before + 2);
  });

  it('every beat is still stored and progress still accumulates', async () => {
    const { ctx, store, beat } = await setup();
    let last = { playedSeconds: 0 };
    for (let i = 0; i < 5; i++) {
      last = await beat();
      ctx.advance(10_000);
    }
    expect(last.playedSeconds).toBeGreaterThanOrEqual(40);
    expect(await count(store, 'playback_events')).toBe(5);
  });

  it('shared data is re-read only after the 30 s cache window', async () => {
    const { ctx, store, beat } = await setup();
    const reads: string[] = [];
    const orig = store.query.bind(store);
    (store as { query: unknown }).query = (q: { collection: string }) => (
      reads.push(q.collection),
      orig(q as never)
    );
    const assignmentReads = () => reads.filter((c) => c === 'assignments').length;
    await beat();
    const first = assignmentReads();
    ctx.advance(10_000);
    await beat();
    expect(assignmentReads()).toBe(first); // warm: cached
    ctx.advance(31_000);
    await beat();
    expect(assignmentReads()).toBeGreaterThan(first); // expired: re-read
  });
});
