import type {
  Attempt,
  MasteryRecord,
  Package,
  QuestionMemory,
  SectionProgress,
  User,
} from '../domain/types';
import type { Doc } from '../store/types';
import { DAY } from '../lib/time';
import { track, type Deps } from './context';
import { awardCoins, COIN_EARN, XP_EARN } from './coin';
import { awardPoints } from './rewards';

/**
 * Condition 1 is computed straight from the store (package's denormalised section list × the
 * learner's completed stations) instead of going through `learning.packageForUser`, so this module
 * never imports the learning service — `learning.ts` imports *this* module, and a cycle here would
 * be a runtime hazard.
 */
async function stationsComplete(d: Deps, userId: string, packageId: string): Promise<boolean> {
  const [pkg, progress] = await Promise.all([
    d.store.get<Package>(`packages/${packageId}`),
    d.store.query<SectionProgress>({
      collection: 'section_progress',
      where: [
        ['userId', '==', userId],
        ['packageId', '==', packageId],
      ],
      limit: 500,
    }),
  ]);
  const wanted = (pkg?.sections ?? []).filter((s) => !s.archived);
  if (!wanted.length) return false;
  const done = new Set(progress.filter((p) => p.completed).map((p) => p.sectionId));
  return wanted.every((s) => done.has(s.id));
}

/**
 * PHASE-3 §3.5 — استادی محصول.
 *
 * G-07: mastery is a *defensible* definition, not a decorative label. Four conditions, all from
 * real data, and the fourth is the one Duolingo does not have: a recorded roleplay approved by a
 * human. Reading and choosing options builds recognition; selling needs speech.
 */
export const DUEL_MIN_SCORE = 80;
export const DUEL_GAP_DAYS = 7;

export function emptyMastery(userId: string, packageId: string, now: Date): MasteryRecord {
  return {
    userId,
    packageId,
    stationDone: false,
    duel80Count: 0,
    duel80LastAt: null,
    reviews30: false,
    reviews90: false,
    roleplayOk: false,
    masteredAt: null,
    updatedAt: now.toISOString(),
  };
}

/** Pure: two independent ≥80% attempts at least DUEL_GAP_DAYS apart. */
export function duelPassCount(
  attempts: Array<Pick<Attempt, 'score' | 'submittedAt' | 'passed'>>,
  now: Date,
): { count: number; lastAt: string | null } {
  const passes = attempts
    .filter((a) => a.submittedAt && a.passed && (a.score ?? 0) >= DUEL_MIN_SCORE)
    .sort((a, b) => ((a.submittedAt ?? '') < (b.submittedAt ?? '') ? -1 : 1));
  const chosen: string[] = [];
  for (const p of passes) {
    const at = p.submittedAt as string;
    const last = chosen[chosen.length - 1];
    if (!last || Date.parse(at) - Date.parse(last) >= DUEL_GAP_DAYS * DAY) chosen.push(at);
  }
  void now;
  return { count: chosen.length, lastAt: chosen[chosen.length - 1] ?? null };
}

export function masteryPath(userId: string, packageId: string): string {
  return `mastery/${userId}_${packageId}`;
}

export function conditionsMet(r: MasteryRecord): number {
  return [r.stationDone, r.duel80Count >= 2, r.reviews30 && r.reviews90, r.roleplayOk].filter(
    Boolean,
  ).length;
}

export async function evaluateMastery(
  d: Deps,
  user: Doc<User>,
  packageId: string,
): Promise<MasteryRecord> {
  const now = d.clock();
  const prev =
    (await d.store.get<MasteryRecord>(masteryPath(user.id, packageId))) ??
    emptyMastery(user.id, packageId, now);
  const [stationDone, attempts, memories, approval] = await Promise.all([
    stationsComplete(d, user.id, packageId),
    d.store.query<Attempt>({
      collection: 'attempts',
      where: [
        ['userId', '==', user.id],
        ['packageId', '==', packageId],
      ],
      limit: 200,
    }),
    d.store.query<QuestionMemory>({
      collection: 'question_memory',
      where: [
        ['userId', '==', user.id],
        ['packageId', '==', packageId],
      ],
      limit: 1000,
    }),
    d.store.get(`roleplay_approvals/${user.id}_${packageId}`),
  ]);
  const duels = duelPassCount(attempts, now);
  const rec: MasteryRecord = {
    userId: user.id,
    packageId,
    stationDone,
    duel80Count: duels.count,
    duel80LastAt: duels.lastAt,
    reviews30: memories.some((m) => m.milestone30),
    reviews90: memories.some((m) => m.milestone90),
    // condition 4 comes from the approval document itself — never from the previous record, so an
    // approval can never be lost and can never be self-declared
    roleplayOk: Boolean(approval),
    masteredAt: prev.masteredAt,
    updatedAt: now.toISOString(),
  };
  if (!rec.masteredAt && conditionsMet(rec) === 4) rec.masteredAt = now.toISOString();
  return rec;
}

/** Persists the evaluation; awards the mastery reward once, on the transition. */
export async function refreshMastery(d: Deps, user: Doc<User>, pkg: { id: string }) {
  const rec = await evaluateMastery(d, user, pkg.id);
  const path = masteryPath(user.id, pkg.id);
  const prev = await d.store.get<MasteryRecord>(path);
  await d.store.set(path, rec as unknown as Record<string, unknown>);
  const justMastered = Boolean(rec.masteredAt) && !prev?.masteredAt;
  if (justMastered) {
    await track(d, 'mastery_unlocked', user.id, { packageId: pkg.id });
    await awardCoins(d, user.id, 'mastery', pkg.id, COIN_EARN.mastery);
    await awardPoints(d, user.id, 'mastery', pkg.id, XP_EARN.mastery);
  }
  return { record: rec, justMastered, conditions: conditionsMet(rec) };
}

export async function myMastery(d: Deps, user: Doc<User>, packageIds: string[]) {
  const out = [];
  for (const packageId of packageIds) {
    const rec =
      (await d.store.get<MasteryRecord>(masteryPath(user.id, packageId))) ??
      emptyMastery(user.id, packageId, d.clock());
    out.push({
      packageId,
      conditions: conditionsMet(rec),
      total: 4,
      stationDone: rec.stationDone,
      duel80Count: rec.duel80Count,
      reviews30: rec.reviews30,
      reviews90: rec.reviews90,
      roleplayOk: rec.roleplayOk,
      masteredAt: rec.masteredAt,
    });
  }
  return out;
}

/** Human approval of a recorded roleplay (condition 4). AC-04: never automatic. */
export async function approveRoleplay(
  d: Deps,
  actorId: string,
  userId: string,
  packageId: string,
): Promise<MasteryRecord> {
  const user = await d.store.get<User>(`users/${userId}`);
  if (!user) throw new Error('USER_NOT_FOUND');
  await d.store.set(`roleplay_approvals/${userId}_${packageId}`, {
    userId,
    packageId,
    approvedBy: actorId,
    approvedAt: d.clock().toISOString(),
  });
  await track(d, 'roleplay_approved', userId, { packageId, approvedBy: actorId });
  // one code path pays the mastery reward, whichever condition completes it last
  const { record } = await refreshMastery(d, { id: userId } as Doc<User>, { id: packageId });
  return record;
}

/** Admin KPI: what share of evaluated (user × package) pairs is actually mastered. */
export async function masteryRate(d: Deps) {
  const all = await d.store.query<MasteryRecord>({ collection: 'mastery', limit: 5000 });
  const mastered = all.filter((m) => m.masteredAt).length;
  const byCondition = [
    all.filter((m) => m.stationDone).length,
    all.filter((m) => m.duel80Count >= 2).length,
    all.filter((m) => m.reviews30 && m.reviews90).length,
    all.filter((m) => m.roleplayOk).length,
  ];
  return {
    evaluated: all.length,
    mastered,
    masteryRate: all.length ? mastered / all.length : null,
    conditionCoverage: {
      stations: byCondition[0] ?? 0,
      duels: byCondition[1] ?? 0,
      reviews: byCondition[2] ?? 0,
      roleplay: byCondition[3] ?? 0,
    },
  };
}
