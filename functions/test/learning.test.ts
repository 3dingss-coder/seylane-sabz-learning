import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as content from '../src/services/content';
import { ids } from '../src/lib/ids';
import { heartbeatSchema, recordProgress } from '../src/services/learning';
import type { User } from '../src/domain/types';
import type { DocStore, QuerySpec } from '../src/store/types';
import { SYSTEM } from '../src/services/context';
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
let m: { id: string; token: string };
beforeEach(async () => {
  ctx = await createCtx();
  fx = await buildFixture(ctx, { sections: 2, durationSec: 120 });
  m = await ctx.user('marketer');
});

const hb = (sectionId: string, body: object, key?: string) => {
  ctx.advance(60_000); // one heartbeat interval of real time
  ctx.limiter.reset();
  const t = ctx.api(m.token).post(`/v1/me/sections/${sectionId}/progress`, body);
  return key ? t.set('Idempotency-Key', key) : t;
};

describe('home & catalog (PROMPT 008)', () => {
  it('home shows the assigned package with brand/product and the next action', async () => {
    const res = await ctx.api(m.token).get('/v1/me/home');
    expect(res.status).toBe(200);
    const h = res.body.data;
    expect(h.nextItem.packageId).toBe(fx.packageId);
    expect(h.nextItem.sectionId).toBe(fx.sections[0]?.id);
    expect(JSON.stringify(h)).not.toContain('answerKey');
  });

  it('unassigned packages are invisible (404)', async () => {
    const other = await buildFixture(ctx, { assign: 'none' });
    expect((await ctx.api(m.token).get(`/v1/me/packages/${other.packageId}`)).status).toBe(404);
    expect((await ctx.api(m.token).get(`/v1/me/sections/${other.sections[0]?.id}`)).status).toBe(
      404,
    );
  });

  it('keeps heartbeat access for started packages and rejects an unassigned package', async () => {
    const unassigned = await buildFixture(ctx, { assign: 'none', sections: 1 });
    const unassignedResponse = await ctx
      .api(m.token)
      .post(`/v1/me/sections/${unassigned.sections[0]?.id}/progress`, {
        positionSec: 5,
        playedDeltaSec: 5,
      });
    expect(unassignedResponse.status).toBe(404);

    const sectionId = fx.sections[0]?.id ?? '';
    const first = await ctx
      .api(m.token)
      .post(`/v1/me/sections/${sectionId}/progress`, { positionSec: 5, playedDeltaSec: 5 });
    expect(first.status).toBe(200);
    await ctx.deps.store.update(`assignments/fx-${fx.packageId}`, {
      revokedAt: ctx.deps.clock().toISOString(),
    });
    const continued = await ctx
      .api(m.token)
      .post(`/v1/me/sections/${sectionId}/progress`, { positionSec: 10, playedDeltaSec: 5 });
    expect(continued.status).toBe(200);
  });
});

describe('player & tracking (PROMPT 009)', () => {
  it('28.2 #1 anti-cheat: seeking to the end does not raise percent', async () => {
    const r = await hb(fx.sections[0]?.id ?? '', { positionSec: 118, playedDeltaSec: 3 });
    expect(r.status).toBe(200);
    expect(r.body.data.percent).toBeLessThan(5);
    expect(r.body.data.completed).toBe(false);
    const big = await hb(fx.sections[0]?.id ?? '', { positionSec: 118, playedDeltaSec: 500 });
    expect(big.status).toBe(400);
  });

  it('wall-clock budget: a crafted burst cannot consume faster than real time', async () => {
    const s = fx.sections[0]?.id ?? '';
    // 20 × 60s claimed within the same instant (no real time passes).
    for (let i = 0; i < 20; i++) {
      ctx.limiter.reset();
      await ctx
        .api(m.token)
        .post(`/v1/me/sections/${s}/progress`, { positionSec: 60, playedDeltaSec: 60 })
        .set('Idempotency-Key', `burst-${i}`);
    }
    let p = await ctx.api(m.token).get(`/v1/me/sections/${s}/progress`);
    expect(p.body.data.completed).toBe(false);
    expect(p.body.data.percent).toBeLessThanOrEqual(59); // ≤ 70s initial credit of 120s
    // Real time passes → honest heartbeats are credited again (up to 1.5× speed).
    ctx.advance(60_000);
    ctx.limiter.reset();
    await ctx
      .api(m.token)
      .post(`/v1/me/sections/${s}/progress`, { positionSec: 110, playedDeltaSec: 60 })
      .set('Idempotency-Key', 'after-wait');
    p = await ctx.api(m.token).get(`/v1/me/sections/${s}/progress`);
    expect(p.body.data.completed).toBe(true);
  });

  it('wall-clock budget is per user: two devices/sections share it', async () => {
    const other = await buildFixture(ctx, { sections: 1, durationSec: 120 });
    const a = fx.sections[0]?.id ?? '';
    const b = other.sections[0]?.id ?? '';
    ctx.advance(60_000);
    for (const [sid, k] of [
      [a, 'dev1'],
      [b, 'dev2'],
    ] as const) {
      ctx.limiter.reset();
      await ctx
        .api(m.token)
        .post(`/v1/me/sections/${sid}/progress`, { positionSec: 60, playedDeltaSec: 60 })
        .set('Idempotency-Key', k);
    }
    const pa = (await ctx.api(m.token).get(`/v1/me/sections/${a}/progress`)).body.data.percent;
    const pb = (await ctx.api(m.token).get(`/v1/me/sections/${b}/progress`)).body.data.percent;
    // 70s initial credit + 60s × 1.5 accrued → at most 160s of the 240s claimed.
    expect(((pa + pb) / 100) * 120).toBeLessThanOrEqual(160);
  });

  it('completion at ≥85% of real playback; resume position returned', async () => {
    const s = fx.sections[0];
    await watchSection(ctx, m.token, s?.id ?? '', 103);
    const p = await ctx.api(m.token).get(`/v1/me/sections/${s?.id}/progress`);
    expect(p.body.data.completed).toBe(true);
    expect(p.body.data.lastPositionSec).toBe(103);
  });

  it('authorizes a heartbeat with package-scoped progress instead of loading the full learning view', async () => {
    const sectionId = fx.sections[0]?.id ?? '';
    const user = await ctx.deps.store.get<User>(`users/${m.id}`);
    if (!user) throw new Error('test marketer was not stored');
    const path = `section_progress/${ids.progress(m.id, sectionId)}`;
    await ctx.deps.store.set(path, {
      userId: m.id,
      sectionId,
      packageId: fx.packageId,
      playedSeconds: 1,
      percent: 0,
      completed: false,
      quizPassed: false,
      recentKeys: [],
      startedAt: ctx.deps.clock().toISOString(),
      updatedAt: ctx.deps.clock().toISOString(),
    });

    const store = ctx.deps.store;
    const originalQuery = store.query.bind(store);
    const queries: QuerySpec[] = [];
    vi.spyOn(store, 'query').mockImplementation(((query: QuerySpec) => {
      queries.push(query);
      return originalQuery(query);
    }) as DocStore['query']);

    await recordProgress(
      ctx.deps,
      user,
      sectionId,
      heartbeatSchema.parse({ positionSec: 10, playedDeltaSec: 5 }),
      'query-count-probe',
      { skipBudget: true },
    );
    expect(queries.map((query) => query.collection)).toEqual(['section_progress']);
    expect(queries[0]?.where).toContainEqual(['userId', '==', m.id]);
    expect(queries[0]?.where).toContainEqual(['packageId', '==', fx.packageId]);
  });

  it('28.2 #7 offline replay: duplicate Idempotency-Keys are counted once', async () => {
    const s = fx.sections[0]?.id ?? '';
    const batch = [1, 2, 3].map((i) => ({
      body: { positionSec: i * 30, playedDeltaSec: 30 },
      key: `off-${i}`,
    }));
    for (const b of batch) await hb(s, b.body, b.key);
    // reconnect: the client flushes the same queue again
    for (const b of batch) {
      const r = await hb(s, b.body, b.key);
      expect(r.body.data.duplicate).toBe(true);
    }
    const p = await ctx.api(m.token).get(`/v1/me/sections/${s}/progress`);
    expect(p.body.data.percent).toBe(75);
  });

  it('later section heartbeat is allowed without finishing the previous one (no sequential lock)', async () => {
    const s2 = fx.sections[1]?.id ?? '';
    const pkg = await ctx.api(m.token).get(`/v1/me/packages/${fx.packageId}`);
    expect(pkg.body.data.sections[1].state).not.toBe('locked');
    expect((await ctx.api(m.token).get(`/v1/me/sections/${s2}/media`)).status).not.toBe(403);
    expect((await hb(s2, { positionSec: 5, playedDeltaSec: 5 })).status).toBe(200);
  });

  it('heartbeat matches package visibility for archived sections', async () => {
    const startedSectionId = fx.sections[0]?.id ?? '';
    const unstartedSectionId = fx.sections[1]?.id ?? '';

    await content.updateSection(ctx.deps, SYSTEM, fx.packageId, unstartedSectionId, {
      archived: true,
    });
    const hidden = await ctx.api(m.token).post(`/v1/me/sections/${unstartedSectionId}/progress`, {
      positionSec: 5,
      playedDeltaSec: 5,
    });
    expect(hidden.status).toBe(404);

    expect((await hb(startedSectionId, { positionSec: 5, playedDeltaSec: 5 })).status).toBe(200);
    await content.updateSection(ctx.deps, SYSTEM, fx.packageId, startedSectionId, {
      archived: true,
    });
    const continued = await ctx.api(m.token).post(`/v1/me/sections/${startedSectionId}/progress`, {
      positionSec: 10,
      playedDeltaSec: 5,
    });
    expect(continued.status).toBe(200);
  });

  it('media URL is short-lived and signed for unlocked sections', async () => {
    const r = await ctx.api(m.token).get(`/v1/me/sections/${fx.sections[0]?.id}/media`);
    expect(r.status).toBe(200);
    expect(r.body.data.url).toMatch(/\/v1\/files\/signed\//);
    const file = await ctx.api().get(new URL(r.body.data.url, 'http://x').pathname);
    expect(file.status).toBe(200);
    ctx.advance(5 * 3600_000);
    const expired = await ctx.api().get(new URL(r.body.data.url, 'http://x').pathname);
    expect(expired.status).toBe(403);
  });
});

describe('quiz & sequential lock (PROMPT 010)', () => {
  it('quiz is open before the media is completed; answerKey never sent', async () => {
    const q = fx.sections[0];
    const early = await ctx.api(m.token).get(`/v1/me/quizzes/${q?.quizId}`);
    expect(early.status).toBe(200);
    expect(early.body.data.attemptInfo.canAttempt).toBe(true);
    await watchSection(ctx, m.token, q?.id ?? '', 120);
    const quiz = await ctx.api(m.token).get(`/v1/me/quizzes/${q?.quizId}`);
    expect(quiz.status).toBe(200);
    expect(JSON.stringify(quiz.body)).not.toMatch(/answerKey/);
    const start = await ctx.api(m.token).post(`/v1/me/quizzes/${q?.quizId}/attempts`);
    expect(JSON.stringify(start.body)).not.toMatch(/answerKey/);
  });

  it('28.2 #2 passing unlocks the next section; duplicate submit is idempotent', async () => {
    const s1 = fx.sections[0];
    await watchSection(ctx, m.token, s1?.id ?? '', 120);
    const start = await ctx.api(m.token).post(`/v1/me/quizzes/${s1?.quizId}/attempts`);
    const id = start.body.data.attemptId as string;
    const [a, b] = await Promise.all([
      ctx.api(m.token).post(`/v1/me/attempts/${id}/submit`, { answers: s1?.answers }),
      ctx.api(m.token).post(`/v1/me/attempts/${id}/submit`, { answers: s1?.answers }),
    ]);
    expect(a.body.data.passed).toBe(true);
    expect(b.body.data.passed).toBe(true);
    expect(a.body.data.pointsEarned + b.body.data.pointsEarned).toBe(20);
    const pkg = await ctx.api(m.token).get(`/v1/me/packages/${fx.packageId}`);
    expect(pkg.body.data.sections[1].state).not.toBe('locked');
    const pts = await ctx.api(m.token).get('/v1/me/points');
    expect(pts.body.data.balance).toBe(20);
  });

  it('28.2 #3 attempt limit → 409; manager approval grants one more', async () => {
    await ctx.deps.store.set('teams/t1', {
      name: 'تیم',
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
    const mk = await ctx.user('marketer', { teamId: 't1' });
    const mgr = await ctx.user('manager', { teamId: 't1' });
    const s1 = fx.sections[0];
    await watchSection(ctx, mk.token, s1?.id ?? '', 120);
    const wrong = Object.fromEntries(Object.keys(s1?.answers ?? {}).map((k) => [k, 'a']));
    for (let i = 0; i < 3; i++) {
      ctx.limiter.reset();
      if (i > 0) await watchSection(ctx, mk.token, s1?.id ?? '', 120);
      const r = await passQuiz(ctx, mk.token, s1?.quizId ?? '', wrong);
      expect(r.body.data.passed).toBe(false);
    }
    ctx.limiter.reset();
    const blocked = await ctx.api(mk.token).post(`/v1/me/quizzes/${s1?.quizId}/attempts`);
    expect(blocked.status).toBe(409);
    const [firstRequest, duplicateRequest] = await Promise.all([
      ctx.api(mk.token).post(`/v1/me/quizzes/${s1?.quizId}/retake-requests`),
      ctx.api(mk.token).post(`/v1/me/quizzes/${s1?.quizId}/retake-requests`),
    ]);
    expect(firstRequest.status).toBe(201);
    expect(duplicateRequest.status).toBe(201);
    expect(duplicateRequest.body.data.id).toBe(firstRequest.body.data.id);
    const req = firstRequest;
    expect(
      await ctx.deps.store.query({
        collection: 'retake_requests',
        where: [
          ['userId', '==', mk.id],
          ['quizId', '==', s1?.quizId],
          ['status', '==', 'pending'],
        ],
      }),
    ).toHaveLength(1);
    const list = await ctx.api(mgr.token).get('/v1/manager/retake-requests');
    expect(list.body.data).toHaveLength(1);
    const ok = await ctx
      .api(mgr.token)
      .post(`/v1/manager/retake-requests/${req.body.data.id}/approve`, {});
    expect(ok.status).toBe(200);
    await watchSection(ctx, mk.token, s1?.id ?? '', 120);
    const again = await passQuiz(ctx, mk.token, s1?.quizId ?? '', s1?.answers ?? {});
    expect(again.body.data.passed).toBe(true);
    expect(again.body.data.pointsEarned).toBe(0); // not first-try
  });

  it('27.2 escalated retake (after 2 approvals) is admin-only', async () => {
    await ctx.deps.store.set('teams/t1', {
      name: 'تیم',
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
    const mk = await ctx.user('marketer', { teamId: 't1' });
    const mgr = await ctx.user('manager', { teamId: 't1' });
    const admin = await ctx.user('admin');
    const s1 = fx.sections[0];
    await watchSection(ctx, mk.token, s1?.id ?? '', 120);
    const wrong = Object.fromEntries(Object.keys(s1?.answers ?? {}).map((k) => [k, 'a']));
    const failUntilBlocked = async () => {
      for (;;) {
        ctx.limiter.reset();
        await watchSection(ctx, mk.token, s1?.id ?? '', 120);
        const st = await ctx.api(mk.token).post(`/v1/me/quizzes/${s1?.quizId}/attempts`);
        if (st.status === 409) return;
        await ctx
          .api(mk.token)
          .post(`/v1/me/attempts/${st.body.data.attemptId}/submit`, { answers: wrong });
      }
    };
    for (let round = 0; round < 2; round++) {
      await failUntilBlocked();
      const rq = await ctx.api(mk.token).post(`/v1/me/quizzes/${s1?.quizId}/retake-requests`);
      expect(rq.body.data.escalated ?? false).toBe(false);
      await ctx.api(mgr.token).post(`/v1/manager/retake-requests/${rq.body.data.id}/approve`, {});
    }
    await failUntilBlocked();
    const third = await ctx.api(mk.token).post(`/v1/me/quizzes/${s1?.quizId}/retake-requests`);
    expect(third.status).toBe(201);
    const denied = await ctx
      .api(mgr.token)
      .post(`/v1/manager/retake-requests/${third.body.data.id}/approve`, {});
    expect(denied.status).toBe(403);
    const ok = await ctx
      .api(admin.token)
      .post(`/v1/admin/retake-requests/${third.body.data.id}/approve`, { note: 'آخرین فرصت' });
    expect(ok.status).toBe(200);
  });

  it('28.2 #6 completing the package twice never re-awards points', async () => {
    for (const s of fx.sections) {
      await watchSection(ctx, m.token, s.id, 120);
      ctx.limiter.reset();
      await passQuiz(ctx, m.token, s.quizId, s.answers);
    }
    const pts1 = (await ctx.api(m.token).get('/v1/me/points')).body.data.balance;
    expect(pts1).toBe(20 * 2 + 30 + 50);
    // replay everything
    for (const s of fx.sections) {
      await watchSection(ctx, m.token, s.id, 120);
      ctx.limiter.reset();
      const r = await ctx.api(m.token).post(`/v1/me/quizzes/${s.quizId}/attempts`);
      expect(r.status).toBe(409);
    }
    const pts2 = (await ctx.api(m.token).get('/v1/me/points')).body.data.balance;
    expect(pts2).toBe(pts1);
    const badges = (await ctx.api(m.token).get('/v1/me/badges')).body.data;
    expect(
      badges.filter((b: { earned: boolean }) => b.earned).map((b: { id: string }) => b.id),
    ).toContain('first_package');
  });

  it('28.2 #8 versioning: editing a question keeps earlier attempts valid', async () => {
    const s1 = fx.sections[0];
    await watchSection(ctx, m.token, s1?.id ?? '', 120);
    const start = await ctx.api(m.token).post(`/v1/me/quizzes/${s1?.quizId}/attempts`);
    const qid = s1?.questionIds[0] ?? '';
    await content.updateQuestion(ctx.deps, SYSTEM, s1?.quizId ?? '', qid, {
      stem: 'سؤال ویرایش‌شده؟',
      options: ['الف', 'ب', 'پ', 'ت'],
      answerKey: 'd',
      explanation: 'تغییر کرد',
    });
    const r = await ctx
      .api(m.token)
      .post(`/v1/me/attempts/${start.body.data.attemptId}/submit`, { answers: s1?.answers });
    expect(r.body.data.passed).toBe(true);
    expect(r.body.data.score).toBe(100);
    const quiz = await ctx.deps.store.get<{ version: number }>(`quizzes/${s1?.quizId}`);
    expect(quiz?.version).toBeGreaterThan(1);
  });

  it('unanswered questions → 400 in Persian', async () => {
    const s1 = fx.sections[0];
    await watchSection(ctx, m.token, s1?.id ?? '', 120);
    const start = await ctx.api(m.token).post(`/v1/me/quizzes/${s1?.quizId}/attempts`);
    const r = await ctx
      .api(m.token)
      .post(`/v1/me/attempts/${start.body.data.attemptId}/submit`, { answers: {} });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('به همه سؤال‌ها پاسخ دهید');
  });

  it("another user's attempt is not accessible", async () => {
    const s1 = fx.sections[0];
    await watchSection(ctx, m.token, s1?.id ?? '', 120);
    const start = await ctx.api(m.token).post(`/v1/me/quizzes/${s1?.quizId}/attempts`);
    const other = await ctx.user('marketer');
    const r = await ctx
      .api(other.token)
      .post(`/v1/me/attempts/${start.body.data.attemptId}/submit`, { answers: s1?.answers });
    expect(r.status).toBe(404);
  });
});
