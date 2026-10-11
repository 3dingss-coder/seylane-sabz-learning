import { z } from 'zod';
import { DAY, dayKey, minutesOfDay, parseHhmm, weekKey, zonedParts } from '../lib/time';
import { ids } from '../lib/ids';
import { text } from '../http/validate';
import type { Doc } from '../store/types';
import { StoreConflictError } from '../store/types';
import type {
  NotificationPrefs,
  PushAutomation,
  PushAutomationDecisions,
  PushAutomationDecisionItem,
  PushAutomationSettings,
  User,
} from '../domain/types';
import { isSafeImageUrl, isSafeInternalPath } from './push-campaigns';
import { isCategory, isMutable, PROTECTED_CATEGORIES } from '../domain/notification-categories';
import { ApiError } from '../http/errors';
import { AUTOMATION_PATH_VARS } from './push-automation-catalog';
import { withDefaults } from './automation/migrate';
import { decideRepeat, type RepeatState } from './automation/repeat';
import type { RepeatPolicy } from '../domain/types';
import { audit, getPolicy, type Actor, type Deps } from './context';

/**
 * The governor: everything the engine must decide *before* a push may leave, and nothing else.
 * It never sends — `push-automation-engine.ts` does, through `notifyUsers`. That split keeps the
 * rules in one place and testable, and lets `notify.ts` read the same flags without importing the
 * engine (which would be a cycle).
 *
 * Storage (all in the existing `docs` table; no SQL migration):
 *  • `push_automation_settings/global`  — global caps + kill-switch. Read uncached on purpose:
 *    the «stop everything» switch must act on the next request, not after the 30s policy cache.
 *  • `push_automation_claims/<windowKey>/<hash>`  — idempotency (atomic `create`, same as campaigns).
 *  • `push_automation_counters/user/<userId>`     — one rolling doc: day/week counters + per-key
 *    last-send. Self-resetting on read, so it never needs pruning and never grows.
 *  • `push_automation_decisions/<dayKey>`         — «why nothing was sent», one doc per user/day.
 *  • `notification_prefs/<userId>`                — what the marketer muted.
 */

export const AUTOMATIONS = 'push_automations';
export const SETTINGS = 'push_automation_settings';
export const CLAIMS = 'push_automation_claims';
export const COUNTERS = 'push_automation_counters';
export const DECISIONS = 'push_automation_decisions';
export const QUEUE = 'push_automation_queue';
export const RUNS = 'push_automation_runs';
export const PREFS = 'notification_prefs';
export const TEXT_REVISIONS = 'push_automation_text_revs';

/** Per-automation decisions kept inside one user-day document. */
export const DECISION_WINDOW = 20;

export const DEFAULT_SETTINGS: Omit<PushAutomationSettings, 'updatedAt' | 'updatedBy'> = {
  paused: false,
  maxPerUserPerDay: 2,
  maxPerUserPerWeek: 10,
  minGapMs: 4 * 3600_000,
  defaultHourTehran: 10,
  decisionTtlDays: 30,
  failureAlertPct: 20,
};

/** Why a push did not go out. Shown verbatim in the panel, so the labels are Persian. */
export type SkipReason =
  | 'paused'
  | 'disabled'
  | 'notScheduled'
  | 'audience'
  | 'inactiveUser'
  | 'optedOut'
  | 'optInOnly'
  | 'sendOnce'
  | 'cooldown'
  | 'gap'
  | 'capDay'
  | 'capWeek'
  | 'capMonth'
  | 'priority'
  | 'duplicate'
  | 'ladder'
  | 'noDevice'
  | 'missingVariable'
  | 'superseded'
  | 'quiet'
  | 'notImplemented'
  | 'error';

export const SKIP_LABELS: Record<SkipReason, string> = {
  paused: 'توقف کلی اتوماسیون‌ها فعال است',
  disabled: 'اتوماسیون خاموش است',
  notScheduled: 'پنجره زمانی این اجرا نرسیده بود',
  audience: 'کاربر در مخاطب این اتوماسیون نبود',
  inactiveUser: 'حساب کاربر غیرفعال یا معلق است',
  optedOut: 'کاربر این دسته را در تنظیمات اعلان خاموش کرده است',
  optInOnly: 'کاربر این حالت را فعال نکرده است',
  sendOnce: 'قبلاً یک بار برای این کاربر ارسال شده است',
  cooldown: 'فاصله تکرار همین اتوماسیون رعایت نشده است',
  gap: 'حداقل فاصله بین دو پوش کاربر رعایت نشده است',
  capDay: 'سقف روزانه پوش کاربر پر شده است',
  capWeek: 'سقف هفتگی پوش کاربر پر شده است',
  capMonth: 'سقف ماهانه‌ای که خودِ قاعده گذاشته پر شده است',
  priority: 'اتوماسیون با اولویت بالاتر همان لحظه ارسال شد',
  duplicate: 'این پنجره زمانی قبلاً ارسال شده است',
  ladder: 'پله بالاتر بی‌فعالیتی همان دوره ارسال شده است',
  noDevice: 'هیچ دستگاه معتبری برای این کاربر ثبت نشده است',
  missingVariable: 'یکی از متغیرهای پیام قابل پر کردن نبود',
  superseded: 'اتوماسیون جایگزین مسئول این کاربر است',
  quiet: 'ساعت سکوت — ارسال به اول بازه مجاز موکول شد',
  notImplemented: 'این اتوماسیون نیازمند داده‌ای است که هنوز محاسبه نمی‌شود',
  error: 'خطای غیرمنتظره',
};

export const isSkipReason = (v: string): v is SkipReason =>
  (Object.keys(SKIP_LABELS) as string[]).includes(v);

// ─── Path & id helpers (all deterministic → idempotent by construction) ──────

/**
 * Claims live in a shard named after TODAY (`YYYY-MM-DD`) whatever the length of the window they
 * dedupe: one uniform retention rule for pruning, and the doc id still hashes the full window key, so
 * a weekly claim is exactly as unique as a daily one. Long windows are additionally protected by the
 * cooldown in the rolling counter, so losing an old claim to pruning cannot double-send.
 */
export function claimPath(key: string, userId: string, windowKey: string, shard: string): string {
  return `${CLAIMS}/${shard}/${ids.hash(`${key}|${userId}|${windowKey}`)}`;
}

export function counterPath(userId: string): string {
  return `${COUNTERS}/user/${userId}`;
}

export function decisionsPath(day: string, userId: string): string {
  return `${DECISIONS}/${day}/${userId}`;
}

export function queueId(key: string, userId: string, dueBucket: number): string {
  return ids.hash(`${key}|${userId}|${dueBucket}`);
}

// ─── Automation paths (allowlist for the engine only) ────────────────────────

/**
 * Destinations an automation may open. Marketers need the learning routes, managers also `/manager`;
 * `/admin` is never allowed (a push must not drop a marketer in front of the panel).
 * Campaign behaviour is untouched: this passes its own prefix list to the same validator.
 */
export const AUTOMATION_ROUTE_PREFIXES = [
  '/learn',
  '/packages',
  '/sections',
  '/quiz',
  '/messages',
  '/cards',
  '/mentor',
  '/profile',
  '/manager',
];

export function isSafeAutomationPath(value: string): boolean {
  return isSafeInternalPath(value, AUTOMATION_ROUTE_PREFIXES);
}

/**
 * Validation for a path *template* (`/packages/{packageId}`): every `{...}` must be a known variable,
 * and the path with the placeholders filled by a dummy segment must pass the normal internal-path
 * check. The rendered result is validated again at send time — a variable can never smuggle a host.
 */
export function isSafePathTemplate(value: string, knownVars: readonly string[]): boolean {
  if (value.length > 300) return false;
  const names = [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] as string);
  const unknown = [...value.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] as string);
  if (unknown.length !== names.length) return false; // malformed brace
  if (names.some((n) => !knownVars.includes(n))) return false;
  const stripped = value.replace(/\{[A-Za-z0-9_]+\}/g, 'x');
  return isSafeAutomationPath(stripped);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsSchema = z.object({
  paused: z.boolean(),
  maxPerUserPerDay: z.number().int().min(0).max(20),
  maxPerUserPerWeek: z.number().int().min(0).max(70),
  minGapMs: z
    .number()
    .int()
    .min(0)
    .max(7 * DAY)
    .refine((v) => v % 60_000 === 0, 'فاصله باید مضربی از یک دقیقه باشد.'),
  defaultHourTehran: z.number().int().min(0).max(23),
  decisionTtlDays: z.number().int().min(1).max(180),
  failureAlertPct: z.number().int().min(1).max(100),
});

/** Never cached: the kill-switch must apply to the very next run/request. */
export async function readSettings(d: Deps): Promise<PushAutomationSettings> {
  const doc = await d.store.get<PushAutomationSettings>(`${SETTINGS}/global`);
  return { ...DEFAULT_SETTINGS, updatedAt: '', updatedBy: null, ...(doc ?? {}) };
}

export async function writeSettings(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof settingsSchema>,
): Promise<PushAutomationSettings> {
  const before = await d.store.get<PushAutomationSettings>(`${SETTINGS}/global`);
  const next: PushAutomationSettings = {
    ...input,
    updatedAt: d.clock().toISOString(),
    updatedBy: actor.id,
  };
  await d.store.set(`${SETTINGS}/global`, next as unknown as Record<string, unknown>);
  await audit(d, actor, 'push_automation.settings_updated', SETTINGS, 'global', before, input);
  return next;
}

// ─── Catalogue reads shared by engine + admin API ────────────────────────────

export async function loadAutomations(d: Deps): Promise<Array<Doc<PushAutomation>>> {
  const rows = await d.store.query<PushAutomation>({ collection: AUTOMATIONS });
  // The one place a stored rule becomes a runnable rule: a v1 row gains the v2 fields with their
  // legacy-equivalent defaults, so nothing in the store has to be rewritten (and nothing that is not
  // written can accidentally start sending). See `services/automation/migrate.ts`.
  return rows.map(withDefaults);
}

/** Only what the engine may act on now: enabled, not paused, not awaiting a v2 feature. */
export async function loadRunnable(d: Deps): Promise<{
  settings: PushAutomationSettings;
  automations: Array<Doc<PushAutomation>>;
}> {
  const settings = await readSettings(d);
  const all = await loadAutomations(d);
  const automations = settings.paused
    ? []
    : all.filter((a) => a.enabled && !a.requiresFeature && !isSystemGate(a));
  return { settings, automations };
}

/** A «system gate» only turns an existing template on/off; it carries no own message to send. */
export function isSystemGate(a: Pick<PushAutomation, 'templateKey'>): boolean {
  return !!a.templateKey;
}

/**
 * The gate in front of a system template. Returns `null` when the automation catalogue has not been
 * seeded yet, so existing behaviour (`welcome`, deadline jobs, …) is never changed by an absent doc.
 */
export async function templateGate(
  d: Deps,
  templateKey: string,
): Promise<{ enabled: boolean; superseded: boolean } | null> {
  const all = await loadAutomations(d);
  if (!all.length) return null;
  const gate = all.find((a) => a.templateKey === templateKey);
  const enabled = gate ? gate.enabled : true;
  const superseded = all.some(
    (a) => a.enabled && !isSystemGate(a) && (a.supersedes ?? []).includes(templateKey),
  );
  return { enabled, superseded };
}

// ─── Windows ─────────────────────────────────────────────────────────────────

/**
 * The dedupe window of one automation for one user:
 *  • daily / inactivity / condition  → `YYYY-MM-DD` in the policy timezone,
 *  • weekly / `sendOnce`-style long cooldowns → `YYYY-Www`,
 *  • plus the cooldown bucket, so a 48h cooldown cannot be re-sent in the next window.
 */
export async function windowKeyFor(
  d: Deps,
  a: PushAutomation,
  cooldownMs: number,
): Promise<string> {
  const policy = await getPolicy(d);
  const now = d.clock();
  const weekly = a.trigger.kind === 'schedule_weekly' || (a.trigger.weekday ?? null) !== null;
  const base = weekly ? weekKey(now, policy.timezone) : dayKey(now, policy.timezone);
  const bucket = cooldownMs > 0 ? `#${Math.floor(now.getTime() / cooldownMs)}` : '';
  return `${base}${bucket}`;
}

/**
 * Has this automation's Tehran window arrived? Events are always "now"; the daily/weekly windows are
 * evaluated inside a 90-minute slot that starts at their own `time`, so a 10:00 nudge is never
 * considered "due" at 03:00 and the cron may fire up to 6 times an hour without duplicating (the
 * claim window still allows exactly one send per window).
 */
export async function windowReached(d: Deps, a: PushAutomation, now = d.clock()): Promise<boolean> {
  const kind = a.trigger.kind;
  if (kind === 'event' || kind === 'event_delay') return true;
  const policy = await getPolicy(d);
  const tz = policy.timezone;
  const settings = await readSettings(d);
  const at = parseHhmm(a.trigger.time) ?? settings.defaultHourTehran * 60;
  const minutes = minutesOfDay(now, tz);
  if (kind === 'schedule_weekly' || (a.trigger.weekday ?? null) !== null) {
    const weekday = a.trigger.weekday ?? policy.weeklyDigestDay;
    if (zonedParts(now, tz).weekday !== weekday) return false;
  }
  return minutes >= at && minutes < at + 90;
}

/** The window a sweep for `a` belongs to right now (`YYYY-MM-DD` or `YYYY-Www`), for the run log. */
export async function currentWindow(d: Deps, a: PushAutomation): Promise<string> {
  const policy = await getPolicy(d);
  const now = d.clock();
  const weekly = a.trigger.kind === 'schedule_weekly' || (a.trigger.weekday ?? null) !== null;
  return weekly ? weekKey(now, policy.timezone) : dayKey(now, policy.timezone);
}

// ─── Claims (idempotency) ────────────────────────────────────────────────────

/** Atomic `create`; a second call for the same (automation, user, window) returns false. */
export async function tryClaim(
  d: Deps,
  key: string,
  userId: string,
  windowKey: string,
): Promise<boolean> {
  try {
    await d.store.create(await claimPathFor(d, key, userId, windowKey), {
      key,
      userId,
      windowKey,
      createdAt: d.clock().toISOString(),
    });
    return true;
  } catch (e) {
    if (e instanceof StoreConflictError) return false;
    throw e;
  }
}

/** True when this (automation, user, window) was already claimed — used by dry-run and ladder. */
export async function isClaimed(d: Deps, key: string, userId: string, windowKey: string) {
  return (await d.store.get(await claimPathFor(d, key, userId, windowKey))) !== null;
}

/** Resolves today's shard for a claim path (the store has no prefix query, so the day is the key). */
export async function claimPathFor(d: Deps, key: string, userId: string, windowKey: string) {
  const policy = await getPolicy(d);
  return claimPath(key, userId, windowKey, dayKey(d.clock(), policy.timezone));
}

// ─── Rolling per-user counter ────────────────────────────────────────────────

export interface UserCounter {
  day: string;
  daySent: number;
  week: string;
  weekSent: number;
  /** Month window (`YYYY-MM` of the Tehran day key), for a policy that caps a month. */
  month?: string;
  monthSent?: number;
  lastAt: string | null;
  /** automationKey → ISO time of its last send (cooldown + sendOnce). */
  keys: Record<string, string>;
  /**
   * automationKey → its own windows. The global numbers above answer «how many pushes has this *user*
   * had today», which is what a cap on the platform means; a rule's `repeatPolicy` must answer «how
   * many times has *this rule* reached this user today», and that is only knowable per rule.
   */
  perRule?: Record<string, RuleCounter>;
}

/** One rule's counters for one user. Rolls on the same Tehran windows as the global ones. */
export interface RuleCounter {
  day: string;
  daySent: number;
  week: string;
  weekSent: number;
  month: string;
  monthSent: number;
  total: number;
  lastAt: string | null;
}

export const emptyRuleCounter = (day: string, week: string, month: string): RuleCounter => ({
  day,
  daySent: 0,
  week,
  weekSent: 0,
  month,
  monthSent: 0,
  total: 0,
  lastAt: null,
});

/** The month a Tehran day key belongs to (`2026-10-03` → `2026-10`). */
export const monthOf = (day: string): string => day.slice(0, 7);

const emptyCounter = (day: string, week: string): UserCounter => ({
  day,
  daySent: 0,
  week,
  weekSent: 0,
  month: monthOf(day),
  monthSent: 0,
  lastAt: null,
  keys: {},
  perRule: {},
});

/** Re-derives today's counters from a stored doc, resetting whatever window has rolled over. */
export function normalizeCounter(
  stored: UserCounter | null,
  day: string,
  week: string,
): UserCounter {
  if (!stored) return emptyCounter(day, week);
  const month = monthOf(day);
  const perRule: Record<string, RuleCounter> = {};
  for (const [k, v] of Object.entries(stored.perRule ?? {})) {
    if (!v) continue;
    perRule[k] = {
      ...emptyRuleCounter(day, week, month),
      daySent: v.day === day ? v.daySent : 0,
      weekSent: v.week === week ? v.weekSent : 0,
      monthSent: v.month === month ? v.monthSent : 0,
      total: v.total ?? 0,
      lastAt: v.lastAt ?? null,
    };
  }
  return {
    day,
    daySent: stored.day === day ? stored.daySent : 0,
    week,
    weekSent: stored.week === week ? stored.weekSent : 0,
    month,
    monthSent: stored.month === month ? (stored.monthSent ?? 0) : 0,
    lastAt: stored.lastAt ?? null,
    keys: stored.keys ?? {},
    perRule,
  };
}

/** One query for the whole population — a sweep may not cost one read per user. */
export async function loadCounterIndex(d: Deps): Promise<Map<string, UserCounter>> {
  const policy = await getPolicy(d);
  const day = dayKey(d.clock(), policy.timezone);
  const week = weekKey(d.clock(), policy.timezone);
  const rows = await d.store.query<UserCounter>({ collection: `${COUNTERS}/user` });
  const out = new Map<string, UserCounter>();
  for (const r of rows) out.set(r.id, normalizeCounter(r, day, week));
  return out;
}

/** Writes a counter the caller already holds (the sweep path, where `bumpCounter` would re-read). */
export async function writeCounter(d: Deps, userId: string, next: UserCounter): Promise<void> {
  await d.store.set(counterPath(userId), next as unknown as Record<string, unknown>);
}

/** Day/week counters reset lazily on read, so no pruning job and no unbounded growth. */
export async function readCounter(d: Deps, userId: string): Promise<UserCounter> {
  const policy = await getPolicy(d);
  const now = d.clock();
  const day = dayKey(now, policy.timezone);
  const week = weekKey(now, policy.timezone);
  const stored = await d.store.get<UserCounter>(counterPath(userId));
  // One roll function for both paths, so a per-rule window can never be counted twice in one read.
  return normalizeCounter(stored ?? null, day, week);
}

/** `patch = null` records a skip only (no send); otherwise the counters move forward. */
export async function bumpCounter(
  d: Deps,
  userId: string,
  key: string,
  opts: { sent: boolean },
): Promise<void> {
  const cur = await readCounter(d, userId);
  await writeCounter(
    d,
    userId,
    advanceCounter(cur, key, opts.sent, cur.day, cur.week, d.clock().toISOString()),
  );
}

/** Pure counter move (shared by `bumpCounter` and the sweep's in-memory update). */
export function advanceCounter(
  cur: UserCounter,
  key: string,
  sent: boolean,
  day: string,
  week: string,
  now: string,
): UserCounter {
  const keys = { ...cur.keys, ...(sent ? { [key]: now } : {}) };
  const trimmed: Record<string, string> = {};
  for (const k of Object.keys(keys)
    .sort((a, b) => (keys[a] ?? '').localeCompare(keys[b] ?? ''))
    .slice(-24))
    trimmed[k] = keys[k] as string;
  const month = monthOf(day);
  const prev = cur.perRule?.[key] ?? emptyRuleCounter(day, week, month);
  const rolled: RuleCounter = {
    day,
    daySent: prev.day === day ? prev.daySent : 0,
    week,
    weekSent: prev.week === week ? prev.weekSent : 0,
    month,
    monthSent: prev.month === month ? prev.monthSent : 0,
    total: prev.total ?? 0,
    lastAt: prev.lastAt ?? null,
  };
  // Bounded like `keys`: a per-user doc must not grow with the number of rules ever created. The rule
  // being written is rebuilt, so no stale entry of it survives the trim.
  const perRuleAll: Record<string, RuleCounter> = {};
  const keep = Object.entries(cur.perRule ?? {})
    .filter(([k]) => k !== key)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-48);
  for (const [k, v] of keep) perRuleAll[k] = v;
  perRuleAll[key] = {
    ...rolled,
    daySent: rolled.daySent + (sent ? 1 : 0),
    weekSent: rolled.weekSent + (sent ? 1 : 0),
    monthSent: rolled.monthSent + (sent ? 1 : 0),
    total: rolled.total + (sent ? 1 : 0),
    lastAt: sent ? now : rolled.lastAt,
  };
  return {
    day,
    daySent: (cur.day === day ? cur.daySent : 0) + (sent ? 1 : 0),
    week,
    weekSent: (cur.week === week ? cur.weekSent : 0) + (sent ? 1 : 0),
    month,
    monthSent: (cur.month === month ? (cur.monthSent ?? 0) : 0) + (sent ? 1 : 0),
    lastAt: sent ? now : cur.lastAt,
    keys: trimmed,
    perRule: perRuleAll,
  };
}

// ─── User preferences ────────────────────────────────────────────────────────

export const prefsSchema = z.object({
  mutedCategories: z.array(z.string().max(40)).max(12).default([]),
  preferredHour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  optIns: z.record(z.string().max(60), z.boolean()).default({}),
});

/**
 * The set of `userIds` that muted `category`. One query for the whole batch — `notifyUsers` may not
 * turn a push into N database reads. Never throws: a broken prefs document must not silence a push.
 */
export async function prefsForNotify(
  d: Deps,
  userIds: string[],
  category: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!userIds.length) return out;
  try {
    const rows = await d.store.query<NotificationPrefs>({ collection: PREFS });
    const wanted = new Set(userIds);
    for (const r of rows) {
      if (!wanted.has(r.id)) continue;
      if ((r.mutedCategories ?? []).includes(category)) out.add(r.id);
    }
  } catch (e) {
    console.warn('[automations] prefs read failed', (e as Error).message);
  }
  return out;
}

export async function readPrefs(d: Deps, userId: string): Promise<NotificationPrefs | null> {
  return d.store.get<NotificationPrefs>(`${PREFS}/${userId}`);
}

/** One query for the whole population; used by sweeps so N users never cost N reads. */
export async function readPrefsIndex(d: Deps): Promise<Map<string, NotificationPrefs>> {
  const rows = await d.store.query<NotificationPrefs>({ collection: PREFS });
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * The marketer's own write path. `deadlines` (and `health`) cannot be muted — a learner who silences
 * deadline reminders loses the one thing the assignment flow depends on, so the request is refused
 * with a Persian explanation instead of being quietly ignored.
 */
export async function writePrefsSafe(
  d: Deps,
  userId: string,
  input: z.infer<typeof prefsSchema>,
): Promise<NotificationPrefs> {
  const unknown = input.mutedCategories.filter((c) => !isCategory(c));
  if (unknown.length) throw new ApiError('VALIDATION', 'دسته‌ی اعلان ناشناخته است.');
  const protectedMuted = input.mutedCategories.filter((c) => !isMutable(c));
  if (protectedMuted.length)
    throw new ApiError(
      'VALIDATION',
      'اعلان‌های مهلت و سلامت را نمی‌توان خاموش کرد؛ بقیه دسته‌ها آزاد است.',
    );
  return writePrefs(d, userId, input);
}

/** The panel/admin view: current prefs with the categories the user may still mute. */
export async function readPrefsView(d: Deps, userId: string) {
  const prefs = await readPrefs(d, userId);
  return {
    prefs: prefs ?? { mutedCategories: [], preferredHour: null, optIns: {}, updatedAt: null },
    protectedCategories: PROTECTED_CATEGORIES.slice(),
  };
}

export async function writePrefs(
  d: Deps,
  userId: string,
  input: z.infer<typeof prefsSchema>,
): Promise<NotificationPrefs> {
  const next: NotificationPrefs = {
    mutedCategories: input.mutedCategories,
    preferredHour: input.preferredHour ?? null,
    optIns: input.optIns,
    updatedAt: d.clock().toISOString(),
  };
  await d.store.set(`${PREFS}/${userId}`, next as unknown as Record<string, unknown>);
  return next;
}

// ─── Decisions («چرا پوش نرفت؟») ─────────────────────────────────────────────

export async function logDecision(
  d: Deps,
  userId: string,
  entry: PushAutomationDecisionItem,
): Promise<void> {
  const policy = await getPolicy(d);
  const settings = await readSettings(d);
  const day = dayKey(d.clock(), policy.timezone);
  const path = decisionsPath(day, userId);
  const prev = await d.store.get<PushAutomationDecisions>(path);
  const items = [entry, ...(prev?.items ?? [])].slice(0, DECISION_WINDOW);
  await d.store.set(path, {
    userId,
    dayKey: day,
    items,
    expireAt: new Date(
      d.clock().getTime() + Math.max(1, settings.decisionTtlDays) * DAY,
    ).toISOString(),
  } as unknown as Record<string, unknown>);
}

/** Newest first, across the last `days` day-shards (bounded: one small read per day). */
export async function recentDecisions(
  d: Deps,
  userId: string,
  limit = 30,
): Promise<PushAutomationDecisionItem[]> {
  const policy = await getPolicy(d);
  const settings = await readSettings(d);
  const out: PushAutomationDecisionItem[] = [];
  const days = Math.min(14, Math.max(1, settings.decisionTtlDays));
  for (let i = 0; i < days && out.length < limit; i++) {
    const day = dayKey(new Date(d.clock().getTime() - i * DAY), policy.timezone);
    const doc = await d.store.get<PushAutomationDecisions>(decisionsPath(day, userId));
    if (!doc?.items?.length) continue;
    out.push(...doc.items);
  }
  return out.slice(0, limit);
}

// ─── The single gate ─────────────────────────────────────────────────────────

export interface GateInput {
  automation: PushAutomation;
  user: Doc<User>;
  prefs: NotificationPrefs | null;
  counter: UserCounter;
  settings: PushAutomationSettings;
  /** Rendered message: `null` in a variable means the message may not go out at all. */
  missingVariables?: string[];
  /** Number of users with a device for the automation's channel. */
  hasDevice?: boolean;
  /** Set when a higher-priority automation already claimed this window. */
  lostToPriority?: boolean;
  /** Skip the global gap (urgent only, per spec). */
  ignoreGap?: boolean;
  /** Dry-run must not claim, count or log. */
  dry?: boolean;
}

export type GateResult =
  { ok: true; windowKey: string } | { ok: false; reason: SkipReason; detail?: string };

/**
 * What a rule's own repeat policy says about this user right now, in the shapes the gate already
 * speaks. Exported because the panel has to explain a refusal with the same function the sender uses:
 * a preview that re-implements cadence is a preview that drifts from reality.
 *
 * The counters it reads are the *per-rule* ones — «how many times has this rule reached this user
 * today» — not the global «how many pushes has this user had today». That difference is the whole
 * point of a per-rule policy, and it is why the global numbers are not consulted on this path.
 */
export function policyDecision(
  policy: RepeatPolicy,
  automationKey: string,
  counter: UserCounter,
  nowMs: number,
): { allow: true } | { allow: false; reason: SkipReason; detail?: string } {
  const rc = counter.perRule?.[automationKey];
  const state: RepeatState = {
    lastSentAt: rc?.lastAt ? Date.parse(rc.lastAt) : null,
    daySent: rc?.daySent ?? 0,
    weekSent: rc?.weekSent ?? 0,
    monthSent: rc?.monthSent ?? 0,
    lifetimeSent: rc?.total ?? 0,
  };
  const d = decideRepeat(policy, state, nowMs);
  if (d.allow) return { allow: true };
  const reason: SkipReason =
    d.reason === 'per_week'
      ? 'capWeek'
      : d.reason === 'per_month'
        ? 'capMonth'
        : d.reason === 'min_interval'
          ? 'cooldown'
          : d.reason === 'once_in_livespan'
            ? 'sendOnce'
            : d.reason === 'same_event_instance'
              ? 'duplicate'
              : 'capDay';
  return { allow: false, reason, detail: d.message };
}

/**
 * The whole rulebook in one function: kill-switch → enabled → audience → status → prefs → caps →
 * cooldown/gap → idempotency claim. Order matters: everything cheap and side-effect-free is checked
 * before the claim, because a claim can never be taken back (a retried send is worse than a skip).
 */
export async function gate(d: Deps, g: GateInput): Promise<GateResult> {
  const { automation: a, user, prefs, counter, settings } = g;
  if (settings.paused) return { ok: false, reason: 'paused' };
  if (!a.enabled) return { ok: false, reason: 'disabled' };
  if (a.requiresFeature) return { ok: false, reason: 'notImplemented' };
  if (user.status !== 'active') return { ok: false, reason: 'inactiveUser' };
  if (!isUserInAudience(a, user)) return { ok: false, reason: 'audience' };

  const muted = prefs?.mutedCategories ?? [];
  if (muted.length && muted.includes(a.category)) return { ok: false, reason: 'optedOut' };
  if (a.optInOnly && !prefs?.optIns?.[a.key]) return { ok: false, reason: 'optInOnly' };

  if (g.missingVariables?.length) return { ok: false, reason: 'missingVariable' };
  if (g.hasDevice === false) return { ok: false, reason: 'noDevice' };
  if (g.lostToPriority) return { ok: false, reason: 'priority' };

  const cooldown = Math.max(0, a.delivery.cooldownMs ?? 0);
  const lastForKey = counter.keys?.[a.key];

  if (a.repeatPolicy) {
    // The rule owns its cadence. The global per-user caps are deliberately NOT consulted on this path:
    // they were an imposed limit on every rule at once, and the plan replaces them with the policy
    // above. What is not a cap and therefore still stands, untouched: the kill-switch, `enabled`,
    // `requiresFeature`, the user's status and audience, the user's own muted categories and opt-ins,
    // a missing variable, no valid device, the cooldown this rule asked for, and the idempotency
    // claim below. A policy can raise a *send count*; it cannot buy a permission.
    const own = policyDecision(a.repeatPolicy, a.key, counter, d.clock().getTime());
    if (!own.allow) return { ok: false, reason: own.reason, detail: own.detail };
    // A day cap the admin set on THIS rule still binds (it is the rule's own choice, not the platform's).
    const ownDay = a.delivery.maxPerUserPerDay;
    if (ownDay !== null && ownDay !== undefined && ownDay >= 0 && counter.daySent >= ownDay)
      return {
        ok: false,
        reason: 'capDay',
        detail: 'سقف روزانه‌ای که روی همین قاعده گذاشته شده پر است.',
      };
  } else {
    const capDay = a.delivery.maxPerUserPerDay ?? settings.maxPerUserPerDay;
    if (capDay >= 0 && counter.daySent >= capDay) return { ok: false, reason: 'capDay' };
    if (settings.maxPerUserPerWeek > 0 && counter.weekSent >= settings.maxPerUserPerWeek)
      return { ok: false, reason: 'capWeek' };
  }

  if (a.delivery.sendOnce && lastForKey) return { ok: false, reason: 'sendOnce' };
  if (cooldown > 0 && lastForKey && d.clock().getTime() - Date.parse(lastForKey) < cooldown)
    return { ok: false, reason: 'cooldown' };
  // The global minimum gap is part of the inherited cadence: a rule with its own policy has already
  // answered the spacing question in `minIntervalMs`, so the platform-wide gap does not add to it.
  if (
    !a.repeatPolicy &&
    !g.ignoreGap &&
    settings.minGapMs > 0 &&
    a.delivery.priority !== 'urgent' &&
    counter.lastAt &&
    d.clock().getTime() - Date.parse(counter.lastAt) < settings.minGapMs
  )
    return { ok: false, reason: 'gap' };

  const windowKey = await windowKeyFor(d, a, cooldown);
  if (!g.dry && !(await tryClaim(d, a.key, user.id, windowKey)))
    return { ok: false, reason: 'duplicate' };
  return { ok: true, windowKey };
}

/** Audience membership is resolved against live user data (status is checked by the caller). */
export function isUserInAudience(a: PushAutomation, user: Doc<User>): boolean {
  const aud = a.audience;
  switch (aud.type) {
    case 'all':
      return matchesRole(a, user);
    case 'role':
      return user.role === (aud.targetId ?? user.role);
    case 'team':
      return !!aud.targetId && user.teamId === aud.targetId;
    case 'user':
      return user.id === aud.targetId;
  }
}

/**
 * `audienceRole` narrows the population: a marketer automation never reaches managers and vice versa.
 * A team/user-scoped audience is already explicit, so the role only guards the `all` case.
 */
function matchesRole(a: PushAutomation, user: Doc<User>): boolean {
  return a.audienceRole === 'all' || user.role === a.audienceRole;
}

export function addSkip(skipped: Record<string, number>, reason: string): void {
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}

/** A short label used in the runs table; unknown reasons fall back to the raw value. */
export function skipLabel(reason: string): string {
  return isSkipReason(reason) ? SKIP_LABELS[reason] : reason;
}

/** Persian-only validation shared by the create/update schemas (same limits as campaigns). */
export const automationMessageSchema = z.object({
  title: text(2, 80, 'عنوان'),
  body: text(2, 300, 'متن'),
  actionRef: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((v) => isSafePathTemplate(v, AUTOMATION_PATH_VARS), {
      message:
        'مقصد باید یک مسیر داخلی معتبر باشد (/packages، /sections، /quiz، /messages، /cards، /mentor، /manager) و متغیرهای آن از فهرست مجاز.',
    }),
  // The same public-HTTPS rule the campaign studio applies (§4.5): an automation is not a weaker
  // writer of payloads, and this URL ends up in the in-app card and the push message.
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .optional()
    .refine((v) => !v || isSafeImageUrl(v), {
      message: 'آدرس تصویر باید یک لینک عمومی و معتبر با HTTPS باشد.',
    })
    .transform((v) => (v ? v : null)),
});
