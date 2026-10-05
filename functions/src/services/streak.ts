import { z } from 'zod';
import { DEFAULT_POLICY } from '../domain/policy';
import type { Streak, StreakEvent } from '../domain/types';
import { DAY, dayKey } from '../lib/time';
import { track, type Deps } from './context';

/**
 * PHASE-3 §3.2 — پیوستگی (streak).
 *
 * A streak day is counted only by a *learning* action (a completed station), never by opening the
 * app (G-02). Forgiveness is on from day one (shield / repair / ramp-down / leave), because an
 * unforgiving streak is a churn bomb.
 *
 * Rule G-03: `streaks/{userId}` is a private record. It is served only under `/v1/me/*` and never
 * appears in a manager or admin payload — `assertStreakNotExposed` guards that in code.
 */
const TZ = DEFAULT_POLICY.timezone;

export const MAX_SHIELDS = 2;
/** completed stations that charge one shield (earned, never bought) */
export const SHIELD_EVERY_STATIONS = 5;
/** days a broken streak can still be repaired for its full peak */
export const REPAIR_WINDOW_DAYS = 3;
/** §3.2.3 باشگاه پیوستگی */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

export const leaveSchema = z.object({ days: z.number().int().min(1).max(7) });

export function todayKey(d: Date): string {
  return dayKey(d, TZ);
}

export function emptyStreak(now: Date): Streak {
  return {
    current: 0,
    longest: 0,
    peak: 0,
    pendingPeak: 0,
    lastDay: null,
    shields: 0,
    stationsSinceShield: 0,
    repairUntil: null,
    onLeaveUntil: null,
    leaveTakenAt: null,
    updatedAt: now.toISOString(),
  };
}

/** Whole days between two YYYY-MM-DD keys (b − a). */
export function dayGap(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/**
 * Pure state machine — the whole §3.2 rule set in one testable function.
 *
 *  • same day → unchanged (idempotent, so a second station costs nothing)
 *  • consecutive day → +1
 *  • one missed day + a shield → shield spent, streak survives
 *  • otherwise → break: inside the repair window the peak comes back in full; outside it the
 *    streak drops to **half the peak, not to zero** (ramp-down), and a new 3-day window opens
 *  • on approved leave the streak freezes: it neither grows nor breaks
 */
export function advanceStreak(prev: Streak, today: string, now: Date): {
  next: Streak;
  events: StreakEvent[];
} {
  const events: StreakEvent[] = [];
  const base = { ...prev, updatedAt: now.toISOString() };

  if (prev.lastDay === today) return { next: base, events: ['unchanged'] };

  if (prev.onLeaveUntil && prev.onLeaveUntil >= today) {
    events.push('on_leave');
    return { next: { ...base, lastDay: today }, events };
  }

  let current = prev.current;
  if (!prev.lastDay) {
    current = 1;
    events.push('started');
  } else {
    const gap = dayGap(prev.lastDay, today);
    if (gap === 1) {
      current += 1;
      events.push('extended');
    } else if (gap === 2 && prev.shields > 0) {
      base.shields = prev.shields - 1;
      current += 1;
      events.push('shield_used');
    } else {
      const lost = Math.max(prev.peak, prev.current);
      current = Math.floor(lost / 2) + 1; // ramp-down to half, today counts
      base.pendingPeak = lost; // winnable back inside the window
      base.peak = current; // re-based: a second break halves again, it never freezes at the old high
      base.repairUntil = addDays(today, REPAIR_WINDOW_DAYS);
      events.push('broken');
    }
  }

  /* بازگردانی — a broken streak gets 3 days back. Completing *any* station inside the window
     restores the whole peak, so the repair is checked on every counted day, not only on the day
     of the break. */
  if (prev.repairUntil && prev.repairUntil >= today && prev.pendingPeak > current) {
    current = prev.pendingPeak;
    base.pendingPeak = 0;
    base.repairUntil = null;
    const i = events.indexOf('extended');
    if (i >= 0) events.splice(i, 1);
    if (!events.includes('repaired')) events.push('repaired');
  }

  const next: Streak = {
    ...base,
    current: Math.max(0, current),
    longest: Math.max(prev.longest, current),
    peak: Math.max(base.peak, current),
    lastDay: today,
  };
  return { next, events };
}

/** Charges one shield per `SHIELD_EVERY_STATIONS` completed stations (never purchasable). */
export function chargeShield(prev: Streak): Streak {
  if (prev.shields >= MAX_SHIELDS) return prev;
  const n = prev.stationsSinceShield + 1;
  if (n < SHIELD_EVERY_STATIONS) return { ...prev, stationsSinceShield: n };
  return { ...prev, stationsSinceShield: 0, shields: prev.shields + 1 };
}

/**
 * What the streak *is* as of `today`, before the next station completes. The stored `current` only
 * changes when a station is completed, so a user who stopped showing up would otherwise keep
 * displaying a stale number. This is the display rule that mirrors `advanceStreak`:
 * frozen on leave, saved by an unused shield, otherwise ramped down once the window closes.
 */
export function effectiveCurrent(s: Streak, today: string): number {
  if (!s.lastDay) return 0;
  if (s.onLeaveUntil && s.onLeaveUntil >= today) return s.current;
  const gap = dayGap(s.lastDay, today);
  if (gap <= 1) return s.current;
  if (gap === 2 && s.shields > 0) return s.current; // the shield has not been spent yet
  return s.repairUntil && s.repairUntil >= today ? s.current : Math.floor(s.current / 2);
}

export async function getStreak(d: Deps, userId: string): Promise<Streak> {
  return (await d.store.get<Streak>(`streaks/${userId}`)) ?? emptyStreak(d.clock());
}

/**
 * Called when a station is completed. Idempotent per day: a second station the same day does not
 * extend the streak twice. Every transition is an analytics event (PHASE-0 rule 12).
 */
export async function touchStreak(d: Deps, userId: string): Promise<Streak> {
  const now = d.clock();
  const today = todayKey(now);
  const path = `streaks/${userId}`;
  const result = await d.store.runTransaction(async (tx) => {
    const prev = (await tx.get<Streak>(path)) ?? emptyStreak(now);
    const { next: advanced, events } = advanceStreak(prev, today, now);
    const next = events.includes('unchanged') ? advanced : chargeShield(advanced);
    tx.set(path, next as unknown as Record<string, unknown>);
    return { next, events };
  });
  for (const ev of result.events) {
    if (ev === 'unchanged') continue;
    const name =
      ev === 'shield_used'
        ? 'shield_used'
        : ev === 'broken'
          ? 'streak_broken'
          : ev === 'repaired'
            ? 'streak_repaired'
            : ev === 'on_leave'
              ? 'streak_frozen_on_leave'
              : 'streak_extended';
    await track(d, name, userId, {
      current: result.next.current,
      longest: result.next.longest,
      shields: result.next.shields,
    });
  }
  return result.next;
}

/** §3.2.2 مرخصی — once per season, up to 7 days, no cost. */
export async function requestLeave(
  d: Deps,
  userId: string,
  days: number,
): Promise<{ ok: true; streak: Streak } | { ok: false; reason: 'too_long' | 'already_taken' }> {
  if (days < 1 || days > 7) return { ok: false, reason: 'too_long' };
  const now = d.clock();
  const today = todayKey(now);
  const path = `streaks/${userId}`;
  const out = await d.store.runTransaction(async (tx) => {
    const prev = (await tx.get<Streak>(path)) ?? emptyStreak(now);
    if (prev.leaveTakenAt && dayGap(prev.leaveTakenAt.slice(0, 10), today) < 90)
      return { ok: false as const, reason: 'already_taken' as const };
    const next: Streak = {
      ...prev,
      onLeaveUntil: addDays(today, days),
      leaveTakenAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    tx.set(path, next as unknown as Record<string, unknown>);
    return { ok: true as const, streak: next };
  });
  if (out.ok) await track(d, 'streak_leave_requested', userId, { days });
  return out;
}

export async function myStreak(d: Deps, userId: string) {
  const s = await getStreak(d, userId);
  const current = effectiveCurrent(s, todayKey(d.clock()));
  const nextMilestone = STREAK_MILESTONES.find((m) => m > current) ?? null;
  return {
    current,
    longest: s.longest,
    shields: s.shields,
    maxShields: MAX_SHIELDS,
    repairUntil: s.repairUntil,
    onLeaveUntil: s.onLeaveUntil,
    nextMilestone,
    daysToMilestone: nextMilestone === null ? null : nextMilestone - current,
  };
}

/**
 * G-03 in code: a manager/admin payload must never carry streak data. Used by the report builders
 * and asserted in `test/gamification.test.ts`.
 */
export function assertStreakNotExposed(payload: unknown, where: string): void {
  const keys = payload && typeof payload === 'object' ? Object.keys(payload as object) : [];
  const leaked = keys.filter((k) => /streak|پیوستگی/i.test(k));
  if (leaked.length)
    throw new Error(`G-03 violated: ${where} exposes ${leaked.join(', ')} to a manager`);
}
