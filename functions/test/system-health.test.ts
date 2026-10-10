import { beforeEach, describe, expect, it } from 'vitest';
import { UnconfiguredPushSender, type PushSender } from '../src/push/types';
import { notifyUsers, flushDeferredPush } from '../src/services/notify';
import { runCron } from '../src/services/cron';
import {
  cronStalenessMinutes,
  readCronHealth,
  readPushHealth,
  recordPushOutcome,
  systemHealth,
} from '../src/services/system-health';
import { createCtx, type TestCtx } from './support/ctx';

/**
 * System health: the admin panel's answer to "is Push configured?" and "did the cron run?" must come
 * from stored documents, not from opening the Cloudflare dashboard.
 */
let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
});

describe('cron heartbeat', () => {
  it('is absent before the first run and reported as never-run', async () => {
    expect(await readCronHealth(ctx.deps)).toBeNull();
    const h = await systemHealth(ctx.deps);
    expect(h.cron.neverReported).toBe(true);
    expect(h.cron.stalled).toBe(true);
    expect(h.cron.lastRunAt).toBeNull();
  });

  it('records every job of the schedule, including failures', async () => {
    await runCron(ctx.deps, '30 6 * * *'); // daily-reminders
    const health = await readCronHealth(ctx.deps);
    expect(health?.cron).toBe('30 6 * * *');
    expect(health?.ok).toBe(true);
    expect(health?.jobs.map((j) => j.name)).toEqual(['daily-reminders']);
    expect(cronStalenessMinutes(health, ctx.now.value)).toBe(0);
  });

  it('goes stale when the scheduler stops reporting', async () => {
    await runCron(ctx.deps, '*/15 * * * *');
    ctx.advance(45 * 60_000);
    const h = await systemHealth(ctx.deps);
    expect(h.cron.minutesSinceLastRun).toBe(45);
    expect(h.cron.stalled).toBe(true);
    ctx.advance(-30 * 60_000);
    expect((await systemHealth(ctx.deps)).cron.stalled).toBe(false);
  });
});

describe('push health', () => {
  it('reports the sender identity without exposing anything secret', async () => {
    expect((await readPushHealth(ctx.deps)).provider).toBe('recording');
    (ctx.deps as { push: PushSender }).push = new UnconfiguredPushSender();
    const p = await readPushHealth(ctx.deps);
    expect(p.provider).toBe('unconfigured');
    expect(p.configured).toBe(false);
  });

  it('aggregates the deferred flush into ONE day counter (sent + failed)', async () => {
    const m = await ctx.user('marketer');
    await ctx.api(m.token).post('/v1/me/devices', { token: 'fcm-token-000001', platform: 'web' });
    ctx.setNow('2026-10-03T19:30:00.000Z'); // 23:00 Tehran → inside quiet hours
    await notifyUsers(ctx.deps, [m.id], 'new_assignment', { title: 'آموزش جدید', body: 'x' });
    expect((await systemHealth(ctx.deps)).push.today.sent).toBe(0);
    ctx.setNow('2026-10-04T03:31:00.000Z'); // 07:01 Tehran → the flush is due
    expect(await flushDeferredPush(ctx.deps)).toBe(1);
    expect((await systemHealth(ctx.deps)).push.today).toEqual({ sent: 1, failed: 0, invalid: 0 });
  });

  it('a run whose provider rejects everything counts as failure, and the reason is sanitised', async () => {
    (ctx.deps as { push: PushSender }).push = new UnconfiguredPushSender();
    await recordPushOutcome(ctx.deps, {
      sent: 0,
      failed: 3,
      invalid: 1,
      error: `FCM failed for token ${'t'.repeat(300)}`,
    });
    const after = await systemHealth(ctx.deps);
    expect(after.push.today).toEqual({ sent: 0, failed: 3, invalid: 1 });
    expect(after.push.lastError).toContain('FCM failed');
    expect((after.push.lastError ?? '').length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(after)).not.toContain('t'.repeat(60));
  });

  it('GET /admin/system-health is admin-only and returns the two blocks', async () => {
    const anon = await ctx.api().get('/v1/admin/system-health');
    expect(anon.status).toBe(401);
    const marketer = await ctx.user('marketer');
    expect((await ctx.api(marketer.token).get('/v1/admin/system-health')).status).toBe(403);
    const admin = await ctx.user('admin');
    const r = await ctx.api(admin.token).get('/v1/admin/system-health');
    expect(r.status).toBe(200);
    expect(r.body.data.push.provider).toBe('recording');
    expect(r.body.data.cron.neverReported).toBe(true);
  });
});
