/* The category *ids* are part of the API contract (`functions/src/domain/notification-categories.ts`);
 * their Persian labels arrive from the server on every row, so the wording is never duplicated here. */
export type AutomationCategory =
  | 'deadlines'
  | 'quizzes'
  | 'progress'
  | 'mentor'
  | 'content'
  | 'messages'
  | 'digests'
  | 'health'
  | 'general';

/**
 * Pure model of the automation panel (no React, no fetch) — the same split `pushCampaignModel.ts`
 * uses, so the rules the UI applies can be unit-tested without a DOM.
 *
 * The server is the authority: everything here is a *presentation* of `listAutomations()` /
 * `dryRun()` output (`functions/src/services/push-automation-admin.ts`), never a second copy of a
 * decision. The one exception is `needsCriticalConfirm`, which mirrors `CRITICAL_AUTOMATION_KEYS`
 * purely so the dialog can be shown before the request instead of after a 409.
 */

export type AutomationPriority = 'urgent' | 'high' | 'normal' | 'low';
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface AutomationRow {
  key: string;
  name: string;
  description: string;
  category: AutomationCategory | (string & {});
  categoryLabel: string;
  triggerKind: string;
  triggerLabel: string;
  enabled: boolean;
  isSystem: boolean;
  isGate: boolean;
  templateKey: string | null;
  requiresFeature: string | null;
  optInOnly: boolean;
  push: boolean;
  priority: AutomationPriority;
  audienceLabel: string;
  timeLabel: string;
  dueNow: boolean;
  lastRunAt: string | null;
  sent7d: number;
  skipped7d: number;
  version: number;
}

export interface AutomationSettings {
  paused: boolean;
  maxPerUserPerDay: number;
  maxPerUserPerWeek: number;
  minGapMs: number;
  defaultHourTehran: number;
  decisionTtlDays: number;
  failureAlertPct: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AutomationList {
  rows: AutomationRow[];
  paused: boolean;
  settings: AutomationSettings;
  counts: { total: number; enabled: number; gates: number; v2: number };
  today: { sent: number; skipped: Record<string, number> };
}

export interface DryRunSample {
  userId: string;
  name: string;
  title: string;
  body: string;
  reason: string;
}

export interface DryRunResult {
  key: string;
  windowKey: string;
  evaluated: number;
  wouldSend: number;
  skipped: Record<string, number>;
  skippedLabels: Array<{ reason: string; count: number; label: string }>;
  sample: DryRunSample[];
  note: string | null;
}

export interface CronHealth {
  lastRunAt: string | null;
  expression: string | null;
  ok: boolean;
  error: string | null;
  jobs: Array<{ name: string; ok: boolean; error?: string; at?: string }>;
  minutesSinceLastRun: number | null;
  stalled: boolean;
  neverReported: boolean;
}

export interface PushHealth {
  provider: string;
  configured: boolean;
  lastAttemptAt: string | null;
  lastError: string | null;
  today: { sent: number; failed: number; invalid: number };
  /** null until there is at least one attempt today. */
  failureRate: number | null;
}

export interface SystemHealth {
  cron: CronHealth;
  push: PushHealth;
}

export const CRITICAL_KEYS = ['deadline_warning', 'deadline_passed', 'reminder'];

/** The three follow-up rules whose off-switch breaks the deadline chain (mirror of the server list). */
export const needsCriticalConfirm = (row: Pick<AutomationRow, 'key'>): boolean =>
  CRITICAL_KEYS.includes(row.key);

export const PRIORITY_META: Record<AutomationPriority, { label: string; tone: Tone }> = {
  urgent: { label: 'فوری', tone: 'danger' },
  high: { label: 'بالا', tone: 'warning' },
  normal: { label: 'عادی', tone: 'info' },
  low: { label: 'پایین', tone: 'neutral' },
};

/**
 * Group order = the order a person should clean up in: what protects a deadline first, then quizzes,
 * then habits, then the manager's side, then the templates the product already sends, then the engine.
 */
export const CATEGORY_ORDER: AutomationCategory[] = [
  'deadlines',
  'quizzes',
  'progress',
  'content',
  'messages',
  'mentor',
  'digests',
  'health',
  'general',
];

export interface AutomationGroup {
  category: string;
  label: string;
  rows: AutomationRow[];
  enabledCount: number;
}

/** Groups keep the server's order inside each group (it already sorts due → on → off → v2). */
export function groupRows(rows: AutomationRow[]): AutomationGroup[] {
  const byCat = new Map<string, AutomationRow[]>();
  for (const r of rows) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }
  const orderOf = (c: string) => {
    const i = (CATEGORY_ORDER as string[]).indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...byCat.entries()]
    .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
    .map(([category, list]) => ({
      category,
      label: list[0]?.categoryLabel || category,
      rows: list,
      enabledCount: list.filter((r) => r.enabled).length,
    }));
}

/** One badge that says what the row *is*, so an admin never thinks a gate is a duplicate scenario. */
export function stateOf(row: AutomationRow): { tone: Tone; label: string; hint: string } {
  if (row.requiresFeature)
    return {
      tone: 'neutral',
      label: 'نسخه ۲',
      hint: 'نیازمند داده‌ای که هنوز محاسبه نمی‌شود؛ قابل فعال‌کردن نیست.',
    };
  if (row.isGate)
    return row.enabled
      ? {
          tone: 'info',
          label: 'سیستمی — روشن',
          hint: 'درگاهِ یک قالب موجود. متن آن را در «اعلان‌ها ← قالب‌ها» ویرایش کنید.',
        }
      : {
          tone: 'warning',
          label: 'سیستمی — خاموش',
          hint: 'تا وقتی خاموش است، آن اعلان سیستمی ساخته نمی‌شود.',
        };
  if (row.enabled && !row.push)
    return { tone: 'info', label: 'فقط داخل اپ', hint: 'کارت داخل اپ می‌سازد، پوش نمی‌فرستد.' };
  if (row.enabled)
    return { tone: 'success', label: 'روشن', hint: 'در پنجره زمانی خودش بررسی می‌شود.' };
  return { tone: 'neutral', label: 'خاموش', hint: 'هیچ اعلانی از این قانون ساخته نمی‌شود.' };
}

export const faNum = (n: number | null | undefined): string => (n ?? 0).toLocaleString('fa-IR');

export const faPct = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${Math.round(n * 100)}٪`.replace(/\d/g, faDigit);

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const faDigit = (c: string) => FA_DIGITS[Number(c)] ?? c;

/** ۴ ساعت / ۹۰ دقیقه / ۳۰ ثانیه — the gap cap is stored in ms. */
export function gapLabel(ms: number): string {
  if (!ms) return 'بدون فاصله';
  const min = Math.round(ms / 60_000);
  // Round *down* to seconds first: a 45-second gap must never print as «۰ ساعت».
  if (min < 1) return `${faNum(Math.round(ms / 1000))} ثانیه`;
  if (min % 60 === 0) return `${faNum(min / 60)} ساعت`;
  if (min >= 60) return `${faNum(Math.floor(min / 60))} ساعت و ${faNum(min % 60)} دقیقه`;
  return `${faNum(min)} دقیقه`;
}

export function capsSummary(s: AutomationSettings): string {
  const parts = [
    `حداکثر ${faNum(s.maxPerUserPerDay)} پوش در روز برای هر نفر`,
    `${faNum(s.maxPerUserPerWeek)} پوش در هفته`,
    `حداقل فاصله ${gapLabel(s.minGapMs)}`,
  ];
  return parts.join(' · ');
}

/** What a «برآورد» result says in one sentence, including why people were skipped. */
export function estimateSentence(dry: DryRunResult): string {
  const head = `${faNum(dry.evaluated)} نفر در جمعیت بررسی‌شده مشمول این قانون بودند`;
  const send = `${faNum(dry.wouldSend)} نفر همین حالا پوش می‌گرفتند`;
  const top = dry.skippedLabels.slice(0, 3);
  if (!top.length) return `${head} — ${send}.`;
  const reasons = top.map((s) => `${s.label} (${faNum(s.count)})`).join('، ');
  return `${head} — ${send}. ردشدن‌ها: ${reasons}.`;
}

/** The number shown on the row after an estimate, so the table answers «چند نفر؟» without a dialog. */
export function estimateChip(dry: DryRunResult): string {
  return `${faNum(dry.wouldSend)} نفر مشمول ارسال`;
}

export interface CapDraft {
  maxPerUserPerDay: string;
  maxPerUserPerWeek: string;
  gapMinutes: string;
  defaultHourTehran: string;
  decisionTtlDays: string;
  failureAlertPct: string;
}

export function draftFromSettings(s: AutomationSettings): CapDraft {
  return {
    maxPerUserPerDay: String(s.maxPerUserPerDay),
    maxPerUserPerWeek: String(s.maxPerUserPerWeek),
    gapMinutes: String(Math.round(s.minGapMs / 60_000)),
    defaultHourTehran: String(s.defaultHourTehran),
    decisionTtlDays: String(s.decisionTtlDays),
    failureAlertPct: String(s.failureAlertPct),
  };
}

/** Client-side mirror of the server limits, so the admin sees the Persian error before a 400. */
export function validateCaps(draft: CapDraft): Partial<Record<keyof CapDraft, string>> {
  const errors: Partial<Record<keyof CapDraft, string>> = {};
  const int = (v: string): number | null => {
    // An emptied field is *not* zero: clearing «سقف روزانه» must fail loudly rather than silently
    // switch every automatic push off.
    const t = v.trim().replace(/[^\d-]/g, '');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && Number.isInteger(n) ? n : null;
  };
  const day = int(draft.maxPerUserPerDay);
  if (day === null || day < 0 || day > 20)
    errors.maxPerUserPerDay =
      'سقف روزانه باید عددی بین ۰ تا ۲۰ باشد (۰ یعنی هیچ پوش خودکاری نرود).';
  const week = int(draft.maxPerUserPerWeek);
  if (week === null || week < 0 || week > 70)
    errors.maxPerUserPerWeek = 'سقف هفتگی باید عددی بین ۰ تا ۷۰ باشد.';
  const gap = int(draft.gapMinutes);
  if (gap === null || gap < 0 || gap > 10080)
    errors.gapMinutes = 'حداقل فاصله بر حسب دقیقه و بین ۰ تا ۷۰۸۰ است.';
  const hour = int(draft.defaultHourTehran);
  if (hour === null || hour < 0 || hour > 23)
    errors.defaultHourTehran = 'ساعت پیش‌فرض بین ۰ تا ۲۳ است.';
  const ttl = int(draft.decisionTtlDays);
  if (ttl === null || ttl < 1 || ttl > 180)
    errors.decisionTtlDays = 'مدت نگه‌داشتن دلایل بین ۱ تا ۱۸۰ روز است.';
  const pct = int(draft.failureAlertPct);
  if (pct === null || pct < 1 || pct > 100)
    errors.failureAlertPct = 'آستانه هشدار شکست بین ۱ تا ۱۰۰ درصد است.';
  return errors;
}

export function settingsFromDraft(draft: CapDraft, base: AutomationSettings): AutomationSettings {
  const n = (v: string, fallback: number) => {
    const t = v.trim().replace(/[^\d-]/g, '');
    const parsed = t ? Number(t) : Number.NaN;
    return Number.isInteger(parsed) ? parsed : fallback;
  };
  return {
    ...base,
    maxPerUserPerDay: n(draft.maxPerUserPerDay, base.maxPerUserPerDay),
    maxPerUserPerWeek: n(draft.maxPerUserPerWeek, base.maxPerUserPerWeek),
    minGapMs: Math.max(0, n(draft.gapMinutes, Math.round(base.minGapMs / 60_000))) * 60_000,
    defaultHourTehran: n(draft.defaultHourTehran, base.defaultHourTehran),
    decisionTtlDays: n(draft.decisionTtlDays, base.decisionTtlDays),
    failureAlertPct: n(draft.failureAlertPct, base.failureAlertPct),
  };
}

export interface HealthItem {
  id: 'scheduler' | 'provider' | 'volume' | 'failures';
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

/**
 * The three facts the panel must never let an admin guess: is the scheduler alive, is Push configured
 * at all, and is anything failing. Every value comes from `GET /admin/system-health` (PR0).
 */
export function healthItems(health: SystemHealth, settings: AutomationSettings): HealthItem[] {
  const { cron, push } = health;
  const scheduler: HealthItem = cron.neverReported
    ? {
        id: 'scheduler',
        label: 'زمان‌بندی سامانه',
        value: 'گزارشی نرسانده است',
        detail:
          'هیچ اجرای زمان‌بندی‌شده‌ای ثبت نشده است؛ یعنی Cron Trigger روی سرویس فعال نیست یا هنوز ارجاعی نخورده.',
        tone: 'danger',
      }
    : cron.stalled
      ? {
          id: 'scheduler',
          label: 'زمان‌بندی سامانه',
          value: `${faNum(cron.minutesSinceLastRun ?? 0)} دقیقه است اجرا نشده`,
          detail:
            'بیش از ۳۰ دقیقه از آخرین اجرا گذشته است؛ اتوماسیون‌ها در پنجره خودشان بررسی می‌شوند.',
          tone: 'warning',
        }
      : {
          id: 'scheduler',
          label: 'زمان‌بندی سامانه',
          value: 'فعال',
          detail: `هر ${faNum(15)} دقیقه یک‌بار اجرا می‌شود.`,
          tone: 'success',
        };
  const provider: HealthItem = push.configured
    ? {
        id: 'provider',
        label: 'سرویس ارسال',
        value: push.provider,
        detail: 'سرویس ارسال اعلان پیکربندی است.',
        tone: 'success',
      }
    : {
        id: 'provider',
        label: 'سرویس ارسال',
        value: 'پیکربندی‌نشده',
        detail:
          'بدون کلید سرویس، هیچ پوشی نمی‌رود (کارت داخل اپ ساخته می‌شود). سند راه‌اندازی کمپین‌ها را ببینید.',
        tone: 'danger',
      };
  const volume: HealthItem = {
    id: 'volume',
    label: 'پوش امروز',
    value: `${faNum(push.today.sent)} ارسال · ${faNum(push.today.failed)} ناموفق`,
    detail: settings.paused
      ? 'توقف کلی روشن است: هیچ اتوماسیونی اجرا نمی‌شود.'
      : `سقف‌ها: ${capsSummary(settings)}`,
    tone: settings.paused ? 'warning' : 'neutral',
  };
  const rate = push.failureRate;
  const failures: HealthItem =
    rate === null
      ? {
          id: 'failures',
          label: 'نرخ شکست',
          value: 'داده‌ای نیست',
          detail: 'امروز هنوز درخواستی به سرویس ارسال نرفته است.',
          tone: 'neutral',
        }
      : {
          id: 'failures',
          label: 'نرخ شکست',
          value: faPct(rate),
          detail: push.lastError
            ? `آخرین خطا: ${push.lastError}`
            : `آستانه هشدار: ${faNum(settings.failureAlertPct)}٪`,
          tone:
            rate * 100 >= settings.failureAlertPct ? 'danger' : rate > 0 ? 'warning' : 'success',
        };
  return [scheduler, provider, volume, failures];
}

/** Rows the wizard/table can never be tricked by: the destination is shown as a plain internal path. */
export function shortPath(actionRef: string): string {
  return actionRef.replace(/^\//, '') || 'خانه';
}

export const isDeadlineCategory = (row: AutomationRow): boolean => row.category === 'deadlines';
