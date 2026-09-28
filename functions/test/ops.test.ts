import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runDailyReminders, runDeadlineSweep, runWeeklyDigest } from '../src/services/jobs';
import { runMentorDaily } from '../src/services/mentor-rules';
import { flushDeferredPush } from '../src/services/notify';
import { runSeed } from '../src/seed/seed';
import { createCtx, type TestCtx } from './support/ctx';

/** Scheduled jobs + admin/manager reporting over the real seed (also feeds check:indexes). */
let ctx: TestCtx;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  ctx = await createCtx();
  await runSeed(ctx.deps, {
    repoRoot: path.resolve(__dirname, '..', '..'),
    demo: true,
    linkLocalFiles: true,
  });
}, 120_000);

async function loginAll() {
  for (const [k, phone] of Object.entries({
    sa: '09120000001',
    admin: '09120000002',
    mgr: '09120000003',
    sara: '09120000004',
    ali: '09120000005',
  })) {
    const r = await ctx.api().post('/v1/auth/login', { identifier: phone, password: 'demo1234' });
    tokens[k] = r.body.data.idToken;
  }
  ctx.limiter.reset();
}

describe('scheduled jobs', () => {
  it('run without errors on seeded data', async () => {
    await runDeadlineSweep(ctx.deps);
    ctx.advance(4 * 86400_000);
    const sweep = await runDeadlineSweep(ctx.deps);
    expect(sweep.passed).toBeGreaterThan(0); // ATL deadline (2 days) passed for demo marketers
    expect(await runDailyReminders(ctx.deps)).toBeDefined();
    expect(await runWeeklyDigest(ctx.deps, true)).toBeDefined();
    expect(await runMentorDaily(ctx.deps)).toBeGreaterThanOrEqual(0);
    expect(await flushDeferredPush(ctx.deps)).toBeGreaterThanOrEqual(0);
  });
});

describe('reports & admin lists', () => {
  beforeAll(loginAll); // tokens after the clock jumps of the jobs suite
  const ok = async (token: string | undefined, url: string) => {
    ctx.limiter.reset();
    const r = await ctx.api(token).get(url);
    expect(r.status, `${url} → ${JSON.stringify(r.body).slice(0, 200)}`).toBe(200);
    return r.body.data;
  };
  it('admin endpoints respond', async () => {
    const t = tokens.admin;
    await ok(t, '/v1/admin/dashboard');
    await ok(t, '/v1/admin/reports/kpis');
    await ok(t, '/v1/admin/reports/completion');
    await ok(t, '/v1/admin/reports/completion?brand=brand-sb-5');
    await ok(t, '/v1/admin/reports/mentor');
    await ok(t, '/v1/admin/retake-requests');
    await ok(t, '/v1/admin/users?role=marketer&status=active');
    await ok(t, '/v1/admin/users?teamId=team-tehran');
    await ok(t, '/v1/admin/teams');
    await ok(t, '/v1/admin/brands');
    await ok(t, '/v1/admin/products?brandId=brand-sb-5');
    await ok(t, '/v1/admin/packages?status=published');
    await ok(t, '/v1/admin/packages?brandId=brand-sb-10');
    await ok(t, '/v1/admin/paths');
    await ok(t, '/v1/admin/assignments');
    await ok(t, '/v1/admin/notification-templates');
    await ok(t, '/v1/admin/audit-logs');
    await ok(t, '/v1/admin/audit-logs?entity=packages');
    await ok(t, '/v1/admin/audit-logs?action=package.seeded&from=2026-01-01');
    const tree = await ok(t, '/v1/admin/content/tree');
    expect(tree.unassignedCount).toBe(1);
  });
  it('manager endpoints respond with own team only', async () => {
    const dash = await ok(tokens.mgr, '/v1/manager/dashboard');
    expect(JSON.stringify(dash)).toContain('سارا احمدی');
    expect(JSON.stringify(dash)).not.toContain('مریم کریمی');
    await ok(tokens.mgr, '/v1/manager/reports/completion');
    await ok(tokens.mgr, '/v1/manager/retake-requests');
  });
  it('marketer inbox/points/mentor endpoints respond', async () => {
    for (const url of [
      '/v1/me/notifications',
      '/v1/me/messages',
      '/v1/me/points',
      '/v1/me/badges',
      '/v1/me/mentor/nudges',
      '/v1/me/mentor/history',
      '/v1/me/packages?status=new',
    ])
      await ok(tokens.sara, url);
  });
  it('manual notification to a team', async () => {
    const r = await ctx.api(tokens.admin).post('/v1/admin/notifications/send', {
      audience: 'team',
      targetId: 'team-tehran',
      title: 'اطلاعیه',
      body: 'جلسه فردا ساعت ۱۰',
    });
    expect(r.status).toBeLessThan(300);
  });
});
