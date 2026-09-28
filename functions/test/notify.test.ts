import { beforeEach, describe, expect, it } from 'vitest';
import { runDeadlineSweep } from '../src/services/jobs';
import { flushDeferredPush, notifyUsers } from '../src/services/notify';
import { buildFixture, createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createCtx();
  await ctx.deps.store.set('teams/t1', {
    name: 'تیم',
    managerId: null,
    archived: false,
    createdAt: '',
    updatedAt: '',
  });
});

const notifs = (userId: string, type?: string) =>
  ctx.deps.store.query<{ type: string; pushStatus: string }>({
    collection: 'notifications',
    where: [
      ['userId', '==', userId],
      ...(type ? [['type', '==', type] as [string, '==', string]] : []),
    ],
  });

describe('deadlines & escalation (28.2 #4)', () => {
  it('72h/24h warnings once each; passed deadline → marketer + manager, once', async () => {
    const fx = await buildFixture(ctx, { deadlineDays: 4 });
    const m = await ctx.user('marketer', { teamId: 't1' });
    const mgr = await ctx.user('manager', { teamId: 't1' });
    expect((await runDeadlineSweep(ctx.deps)).warnings).toBe(0);
    ctx.advance(25 * 3600_000); // 71h left
    expect((await runDeadlineSweep(ctx.deps)).warnings).toBe(1);
    expect((await runDeadlineSweep(ctx.deps)).warnings).toBe(0); // no duplicate
    ctx.advance(48 * 3600_000); // 23h left
    expect((await runDeadlineSweep(ctx.deps)).warnings).toBe(1);
    ctx.advance(24 * 3600_000); // passed
    const s = await runDeadlineSweep(ctx.deps);
    expect(s.passed).toBe(1);
    expect(s.managerReports).toBe(1);
    expect((await runDeadlineSweep(ctx.deps)).passed).toBe(0);
    expect(await notifs(m.id, 'deadline_warning')).toHaveLength(2);
    expect(await notifs(m.id, 'deadline_passed')).toHaveLength(1);
    expect(await notifs(mgr.id, 'escalation')).toHaveLength(1);
    // still accessible after deadline (D15: no automatic lock)
    const login = await ctx
      .api()
      .post('/v1/auth/login', { identifier: m.phone, password: 'pass1234' });
    expect(
      (await ctx.api(login.body.data.idToken).get(`/v1/me/packages/${fx.packageId}`)).status,
    ).toBe(200);
  });
});

describe('quiet hours (28.2 #11)', () => {
  it('normal push is deferred at 23:00 Tehran and flushed at 07:00; urgent bypasses', async () => {
    const m = await ctx.user('marketer');
    await ctx
      .api(m.token)
      .post('/v1/me/devices', { token: 'fcm-token-000001', platform: 'android' });
    ctx.setNow('2026-10-03T19:30:00.000Z'); // 23:00 Tehran
    await notifyUsers(ctx.deps, [m.id], 'new_assignment', { title: 'آموزش جدید', body: 'x' });
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect((await notifs(m.id))[0]?.pushStatus).toBe('deferred');
    await notifyUsers(
      ctx.deps,
      [m.id],
      'deadline_warning',
      { title: 'فوری', body: 'y' },
      { priority: 'high', urgent: true },
    );
    expect(ctx.deps.push.sent).toHaveLength(1);
    expect(await flushDeferredPush(ctx.deps)).toBe(0);
    ctx.setNow('2026-10-04T03:31:00.000Z'); // 07:01 Tehran
    expect(await flushDeferredPush(ctx.deps)).toBe(1);
    expect(ctx.deps.push.sent).toHaveLength(2);
    // push payload is generic (no sensitive details on lock screen)
    expect(ctx.deps.push.sent[0]?.msg.body).not.toContain('فوری');
  });

  it('in-app notifications are always created; read-all works', async () => {
    const m = await ctx.user('marketer');
    await notifyUsers(ctx.deps, [m.id], 'reminder', { title: 'یادآوری', body: 'ادامه بده' });
    const list = await ctx.api(m.token).get('/v1/me/notifications');
    expect(list.body.data.unread).toBe(1);
    await ctx.api(m.token).post('/v1/me/notifications/read-all');
    expect((await ctx.api(m.token).get('/v1/me/notifications')).body.data.unread).toBe(0);
  });
});
