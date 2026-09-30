import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { Express } from 'express';
import { createApp } from './app';
import { loadConfig } from './config';
import { buildFirebaseDeps } from './deps';
import type { JobName } from './services/cron';
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
const job = (schedule: string, name: JobName | 'backup', run: (d: Deps) => Promise<unknown>) =>
  onSchedule(
    { schedule, timeZone: TZ, retryCount: 1, memory: '512MiB', timeoutSeconds: 540 },
    async () => {
      const result = await run(await deps());
      console.info(`[job:${name}]`, JSON.stringify(result));
    },
  );

// Spec §26 / PROMPT 011 — all jobs are idempotent (deterministic ids / throttle log) and come
// from the same table the Cloudflare cron triggers dispatch (services/cron.ts), so a job cannot
// behave differently on one platform than on the other.
const shared = () => import('./services/cron');
const scheduled = (schedule: string, name: JobName) =>
  job(schedule, name, async (d) => (await shared()).runJob(d, name));

export const deadlineSweep = scheduled('every 60 minutes', 'deadline-sweep');
export const dailyReminders = scheduled('0 10 * * *', 'daily-reminders');
export const weeklyDigest = scheduled('0 * * * *', 'weekly-digest');
export const mentorDaily = scheduled('0 8 * * *', 'mentor-daily');
export const flushDeferredPush = scheduled('every 15 minutes', 'flush-push');
export const dailyBackup = job('0 3 * * *', 'backup', async () =>
  (await import('./services/backup')).exportFirestore(),
);
