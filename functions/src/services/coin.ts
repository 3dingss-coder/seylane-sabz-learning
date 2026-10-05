import { z } from 'zod';
import type { CoinBalance, CoinCatalogItem, CoinEntry, CoinRedemption, CoinReason } from '../domain/types';
import { track, type Deps } from './context';

/**
 * PHASE-3 §3.3 — سکهٔ توانمندی.
 *
 * There is no virtual shop: in an internal enablement tool, gems that buy icons kill the system's
 * credibility. Coins buy **real** fulfilment (a tester, a printed catalogue, priority assignment,
 * a coaching slot), and every redemption is recorded and visible.
 *
 * G-04: nothing purchasable may give an unfair advantage in assessment — no coin can buy a quiz
 * score, and nothing moves a deadline silently.
 */

/** §3.3.3 sources of coins (left column). */
export const COIN_EARN = {
  station: 10,
  duelFirstPass: 30,
  duelRetryPass: 10,
  reviewOnTime: 15,
  packageCompleted: 100,
  mastery: 500,
  helpedTeammate: 20,
} as const;

/** §3.3.3 capability points (right column) — standing, not spendable. */
export const XP_EARN = {
  station: 20,
  duelFirstPass: 50,
  duelRetryPass: 25,
  reviewOnTime: 40,
  packageCompleted: 150,
  mastery: 800,
  helpedTeammate: 30,
} as const;

/** §3.3.2 — real goods only. `fulfilment` is what makes G-04 checkable in code. */
export const COIN_CATALOG: CoinCatalogItem[] = [
  {
    code: 'tester_sample',
    title: 'نمونهٔ تستر اضافه',
    price: 200,
    fulfilment: 'physical',
    note: 'ابزار کار واقعی در ویزیت حضوری.',
  },
  {
    code: 'printed_catalog',
    title: 'کاتالوگ چاپی برند',
    price: 150,
    fulfilment: 'physical',
    note: 'نسخهٔ چاپی به‌روز برای مشتری.',
  },
  {
    code: 'assignment_priority',
    title: 'اولویت انتساب محصول جدید',
    price: 400,
    fulfilment: 'process',
    note: 'زودتر یاد می‌گیری، زودتر می‌فروشی. در انتساب‌ها ثبت می‌شود.',
  },
  {
    code: 'deadline_grace_day',
    title: 'یک روز معافیت از ددلاین',
    price: 600,
    fulfilment: 'process',
    note: 'شفاف و ثبت‌شده؛ هرگز پنهانی اعمال نمی‌شود.',
  },
  {
    code: 'coaching_30',
    title: '۳۰ دقیقه کوچینگ فردی با مدیر فروش',
    price: 1000,
    fulfilment: 'coaching',
    note: 'توسعهٔ شغلی، نه مزیت ارزیابی.',
  },
];

export const redeemSchema = z.object({ code: z.string().min(1).max(60) });

export function catalogItem(code: string): CoinCatalogItem | undefined {
  return COIN_CATALOG.find((c) => c.code === code);
}

/**
 * G-04 as an executable rule: the catalogue may only contain real fulfilment, never a score, a
 * grade or an invisible deadline change. Throws on violation (also asserted in tests).
 */
export function assertCatalogIsFair(catalog: CoinCatalogItem[] = COIN_CATALOG): void {
  const allowed: CoinCatalogItem['fulfilment'][] = ['physical', 'process', 'coaching'];
  for (const item of catalog) {
    if (!allowed.includes(item.fulfilment))
      throw new Error(`G-04 violated: ${item.code} is not a real fulfilment`);
    if (item.price <= 0) throw new Error(`G-04 violated: ${item.code} must have a real price`);
    if (/score|نمره|grade|answer/i.test(item.title))
      throw new Error(`G-04 violated: ${item.code} tries to buy an assessment advantage`);
  }
}

export function emptyBalance(userId: string, now: Date): CoinBalance {
  return { userId, balance: 0, lifetime: 0, updatedAt: now.toISOString() };
}

/**
 * Idempotent coin award — the same ledger trick as `awardPoints`: the deterministic id
 * (userId+reason+refId) makes a double call a no-op, so a retried webhook can never mint coins.
 */
export async function awardCoins(
  d: Deps,
  userId: string,
  reason: CoinReason,
  refId: string,
  amount: number,
): Promise<boolean> {
  if (!amount) return false;
  const ledgerPath = `coin_ledger/${userId}_${reason}_${refId}`;
  const balancePath = `coin_balance/${userId}`;
  const awarded = await d.store.runTransaction(async (tx) => {
    if (await tx.get(ledgerPath)) return false;
    const bal = (await tx.get<CoinBalance>(balancePath)) ?? emptyBalance(userId, d.clock());
    const entry: CoinEntry = {
      userId,
      amount,
      reason,
      refId,
      createdAt: d.clock().toISOString(),
    };
    tx.create(ledgerPath, entry as unknown as Record<string, unknown>);
    tx.set(balancePath, {
      ...bal,
      balance: Math.max(0, bal.balance + amount),
      lifetime: bal.lifetime + Math.max(0, amount),
      updatedAt: d.clock().toISOString(),
    } as unknown as Record<string, unknown>);
    return true;
  });
  if (awarded) await track(d, 'coin_earned', userId, { amount, reason });
  return awarded;
}

export async function coinBalance(d: Deps, userId: string): Promise<CoinBalance> {
  return (await d.store.get<CoinBalance>(`coin_balance/${userId}`)) ?? emptyBalance(userId, d.clock());
}

export async function myCoins(d: Deps, userId: string) {
  const [bal, ledger, redemptions] = await Promise.all([
    coinBalance(d, userId),
    d.store.query<CoinEntry>({
      collection: 'coin_ledger',
      where: [['userId', '==', userId]],
      orderBy: [['createdAt', 'desc']],
      limit: 100,
    }),
    d.store.query<CoinRedemption>({
      collection: 'coin_redemptions',
      where: [['userId', '==', userId]],
      orderBy: [['createdAt', 'desc']],
      limit: 50,
    }),
  ]);
  assertCatalogIsFair();
  return {
    balance: bal.balance,
    lifetime: bal.lifetime,
    catalog: COIN_CATALOG,
    ledger: ledger.map((l) => ({
      id: l.id,
      amount: l.amount,
      reason: l.reason,
      refId: l.refId,
      createdAt: l.createdAt,
    })),
    redemptions: redemptions.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      price: r.price,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

export type RedeemResult =
  | { ok: true; redemption: CoinRedemption; balance: number }
  | { ok: false; reason: 'unknown_item' | 'insufficient_balance' };

/** Spends coins on a real good. The record is user-visible and auditable — never silent (G-04). */
export async function redeemCoin(
  d: Deps,
  userId: string,
  code: string,
): Promise<RedeemResult> {
  const item = catalogItem(code);
  if (!item) return { ok: false, reason: 'unknown_item' };
  assertCatalogIsFair();
  const now = d.clock();
  const balancePath = `coin_balance/${userId}`;
  const redemptionId = `coin_redemptions/${userId}_${code}_${now.getTime()}`;
  const out = await d.store.runTransaction(async (tx) => {
    const bal = (await tx.get<CoinBalance>(balancePath)) ?? emptyBalance(userId, now);
    if (bal.balance < item.price) return { ok: false as const, reason: 'insufficient_balance' as const };
    const redemption: CoinRedemption = {
      userId,
      code: item.code,
      title: item.title,
      price: item.price,
      status: 'pending_fulfilment',
      createdAt: now.toISOString(),
    };
    tx.create(redemptionId, redemption as unknown as Record<string, unknown>);
    tx.create(`coin_ledger/${userId}_redeem_${redemptionId}`, {
      userId,
      amount: -item.price,
      reason: 'redeem',
      refId: item.code,
      createdAt: now.toISOString(),
    } as unknown as Record<string, unknown>);
    tx.set(balancePath, {
      ...bal,
      balance: bal.balance - item.price,
      updatedAt: now.toISOString(),
    } as unknown as Record<string, unknown>);
    return { ok: true as const, redemption, balance: bal.balance - item.price };
  });
  if (out.ok) await track(d, 'coin_redeemed', userId, { code, price: item.price });
  return out;
}
