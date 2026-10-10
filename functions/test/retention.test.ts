import { describe, expect, it } from 'vitest';
import { D1Store } from '../src/store/d1';
import { purgeExpiredEvents } from '../src/services/retention';
import { createSqliteD1 } from './support/sqlite-d1';
import { createCtx } from './support/ctx';

const DAY = 86_400_000;

async function setup() {
  const ctx = await createCtx();
  const store = new D1Store(createSqliteD1());
  ctx.deps.store = store;
  return { ctx, store };
}

describe('retention purge', () => {
  it('deletes only expired rows of the event logs', async () => {
    const { ctx, store } = await setup();
    const now = ctx.deps.clock().getTime();
    const old = new Date(now - DAY);
    const future = new Date(now + 30 * DAY);
    for (let i = 0; i < 5; i++) {
      await store.set(`analytics_events/old${i}`, { name: 'x', expireAt: old });
      await store.set(`playback_events/old${i}`, { userId: 'u', expireAt: old });
    }
    await store.set('analytics_events/new', { name: 'x', expireAt: future });
    await store.set('playback_events/new', { userId: 'u', expireAt: future });
    // Another collection with an expired expireAt must be left alone.
    await store.set('mentor_nudges/keep', { expireAt: old });
    // A row without expireAt must be left alone.
    await store.set('analytics_events/noexp', { name: 'y' });

    const r = await purgeExpiredEvents(ctx.deps);
    expect(r).toEqual({ deleted: { playback_events: 5, analytics_events: 5 } });
    expect((await store.query({ collection: 'analytics_events' })).map((x) => x.id).sort()).toEqual(
      ['new', 'noexp'],
    );
    expect((await store.query({ collection: 'playback_events' })).length).toBe(1);
    expect(await store.get('mentor_nudges/keep')).not.toBeNull();
  });

  it('handles more rows than one batch and stops at the deadline', async () => {
    const { ctx, store } = await setup();
    const old = new Date(ctx.deps.clock().getTime() - DAY);
    await store.batchSet(
      Array.from({ length: 1200 }, (_, i) => ({
        path: `analytics_events/e${i}`,
        data: { name: 'x', expireAt: old },
      })),
    );
    const r = await purgeExpiredEvents(ctx.deps);
    expect(r).toEqual({ deleted: { playback_events: 0, analytics_events: 1200 } });
    expect((await store.query({ collection: 'analytics_events' })).length).toBe(0);
    await store.set('analytics_events/z', { name: 'x', expireAt: old });
    const stopped = await purgeExpiredEvents(ctx.deps, Date.now() - 1);
    expect(stopped).toMatchObject({ partial: true });
    expect(await store.get('analytics_events/z')).not.toBeNull();
  });

  it('is a no-op on a store without purgeExpired', async () => {
    const { ctx } = await setup();
    const bare = { ...ctx.deps, store: { ...ctx.deps.store, purgeExpired: undefined } };
    expect(await purgeExpiredEvents(bare as never)).toEqual({ skipped: true });
  });
});
