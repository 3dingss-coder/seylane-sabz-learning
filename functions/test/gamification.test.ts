import { beforeEach, describe, expect, it } from 'vitest';
import { DAY } from '../src/lib/time';
import * as coin from '../src/services/coin';
import * as gamification from '../src/services/gamification';
import * as mastery from '../src/services/mastery';
import * as quest from '../src/services/quest';
import * as spaced from '../src/services/spaced';
import type { Streak } from '../src/domain/types';
import * as streak from '../src/services/streak';
import { buildFixture, createCtx, passQuiz, watchSection, type Fixture, type TestCtx } from './support/ctx';

let ctx: TestCtx;
let fx: Fixture;
let m: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx();
  fx = await buildFixture(ctx, { sections: 1, durationSec: 120 });
  m = await ctx.user('marketer');
});

const d = () => ctx.deps;
const at = (iso: string) => new Date(iso);

/**
 * Advancing the fake clock past the token lifetime would otherwise make the failure look like a
 * product bug: re-mint the same user's id token whenever a test travels in time.
 */
/** Narrowing helpers — the lint config forbids non-null assertions, and a missing fixture element
 *  should fail loudly instead of silently producing undefined. */
function theSection(f: Fixture) {
  const s = f.sections[0];
  if (!s) throw new Error('fixture built no section');
  return s;
}
function twoDue(items: Array<{ questionId: string }>) {
  const [a, b] = items;
  if (!a || !b) throw new Error('expected at least two due reviews');
  return [a, b] as const;
}

async function relogin(user: { phone: string }): Promise<string> {
  const signed = await ctx.deps.auth.signIn(`${user.phone}@phone.seylane-sabz.app`, 'pass1234');
  if (!signed.ok) throw new Error('re-sign-in failed');
  return signed.tokens.idToken;
}

describe('PHASE-3 §3.2 — پیوستگی (streak)', () => {
  const day0 = '2026-03-01';
  const base = (): Streak => ({ ...streak.emptyStreak(at(`${day0}T08:00:00Z`)), lastDay: null });

  it('counts consecutive days, and the same day twice is a no-op (idempotent)', () => {
    const a = streak.advanceStreak(base(), day0, at(`${day0}T08:00:00Z`));
    expect(a.next.current).toBe(1);
    expect(a.events).toEqual(['started']);
    const b = streak.advanceStreak(a.next, day0, at(`${day0}T19:00:00Z`));
    expect(b.next.current).toBe(1);
    expect(b.events).toEqual(['unchanged']);
    const c = streak.advanceStreak(b.next, '2026-03-02', at('2026-03-02T08:00:00Z'));
    expect(c.next.current).toBe(2);
    expect(c.next.longest).toBe(2);
    expect(c.events).toEqual(['extended']);
  });

  it('a shield absorbs one missed day — forgiveness from day one', () => {
    const withShield = { ...streak.advanceStreak(base(), day0, at(`${day0}T08:00:00Z`)).next, shields: 1 };
    const after = streak.advanceStreak(withShield, '2026-03-03', at('2026-03-03T08:00:00Z'));
    expect(after.events).toContain('shield_used');
    expect(after.next.current).toBe(2);
    expect(after.next.shields).toBe(0);
  });

  it('an unshielded break halves the peak instead of zeroing it (ramp-down) and opens a repair window', () => {
    let s: Streak = base();
    for (const day of ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'])
      s = streak.advanceStreak(s, day, at(`${day}T08:00:00Z`)).next;
    expect(s.current).toBe(4);
    const broken = streak.advanceStreak(s, '2026-03-08', at('2026-03-08T08:00:00Z'));
    expect(broken.events).toContain('broken');
    expect(broken.next.current).toBe(3); // floor(4/2) + today
    expect(broken.next.current).toBeGreaterThan(0);
    expect(broken.next.repairUntil).toBe('2026-03-11');
  });

  /** builds an N-day streak ending on 2026-03-{N} */
  const streakOf = (n: number): Streak => {
    let s: Streak = base();
    for (let day = 1; day <= n; day++) {
      const key = `2026-03-${String(day).padStart(2, '0')}`;
      s = streak.advanceStreak(s, key, at(`${key}T08:00:00Z`)).next;
    }
    return s;
  };

  it('inside the repair window a station restores the whole peak (بازگردانی)', () => {
    const s10 = streakOf(10);
    expect(s10.current).toBe(10);
    const broken = streak.advanceStreak(s10, '2026-03-14', at('2026-03-14T08:00:00Z'));
    expect(broken.events).toContain('broken');
    expect(broken.next.current).toBe(6); // floor(10/2) + today
    expect(broken.next.repairUntil).toBe('2026-03-17');

    const repaired = streak.advanceStreak(broken.next, '2026-03-15', at('2026-03-15T08:00:00Z'));
    expect(repaired.events).toContain('repaired');
    expect(repaired.next.current).toBe(10); // peak restored, not 7
    expect(repaired.next.repairUntil).toBeNull();
  });

  it('after the repair window closes, the ramp-down stands — and never reaches zero', () => {
    const s10 = streakOf(10);
    const broken = streak.advanceStreak(s10, '2026-03-14', at('2026-03-14T08:00:00Z')).next;
    const late = streak.advanceStreak(broken, '2026-03-20', at('2026-03-20T08:00:00Z'));
    expect(late.events).not.toContain('repaired');
    expect(late.next.current).toBe(4); // floor(6/2) + today
    expect(late.next.current).toBeGreaterThan(0);
  });

  it('approved leave freezes the streak: it neither grows nor breaks', () => {
    const s: Streak = streak.advanceStreak(base(), day0, at(`${day0}T08:00:00Z`)).next;
    const onLeave: Streak = { ...s, onLeaveUntil: '2026-03-10' };
    const after = streak.advanceStreak(onLeave, '2026-03-09', at('2026-03-09T08:00:00Z'));
    expect(after.events).toEqual(['on_leave']);
    expect(after.next.current).toBe(1); // unchanged, not broken
  });

  it('shields are earned by learning (1 per 5 stations), capped at 2', () => {
    let s: Streak = base();
    for (let i = 0; i < 12; i++) s = streak.chargeShield(s);
    expect(s.shields).toBe(streak.MAX_SHIELDS);
    expect(s.shields).toBe(2);
  });

  it('G-03 — a manager payload carrying a streak is rejected in code', () => {
    expect(() => streak.assertStreakNotExposed({ completionRate: 0.5 }, 'manager')).not.toThrow();
    expect(() => streak.assertStreakNotExposed({ streakDays: 4 }, 'manager')).toThrow(/G-03/);
  });

  it('a completed station extends the real streak exactly once per day', async () => {
    await watchSection(ctx, m.token, theSection(fx).id, 120);
    const g = await ctx.api(m.token).get('/v1/me/gamification');
    expect(g.status).toBe(200);
    expect(g.body.data.streak.current).toBe(1);
    // a second station the same day must not double-count the day
    const fx2 = await buildFixture(ctx, { sections: 1, durationSec: 60 });
    await watchSection(ctx, m.token, theSection(fx2).id, 60);
    const again = await ctx.api(m.token).get('/v1/me/gamification');
    expect(again.body.data.streak.current).toBe(1);
  });

  it('G-02 — the mentor and the marketer see the same streak, counted by completed stations', async () => {
    // before any learning action both read zero
    const before = await ctx.api(m.token).get('/v1/me/mentor/behavior');
    expect(before.body.data.state.streakDays).toBe(0);

    await watchSection(ctx, m.token, theSection(fx).id, 120);
    const gamified = (await ctx.api(m.token).get('/v1/me/gamification')).body.data;
    const behavior = (await ctx.api(m.token).get('/v1/me/mentor/behavior')).body.data;
    expect(gamified.streak.current).toBe(1);
    expect(behavior.state.streakDays).toBe(gamified.streak.current);

    // a lapsed streak must not keep displaying a stale number on either surface
    ctx.advance(6 * DAY);
    const token = await relogin(m);
    const stale = (await ctx.api(token).get('/v1/me/gamification')).body.data;
    const behavior2 = (await ctx.api(token).get('/v1/me/mentor/behavior')).body.data;
    expect(stale.streak.current).toBe(0);
    expect(behavior2.state.streakDays).toBe(stale.streak.current);
  });

  it('leave is granted once per season and refuses more than 7 days', async () => {
    const ok = await ctx.api(m.token).post('/v1/me/streak/leave', { days: 5 });
    expect(ok.status).toBe(200);
    const again = await ctx.api(m.token).post('/v1/me/streak/leave', { days: 3 });
    expect(again.status).toBe(400);
    const tooLong = await ctx.api((await ctx.user('marketer')).token).post('/v1/me/streak/leave', {
      days: 9,
    });
    expect(tooLong.status).toBe(400);
  });
});

describe('PHASE-3 §3.4 — مرور هوشمند (spaced repetition)', () => {
  const mem = (halfLifeDays: number, daysAgo = 0) =>
    spaced.emptyMemory(at('2026-03-01T00:00:00Z'), {
      userId: 'u1',
      questionId: 'q1',
      quizId: 'quiz1',
      sectionId: 's1',
      packageId: 'p1',
    }, true) && {
      ...spaced.emptyMemory(at('2026-03-01T00:00:00Z'), {
        userId: 'u1',
        questionId: 'q1',
        quizId: 'quiz1',
        sectionId: 's1',
        packageId: 'p1',
      }, true),
      halfLifeDays,
      lastSeenAt: new Date(Date.parse('2026-03-10T00:00:00Z') - daysAgo * DAY).toISOString(),
      nextReviewAt: new Date(
        Date.parse('2026-03-10T00:00:00Z') - daysAgo * DAY + halfLifeDays * DAY,
      ).toISOString(),
    };

  it('a correct review grows the half-life ×2.2, a wrong one decays ×0.4 (never to zero)', () => {
    const up = spaced.applyAnswer(mem(10), true, at('2026-03-20T00:00:00Z'));
    expect(up.next.halfLifeDays).toBeCloseTo(22, 5);
    const down = spaced.applyAnswer(mem(10), false, at('2026-03-20T00:00:00Z'));
    expect(down.next.halfLifeDays).toBeCloseTo(4, 5);
    expect(down.next.halfLifeDays).toBeGreaterThan(0);
    expect(down.next.correctStreak).toBe(0);
  });

  it('the half-life is capped at 90 days', () => {
    const r = spaced.applyAnswer(mem(80), true, at('2026-03-20T00:00:00Z'));
    expect(r.next.halfLifeDays).toBe(spaced.HALF_LIFE_CEIL_DAYS);
  });

  it('G-06 — a review near the forgetting curve is worth more, capped at 3×', () => {
    expect(spaced.reviewPoints(1)).toBe(Math.round(40 * (1 / 7)));
    expect(spaced.reviewPoints(7)).toBe(40);
    expect(spaced.reviewPoints(21)).toBe(120);
    expect(spaced.reviewPoints(90)).toBe(120); // capped, not 514
  });

  it('30/90-day successful reviews set the mastery milestones', () => {
    const m30 = spaced.applyAnswer(mem(30, 31), true, at('2026-03-10T00:00:00Z'));
    expect(m30.next.milestone30).toBe(true);
    expect(m30.next.milestone90).toBe(false);
    const m90 = spaced.applyAnswer(mem(90, 95), true, at('2026-03-10T00:00:00Z'));
    expect(m90.next.milestone90).toBe(true);
  });

  it('submitting a duel schedules reviews; the queue is capped at 7 and carries real content', async () => {
    const section = theSection(fx);
    await passQuiz(ctx, m.token, section.quizId, section.answers);
    ctx.advance(4 * DAY);
    const token = await relogin(m);
    const due = await ctx.api(token).get('/v1/me/reviews');
    expect(due.status).toBe(200);
    const items = due.body.data as Array<{ questionId: string; stem: string; options: unknown[] }>;
    expect(items.length).toBe(section.questionIds.length);
    expect(items.length).toBeLessThanOrEqual(spaced.DAILY_REVIEW_CAP);
    const firstItem = items[0];
    if (!firstItem) throw new Error('expected a due review with content');
    expect(firstItem.stem.length).toBeGreaterThan(3);
    expect(firstItem.options.length).toBeGreaterThan(1);
    expect(JSON.stringify(due.body)).not.toContain('answerKey');
  });

  it('an on-time review pays coins + capability points, and AC-03 blocks instant farming', async () => {
    const section = theSection(fx);
    await passQuiz(ctx, m.token, section.quizId, section.answers);
    // the first half-life is 2.2 days; 3 days is due but still inside the 24h on-time grace
    ctx.advance(3 * DAY);
    const token = await relogin(m);
    const due = (await ctx.api(token).get('/v1/me/reviews')).body.data as Array<{
      questionId: string;
    }>;
    const [dueA, dueB] = twoDue(due);
    const first = await ctx.api(token).post(`/v1/me/reviews/${dueA.questionId}/answer`, {
      answerKey: (section.answers[dueA.questionId] ?? ''),
    });
    expect(first.status).toBe(200);
    expect(first.body.data.correct).toBe(true);
    expect(first.body.data.coinsEarned).toBe(coin.COIN_EARN.reviewOnTime);
    expect(first.body.data.pointsEarned).toBeGreaterThan(0);

    // AC-03: the next answer arrives <3s later (same fake instant) → recorded, but unrewarded
    ctx.limiter.reset();
    const second = await ctx.api(token).post(`/v1/me/reviews/${dueB.questionId}/answer`, {
      answerKey: (section.answers[dueB.questionId] ?? ''),
    });
    expect(second.body.data.rewarded).toBe(false);
    expect(second.body.data.reason).toBe('too_fast');
    expect(second.body.data.coinsEarned).toBe(0);
  });

  it('a review outside the queue is refused (no free XP from any question id)', async () => {
    const r = await ctx.api(m.token).post('/v1/me/reviews/not-a-question/answer', {
      answerKey: 'a',
    });
    expect(r.status).toBe(404);
  });
});

describe('PHASE-3 §3.6 — مأموریت امروز (daily quests)', () => {
  it('offers exactly three quests, deterministic per user and day', () => {
    const a = quest.todaysQuestIds('u1', '2026-03-01');
    const b = quest.todaysQuestIds('u1', '2026-03-01');
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
    expect(a).not.toContain('help'); // no quest without a real trigger
  });

  it('chest quality is inside the declared range and deterministic', () => {
    const q = quest.rollChest('u1|2026-03-01|stations|chest');
    expect(['bronze', 'silver', 'gold']).toContain(q);
    expect(quest.rollChest('u1|2026-03-01|stations|chest')).toBe(q);
  });

  it('completing a station moves the quest, and the reward is paid once', async () => {
    await watchSection(ctx, m.token, theSection(fx).id, 120);
    const g1 = (await ctx.api(m.token).get('/v1/me/gamification')).body.data;
    const stationsQuest = g1.quests.quests.find((q: { kind: string }) => q.kind === 'stations');
    expect(g1.quests.total).toBe(3);
    if (stationsQuest) {
      expect(stationsQuest.progress).toBeGreaterThan(0);
      if (stationsQuest.done) expect(stationsQuest.chest).not.toBeNull();
    }
    const coinsAfterOne = g1.coins.balance;
    // re-watching a completed station must not pay twice
    await watchSection(ctx, m.token, theSection(fx).id, 120);
    const g2 = (await ctx.api(m.token).get('/v1/me/gamification')).body.data;
    expect(g2.coins.balance).toBe(coinsAfterOne);
  });
});

describe('PHASE-3 §3.3 — سکهٔ توانمندی', () => {
  it('an award is idempotent: the same reason+ref can never mint twice', async () => {
    const first = await coin.awardCoins(d(), m.id, 'station_completed', 's1', 10);
    const second = await coin.awardCoins(d(), m.id, 'station_completed', 's1', 10);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await coin.coinBalance(d(), m.id)).balance).toBe(10);
  });

  it('G-04 — the catalogue may not sell an assessment advantage', () => {
    expect(() => coin.assertCatalogIsFair()).not.toThrow();
    expect(() =>
      coin.assertCatalogIsFair([
        { code: 'x', title: 'نمرهٔ آزمون', price: 100, fulfilment: 'process', note: '' },
      ]),
    ).toThrow(/G-04/);
    expect(() =>
      coin.assertCatalogIsFair([
        { code: 'y', title: 'چیز', price: 0, fulfilment: 'physical', note: '' },
      ]),
    ).toThrow(/G-04/);
  });

  it('redemption spends real balance and leaves a visible, auditable record', async () => {
    await coin.awardCoins(d(), m.id, 'mastery', 'p1', 500);
    const poor = await ctx.api(m.token).post('/v1/me/coins/redeem', { code: 'deadline_grace_day' });
    expect(poor.status).toBe(400); // 600 > 500

    const ok = await ctx.api(m.token).post('/v1/me/coins/redeem', { code: 'assignment_priority' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.balance).toBe(100);

    const mine = await ctx.api(m.token).get('/v1/me/coins');
    expect(mine.body.data.balance).toBe(100);
    expect(mine.body.data.redemptions[0]).toMatchObject({
      code: 'assignment_priority',
      status: 'pending_fulfilment',
    });
    const unknown = await ctx.api(m.token).post('/v1/me/coins/redeem', { code: 'diamond_sword' });
    expect(unknown.status).toBe(404);
  });
});

describe('PHASE-3 §3.5 — استادی محصول', () => {
  it('two ≥80% passes count only when at least 7 days apart', () => {
    const now = at('2026-04-01T00:00:00Z');
    const close = mastery.duelPassCount(
      [
        { score: 90, passed: true, submittedAt: '2026-03-01T00:00:00Z' },
        { score: 95, passed: true, submittedAt: '2026-03-03T00:00:00Z' },
      ],
      now,
    );
    expect(close.count).toBe(1);
    const apart = mastery.duelPassCount(
      [
        { score: 90, passed: true, submittedAt: '2026-03-01T00:00:00Z' },
        { score: 95, passed: true, submittedAt: '2026-03-09T00:00:00Z' },
      ],
      now,
    );
    expect(apart.count).toBe(2);
    const lowScore = mastery.duelPassCount(
      [{ score: 70, passed: false, submittedAt: '2026-03-01T00:00:00Z' }],
      now,
    );
    expect(lowScore.count).toBe(0);
  });

  it('mastery needs all four conditions — three is not mastery (G-07)', () => {
    const rec = mastery.emptyMastery('u1', 'p1', at('2026-04-01T00:00:00Z'));
    expect(mastery.conditionsMet(rec)).toBe(0);
    const three = { ...rec, stationDone: true, duel80Count: 2, reviews30: true, reviews90: true };
    expect(mastery.conditionsMet(three)).toBe(3);
    expect(three.masteredAt).toBeNull();
    expect(mastery.conditionsMet({ ...three, roleplayOk: true })).toBe(4);
  });

  it('unlocking mastery pays once and emits mastery_unlocked', async () => {
    const user = { id: m.id } as never;
    const section = theSection(fx);
    await watchSection(ctx, m.token, section.id, 120);
    await passQuiz(ctx, m.token, section.quizId, section.answers);

    // second independent ≥80% pass, 8 days later (condition 2)
    await d().store.set('attempts/manual-2', {
      quizId: section.quizId,
      userId: m.id,
      sectionId: section.id,
      packageId: fx.packageId,
      attemptNumber: 2,
      status: 'submitted',
      answers: {},
      score: 95,
      passed: true,
      passScore: 80,
      quizVersion: 1,
      snapshot: [],
      submittedAt: new Date(d().clock().getTime() + 8 * DAY).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // successful reviews at 30 and 90 days (condition 3)
    for (const [id, m30, m90] of [
      ['q30', true, false],
      ['q90', true, true],
    ] as const) {
      await d().store.set(spaced.memoryPath(m.id, `${id}-${section.quizId}`), {
        userId: m.id,
        questionId: `${id}-${section.quizId}`,
        quizId: section.quizId,
        sectionId: section.id,
        packageId: fx.packageId,
        correctStreak: 3,
        halfLifeDays: 30,
        seenCount: 3,
        lastSeenAt: new Date().toISOString(),
        nextReviewAt: new Date(Date.now() + 30 * DAY).toISOString(),
        milestone30: m30,
        milestone90: m90,
        reviewsTotal: 2,
        reviewsOnTime: 2,
        updatedAt: new Date().toISOString(),
      });
    }
    const before = await mastery.refreshMastery(d(), user, { id: fx.packageId });
    expect(before.record.masteredAt).toBeNull();
    expect(before.conditions).toBe(3);

    const approved = await mastery.approveRoleplay(d(), 'admin-1', m.id, fx.packageId);
    expect(approved.roleplayOk).toBe(true);
    expect(approved.masteredAt).not.toBeNull();

    const again = await mastery.refreshMastery(d(), user, { id: fx.packageId });
    expect(again.justMastered).toBe(false); // paid once, not on every refresh
    expect((await coin.coinBalance(d(), m.id)).balance).toBeGreaterThanOrEqual(coin.COIN_EARN.mastery);
  });
});

describe('PHASE-3 DoD — analytics + admin visibility', () => {
  it('every mechanic emits its event, and the admin panel shows review health + mastery rate', async () => {
    const section = theSection(fx);
    await watchSection(ctx, m.token, section.id, 120);
    await passQuiz(ctx, m.token, section.quizId, section.answers);
    ctx.advance(4 * DAY);
    const token = await relogin(m);
    const due = (await ctx.api(token).get('/v1/me/reviews')).body.data as Array<{
      questionId: string;
    }>;
    const dueA = due[0];
    if (!dueA) throw new Error('expected a due review');
    ctx.limiter.reset();
    await ctx.api(token).post(`/v1/me/reviews/${dueA.questionId}/answer`, {
      answerKey: (section.answers[dueA.questionId] ?? ''),
    });
    await coin.awardCoins(d(), m.id, 'mastery', 'p1', 1000);
    await ctx.api(token).post('/v1/me/coins/redeem', { code: 'tester_sample' });

    const events = await d().store.query<{ name: string }>({
      collection: 'analytics_events',
      limit: 5000,
    });
    const names = new Set(events.map((e) => e.name));
    for (const required of [
      'streak_extended',
      'coin_earned',
      'review_scheduled',
      'duel_attempt',
      'review_done',
      'coin_redeemed',
    ])
      expect(names.has(required), `missing analytics event: ${required}`).toBe(true);

    const admin = await ctx.user('admin');
    const res = await ctx.api(admin.token).get('/v1/admin/metrics/gamification');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.reviews.trackedQuestions).toBeGreaterThan(0);
    expect(data.reviews.reviewsDone).toBeGreaterThan(0);
    expect(typeof data.reviews.onTimeRate).toBe('number');
    expect(data.mastery).toHaveProperty('masteryRate');
    expect(data.coins.redemptions).toBe(1);
    // G-03: the admin payload must not carry streak data
    expect(JSON.stringify(data)).not.toMatch(/streak/i);
    expect(() => streak.assertStreakNotExposed(data, 'admin')).not.toThrow();
  });

  it('a marketer cannot read the admin metrics', async () => {
    const res = await ctx.api(m.token).get('/v1/admin/metrics/gamification');
    expect(res.status).toBe(403);
  });

  it('the facade snapshot exposes streak, quests, review queue, coins and mastery in one call', async () => {
    const snap = await gamification.myGamification(d(), m.id);
    expect(snap).toMatchObject({
      streak: { current: 0 },
      quests: { total: 3 },
      reviews: { due: 0, cap: 7 },
      coins: { balance: 0 },
    });
    expect(snap.mastery).toHaveProperty('evaluated');
  });
});
