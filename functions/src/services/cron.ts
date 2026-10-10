import { runDeadlineSweep, runDailyReminders, runWeeklyDigest } from './jobs';
import { runMentorDaily } from './mentor-rules';
import { runBehaviorSweep } from './behavior';
import { rebuildKnowledgeIndex } from './knowledge';
import { extractPendingMedia } from './media-ingest';
import { invalidateIndexCache } from './retrieval';
import { flushDeferredPush } from './notify';
import { runPushCampaigns } from './push-campaigns';
import type { Deps } from './context';
import { purgeExpiredEvents } from './retention';

export type JobName =
  | 'flush-push'
  | 'deadline-sweep'
  | 'weekly-digest'
  | 'daily-reminders'
  | 'mentor-daily'
  | 'knowledge-reindex'
  | 'migrate-blobs'
  | 'push-campaigns'
  | 'purge-expired';

export interface JobOptions {
  /** Manual triggers ignore the "only at this weekday/hour" gates (the weekly digest). */
  force?: boolean;
  /** Epoch-ms after which a job must not START another unit of work (cron invocations only). */
  deadlineAtMs?: number | null;
}

/**
 * Cloudflare ends a Cron Trigger invocation after 15 minutes of wall time ("exceededWallTime").
 * Jobs stop starting new work after the budget, and a hard backstop ends the invocation earlier
 * than the platform would, so the failure is logged with the job name. Provisional values: no
 * production duration data was available; tune from the `[cron]` log line (`totalMs`, per job).
 */
export const CRON_BUDGET_MS = 10 * 60_000;
export const CRON_HARD_LIMIT_MS = 13 * 60_000;

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
  'knowledge-reindex': async (d, o) => {
    // 1) Read any media that is new or was produced by an older extractor (bounded per run).
    //    A failure here must not stop step 2 (it used to: one bad asset froze the whole index), but
    //    it is still reported: after the index is rebuilt the error is re-thrown so the job fails.
    let extraction: unknown = null;
    let extractionError: unknown = null;
    try {
      extraction = await extractPendingMedia(d, { deadlineAtMs: o?.deadlineAtMs ?? null });
    } catch (e) {
      extractionError = e;
      console.error(`[cron:knowledge-reindex] extraction failed ${describeError(e)}`);
    }
    // 2) Re-index changed knowledge items (only new/changed ones are embedded).
    const result = await rebuildKnowledgeIndex(d);
    invalidateIndexCache(d);
    if (extractionError) throw extractionError;
    return { ...result, extraction };
  },
  // Moves files stored in D1 into R2 (a few verified files per run; a no-op once D1 is empty or
  // when no R2 bucket is bound).
  'migrate-blobs': async (d) => (await d.blob.migrateToObjectStorage?.()) ?? { skipped: true },
  // Admin push campaigns: starts due scheduled campaigns and sends pending batches (budgeted).
  'push-campaigns': (d) => runPushCampaigns(d),
  // Event logs carry an `expireAt` (a Firestore-TTL leftover) that nothing enforced on D1, so they only
  // ever grew. Deletes expired rows of the two high-volume logs, in bounded batches.
  'purge-expired': (d, o) => purgeExpiredEvents(d, o?.deadlineAtMs ?? null),
};

export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export const isJobName = (v: string): v is JobName => (JOB_NAMES as string[]).includes(v);

export function runJob(d: Deps, name: JobName, o: JobOptions = {}): Promise<unknown> {
  return JOBS[name](d, o);
}

// Cloudflare Cron Triggers fire in UTC (Iran has no DST any more: Asia/Tehran = UTC+03:30 all
// year), so the Tehran wall-clock times of spec §26 are converted here:
//   every 15 min   → web push deferred by quiet hours + scheduled push campaigns + blob migration
//   hourly         → deadline sweep + weekly digest (the digest checks its own policy slot) + knowledge-reindex
//                    (reads up to 8 new media files per run, re-indexes only what changed)
//   08:00 Tehran   → mentor daily nudges + behaviour sweep + knowledge reindex
//   10:00 Tehran   → inactivity reminders
// Keep this map and `[triggers] crons` in wrangler.toml in sync (guarded by cron.test.ts).
export const CRON_JOBS: Record<string, JobName[]> = {
  '*/15 * * * *': ['flush-push', 'push-campaigns', 'migrate-blobs'],
  // knowledge-reindex rescans every knowledge item and media row (D1 is single-threaded); it took
  // 12-23 s per run in production logs and slowed learners' requests. Hourly is plenty; admins can
  // run it on demand via POST /v1/admin/jobs/knowledge-reindex.
  '0 * * * *': ['deadline-sweep', 'weekly-digest', 'knowledge-reindex'],
  '30 4 * * *': ['mentor-daily'],
  '30 6 * * *': ['daily-reminders'],
  '0 22 * * *': ['purge-expired'], // 01:30 Tehran, the quietest hour
};

export const CRON_SCHEDULES = Object.keys(CRON_JOBS);

export interface CronResult {
  cron: string;
  jobs: Record<string, { ok: boolean; error?: string; result?: unknown }>;
}

/** Workers drops an Error's message when it is passed as an object; log the details as text. */
export function describeError(e: unknown): string {
  if (e instanceof Error) {
    const cause = e.cause instanceof Error ? e.cause.message : e.cause;
    return JSON.stringify({
      name: e.name,
      message: e.message,
      cause: cause === undefined ? undefined : String(cause),
      stack: e.stack?.split('\n').slice(0, 6).join(' | '),
    });
  }
  return JSON.stringify({ thrown: String(e).slice(0, 500) });
}

/**
 * Runs every job bound to a cron expression. One failing job never blocks the others. Once the
 * budget is spent, jobs that have not started are skipped (and reported as failed) rather than
 * being started and killed by the platform.
 */
export async function runCron(
  d: Deps,
  cron: string,
  opts: { deadlineAtMs?: number | null } = {},
): Promise<CronResult> {
  const names = CRON_JOBS[cron] ?? [];
  const jobs: CronResult['jobs'] = {};
  const deadlineAtMs = opts.deadlineAtMs ?? null;
  for (const name of names) {
    if (deadlineAtMs !== null && Date.now() >= deadlineAtMs) {
      jobs[name] = { ok: false, error: 'skipped: cron time budget exhausted' };
      console.error(`[cron:${name}] skipped: cron time budget exhausted`);
      continue;
    }
    const started = Date.now();
    try {
      jobs[name] = { ok: true, result: await runJob(d, name, { deadlineAtMs }) };
    } catch (e) {
      jobs[name] = { ok: false, error: (e as Error).message?.slice(0, 300) ?? 'failed' };
      console.error(`[cron:${name}] failed after ${Date.now() - started}ms ${describeError(e)}`);
    }
  }
  return { cron, jobs };
}
