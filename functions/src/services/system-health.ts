import { dayKey } from '../lib/time';
import { audit, type Actor, type Deps } from './context';

/**
 * System health (بهداشت سیستم).
 *
 * Before this module, the only trace of a cron run was a `console.info` line in Workers Logs
 * (`services/cron.ts` + `cloudflare-worker.ts`), so an admin had no way to answer "did the
 * scheduler run at all?" or "is Push even configured?" without opening the Cloudflare dashboard.
 * Everything here is ONE small document per run — never per user — so the cost is constant:
 *
 *  • `system_health/cron`        — last run of every cron expression, with per-job status.
 *  • `system_health/push`        — provider identity (fcm / unconfigured / recording) + last error.
 *  • `system_health/push/<day>`  — aggregate send counters for the day (rate alerts read this).
 *
 * No secret value is ever stored: `describe()` on a PushSender reports only the provider name and
 * whether it is configured.
 */

export const CRON_HEALTH = 'system_health/cron';
export const PUSH_HEALTH = 'system_health/push';
export const PUSH_DAY_PREFIX = 'system_health/push';
/** How many daily push counters are kept inside the health document. */
export const PUSH_DAY_WINDOW = 8;

export interface CronJobHealth {
  name: string;
  ok: boolean;
  error: string | null;
}

export interface CronHealth {
  /** The cron expression of the most recent run. */
  cron: string;
  lastRunAt: string;
  ok: boolean;
  error: string | null;
  jobs: CronJobHealth[];
  /** dayKey(timezone) → number of runs on that day (bounded window, for "cron stalled"). */
  runs: Record<string, number>;
}

export interface PushDayCount {
  sent: number;
  failed: number;
  invalid: number;
}

export interface PushHealth {
  provider: 'fcm' | 'unconfigured' | 'recording' | 'unknown';
  configured: boolean;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** Day-keyed aggregate counters (no PII, no tokens). */
  days: Record<string, PushDayCount>;
  updatedAt: string;
}

export interface PushOutcome {
  sent: number;
  failed: number;
  invalid: number;
  error?: string | null;
}

/** Keeps only the newest `keep` keys (day keys sort lexicographically) — no dynamic `delete`. */
function trimWindow<T>(days: Record<string, T>, keep: number): Record<string, T> {
  const keys = Object.keys(days).sort();
  const wanted = keys.slice(Math.max(0, keys.length - keep));
  const out: Record<string, T> = {};
  for (const k of wanted) out[k] = days[k] as T;
  return out;
}

/**
 * Mirrors `sanitizeError` of the campaign studio: anything that looks like a device token or a key
 * is replaced before it reaches a health document (rule: no PII, no token, no secret in reports).
 */
export function redact(raw: string): string {
  return raw.replace(/[A-Za-z0-9_\-:.]{40,}/g, '[hidden]').slice(0, 200);
}

/** `system_health/push/<dayKey>` — one document per day, incremented once per run. */
export function pushDayPath(day: string): string {
  return `${PUSH_DAY_PREFIX}/${day}`;
}

/** The provider behind `Deps.push`, without importing any provider module (no cycles). */
export function describePushSender(d: Deps): {
  provider: PushHealth['provider'];
  configured: boolean;
} {
  const describe = (
    d.push as { describe?: () => { provider: string; configured: boolean } }
  )?.describe?.();
  if (!describe) return { provider: 'unknown', configured: true };
  const p = describe.provider;
  return {
    provider: p === 'fcm' || p === 'unconfigured' || p === 'recording' ? p : 'unknown',
    configured: describe.configured,
  };
}

/** Written by the cron handlers (Cloudflare `scheduled` and `runCron` both call it). */
export async function recordCronRun(
  d: Deps,
  cron: string,
  jobs: Record<string, { ok: boolean; error?: string }>,
): Promise<void> {
  const tz = 'Asia/Tehran';
  const now = d.clock();
  const prev = await d.store.get<CronHealth>(CRON_HEALTH);
  const today = dayKey(now, tz);
  const runsPrev = { ...(prev?.runs ?? {}) };
  runsPrev[today] = (runsPrev[today] ?? 0) + 1;
  // Keep the window small: only the last PUSH_DAY_WINDOW days matter for "stalled" detection.
  const runs = trimWindow(runsPrev, PUSH_DAY_WINDOW);
  const names = Object.keys(jobs);
  const failed = names.filter((n) => !jobs[n]?.ok);
  const health: CronHealth = {
    cron,
    lastRunAt: now.toISOString(),
    ok: failed.length === 0,
    error: failed.length ? `${failed.join('، ')} ناموفق` : null,
    jobs: names.map((n) => ({ name: n, ok: !!jobs[n]?.ok, error: jobs[n]?.error ?? null })),
    runs,
  };
  await d.store.set(CRON_HEALTH, health as unknown as Record<string, unknown>);
}

export async function readCronHealth(d: Deps): Promise<CronHealth | null> {
  return d.store.get<CronHealth>(CRON_HEALTH);
}

/** Aggregated push counters; called once per delivery run, never per user. */
export async function recordPushOutcome(d: Deps, outcome: PushOutcome): Promise<void> {
  const tz = 'Asia/Tehran';
  const now = d.clock();
  const day = dayKey(now, tz);
  const path = pushDayPath(day);
  const prev = await d.store.get<PushDayCount>(path);
  const next: PushDayCount = {
    sent: (prev?.sent ?? 0) + outcome.sent,
    failed: (prev?.failed ?? 0) + outcome.failed,
    invalid: (prev?.invalid ?? 0) + outcome.invalid,
  };
  await d.store.set(path, next as unknown as Record<string, unknown>);

  const doc = await d.store.get<PushHealth>(PUSH_HEALTH);
  const days = trimWindow({ ...(doc?.days ?? {}), [day]: next }, PUSH_DAY_WINDOW);
  await d.store.set(PUSH_HEALTH, {
    ...describePushSender(d),
    lastAttemptAt: now.toISOString(),
    lastError: outcome.error ? redact(String(outcome.error)) : (doc?.lastError ?? null),
    days,
    updatedAt: now.toISOString(),
  } as unknown as Record<string, unknown>);
}

export async function readPushHealth(d: Deps): Promise<PushHealth> {
  const stored = await d.store.get<PushHealth>(PUSH_HEALTH);
  const tz = 'Asia/Tehran';
  const day = dayKey(d.clock(), tz);
  const today = stored?.days?.[day] ?? (await d.store.get<PushDayCount>(pushDayPath(day)));
  const days = { ...(stored?.days ?? {}) };
  if (today) days[day] = today;
  return {
    ...describePushSender(d),
    lastAttemptAt: stored?.lastAttemptAt ?? null,
    lastError: stored?.lastError ?? null,
    days,
    updatedAt: stored?.updatedAt ?? '',
  };
}

/** Minutes since the last recorded cron run, or null when the scheduler never reported. */
export function cronStalenessMinutes(health: CronHealth | null, now: Date): number | null {
  if (!health?.lastRunAt) return null;
  return Math.max(0, Math.round((now.getTime() - Date.parse(health.lastRunAt)) / 60_000));
}

/** accepted ÷ (accepted + failed) over the last 24 h of counters; null when nothing was tried. */
export function pushFailureRate(health: PushHealth, now: Date, tz = 'Asia/Tehran'): number | null {
  const today = dayKey(now, tz);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), tz);
  let sent = 0;
  let failed = 0;
  for (const [k, v] of Object.entries(health.days ?? {})) {
    if (k === today || k === yesterday) {
      sent += v.sent ?? 0;
      failed += v.failed ?? 0;
    }
  }
  const total = sent + failed;
  return total > 0 ? failed / total : null;
}

/** Admin-facing summary used by the automation panel and the audit trail of a health-check. */
export async function systemHealth(d: Deps) {
  const [cron, push] = await Promise.all([readCronHealth(d), readPushHealth(d)]);
  const now = d.clock();
  const staleMin = cronStalenessMinutes(cron, now);
  return {
    cron: {
      lastRunAt: cron?.lastRunAt ?? null,
      expression: cron?.cron ?? null,
      ok: !!cron?.ok,
      error: cron?.error ?? null,
      jobs: cron?.jobs ?? [],
      /** null = the scheduler has never reported (never deployed, or cron not registered). */
      minutesSinceLastRun: staleMin,
      stalled: staleMin === null || staleMin > 30,
      neverReported: staleMin === null,
    },
    push: {
      provider: push.provider,
      configured: push.configured,
      lastAttemptAt: push.lastAttemptAt,
      lastError: push.lastError,
      today: push.days?.[dayKey(now, 'Asia/Tehran')] ?? { sent: 0, failed: 0, invalid: 0 },
      failureRate: pushFailureRate(push, now),
    },
  };
}

export type SystemHealth = Awaited<ReturnType<typeof systemHealth>>;

/** Manual "run the health check" (also used by tests); records a health audit line. */
export async function runHealthCheck(d: Deps, actor: Actor) {
  const health = await systemHealth(d);
  await audit(d, actor, 'system_health.checked', 'system_health', 'global', null, health);
  return health;
}
