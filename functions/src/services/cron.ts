import { runDeadlineSweep, runDailyReminders, runWeeklyDigest } from './jobs';
import { runMentorDaily } from './mentor-rules';
import { runBehaviorSweep } from './behavior';
import { rebuildKnowledgeIndex } from './knowledge';
import { extractPendingMedia } from './media-ingest';
import { invalidateIndexCache } from './retrieval';
import { flushDeferredPush } from './notify';
import type { Deps } from './context';

export type JobName =
  | 'flush-push'
  | 'deadline-sweep'
  | 'weekly-digest'
  | 'daily-reminders'
  | 'mentor-daily'
  | 'knowledge-reindex'
  | 'migrate-blobs';

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
  // Rule-based nudges (legacy path) + the behaviour engine sweep (R1–R6 / B1–B12 interplay).
  'mentor-daily': async (d) => ({
    nudges: await runMentorDaily(d),
    interventions: await runBehaviorSweep(d),
  }),
  // Incremental knowledge index rebuild — only changed items are re-embedded, so on a normal day
  // this costs one embedding batch (or none at all) even on a free tier.
  'knowledge-reindex': async (d) => {
    // 1) Read any media that is new or was produced by an older extractor (bounded per run).
    const extraction = await extractPendingMedia(d);
    // 2) Re-index changed knowledge items (only new/changed ones are embedded).
    const result = await rebuildKnowledgeIndex(d);
    invalidateIndexCache(d);
    return { ...result, extraction };
  },
  // Moves files stored in D1 into R2 (a few verified files per run; a no-op once D1 is empty or
  // when no R2 bucket is bound).
  'migrate-blobs': async (d) => (await d.blob.migrateToObjectStorage?.()) ?? { skipped: true },
};

export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export const isJobName = (v: string): v is JobName => (JOB_NAMES as string[]).includes(v);

export function runJob(d: Deps, name: JobName, o: JobOptions = {}): Promise<unknown> {
  return JOBS[name](d, o);
}

// Cloudflare Cron Triggers fire in UTC (Iran has no DST any more: Asia/Tehran = UTC+03:30 all
// year), so the Tehran wall-clock times of spec §26 are converted here:
//   every 15 min   → web push deferred by quiet hours + knowledge-reindex (reads up to 8 new media
//                    files per run, re-indexes only what changed; zero cost once caught up)
//   hourly         → deadline sweep + weekly digest (the digest checks its own policy slot)
//   08:00 Tehran   → mentor daily nudges + behaviour sweep + knowledge reindex
//   10:00 Tehran   → inactivity reminders
// Keep this map and `[triggers] crons` in wrangler.toml in sync (guarded by cron.test.ts).
export const CRON_JOBS: Record<string, JobName[]> = {
  '*/15 * * * *': ['flush-push', 'knowledge-reindex', 'migrate-blobs'],
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
