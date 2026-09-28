import type { Doc } from '../store/types';
import type { Badge, PointsEntry, PointsReason, User, UserBadge } from '../domain/types';
import { ids } from '../lib/ids';
import { track, type Deps } from './context';
import type { PackageCompletion } from './learning-state';

/** Default badge catalogue (F7 AC③). Seeded to `badges/{code}`; editable later. */
export const DEFAULT_BADGES: Array<Badge & { id: string }> = [
  {
    id: 'first_package',
    code: 'first_package',
    title: 'اولین قدم',
    description: 'اولین بسته آموزشی را کامل کردی.',
    icon: 'sprout',
    rule: { type: 'first_package', threshold: 1 },
    active: true,
  },
  {
    id: 'on_time_3',
    code: 'on_time_3',
    title: 'همیشه به‌موقع',
    description: 'سه بسته پشت‌سرهم را قبل از مهلت تمام کردی.',
    icon: 'alarm-clock-check',
    rule: { type: 'on_time_streak', threshold: 3 },
    active: true,
  },
  {
    id: 'sharp_5',
    code: 'sharp_5',
    title: 'تیزهوش',
    description: 'در پنج آزمون از همان تلاش اول قبول شدی.',
    icon: 'brain',
    rule: { type: 'first_try_passes', threshold: 5 },
    active: true,
  },
  {
    id: 'packages_5',
    code: 'packages_5',
    title: 'پرتلاش',
    description: 'پنج بسته آموزشی را کامل کردی.',
    icon: 'medal',
    rule: { type: 'packages_completed', threshold: 5 },
    active: true,
  },
  {
    id: 'points_500',
    code: 'points_500',
    title: 'ستاره فروش',
    description: 'به ۵۰۰ امتیاز رسیدی.',
    icon: 'star',
    rule: { type: 'points', threshold: 500 },
    active: true,
  },
];

/**
 * Idempotent points award: deterministic ledger id (userId+reason+refId) → exactly once,
 * balance updated in the same transaction (PROMPT 012 AC).
 */
export async function awardPoints(
  d: Deps,
  userId: string,
  reason: PointsReason,
  refId: string,
  amount: number,
): Promise<boolean> {
  if (!amount) return false;
  const ledgerPath = `points_ledger/${ids.points(userId, reason, refId)}`;
  const awarded = await d.store.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerPath);
    if (existing) return false;
    const user = await tx.get<User>(`users/${userId}`);
    if (!user) return false;
    const entry: PointsEntry = {
      userId,
      amount,
      reason,
      refId,
      createdAt: d.clock().toISOString(),
    };
    tx.create(ledgerPath, entry as unknown as Record<string, unknown>);
    tx.update(`users/${userId}`, { pointsBalance: (user.pointsBalance ?? 0) + amount });
    return true;
  });
  if (awarded) await track(d, 'points_earned', userId, { amount, reason });
  return awarded;
}

export interface BadgeStats {
  packagesCompleted: number;
  onTimeStreak: number;
  firstTryPasses: number;
  points: number;
}

export function onTimeStreak(
  completions: Pick<PackageCompletion, 'completedAt' | 'onTime'>[],
): number {
  const sorted = [...completions].sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]?.onTime) streak++;
    else break;
  }
  return streak;
}

export function earnedBadgeIds(badges: Array<Badge & { id: string }>, stats: BadgeStats): string[] {
  return badges
    .filter((b) => b.active)
    .filter((b) => {
      const t = b.rule.threshold;
      switch (b.rule.type) {
        case 'first_package':
        case 'packages_completed':
          return stats.packagesCompleted >= t;
        case 'on_time_streak':
          return stats.onTimeStreak >= t;
        case 'first_try_passes':
          return stats.firstTryPasses >= t;
        case 'points':
          return stats.points >= t;
      }
    })
    .map((b) => b.id);
}

export async function listBadges(d: Deps): Promise<Array<Doc<Badge>>> {
  const b = await d.store.query<Badge>({ collection: 'badges' });
  return b.length ? b : DEFAULT_BADGES;
}

/** Evaluates badge rules and grants new ones (unique userId+badgeId). Returns newly earned. */
export async function evaluateBadges(d: Deps, userId: string): Promise<Array<Doc<Badge>>> {
  const [badges, completions, firstPass, user, owned] = await Promise.all([
    listBadges(d),
    d.store.query<PackageCompletion>({
      collection: 'package_completions',
      where: [['userId', '==', userId]],
    }),
    d.store.query<PointsEntry>({
      collection: 'points_ledger',
      where: [
        ['userId', '==', userId],
        ['reason', '==', 'first_pass_quiz'],
      ],
    }),
    d.store.get<User>(`users/${userId}`),
    d.store.query<UserBadge>({ collection: 'user_badges', where: [['userId', '==', userId]] }),
  ]);
  const stats: BadgeStats = {
    packagesCompleted: completions.length,
    onTimeStreak: onTimeStreak(completions),
    firstTryPasses: firstPass.length,
    points: user?.pointsBalance ?? 0,
  };
  const have = new Set(owned.map((o) => o.badgeId));
  const fresh: Array<Doc<Badge>> = [];
  for (const id of earnedBadgeIds(badges, stats)) {
    if (have.has(id)) continue;
    try {
      await d.store.create(`user_badges/${ids.userBadge(userId, id)}`, {
        userId,
        badgeId: id,
        earnedAt: d.clock().toISOString(),
      });
      const b = badges.find((x) => x.id === id);
      if (b) fresh.push(b);
      await track(d, 'badge_earned', userId, { badgeId: id });
    } catch {
      /* already granted concurrently */
    }
  }
  if (fresh.length) {
    const { notifyTemplate } = await import('./notify');
    for (const b of fresh)
      await notifyTemplate(
        d,
        [userId],
        'badge_earned',
        { title: b.title },
        { actionRef: '/cards', priority: 'low' },
      );
  }
  return fresh;
}

export async function myPoints(d: Deps, userId: string) {
  const [user, ledger] = await Promise.all([
    d.store.get<User>(`users/${userId}`),
    d.store.query<PointsEntry>({
      collection: 'points_ledger',
      where: [['userId', '==', userId]],
      orderBy: [['createdAt', 'desc']],
      limit: 100,
    }),
  ]);
  return {
    balance: user?.pointsBalance ?? 0,
    ledger: ledger.map((l) => ({
      id: l.id,
      amount: l.amount,
      reason: l.reason,
      refId: l.refId,
      createdAt: l.createdAt,
    })),
  };
}

export async function myBadges(d: Deps, userId: string) {
  const [badges, owned] = await Promise.all([
    listBadges(d),
    d.store.query<UserBadge>({ collection: 'user_badges', where: [['userId', '==', userId]] }),
  ]);
  const map = new Map(owned.map((o) => [o.badgeId, o.earnedAt]));
  return badges
    .filter((b) => b.active)
    .map((b) => ({
      id: b.id,
      code: b.code,
      title: b.title,
      description: b.description,
      icon: b.icon,
      earned: map.has(b.id),
      earnedAt: map.get(b.id) ?? null,
    }));
}
