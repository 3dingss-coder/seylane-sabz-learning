import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFixture,
  createCtx,
  passQuiz,
  watchSection,
  type Fixture,
  type TestCtx,
} from './support/ctx';

let ctx: TestCtx;
let fx: Fixture;
let mgrA: { id: string; token: string };
let mgrB: { id: string; token: string };
let userA: { id: string; token: string };
let userB: { id: string; token: string };

beforeEach(async () => {
  ctx = await createCtx();
  for (const t of ['team-a', 'team-b'])
    await ctx.deps.store.set(`teams/${t}`, {
      name: t === 'team-a' ? 'تیم الف' : 'تیم ب',
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
  fx = await buildFixture(ctx, { sections: 2, durationSec: 60, deadlineDays: 2 });
  mgrA = await ctx.user('manager', { teamId: 'team-a' });
  mgrB = await ctx.user('manager', { teamId: 'team-b' });
  userA = await ctx.user('marketer', { teamId: 'team-a', name: 'بازاریاب الف' });
  userB = await ctx.user('marketer', { teamId: 'team-b', name: 'بازاریاب ب' });
});

describe('manager scope (28.2 #5)', () => {
  it('manager of team A gets 403 for a user of team B', async () => {
    expect((await ctx.api(mgrA.token).get(`/v1/manager/users/${userB.id}/progress`)).status).toBe(
      403,
    );
    expect(
      (await ctx.api(mgrA.token).post(`/v1/manager/users/${userB.id}/messages`, { body: 'سلام' }))
        .status,
    ).toBe(403);
    expect(
      (
        await ctx
          .api(mgrA.token)
          .post(`/v1/manager/users/${userB.id}/notes`, { body: 'یادداشت', packageId: fx.packageId })
      ).status,
    ).toBe(403);
    expect((await ctx.api(mgrA.token).get(`/v1/manager/users/${userA.id}/progress`)).status).toBe(
      200,
    );
  });

  it('marketers cannot use manager or admin APIs', async () => {
    expect((await ctx.api(userA.token).get('/v1/manager/dashboard')).status).toBe(403);
    expect((await ctx.api(userA.token).get('/v1/admin/users')).status).toBe(403);
    expect((await ctx.api(mgrA.token).get('/v1/admin/users')).status).toBe(403);
  });

  it('dashboard lists only own team, with progress and lagging flags', async () => {
    await watchSection(ctx, userA.token, fx.sections[0]?.id ?? '', 60);
    const res = await ctx.api(mgrA.token).get('/v1/manager/dashboard');
    expect(res.status).toBe(200);
    const names = JSON.stringify(res.body.data);
    expect(names).toContain('بازاریاب الف');
    expect(names).not.toContain('بازاریاب ب');
  });

  it('retake requests of another team cannot be approved', async () => {
    const s1 = fx.sections[0];
    await watchSection(ctx, userB.token, s1?.id ?? '', 60);
    const wrong = Object.fromEntries(Object.keys(s1?.answers ?? {}).map((k) => [k, 'a']));
    for (let i = 0; i < 3; i++) {
      ctx.limiter.reset();
      await passQuiz(ctx, userB.token, s1?.quizId ?? '', wrong);
    }
    const req = await ctx.api(userB.token).post(`/v1/me/quizzes/${s1?.quizId}/retake-requests`);
    expect(
      (
        await ctx
          .api(mgrA.token)
          .post(`/v1/manager/retake-requests/${req.body.data.id}/approve`, {})
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx
          .api(mgrB.token)
          .post(`/v1/manager/retake-requests/${req.body.data.id}/approve`, {})
      ).status,
    ).toBe(200);
  });
});

describe('manager messages & notes (F12)', () => {
  it('message reaches the marketer inbox + notification', async () => {
    const r = await ctx.api(mgrA.token).post(`/v1/manager/users/${userA.id}/messages`, {
      body: 'لطفاً آموزش را تا فردا تمام کن.',
      packageId: fx.packageId,
    });
    expect(r.status).toBe(201);
    const inbox = await ctx.api(userA.token).get('/v1/me/messages');
    expect(inbox.body.data[0].body).toBe('لطفاً آموزش را تا فردا تمام کن.');
    const notifs = await ctx.api(userA.token).get('/v1/me/notifications');
    expect(JSON.stringify(notifs.body.data)).toContain('manager_message');
    const audit = await ctx.deps.store.query({
      collection: 'audit_logs',
      where: [['action', '==', 'manager.message_sent']],
    });
    expect(audit).toHaveLength(1);
  });
});
