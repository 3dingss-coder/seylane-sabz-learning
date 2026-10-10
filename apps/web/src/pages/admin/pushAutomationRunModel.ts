import { toPersianDigits } from '@/lib/digits';
import { faDuration } from '@/lib/format';
import type { RunRow } from './automationWizardModel';
import type { AutomationSettings } from './pushAutomationModel';

/**
 * Pure presentation of `recentRuns()` and `traceUser()`
 * (`functions/src/services/push-automation-admin.ts`) for the two read-only pages
 * `PushAutomationRunsPage` / `PushAutomationTracePage`. Nothing here decides a send and nothing here
 * translates a skip reason: the run rows carry `skippedLabels` and the trace carries `label`, both
 * produced by `skipLabel()` on the server, so a new refusal code cannot appear in the panel as a raw
 * English word (prompt §7: the panel must explain, in Persian).
 */

export type { RunRow };

export type PushStatus = 'none' | 'sent' | 'deferred' | 'skipped' | 'failed';

/** Only what the runs filter needs from `GET /admin/push-automations` (`listAutomations`). */
export interface AutomationListLite {
  rows: Array<{ key: string; name: string; isGate: boolean }>;
}

export interface TraceDecision {
  at: string;
  key: string;
  reason: string;
  label: string;
  detail: string | null;
}

export interface TraceNote {
  at: string;
  title: string;
  body: string;
  key: string | null;
  pushStatus: string;
}

/** `NotificationPrefs` as the trace returns it (`functions/src/domain/types.ts`). */
export interface TracePrefs {
  mutedCategories: string[];
  preferredHour: number | null;
  optIns: Record<string, boolean>;
  updatedAt: string;
}

/** `UserCounter` — already day/week-adjusted by `readCounter()`, so the numbers are today's. */
export interface TraceCounter {
  day: string;
  daySent: number;
  week: string;
  weekSent: number;
  lastAt: string | null;
  keys: Record<string, string>;
}

export interface AutomationTrace {
  userId: string;
  name: string;
  prefs: TracePrefs | null;
  counter: TraceCounter;
  decisions: TraceDecision[];
  notifications: TraceNote[];
}

export const RUN_KIND_LABELS: Record<RunRow['kind'], string> = {
  sweep: 'بررسی دسته‌ای',
  event: 'اتفاق',
  queue: 'صف',
  manual: 'دستی',
};

/** The size selector on the runs page. `200` is the server's own maximum (`runsQuery.limit`). */
export const RUN_LIMITS = [12, 30, 100, 200] as const;

export function runsPath(key: string | null, limit: number): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (key) q.set('key', key);
  return `/admin/push-automations/runs?${q.toString()}`;
}

export const tracePath = (userId: string): string =>
  `/admin/push-automations/trace/${encodeURIComponent(userId)}`;

/** `null` while a run is still going (the row is written before the work starts). */
export function runDurationSec(startedAt: string, finishedAt: string | null): number | null {
  const a = Date.parse(startedAt);
  const b = finishedAt ? Date.parse(finishedAt) : NaN;
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

/**
 * `faDuration` rounds everything to minutes and never says «۰ دقیقه»; for a run that took four
 * seconds that reads as a lie, so the short cases get their own wording.
 */
export function runDurationLabel(startedAt: string, finishedAt: string | null): string {
  const sec = runDurationSec(startedAt, finishedAt);
  if (sec === null) return 'در حال اجرا';
  if (sec < 60) return `${toPersianDigits(sec)} ثانیه`;
  return faDuration(sec);
}

/** «۲۰ بررسی · ۷ ارسال · ۳ رد» — the three numbers an admin scans for. */
export function runTally(run: RunRow): string {
  const n = (x: number) => toPersianDigits(x);
  const skipped = Object.values(run.skipped ?? {}).reduce((a, b) => a + b, 0);
  const failed = run.failed ? ` · ${n(run.failed)} خطا` : '';
  return `${n(run.evaluated)} بررسی · ${n(run.sent)} ارسال · ${n(skipped)} رد${failed}`;
}

/**
 * The skip reasons, biggest first, at most three — the server hands back full Persian sentences
 * (`SKIP_LABELS` in the governor), so the count is written as a prefix and only when it repeats.
 * `''` when there is nothing to say; the caller decides the fallback.
 */
export function skippedSentence(run: RunRow): string {
  const labels = run.skippedLabels ?? [];
  const shown = labels
    .slice(0, 3)
    .map((x) => {
      const text = x.label || x.reason;
      return x.count > 1 ? `${toPersianDigits(x.count)} مورد: ${text}` : text;
    })
    .join(' · ');
  const more = labels.length - 3;
  return more > 0 ? `${shown} · +${toPersianDigits(more)} دلیل دیگر` : shown;
}

export const PUSH_STATUS_META: Record<
  PushStatus,
  { tone: 'success' | 'info' | 'warning' | 'neutral'; label: string }
> = {
  sent: { tone: 'success', label: 'پوش ارسال شد' },
  deferred: { tone: 'info', label: 'در انتظار ساعت مجاز' },
  skipped: { tone: 'warning', label: 'پوش انجام نشد' },
  failed: { tone: 'warning', label: 'ارسال پوش شکست خورد' },
  none: { tone: 'neutral', label: 'فقط داخل اپ' },
};

export const pushStatusMeta = (
  status: string,
): { tone: 'success' | 'info' | 'warning' | 'neutral'; label: string } =>
  status in PUSH_STATUS_META
    ? PUSH_STATUS_META[status as PushStatus]
    : { tone: 'neutral', label: status || '—' };

/** The user's share of the global caps, as one sentence. */
export function capSentence(counter: TraceCounter, settings: AutomationSettings): string {
  const n = (x: number) => toPersianDigits(x);
  const day = `${n(counter.daySent)} از ${n(settings.maxPerUserPerDay)}`;
  const week = `${n(counter.weekSent)} از ${n(settings.maxPerUserPerWeek)}`;
  return `امروز ${day} · این هفته ${week}`;
}

/** «۲ دسته خاموش: مهلت‌ها، آزمون‌ها» or the honest «no choice made». */
export function prefsSentence(
  prefs: TracePrefs | null,
  categories: Array<{ id: string; label: string }>,
): string {
  if (!prefs) return 'هیچ انتخاب شخصی ثبت نکرده؛ همان سیاست عمومی جاری است.';
  const labelOf = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const parts: string[] = [];
  if (prefs.mutedCategories.length)
    parts.push(`خاموش: ${prefs.mutedCategories.map(labelOf).join('، ')}`);
  const optIns = Object.entries(prefs.optIns ?? {}).filter(([, on]) => on);
  if (optIns.length) parts.push(`با رضایت: ${optIns.map(([k]) => k).join('، ')}`);
  if (!parts.length) parts.push('همه دسته‌ها روشن');
  return parts.join(' · ');
}

/** Which rules already have a «sent» of their own for this person (cooldown / sendOnce). */
export function sentKeys(counter: TraceCounter): Array<{ key: string; at: string }> {
  return Object.entries(counter.keys ?? {})
    .map(([key, at]) => ({ key, at }))
    .sort((x, y) => y.at.localeCompare(x.at));
}

/** Case- and digit-insensitive filter for the user picker (the app accepts Persian or Latin digits). */
export function filterUsers<T extends { id: string; name: string; phone: string | null }>(
  users: T[],
  q: string,
  limit = 40,
): T[] {
  const needle = toPersianDigits(q.trim()).replace(/\s+/g, ' ');
  if (!needle) return users.slice(0, limit);
  return users
    .filter((u) => {
      const hay = `${u.name} ${u.phone ?? ''}`;
      return toPersianDigits(hay).includes(needle);
    })
    .slice(0, limit);
}
