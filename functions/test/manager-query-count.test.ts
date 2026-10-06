import { describe, expect, it } from 'vitest';
import { buildFixture, createCtx } from './support/ctx';

/** Regression: manager/admin reports used to cost 2 queries per member (N+1) → 500s on D1. */
describe('report query count is independent of team size', () => {
  it('managerReport + managerDashboard + retakes', async () => {
    const ctx = await createCtx();
    await ctx.deps.store.set('teams/t', {
      name: 't',
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
    await buildFixture(ctx, { sections: 2, durationSec: 60, deadlineDays: 2 });
    const mgr = await ctx.user('manager', { teamId: 't' });
    const count = async () => {
      let n = 0;
      const store = ctx.deps.store;
      const orig = store.query.bind(store);
      store.query = ((q: Parameters<typeof orig>[0]) => {
        n++;
        return orig(q);
      }) as typeof store.query;
      for (const path of ['/v1/manager/reports/completion', '/v1/manager/dashboard'])
        expect((await ctx.api(mgr.token).get(path)).status).toBe(200);
      expect((await ctx.api(mgr.token).get('/v1/manager/retake-requests')).status).toBe(200);
      store.query = orig;
      return n;
    };
    for (let i = 0; i < 2; i++) await ctx.user('marketer', { teamId: 't' });
    await count(); // warm caches (catalog)
    const small = await count();
    for (let i = 0; i < 20; i++) await ctx.user('marketer', { teamId: 't' });
    const large = await count();
    expect(large).toBe(small);
  });
});
