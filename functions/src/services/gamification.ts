import type { User } from '../domain/types';
import type { Doc } from '../store/types';
import { track, type Deps } from './context';
import { awardCoins, coinBalance, COIN_EARN, XP_EARN } from './coin';
import { awardPoints } from './rewards';
import { touchStreak } from './streak';
import { bumpQuest, questSummary } from './quest';
import { dueReviews, recordAttemptAnswers } from './spaced';
import { refreshMastery } from './mastery';
import { assertStreakNotExposed, myStreak } from './streak';
import { reviewHealth } from './spaced';
import { masteryRate } from './mastery';

/**
 * PHASE-3 facade — the single place where the motivation engine is fed and read.
 *
 * `learning.ts` calls the two `on*` hooks; the HTTP routes call `myGamification`; admin calls
 * `adminGamification`, which by construction can never contain streak data (G-03).
 */

/** A completed station: the only streak trigger (G-02), plus quests, coins and mastery. */
export async function onStationCompleted(
  d: Deps,
  user: Doc<User>,
  sectionId: string,
  packageId: string,
) {
  await touchStreak(d, user.id);
  await bumpQuest(d, user.id, 'stations');
  // the deterministic ledger id (userId+reason+sectionId) makes this once-per-station
  const coins = (await awardCoins(d, user.id, 'station_completed', sectionId, COIN_EARN.station))
    ? COIN_EARN.station
    : 0;
  const points = (await awardPoints(d, user.id, 'station_completed', sectionId, XP_EARN.station))
    ? XP_EARN.station
    : 0;
  const mastery = await refreshMastery(d, user, { id: packageId });
  return { coins, points, mastered: mastery.justMastered };
}

export interface DuelOutcome {
  quizId: string;
  sectionId: string;
  packageId: string;
  perQuestion: Array<{ questionId: string; correct: boolean }>;
  passed: boolean;
  attemptNumber: number;
}

/** A submitted duel: feeds spaced memory (pass or fail), pays the duel reward, moves quests. */
export async function onDuelSubmitted(d: Deps, user: Doc<User>, o: DuelOutcome) {
  const { reviews } = await recordAttemptAnswers(d, user.id, o, o.perQuestion);

  let coins = 0;
  let points = 0;
  if (o.passed) {
    const firstTry = o.attemptNumber === 1;
    const refId = `${o.quizId}_${o.attemptNumber}`;
    const coinAmount = firstTry ? COIN_EARN.duelFirstPass : COIN_EARN.duelRetryPass;
    const xp = firstTry ? XP_EARN.duelFirstPass : XP_EARN.duelRetryPass;
    if (await awardCoins(d, user.id, firstTry ? 'duel_first_pass' : 'duel_retry_pass', refId, coinAmount))
      coins += coinAmount;
    if (await awardPoints(d, user.id, 'duel_pass', refId, xp)) points += xp;
    await track(d, 'duel_attempt', user.id, {
      quizId: o.quizId,
      passed: true,
      attemptNumber: o.attemptNumber,
      perfect: o.perQuestion.every((q) => q.correct),
    });
  }
  if (o.perQuestion.length && o.perQuestion.every((q) => q.correct))
    await bumpQuest(d, user.id, 'perfect_duel');
  if (reviews > 0) await bumpQuest(d, user.id, 'reviews', reviews);

  const mastery = await refreshMastery(d, user, { id: o.packageId });
  return { coins, points, reviews, mastered: mastery.justMastered };
}

/** Roleplay attempt (coach session finished) — quest progress only, never mastery (AC-04). */
export async function onRoleplayAttempt(d: Deps, userId: string) {
  await bumpQuest(d, userId, 'roleplay');
  await track(d, 'roleplay_attempt', userId, {});
}

/** Everything the marketer UI needs in one call: streak, quests, review queue, coins, mastery. */
export async function myGamification(d: Deps, userId: string) {
  const [streak, quests, due, coins, mastery] = await Promise.all([
    myStreak(d, userId),
    questSummary(d, userId),
    dueReviews(d, userId),
    coinBalance(d, userId),
    d.store.query<{ packageId: string; masteredAt: string | null }>({
      collection: 'mastery',
      where: [['userId', '==', userId]],
      limit: 200,
    }),
  ]);
  return {
    streak,
    quests,
    reviews: { due: due.length, cap: 7, items: due },
    coins: { balance: coins.balance, lifetime: coins.lifetime },
    mastery: {
      evaluated: mastery.length,
      mastered: mastery.filter((m) => m.masteredAt).length,
    },
  };
}

/**
 * Admin KPI panel. G-03 is enforced structurally: nothing streak-related is read here, and the
 * assertion re-checks the payload before it leaves the service.
 */
export async function adminGamification(d: Deps) {
  const [reviews, mastery] = await Promise.all([reviewHealth(d), masteryRate(d)]);
  const redemptions = await d.store.query<{ price: number }>({
    collection: 'coin_redemptions',
    limit: 5000,
  });
  const payload = {
    reviews,
    mastery,
    coins: {
      redemptions: redemptions.length,
      spent: redemptions.reduce((s, r) => s + r.price, 0),
    },
  };
  assertStreakNotExposed(payload, 'adminGamification');
  return payload;
}
