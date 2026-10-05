import type { ChestQuality, Quest, QuestKind } from '../domain/types';
import { ids } from '../lib/ids';
import { dayKey } from '../lib/time';
import { DEFAULT_POLICY } from '../domain/policy';
import { track, type Deps } from './context';
import { awardCoins } from './coin';

/**
 * PHASE-3 §3.6 — مأموریت امروز (daily quests).
 *
 * Three quests a day drawn from a five-kind pool: volume, quality, review, social, field. The
 * chest quality is a *controlled* variable reward — the range is known, the exact quality is not,
 * which is the same trick Duolingo uses, minus the gambling.
 */
const TZ = DEFAULT_POLICY.timezone;

export const QUEST_POOL: Array<{ kind: QuestKind; title: string; target: number; coins: number }> =
  [
    { kind: 'stations', title: '۲ ایستگاه را تمام کن', target: 2, coins: 20 },
    { kind: 'perfect_duel', title: 'یک دوئل را بدون غلط ببر', target: 1, coins: 30 },
    { kind: 'reviews', title: '۴ مرور امروزت را انجام بده', target: 4, coins: 25 },
    { kind: 'roleplay', title: 'یک سناریوی فروش را با صدای خودت ضبط کن', target: 1, coins: 40 },
    // 'help' (اجتماعی) stays out of the pool until a real teammate Q&A trigger exists — shipping a
    // quest nobody can complete is worse than not shipping it.
  ];

/** Chest contents are fixed per quality (no loot-box surprise on *what*, only on *how much*). */
export const CHEST: Record<ChestQuality, { coins: number; weight: number; label: string }> = {
  bronze: { coins: 10, weight: 60, label: 'صندوق برنزی' },
  silver: { coins: 25, weight: 30, label: 'صندوق نقره‌ای' },
  gold: { coins: 60, weight: 10, label: 'صندوق طلایی' },
};

/** Deterministic 0..1 from a seed — the same user+day always gets the same quests and chest. */
export function seededUnit(seed: string): number {
  const hex = ids.hash(seed).slice(0, 8);
  return Number.parseInt(hex, 16) / 0xffffffff;
}

export function rollChest(seed: string): ChestQuality {
  const r = seededUnit(seed) * 100;
  if (r < CHEST.bronze.weight) return 'bronze';
  if (r < CHEST.bronze.weight + CHEST.silver.weight) return 'silver';
  return 'gold';
}

export function todaysQuestIds(userId: string, day: string): QuestKind[] {
  const start = Math.floor(seededUnit(`${userId}|${day}|pick`) * QUEST_POOL.length);
  const picked: QuestKind[] = [];
  for (let i = 0; i < QUEST_POOL.length && picked.length < 3; i++) {
    const q = QUEST_POOL[(start + i) % QUEST_POOL.length];
    if (q) picked.push(q.kind);
  }
  return picked;
}

export function questDoc(userId: string, day: string, kind: QuestKind): Quest {
  // the pool is a fixed literal, so the fallback is only there to keep the lookup total
  const fallback = {
    kind: 'stations' as QuestKind,
    title: '۲ ایستگاه را تمام کن',
    target: 2,
    coins: 20,
  };
  const def = QUEST_POOL.find((q) => q.kind === kind) ?? fallback;
  return {
    userId,
    day,
    kind,
    title: def.title,
    progress: 0,
    target: def.target,
    coinReward: def.coins,
    doneAt: null,
    chest: null,
    chestCoins: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function questPath(q: Pick<Quest, 'userId' | 'day' | 'kind'>): string {
  return `quests/${q.userId}_${q.day}_${q.kind}`;
}

/** Materialises today's three quests (idempotent) and returns them. */
export async function todayQuests(d: Deps, userId: string): Promise<Quest[]> {
  const day = dayKey(d.clock(), TZ);
  const kinds = todaysQuestIds(userId, day);
  const out: Quest[] = [];
  for (const kind of kinds) {
    const path = questPath({ userId, day, kind });
    const existing = await d.store.get<Quest>(path);
    if (existing) {
      out.push(existing);
      continue;
    }
    const fresh = { ...questDoc(userId, day, kind), updatedAt: d.clock().toISOString() };
    try {
      await d.store.create(path, fresh as unknown as Record<string, unknown>);
    } catch {
      /* concurrent create — re-read below */
    }
    out.push((await d.store.get<Quest>(path)) ?? fresh);
  }
  return out;
}

export interface QuestBump {
  quest: Quest | null;
  completed: boolean;
  chest: ChestQuality | null;
  coinsEarned: number;
}

/** Advances every quest of this kind today; awards coins + chest exactly once on completion. */
export async function bumpQuest(
  d: Deps,
  userId: string,
  kind: QuestKind,
  by = 1,
): Promise<QuestBump[]> {
  const day = dayKey(d.clock(), TZ);
  const kinds = todaysQuestIds(userId, day);
  if (!kinds.includes(kind)) return [];
  const path = questPath({ userId, day, kind });
  let before = await d.store.get<Quest>(path);
  // The quests are materialised lazily on first read; a learning action can arrive first, so make
  // sure today's rows exist before bumping — otherwise the very first station of the day would
  // count for nothing.
  if (!before) {
    await todayQuests(d, userId);
    before = await d.store.get<Quest>(path);
  }
  if (!before || before.doneAt)
    return before ? [{ quest: before, completed: false, chest: before.chest, coinsEarned: 0 }] : [];

  const progress = Math.min(before.target, before.progress + by);
  const done = progress >= before.target;
  const chest = done ? (before.chest ?? rollChest(`${userId}|${day}|${kind}|chest`)) : null;
  const chestCoins = done && chest ? CHEST[chest].coins : 0;
  const next: Quest = {
    ...before,
    progress,
    doneAt: done ? d.clock().toISOString() : null,
    chest,
    chestCoins,
    updatedAt: d.clock().toISOString(),
  };
  await d.store.set(path, next as unknown as Record<string, unknown>);

  let coinsEarned = 0;
  if (done) {
    const ref = `${day}_${kind}`;
    if (await awardCoins(d, userId, 'quest', ref, next.coinReward)) coinsEarned += next.coinReward;
    if (chest && (await awardCoins(d, userId, 'chest', ref, chestCoins))) coinsEarned += chestCoins;
    await track(d, 'quest_completed', userId, { kind, target: next.target });
    if (chest) await track(d, 'chest_opened', userId, { quality: chest, coins: chestCoins });
  }
  return [{ quest: next, completed: done, chest, coinsEarned }];
}

/** Counts completed quests today — feeds the home card and the admin metrics. */
export async function questSummary(d: Deps, userId: string) {
  const list = await todayQuests(d, userId);
  return {
    day: dayKey(d.clock(), TZ),
    total: list.length,
    completed: list.filter((q) => q.doneAt).length,
    quests: list.map((q) => ({
      kind: q.kind,
      title: q.title,
      progress: q.progress,
      target: q.target,
      coinReward: q.coinReward,
      done: Boolean(q.doneAt),
      chest: q.chest,
      chestCoins: q.chestCoins,
    })),
  };
}
