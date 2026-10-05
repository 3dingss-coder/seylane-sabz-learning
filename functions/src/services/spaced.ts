import { z } from 'zod';
import type { Question, QuestionMemory } from '../domain/types';
import { DAY } from '../lib/time';
import { track, type Deps } from './context';
import { awardPoints } from './rewards';
import { awardCoins, COIN_EARN, XP_EARN } from './coin';

/**
 * PHASE-3 §3.4 — مرور هوشمند (spaced repetition).
 *
 * A deliberately simple Half-Life Regression: the half-life doubles on a correct review and
 * decays (never to zero) on a wrong one. This is the only mechanic wired straight to the business
 * goal — a marketer who still answers correctly at day 90 sells better than one with a 300-day
 * streak and a forgotten ingredient list.
 */
export const HALF_LIFE_START_DAYS = 1;
export const GROWTH = 2.2;
export const DECAY = 0.4; // ramp-down, not zero — same lesson as the streak
export const HALF_LIFE_CEIL_DAYS = 90;
/** §3.4.2 cognitive cap: never more than 7 reviews a day */
export const DAILY_REVIEW_CAP = 7;
/** AC-03: consecutive reviews faster than this earn nothing */
export const MIN_ANSWER_GAP_MS = 3_000;
/** a review counts as «به‌موقع» while it is at most this late */
export const ON_TIME_GRACE_MS = DAY;

/** G-06: a review near the forgetting curve is worth more — capped at 3× the base. */
export function reviewPoints(halfLifeDays: number): number {
  return Math.round(XP_EARN.reviewOnTime * Math.min(halfLifeDays / 7, 3));
}

export interface PerQuestionResult {
  questionId: string;
  correct: boolean;
}

export function emptyMemory(
  now: Date,
  ids: { userId: string; questionId: string; quizId: string; sectionId: string; packageId: string },
  correct: boolean,
): QuestionMemory {
  const halfLifeDays = correct ? HALF_LIFE_START_DAYS * GROWTH : HALF_LIFE_START_DAYS;
  return {
    userId: ids.userId,
    questionId: ids.questionId,
    quizId: ids.quizId,
    sectionId: ids.sectionId,
    packageId: ids.packageId,
    correctStreak: correct ? 1 : 0,
    halfLifeDays,
    seenCount: 1,
    lastSeenAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() + halfLifeDays * DAY).toISOString(),
    milestone30: false,
    milestone90: false,
    reviewsTotal: 0,
    reviewsOnTime: 0,
    updatedAt: now.toISOString(),
  };
}

/** Pure memory update — the whole §3.4 model, unit-tested without a store. */
export function applyAnswer(
  prev: QuestionMemory,
  correct: boolean,
  now: Date,
): { next: QuestionMemory; wasReview: boolean; onTime: boolean } {
  const wasReview = prev.seenCount > 0 && prev.lastSeenAt !== null;
  const ageDays = prev.lastSeenAt ? (now.getTime() - Date.parse(prev.lastSeenAt)) / DAY : 0;
  const halfLifeDays = Math.min(
    HALF_LIFE_CEIL_DAYS,
    Math.max(0.25, prev.halfLifeDays * (correct ? GROWTH : DECAY)),
  );
  const onTime = wasReview && now.getTime() <= Date.parse(prev.nextReviewAt) + ON_TIME_GRACE_MS;
  return {
    wasReview,
    onTime,
    next: {
      ...prev,
      correctStreak: correct ? prev.correctStreak + 1 : 0,
      halfLifeDays,
      seenCount: prev.seenCount + 1,
      lastSeenAt: now.toISOString(),
      nextReviewAt: new Date(now.getTime() + halfLifeDays * DAY).toISOString(),
      milestone30: prev.milestone30 || (wasReview && correct && ageDays >= 30),
      milestone90: prev.milestone90 || (wasReview && correct && ageDays >= 90),
      reviewsTotal: wasReview ? prev.reviewsTotal + 1 : prev.reviewsTotal,
      reviewsOnTime: wasReview && onTime ? prev.reviewsOnTime + 1 : prev.reviewsOnTime,
      updatedAt: now.toISOString(),
    },
  };
}

export const reviewAnswerSchema = z.object({ answerKey: z.string().min(1).max(8) });

export function memoryPath(userId: string, questionId: string): string {
  return `question_memory/${userId}_${questionId}`;
}

/**
 * Feeds every question of a submitted attempt into the memory model. Returns how many of them were
 * reviews (as opposed to first exposures) so callers can reward them (G-05: review > first try).
 */
export async function recordAttemptAnswers(
  d: Deps,
  userId: string,
  meta: { quizId: string; sectionId: string; packageId: string },
  results: PerQuestionResult[],
): Promise<{ reviews: number }> {
  let reviews = 0;
  for (const r of results) {
    const path = memoryPath(userId, r.questionId);
    const prev = await d.store.get<QuestionMemory>(path);
    const next = prev
      ? applyAnswer(prev, r.correct, d.clock()).next
      : emptyMemory(d.clock(), { userId, questionId: r.questionId, ...meta }, r.correct);
    if (prev) reviews++;
    await d.store.set(path, next as unknown as Record<string, unknown>);
  }
  if (results.length)
    await track(d, 'review_scheduled', userId, {
      quizId: meta.quizId,
      questions: results.length,
      reviews,
    });
  return { reviews };
}

export interface DueReview {
  questionId: string;
  quizId: string;
  sectionId: string;
  packageId: string;
  halfLifeDays: number;
  nextReviewAt: string;
  stem: string;
  options: Array<{ key: string; text: string }>;
}

/** Today's review queue, capped (DAILY_REVIEW_CAP) and ordered by most overdue first. */
export async function dueReviews(d: Deps, userId: string, limit = DAILY_REVIEW_CAP) {
  const all = await d.store.query<QuestionMemory>({
    collection: 'question_memory',
    where: [['userId', '==', userId]],
    orderBy: [['nextReviewAt', 'asc']],
    limit: 500,
  });
  const now = d.clock().getTime();
  const due = all.filter((m) => Date.parse(m.nextReviewAt) <= now).slice(0, limit);
  const out: DueReview[] = [];
  for (const m of due) {
    const q = await d.store.get<Question>(`quizzes/${m.quizId}/questions/${m.questionId}`);
    if (!q || q.archived) continue;
    out.push({
      questionId: m.questionId,
      quizId: m.quizId,
      sectionId: m.sectionId,
      packageId: m.packageId,
      halfLifeDays: m.halfLifeDays,
      nextReviewAt: m.nextReviewAt,
      stem: q.stem,
      options: q.options.map((o) => ({ key: o.key, text: o.text })),
    });
  }
  return out;
}

export async function answerReview(
  d: Deps,
  userId: string,
  questionId: string,
  answerKey: string,
): Promise<{
  correct: boolean;
  explanation: string;
  halfLifeDays: number;
  nextReviewAt: string;
  coinsEarned: number;
  pointsEarned: number;
  rewarded: boolean;
  reason?: 'too_fast';
}> {
  const path = memoryPath(userId, questionId);
  const prev = await d.store.get<QuestionMemory>(path);
  if (!prev) throw new Error('REVIEW_NOT_DUE');
  const q = await d.store.get<Question>(`quizzes/${prev.quizId}/questions/${questionId}`);
  if (!q) throw new Error('REVIEW_NOT_DUE');
  const now = d.clock();
  const correct = q.answerKey === answerKey;

  // AC-03: a review answered faster than a human can read earns nothing (no farming).
  const throttlePath = `review_throttle/${userId}`;
  const throttle = await d.store.get<{ lastAt: string }>(throttlePath);
  const tooFast = throttle ? now.getTime() - Date.parse(throttle.lastAt) < MIN_ANSWER_GAP_MS : false;
  await d.store.set(throttlePath, { lastAt: now.toISOString() });

  const { next, onTime } = applyAnswer(prev, correct, now);
  await d.store.set(path, next as unknown as Record<string, unknown>);
  await track(d, 'review_done', userId, {
    questionId,
    correct,
    onTime,
    halfLifeDays: next.halfLifeDays,
    rewarded: !tooFast,
  });

  let coinsEarned = 0;
  let pointsEarned = 0;
  if (correct && onTime && !tooFast) {
    const refId = `${questionId}_${now.getTime()}`;
    if (await awardCoins(d, userId, 'review_on_time', refId, COIN_EARN.reviewOnTime))
      coinsEarned = COIN_EARN.reviewOnTime;
    const pts = reviewPoints(prev.halfLifeDays);
    if (await awardPoints(d, userId, 'review_on_time', refId, pts)) pointsEarned = pts;
  }
  return {
    correct,
    explanation: q.explanation,
    halfLifeDays: next.halfLifeDays,
    nextReviewAt: next.nextReviewAt,
    coinsEarned,
    pointsEarned,
    rewarded: !tooFast,
    ...(tooFast ? { reason: 'too_fast' as const } : {}),
  };
}

/** Fleet-wide review health for the admin dashboard («درصد مرورِ به‌موقع»). */
export async function reviewHealth(d: Deps) {
  const all = await d.store.query<QuestionMemory>({ collection: 'question_memory', limit: 5000 });
  const total = all.reduce((s, m) => s + m.reviewsTotal, 0);
  const onTime = all.reduce((s, m) => s + m.reviewsOnTime, 0);
  const now = d.clock().getTime();
  return {
    trackedQuestions: all.length,
    reviewsDone: total,
    reviewsOnTime: onTime,
    onTimeRate: total ? onTime / total : null,
    overdueNow: all.filter((m) => Date.parse(m.nextReviewAt) <= now).length,
    dueNext7Days: all.filter((m) => {
      const t = Date.parse(m.nextReviewAt);
      return t > now && t <= now + 7 * DAY;
    }).length,
  };
}
