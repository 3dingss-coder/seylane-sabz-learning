import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { Express } from 'express';
import { createApp } from './app';
import { loadConfig } from './config';
import { buildFirebaseDeps } from './deps';
import type { Deps } from './services/context';

// Region close to users; max instances keeps free-tier cost bounded (risk R4).
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

let depsPromise: Promise<Deps> | null = null;
let appPromise: Promise<Express> | null = null;
const deps = () => (depsPromise ??= buildFirebaseDeps(loadConfig()));
const app = () => (appPromise ??= deps().then((d) => createApp(d)));

/** HTTPS entrypoint: https://<region>-<project>.cloudfunctions.net/api/v1/... */
export const api = onRequest({ memory: '512MiB', timeoutSeconds: 60 }, async (req, res) => {
  const a = await app();
  a(req, res);
});

const TZ = 'Asia/Tehran';
const job = (schedule: string, name: string, run: (d: Deps) => Promise<unknown>) =>
  onSchedule(
    { schedule, timeZone: TZ, retryCount: 1, memory: '512MiB', timeoutSeconds: 540 },
    async () => {
      const result = await run(await deps());
      console.info(`[job:${name}]`, JSON.stringify(result));
    },
  );

// Spec §26 / PROMPT 011 — all jobs are idempotent (deterministic ids / throttle log).
export const deadlineSweep = job('every 60 minutes', 'deadline-sweep', async (d) =>
  (await import('./services/jobs')).runDeadlineSweep(d),
);
export const dailyReminders = job('0 10 * * *', 'daily-reminders', async (d) =>
  (await import('./services/jobs')).runDailyReminders(d),
);
export const weeklyDigest = job('0 * * * *', 'weekly-digest', async (d) =>
  (await import('./services/jobs')).runWeeklyDigest(d),
);
export const mentorDaily = job('0 8 * * *', 'mentor-daily', async (d) => ({
  nudges: await (await import('./services/mentor-rules')).runMentorDaily(d),
}));
export const flushDeferredPush = job('every 15 minutes', 'flush-push', async (d) => ({
  sent: await (await import('./services/notify')).flushDeferredPush(d),
}));
export const dailyBackup = job('0 3 * * *', 'backup', async () =>
  (await import('./services/backup')).exportFirestore(),
);
