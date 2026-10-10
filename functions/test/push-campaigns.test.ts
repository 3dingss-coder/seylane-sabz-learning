import { beforeEach, describe, expect, it } from 'vitest';
import { CRON_JOBS, runCron } from '../src/services/cron';
import { runPushCampaigns } from '../src/services/push-campaigns';
import type { PushMessage, PushSender } from '../src/push/types';
import { createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;
let admin: { id: string; token: string; phone: string };
let marketer: { id: string; token: string; phone: string };
const KEY = 'send-key-0000001';

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran
  admin = await ctx.user('admin');
  marketer = await ctx.user('marketer');
});

const valid = (over: Record<string, unknown> = {}) => ({
  name: 'کمپین تست',
  title: 'عنوان تست',
  body: 'متن تست اعلان',
  imageUrl: 'https://cdn.example.com/banner.png',
  actionRef: '/messages',
  audience: { type: 'all', targetId: null, channel: 'any' },
  scheduledAt: null,
  ...over,
});

async function addDevice(
  userToken: string,
  token: string,
  platform: 'web' | 'android' = 'android',
) {
  const r = await ctx.api(userToken).post('/v1/me/devices', { token, platform });
  expect(r.status).toBe(200);
}

async function createDraft(over: Record<string, unknown> = {}) {
  const r = await ctx.api(admin.token).post('/v1/admin/push-campaigns', valid(over));
  expect(r.status).toBe(201);
  return r.body.data.campaign as { id: string; version: number; status: string };
}

async function send(id: string, key = KEY) {
  const response = await ctx
    .api(admin.token)
    .post(`/v1/admin/push-campaigns/${id}/send`)
    .set('Idempotency-Key', key);
  if (response.status === 200) {
    await runPushCampaigns(ctx.deps);
    const detail = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${id}`);
    response.body.data = detail.body.data;
  }
  return response;
}

class FailingSender implements PushSender {
  calls = 0;
  async send(tokens: string[]) {
    this.calls++;
    return { sent: 0, invalidTokens: tokens.filter((t) => t.startsWith('invalid')) };
  }
}

describe('push campaigns: access control & validation', () => {
  it('rejects anonymous and non-admin users', async () => {
    const anon = await ctx.api().post('/v1/admin/push-campaigns', valid());
    expect(anon.status).toBe(401);
    const forbidden = await ctx.api(marketer.token).post('/v1/admin/push-campaigns', valid());
    expect(forbidden.status).toBe(403);
    const list = await ctx.api(marketer.token).get('/v1/admin/push-campaigns');
    expect(list.status).toBe(403);
    const sendAttempt = await ctx
      .api(marketer.token)
      .post('/v1/admin/push-campaigns/x/send')
      .set('Idempotency-Key', KEY);
    expect(sendAttempt.status).toBe(403);
  });

  it('rejects unsafe image URLs and destinations', async () => {
    const badImages = [
      'http://cdn.example.com/a.png',
      'javascript:alert(1)',
      'https://user:pass@cdn.example.com/a.png',
      'https://localhost/a.png',
      'https://10.0.0.1/a.png',
    ];
    for (const imageUrl of badImages) {
      const r = await ctx.api(admin.token).post('/v1/admin/push-campaigns', valid({ imageUrl }));
      expect(r.status, imageUrl).toBe(400);
    }
    const badTargets = [
      'https://evil.example.com',
      '//evil.example.com',
      'javascript:alert(1)',
      '/admin/users',
      '/messages/../../admin',
      '/\\evil.example.com',
    ];
    for (const actionRef of badTargets) {
      const r = await ctx.api(admin.token).post('/v1/admin/push-campaigns', valid({ actionRef }));
      expect(r.status, actionRef).toBe(400);
      expect(JSON.stringify(r.body)).toContain('مسیر داخلی');
    }
  });

  it('rejects invalid text, audience and schedule with Persian field errors', async () => {
    const r1 = await ctx.api(admin.token).post('/v1/admin/push-campaigns', valid({ title: 'a' }));
    expect(r1.status).toBe(400);
    expect(r1.body.error.details?.[0]?.field).toBe('title');
    const r2 = await ctx
      .api(admin.token)
      .post(
        '/v1/admin/push-campaigns',
        valid({ audience: { type: 'team', targetId: null, channel: 'any' } }),
      );
    expect(r2.status).toBe(400);
    const r3 = await ctx
      .api(admin.token)
      .post(
        '/v1/admin/push-campaigns',
        valid({ audience: { type: 'role', targetId: 'root', channel: 'any' } }),
      );
    expect(r3.status).toBe(400);
    const r4 = await ctx
      .api(admin.token)
      .post('/v1/admin/push-campaigns', valid({ scheduledAt: '2026-10-03T06:00:00.000Z' }));
    expect(r4.status).toBe(400);
    expect(r4.body.error.details?.[0]?.field).toBe('scheduledAt');
  });
});

describe('push campaigns: drafts, persistence and editing', () => {
  it('saves a draft that survives a read, never sends, and is listed', async () => {
    const c = await createDraft();
    expect(c.status).toBe('draft');
    const got = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c.id}`);
    expect(got.status).toBe(200);
    expect(got.body.data.campaign.title).toBe('عنوان تست');
    expect(got.body.data.campaign.imageUrl).toBe('https://cdn.example.com/banner.png');
    expect(got.body.data.campaign.actionRef).toBe('/messages');
    expect(got.body.data.campaign.sendRequestId).toBeUndefined();
    const list = await ctx.api(admin.token).get('/v1/admin/push-campaigns');
    expect(list.body.data.items.map((x: { id: string }) => x.id)).toContain(c.id);
    expect(ctx.deps.push.sent).toHaveLength(0);
  });

  it('edits with optimistic version checks and blocks stale writes', async () => {
    const c = await createDraft();
    const ok = await ctx.api(admin.token).patch(`/v1/admin/push-campaigns/${c.id}`, {
      ...valid({ title: 'عنوان جدید' }),
      version: c.version,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.campaign.title).toBe('عنوان جدید');
    expect(ok.body.data.campaign.version).toBe(2);
    const stale = await ctx.api(admin.token).patch(`/v1/admin/push-campaigns/${c.id}`, {
      ...valid({ title: 'تغییر قدیمی' }),
      version: 1,
    });
    expect(stale.status).toBe(409);
  });

  it('archives a draft (soft delete, hidden from the default list) and never sends it', async () => {
    const c = await createDraft();
    const del = await ctx.api(admin.token).del(`/v1/admin/push-campaigns/${c.id}`);
    expect(del.status).toBe(200);
    const list = await ctx.api(admin.token).get('/v1/admin/push-campaigns');
    expect(list.body.data.items.map((x: { id: string }) => x.id)).not.toContain(c.id);
    const detail = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c.id}`);
    expect(detail.status).toBe(404);
  });
});

describe('push campaigns: immediate send', () => {
  it('requires an Idempotency-Key', async () => {
    const c = await createDraft();
    const r = await ctx.api(admin.token).post(`/v1/admin/push-campaigns/${c.id}/send`);
    expect(r.status).toBe(400);
    expect(ctx.deps.push.sent).toHaveLength(0);
  });

  it('returns quickly with a queued campaign; cron sends the exact admin content, image and internal link', async () => {
    const other = await ctx.user('marketer');
    await addDevice(marketer.token, 'fcm-token-aaaaaaaa1');
    await addDevice(other.token, 'fcm-token-bbbbbbbb2', 'web');
    const c = await createDraft({ title: 'عنوان دستی ادمین', body: 'متن دستی ادمین' });
    const immediate = await ctx.api(admin.token).post(`/v1/admin/push-campaigns/${c.id}/send`).set('Idempotency-Key', 'fast-key-000001');
    expect(immediate.status).toBe(200);
    expect(immediate.body.data.campaign.status).toBe('queued');
    await runPushCampaigns(ctx.deps);
    const r = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c.id}`);
    expect(r.body.data.campaign.status).toBe('sent_with_errors');
    expect(r.body.data.campaign.summary.attempted).toBe(2);
    expect(r.body.data.campaign.summary.accepted).toBe(2);
    expect(r.body.data.campaign.summary.failed).toBe(0);
    expect(ctx.deps.push.sent).toHaveLength(2);
    const first = ctx.deps.push.sent[0];
    if (!first) throw new Error('expected a sent message');
    const msg: PushMessage = first.msg;
    expect(msg.title).toBe('عنوان دستی ادمین');
    expect(msg.body).toBe('متن دستی ادمین');
    expect(msg.imageUrl).toBe('https://cdn.example.com/banner.png');
    expect(msg.data?.link).toBe('/messages');
    expect(msg.data?.campaignId).toBe(c.id);
    expect(msg.data?.imageUrl).toBe('https://cdn.example.com/banner.png');
    // The in-app inbox entry is created too, linked to the campaign.
    const inbox = await ctx.api(marketer.token).get('/v1/me/notifications');
    expect(inbox.status).toBe(200);
    expect(
      inbox.body.data.items.some((i: { title: string }) => i.title === 'عنوان دستی ادمین'),
    ).toBe(true);
  });

  it('a retried request with the same key does not send again; another key is refused', async () => {
    await addDevice(marketer.token, 'fcm-token-cccccccc3');
    const c = await createDraft();
    expect((await send(c.id)).status).toBe(200);
    expect(ctx.deps.push.sent).toHaveLength(1);
    const replay = await send(c.id);
    expect(replay.status).toBe(200);
    expect(replay.body.data.campaign.status).toBe('sent_with_errors');
    expect(ctx.deps.push.sent).toHaveLength(1);
    const other = await send(c.id, 'another-key-0002');
    expect(other.status).toBe(409);
    expect(ctx.deps.push.sent).toHaveLength(1);
  });

  it('a sent campaign cannot be edited, cancelled or re-sent', async () => {
    await addDevice(marketer.token, 'fcm-token-dddddddd4');
    const c = await createDraft();
    await send(c.id);
    const edit = await ctx.api(admin.token).patch(`/v1/admin/push-campaigns/${c.id}`, {
      ...valid({ title: 'تغییر بعد از ارسال' }),
      version: c.version,
    });
    expect(edit.status).toBe(409);
    expect(
      (await ctx.api(admin.token).post(`/v1/admin/push-campaigns/${c.id}/cancel`)).status,
    ).toBe(409);
    expect((await send(c.id, 'third-key-000003')).status).toBe(409);
    expect(ctx.deps.push.sent).toHaveLength(1);
  });

  it('removes invalid device tokens and reports provider failures in the report', async () => {
    await addDevice(marketer.token, 'invalid-token-0000001');
    const c = await createDraft();
    const r = await send(c.id);
    expect(r.body.data.campaign.summary.invalid).toBe(1);
    expect(r.body.data.campaign.summary.failed).toBe(1);
    expect(r.body.data.campaign.summary.accepted).toBe(0);
    // Permanently invalid tokens are pruned from device_tokens; the campaign outcome is a failure.
    expect(r.body.data.campaign.status).toBe('failed');
    expect(JSON.stringify(r.body)).not.toContain('invalid-token-0000001');
  });

  it('does not report a successful Push when all selected users have no device token', async () => {
    const c = await createDraft();
    const r = await send(c.id);
    expect(r.status).toBe(200);
    expect(r.body.data.campaign.status).toBe('failed');
    expect(r.body.data.campaign.summary.attempted).toBe(0);
    expect(r.body.data.campaign.summary.accepted).toBe(0);
    expect(r.body.data.campaign.summary.noDevice).toBeGreaterThan(0);
    expect(ctx.deps.push.sent).toHaveLength(0);
  });

  it('a provider that rejects everything marks the campaign failed, without leaking tokens', async () => {
    await addDevice(marketer.token, 'fcm-token-eeeeeeee5');
    const sender = new FailingSender();
    (ctx.deps as { push: PushSender }).push = sender;
    const c = await createDraft();
    const r = await send(c.id);
    expect(r.body.data.campaign.status).toBe('failed');
    expect(r.body.data.campaign.summary.accepted).toBe(0);
    expect(JSON.stringify(r.body)).not.toContain('fcm-token-eeeeeeee5');
    expect(sender.calls).toBe(1);
  });

  it('refuses to start an audience with nobody in it, and leaves the draft editable', async () => {
    const c = await createDraft({
      audience: { type: 'team', targetId: 'no-such-team', channel: 'any' },
    });
    const r = await send(c.id);
    expect(r.status).toBe(400);
    const got = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c.id}`);
    expect(got.body.data.campaign.status).toBe('draft');
    expect(ctx.deps.push.sent).toHaveLength(0);
  });

  it('audience channel limits recipients to users with that platform token', async () => {
    const webUser = await ctx.user('marketer');
    await addDevice(webUser.token, 'web-token-ffffffff6', 'web');
    await addDevice(marketer.token, 'android-token-ggggg7', 'android');
    const preview = await ctx.api(admin.token).post('/v1/admin/push-campaigns/audience-preview', {
      audience: { type: 'all', targetId: null, channel: 'web' },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.users).toBe(1);
    const c = await createDraft({ audience: { type: 'all', targetId: null, channel: 'web' } });
    await send(c.id, 'web-only-key-0001');
    expect(ctx.deps.push.sent).toHaveLength(1);
    expect(ctx.deps.push.sent[0]?.tokens).toEqual(['web-token-ffffffff6']);
  });
});

describe('push campaigns: scheduling (server-side cron)', () => {
  it('runs a scheduled campaign only once the time has come, even without the admin', async () => {
    await addDevice(marketer.token, 'fcm-token-hhhhhhhh8');
    const at = new Date(ctx.now.value.getTime() + 2 * 3600_000).toISOString();
    const c = await createDraft({ scheduledAt: at });
    expect(c.status).toBe('scheduled');
    expect(await runPushCampaigns(ctx.deps)).toEqual({ started: 0, batches: 0 });
    expect(ctx.deps.push.sent).toHaveLength(0);
    ctx.advance(2 * 3600_000 + 60_000);
    // ID tokens expire after an hour: sign in again, as a real admin session would.
    const fresh = await ctx.deps.auth.signIn(`${admin.phone}@phone.seylane-sabz.app`, 'pass1234');
    if (!fresh.ok) throw new Error('re-login failed');
    admin.token = fresh.tokens.idToken;
    const r = await runCron(ctx.deps, '*/15 * * * *');
    expect(r.jobs['push-campaigns']?.ok).toBe(true);
    expect(ctx.deps.push.sent).toHaveLength(1);
    const detail = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c.id}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body.data.campaign.status).toBe('sent_with_errors');
    // A second scheduler run (retry, overlapping instance, restart) must not send again.
    await runPushCampaigns(ctx.deps);
    await runCron(ctx.deps, '*/15 * * * *');
    expect(ctx.deps.push.sent).toHaveLength(1);
  });

  it('a cancelled scheduled campaign is never executed', async () => {
    await addDevice(marketer.token, 'fcm-token-iiiiiiii9');
    const at = new Date(ctx.now.value.getTime() + 3600_000).toISOString();
    const c = await createDraft({ scheduledAt: at });
    const cancel = await ctx.api(admin.token).post(`/v1/admin/push-campaigns/${c.id}/cancel`);
    expect(cancel.body.data.campaign.status).toBe('cancelled');
    ctx.advance(2 * 3600_000);
    await runPushCampaigns(ctx.deps);
    expect(ctx.deps.push.sent).toHaveLength(0);
  });

  it('cron job table wires the campaign job into the existing 15-minute trigger', () => {
    expect(CRON_JOBS['*/15 * * * *']).toContain('push-campaigns');
  });
});

describe('push campaigns: batching, budgets and interruption safety', () => {
  it('splits a large audience into batches; the cron drains them without blocking the send request', async () => {
    // Audience = 80 device users + admin + marketer (no devices) = 82 users → 4 batches of 25.
    const devices = 80;
    for (let i = 0; i < devices; i++) {
      const u = await ctx.user('marketer');
      await addDevice(u.token, `bulk-token-${String(i).padStart(6, '0')}`);
    }
    const c = await createDraft();
    const r = await send(c.id);
    expect(r.status).toBe(200);
    expect(r.body.data.campaign.status).toBe('sent_with_errors');
    expect(r.body.data.campaign.summary.batchesTotal).toBe(4);
    expect(r.body.data.campaign.summary.batchesDone).toBe(4);
    const done = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c.id}`);
    expect(done.body.data.campaign.status).toBe('sent_with_errors');
    expect(done.body.data.campaign.summary.batchesDone).toBe(4);
    expect(done.body.data.campaign.summary.users).toBe(devices + 2);
    expect(done.body.data.campaign.summary.attempted).toBe(devices);
    expect(done.body.data.campaign.summary.accepted).toBe(devices);
    // every device received exactly one message across inline + cron runs (no duplicates)
    const tokens = ctx.deps.push.sent.flatMap((s) => s.tokens);
    expect(tokens).toHaveLength(devices);
    expect(new Set(tokens).size).toBe(devices);
  });

  it('a batch left in "sending" by a crashed run is marked interrupted and never re-sent', async () => {
    await addDevice(marketer.token, 'fcm-token-jjjjjjjj10');
    const c = await createDraft();
    await send(c.id, 'crash-key-0000001');
    // Simulate: a second campaign whose only batch was half-sent before a crash.
    const c2 = await createDraft({ name: 'کمپین دوم' });
    await ctx.deps.store.set(`push_campaign_batches/${c2.id}-00000`, {
      campaignId: c2.id,
      index: 0,
      userIds: [marketer.id],
      status: 'sending',
      attempts: 1,
      attempted: 0,
      accepted: 0,
      failed: 0,
      invalid: 0,
      noDevice: 0,
      lastError: null,
      startedAt: new Date(ctx.now.value.getTime() - 60 * 60_000).toISOString(),
      finishedAt: null,
    });
    await ctx.deps.store.set(`push_campaigns/${c2.id}`, {
      ...(await ctx.deps.store.get(`push_campaigns/${c2.id}`)),
      status: 'sending',
      summary: {
        batchesTotal: 1,
        batchesDone: 0,
        users: 1,
        attempted: 0,
        accepted: 0,
        failed: 0,
        invalid: 0,
        noDevice: 0,
        interrupted: 0,
      },
    });
    const before = ctx.deps.push.sent.length;
    await runPushCampaigns(ctx.deps);
    expect(ctx.deps.push.sent.length).toBe(before);
    const detail = await ctx.api(admin.token).get(`/v1/admin/push-campaigns/${c2.id}`);
    expect(detail.body.data.batches[0].status).toBe('interrupted');
    expect(detail.body.data.campaign.status).toBe('sent_with_errors');
  });

  it('dashboard counts come from real campaigns and provider totals', async () => {
    await addDevice(marketer.token, 'fcm-token-kkkkkkkk11');
    await createDraft({ name: 'پیش‌نویس' });
    const sent = await createDraft({ name: 'ارسال‌شده' });
    await send(sent.id, 'dash-key-0000001');
    const d = await ctx.api(admin.token).get('/v1/admin/push-campaigns/dashboard');
    expect(d.status).toBe(200);
    expect(d.body.data.counts.total).toBe(2);
    expect(d.body.data.counts.draft).toBe(1);
    expect(d.body.data.counts.sent).toBe(1);
    expect(d.body.data.providerRequests.accepted).toBe(1);
    expect(d.body.data.recent).toHaveLength(2);
  });
});
