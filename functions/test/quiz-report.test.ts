import { beforeEach, describe, expect, it } from 'vitest';
import { buildFixture, createCtx, passQuiz, watchSection, type Fixture, type TestCtx } from './support/ctx';

let ctx: TestCtx;
let fx: Fixture;
let admin: { id: string; token: string };
let mgrA: { id: string; token: string };
let mgrB: { id: string; token: string };
let userA: { id: string; token: string };
let userB: { id: string; token: string };

beforeEach(async () => {
  ctx = await createCtx();
  for (const t of ['team-a', 'team-b'])
    await ctx.deps.store.set(`teams/${t}`, {
      name: t,
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
  fx = await buildFixture(ctx, { sections: 1, durationSec: 60, deadlineDays: 5 });
  admin = await ctx.user('admin');
  mgrA = await ctx.user('manager', { teamId: 'team-a' });
  mgrB = await ctx.user('manager', { teamId: 'team-b' });
  userA = await ctx.user('marketer', { teamId: 'team-a', name: 'بازاریاب الف' });
  userB = await ctx.user('marketer', { teamId: 'team-b', name: 'بازاریاب ب' });
});

/** One failed attempt (all answers wrong) followed by one passing attempt. */
async function failThenPass() {
  const s = fx.sections[0];
  if (!s) throw new Error('fixture has no section');
  await watchSection(ctx, userA.token, s.id, 60);
  const wrongAnswers = Object.fromEntries(
    Object.entries(s.answers).map(([qid, right]) => [qid, right === 'a' ? 'b' : 'a']),
  );
  const failed = await passQuiz(ctx, userA.token, s.quizId, wrongAnswers);
  expect(failed.body.data.passed).toBe(false);
  await watchSection(ctx, userA.token, s.id, 60); // failing clears playback → watch again
  const ok = await passQuiz(ctx, userA.token, s.quizId, s.answers);
  expect(ok.body.data.passed).toBe(true);
}

describe('quiz results report', () => {
  it('admin sees every attempt with correct/wrong counts and a per-learner summary', async () => {
    await failThenPass();
    const res = await ctx.api(admin.token).get('/v1/admin/reports/quizzes');
    expect(res.status).toBe(200);
    const { attempts, summary } = res.body.data;
    expect(attempts).toHaveLength(2);
    const byN = [...attempts].sort(
      (a: { attemptNumber: number }, b: { attemptNumber: number }) => a.attemptNumber - b.attemptNumber,
    );
    expect(byN[0]).toMatchObject({ attemptNumber: 1, correct: 0, wrong: 3, total: 3, passed: false });
    expect(byN[1]).toMatchObject({ attemptNumber: 2, correct: 3, wrong: 0, total: 3, passed: true });
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      userName: 'بازاریاب الف',
      attempts: 2,
      passed: true,
      passedAtAttempt: 2,
      lastCorrect: 3,
      lastWrong: 0,
      totalCorrect: 3,
      totalWrong: 3,
    });
  });

  it('manager only sees own team; other team and marketers are blocked', async () => {
    await failThenPass();
    const a = await ctx.api(mgrA.token).get('/v1/manager/reports/quizzes');
    expect(a.status).toBe(200);
    expect(a.body.data.attempts).toHaveLength(2);
    const b = await ctx.api(mgrB.token).get('/v1/manager/reports/quizzes');
    expect(b.status).toBe(200);
    expect(b.body.data.attempts).toHaveLength(0);
    expect(JSON.stringify(b.body.data)).not.toContain('بازاریاب الف');
    expect((await ctx.api(userB.token).get('/v1/manager/reports/quizzes')).status).toBe(403);
    expect((await ctx.api(mgrA.token).get('/v1/admin/reports/quizzes')).status).toBe(403);
  });

  it('member timeline carries correct/wrong per attempt', async () => {
    await failThenPass();
    const res = await ctx.api(mgrA.token).get(`/v1/manager/users/${userA.id}/progress`);
    const attempts = res.body.data.packages[0].sections[0].attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ correct: 0, wrong: 3, total: 3 });
    expect(attempts[1]).toMatchObject({ correct: 3, wrong: 0, total: 3 });
  });

  it('date filter and bad range are validated', async () => {
    await failThenPass();
    const bad = await ctx
      .api(admin.token)
      .get('/v1/admin/reports/quizzes?from=2030-01-10&to=2030-01-01');
    expect(bad.status).toBe(400);
    const none = await ctx
      .api(admin.token)
      .get('/v1/admin/reports/quizzes?from=2000-01-01&to=2000-01-02');
    expect(none.body.data.attempts).toHaveLength(0);
  });
});
