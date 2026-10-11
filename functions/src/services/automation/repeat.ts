/**
 * Repeat policy: how often a rule (or one step of it) is allowed to send.
 *
 * Before this, cadence lived in the *global* settings — `maxPerUserPerDay`, `maxPerUserPerWeek`,
 * `minGapHours` applied to every rule at once, so an admin could not make a deadline reminder repeat
 * while keeping a welcome nudge once-in-a-lifetime. The policy is per rule now, with per-rule and
 * per-step overrides; the global numbers stay behind as defaults an admin may raise or drop.
 *
 * Two things this must not confuse:
 *
 *  • **Repetition is not a retry.** A policy that allows ten sends a day is not permission to send the
 *    same message ten times because a Worker crashed. Dedupe is a separate mechanism (the claim key in
 *    `push-automation-engine.ts` plus `queuedAt`), and the reason strings below keep them apart.
 *  • **A policy never overrides a hard stop.** Kill-switch, paused rule, missing consent/subscription,
 *    no valid destination, and quiet hours are not caps to be raised — they are checked around this
 *    function and can veto it.
 */

import type { PushAutomationSettings } from '../../domain/types';

/** Hard technical bounds of the policy itself — a typo here would be a bug, not a product decision. */
export const POLICY_LIMITS = {
  /** Below one minute a rule can stampede. A technical floor, not a policy an admin owns. */
  minIntervalFloorMs: 60_000,
  maxIntervalMs: 180 * 24 * 60 * 60 * 1000,
  /** A ceiling high enough that «بیش از ده پوش روزانه» is legal while a runaway is not. */
  maxPerDay: 96,
  maxPerWeek: 366,
  maxPerMonth: 999,
  /** 0 means "no limit for this window". */
  unlimited: 0,
} as const;

export interface RepeatPolicy {
  /** Minimum time between two sends of the same rule to the same user. 0 = no spacing. */
  minIntervalMs: number;
  /** 0 = unlimited. */
  perDay: number;
  perWeek: number;
  perMonth: number;
  /** Never send twice for the same event occurrence, even if the rule re-evaluates it. */
  oncePerEventInstance: boolean;
  /** Allow several sends on one day when the policy's interval permits them. */
  allowSameDayMultiple: boolean;
  /** At most one send per user per rule, ever — the welcome-push shape. */
  onceInLivespan: boolean;
  /** Tighter limit for this rule (per user, keyed by rule id). */
  perRule?: { maxPerDay?: number; minIntervalMs?: number };
  /** Tighter limit for one step id, applied when that step executes. */
  perStep?: Record<string, { minIntervalMs?: number; maxPerDay?: number }>;
  /** Bind even an urgent push to quiet hours. Off by default; urgent is a deliberate exception. */
  respectQuietHoursAlways?: boolean;
}

export const DEFAULT_REPEAT_POLICY: RepeatPolicy = {
  minIntervalMs: 0,
  perDay: POLICY_LIMITS.unlimited,
  perWeek: POLICY_LIMITS.unlimited,
  perMonth: POLICY_LIMITS.unlimited,
  oncePerEventInstance: true,
  allowSameDayMultiple: true,
  onceInLivespan: false,
};

export type RepeatBlockReason =
  | 'min_interval'
  | 'per_day'
  | 'per_week'
  | 'per_month'
  | 'same_event_instance'
  | 'once_in_livespan';

export interface RepeatState {
  lastSentAt: number | null;
  daySent: number;
  weekSent: number;
  monthSent: number;
  lifetimeSent: number;
  /** Identity of the event occurrence this decision is about. */
  eventKey?: string;
  lastEventKey?: string;
}

export interface RepeatDecision {
  allow: boolean;
  reason?: RepeatBlockReason;
  /** What to tell the admin, phrased as a policy — never as a system failure. */
  message?: string;
  /** Earliest ms timestamp at which this could be allowed again, for time-based blocks. */
  retryAt?: number;
}

const faNum = (n: number): string => new Intl.NumberFormat('fa-IR').format(n);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function validateRepeatPolicy(policy: Partial<RepeatPolicy> | undefined): string[] {
  if (!policy) return [];
  const bad: string[] = [];

  if (policy.minIntervalMs !== undefined) {
    const v = num(policy.minIntervalMs);
    if (v === null) bad.push('minIntervalMs باید عدد باشد.');
    else if (v !== 0 && v < POLICY_LIMITS.minIntervalFloorMs)
      bad.push(
        `فاصله‌ی تکرار نمی‌تواند کمتر از ${faNum(POLICY_LIMITS.minIntervalFloorMs / 60000)} دقیقه باشد؛ ۰ یعنی بدون فاصله.`,
      );
    else if (v > POLICY_LIMITS.maxIntervalMs) bad.push('فاصله‌ی تکرار از ۱۸۰ روز بیشتر شد.');
  }

  const windows: [keyof RepeatPolicy, number, string][] = [
    ['perDay', POLICY_LIMITS.maxPerDay, 'روزانه'],
    ['perWeek', POLICY_LIMITS.maxPerWeek, 'هفتگی'],
    ['perMonth', POLICY_LIMITS.maxPerMonth, 'ماهانه'],
  ];
  for (const [key, max, label] of windows) {
    const raw = policy[key];
    if (raw === undefined) continue;
    const v = num(raw);
    if (v === null || !Number.isInteger(v) || v < POLICY_LIMITS.unlimited)
      bad.push(`سقف ${label} باید عدد صحیح نامنفی باشد (۰ یعنی بدون سقف).`);
    else if (v > max) bad.push(`سقف ${label} از ${faNum(max)} بیشتر شد.`);
  }

  if (policy.perRule) {
    const iv = num(policy.perRule.minIntervalMs);
    if (policy.perRule.minIntervalMs !== undefined && (iv === null || iv < 0))
      bad.push('perRule.minIntervalMs باید عدد نامنفی باشد.');
    const cap = num(policy.perRule.maxPerDay);
    if (
      policy.perRule.maxPerDay !== undefined &&
      (cap === null || cap < 0 || cap > POLICY_LIMITS.maxPerDay)
    )
      bad.push('perRule.maxPerDay باید عدد صحیح مجاز باشد.');
  }

  if (policy.perStep) {
    for (const [stepId, p] of Object.entries(policy.perStep)) {
      if (stepId.length > 64) bad.push('شناسه‌ی گام در سیاست تکرار خیلی بلند است.');
      const iv = num(p?.minIntervalMs);
      if (p?.minIntervalMs !== undefined && (iv === null || iv < 0))
        bad.push(`perStep.${stepId}.minIntervalMs باید عدد نامنفی باشد.`);
      const cap = num(p?.maxPerDay);
      if (p?.maxPerDay !== undefined && (cap === null || cap < 0 || cap > POLICY_LIMITS.maxPerDay))
        bad.push(`perStep.${stepId}.maxPerDay باید عدد صحیح مجاز باشد.`);
    }
  }
  return bad;
}

/**
 * The policy's answer to «آیا این قانون الان می‌تواند برای این کاربر ارسال کند؟». Pure, so a dry-run can
 * ask it without touching a counter and the panel can show the reason exactly as the runtime sees it.
 */
export function decideRepeat(
  policy: Partial<RepeatPolicy> | undefined,
  state: RepeatState,
  now: number,
): RepeatDecision {
  const p: RepeatPolicy = { ...DEFAULT_REPEAT_POLICY, ...(policy ?? {}) };

  const gap = p.perRule?.minIntervalMs ?? p.minIntervalMs;
  if (gap > 0 && state.lastSentAt !== null && now - state.lastSentAt < gap)
    return {
      allow: false,
      reason: 'min_interval',
      message: `سیاست تکرار این قانون: ارسال بعدی ${faNum(Math.ceil(gap / 3_600_000))} ساعت پس از آخرین ارسال مجاز است.`,
      retryAt: state.lastSentAt + gap,
    };

  if (p.onceInLivespan && state.lifetimeSent >= 1)
    return {
      allow: false,
      reason: 'once_in_livespan',
      message: 'این قانون یک‌بار برای همیشه برای هر کاربر ارسال می‌شود و آن یک‌بار انجام شده.',
    };

  const perDay = p.perRule?.maxPerDay ?? p.perDay;
  if (perDay > 0 && state.daySent >= perDay)
    return {
      allow: false,
      reason: 'per_day',
      message: `سقف روزانه‌ی این قانون ${faNum(perDay)} ارسال است و پر شده.`,
      retryAt: nextLocalMidnight(now),
    };

  if (!p.allowSameDayMultiple && state.daySent >= 1)
    return {
      allow: false,
      reason: 'per_day',
      message: 'این قانون در هر روز فقط یک ارسال مجاز دارد.',
      retryAt: nextLocalMidnight(now),
    };

  if (p.perWeek > 0 && state.weekSent >= p.perWeek)
    return {
      allow: false,
      reason: 'per_week',
      message: `سقف هفتگی این قانون ${faNum(p.perWeek)} ارسال است و پر شده.`,
      retryAt: nextLocalMidnight(now) + 24 * 60 * 60 * 1000,
    };

  if (p.perMonth > 0 && state.monthSent >= p.perMonth)
    return {
      allow: false,
      reason: 'per_month',
      message: `سقف ماهانه‌ی این قانون ${faNum(p.perMonth)} ارسال است و پر شده.`,
      retryAt: nextLocalMidnight(now) + 24 * 60 * 60 * 1000,
    };

  if (p.oncePerEventInstance && state.eventKey && state.lastEventKey === state.eventKey)
    return {
      allow: false,
      reason: 'same_event_instance',
      message: 'برای همین رویداد قبلاً ارسال شده؛ تکرارِ یک رویداد با ارسالِ تازه فرق می‌کند.',
    };

  return { allow: true };
}

/**
 * The next Tehran midnight — the day boundary the counters roll on (UTC+3:30, no DST). Always in the
 * future: a `retryAt` in the past would make a blocked rule fire again on the very next tick.
 */
export function nextLocalMidnight(now: number): number {
  const DAY = 24 * 60 * 60 * 1000;
  const offset = 3.5 * 60 * 60 * 1000;
  const d = new Date(now + offset);
  d.setUTCHours(0, 0, 0, 0);
  const floor = d.getTime() - offset;
  return floor > now ? floor : floor + DAY;
}

/**
 * The policy that reproduces the OLD global caps for one rule. Migration uses it so a v1 rule keeps
 * exactly the cadence it had; an admin loosens it afterwards, deliberately, one rule at a time.
 */
export function policyFromLegacySettings(
  settings: Pick<PushAutomationSettings, 'maxPerUserPerDay' | 'maxPerUserPerWeek' | 'minGapMs'>,
): RepeatPolicy {
  return {
    ...DEFAULT_REPEAT_POLICY,
    minIntervalMs: Math.max(0, settings.minGapMs),
    perDay: settings.maxPerUserPerDay,
    perWeek: settings.maxPerUserPerWeek,
    perMonth: POLICY_LIMITS.unlimited,
    oncePerEventInstance: true,
    // The legacy engine allowed a second send on the same day once the gap had passed; keep that.
    allowSameDayMultiple: true,
    onceInLivespan: false,
  };
}

/** How a policy compares to the legacy caps — the parity check the migration asserts. */
export function legacyParity(
  policy: RepeatPolicy,
  settings: Pick<PushAutomationSettings, 'maxPerUserPerDay' | 'maxPerUserPerWeek' | 'minGapMs'>,
): 'identical' | 'stricter' | 'looser' {
  const gap = Math.max(0, settings.minGapMs);
  if (
    policy.perDay === settings.maxPerUserPerDay &&
    policy.perWeek === settings.maxPerUserPerWeek &&
    policy.minIntervalMs === gap
  )
    return 'identical';
  const looser =
    (settings.maxPerUserPerDay > 0 &&
      (policy.perDay === 0 || policy.perDay > settings.maxPerUserPerDay)) ||
    (settings.maxPerUserPerWeek > 0 &&
      (policy.perWeek === 0 || policy.perWeek > settings.maxPerUserPerWeek)) ||
    policy.minIntervalMs < gap;
  return looser ? 'looser' : 'stricter';
}
