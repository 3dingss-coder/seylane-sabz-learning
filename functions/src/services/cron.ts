import { runDeadlineSweep, runDailyReminders, runWeeklyDigest } from './jobs';
import { runMentorDaily } from './mentor-rules';
import { flushDeferredPush } from './notify';
import type { Deps } from './context';

export type JobName =
  'flush-push' | 'deadline-sweep' | 'weekly-digest' | 'daily-reminders' | 'mentor-daily';

export interface JobOptions {
  /** Manual triggers ignore the "only at this weekday/hour" gates (the weekly digest). */
  force?: boolean;
}

/** The one job table: cron triggers and `POST /admin/jobs/:name` both run through it. */
export const JOBS: Record<JobName, (d: Deps, o?: JobOptions) => Promise<unknown>> = {
  'flush-push': (d) => flushDeferredPush(d).then((sent) => ({ sent })),
  'deadline-sweep': (d) => runDeadlineSweep(d),
  'weekly-digest': (d, o) => runWeeklyDigest(d, Boolean(o?.force)),
  'daily-reminders': (d) => runDailyReminders(d),
  'mentor-daily': async (d) => ({ nudges: await runMentorDaily(d) }),
};

export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export const isJobName = (v: string): v is JobName => (JOB_NAMES as string[]).includes(v);

export function runJob(d: Deps, name: JobName, o: JobOptions = {}): Promise<unknown> {
  return JOBS[name](d, o);
}

// Cloudflare Cron Triggers fire in UTC (Iran has no DST any more: Asia/Tehran = UTC+03:30 all
// year), so the Tehran wall-clock times of spec §26 are converted here:
//   every 15 min   → web push deferred by quiet hours
//   hourly         → deadline sweep + weekly digest (the digest checks its own policy slot)
//   08:00 Tehran   → mentor daily nudges
//   10:00 Tehran   → inactivity reminders
// Keep this map and `[triggers] crons` in wrangler.toml in sync (guarded by cron.test.ts).
export const CRON_JOBS: Record<string, JobName[]> = {
  '*/15 * * * *': ['flush-push'],
  '0 * * * *': ['deadline-sweep', 'weekly-digest'],
  '30 4 * * *': ['mentor-daily'],
  '30 6 * * *': ['daily-reminders'],
};

export const CRON_SCHEDULES = Object.keys(CRON_JOBS);

export interface CronResult {
  cron: string;
  jobs: Record<string, { ok: boolean; error?: string; result?: unknown }>;
}

/** Runs every job bound to a cron expression. One failing job never blocks the others. */
export async function runCron(d: Deps, cron: string): Promise<CronResult> {
  const names = CRON_JOBS[cron] ?? [];
  const jobs: CronResult['jobs'] = {};
  for (const name of names) {
    try {
      jobs[name] = { ok: true, result: await runJob(d, name) };
    } catch (e) {
      jobs[name] = { ok: false, error: (e as Error).message?.slice(0, 300) ?? 'failed' };
      console.error(`[cron:${name}] failed`, e);
    }
  }
  return { cron, jobs };
}
