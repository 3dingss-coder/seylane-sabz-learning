import { DeadlineError, withTimeout } from './lib/bounded';
import { D1_INIT_TIMEOUT_MS, type D1Database } from './store/d1';
import { buildCloudflareDeps, createFetchHandler, type CloudflareEnv } from './web-handler';
import { runCron } from './services/cron';
import type { Deps } from './services/context';
import type { Data } from './store/types';
import seedSnapshotJson from '../lib/seed-snapshot.json';

const seedSnapshot = seedSnapshotJson as unknown as Record<string, Record<string, Data>>;

/** The two Cron Trigger globals, declared locally — the project ships no @cloudflare/workers-types. */
interface CronTriggerEvent {
  /** The cron expression from `[triggers] crons`, e.g. "0 * * * *". */
  cron: string;
  scheduledTime: number;
  noRetry?: boolean;
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

let cachedDeps: Promise<Deps> | null = null;
let cachedDb: D1Database | undefined;

function clearDepsIfCurrent(work: Promise<Deps>): void {
  if (cachedDeps !== work) return;
  cachedDeps = null;
  cachedDb = undefined;
  if (cachedHandler?.deps === work) cachedHandler = null;
}

/** Deps (store + services) are built once per isolate and reused by the fetch and cron entrypoints. */
function getDepsWork(env: CloudflareEnv): Promise<Deps> {
  const db = env.DB && typeof env.DB.prepare === 'function' ? env.DB : undefined;
  if (!cachedDeps || cachedDb !== db) {
    const work = buildCloudflareDeps(env, seedSnapshot);
    cachedDb = db;
    cachedDeps = work;
    void work.catch(() => clearDepsIfCurrent(work));
  }
  return cachedDeps;
}

/** Each request owns its startup deadline; timing out one waiter does not cancel shared startup. */
function getDeps(env: CloudflareEnv): Promise<Deps> {
  const work = getDepsWork(env);
  return withTimeout(work, D1_INIT_TIMEOUT_MS, 'Cloudflare Worker startup').catch((err) => {
    if (err instanceof DeadlineError) clearDepsIfCurrent(work);
    throw err;
  });
}

type FetchHandler = (request: Request) => Promise<Response>;
let cachedHandler: { deps: Promise<Deps>; handler: Promise<FetchHandler> } | null = null;

/**
 * The router and its rate limiter are built once per isolate (not per request), so route setup
 * is not repeated and the in-memory rate limits actually accumulate across requests.
 */
function getHandler(env: CloudflareEnv): Promise<FetchHandler> {
  const deps = getDepsWork(env);
  if (!cachedHandler || cachedHandler.deps !== deps) {
    const handler = deps.then((d) => createFetchHandler(d));
    cachedHandler = { deps, handler };
    void handler.catch(() => {
      if (cachedHandler?.handler === handler) cachedHandler = null;
      clearDepsIfCurrent(deps);
    });
  }
  const handler = cachedHandler.handler;
  return withTimeout(handler, D1_INIT_TIMEOUT_MS, 'Cloudflare Worker handler startup').catch(
    (err) => {
      if (err instanceof DeadlineError) {
        if (cachedHandler?.handler === handler) cachedHandler = null;
        clearDepsIfCurrent(deps);
      }
      throw err;
    },
  );
}

function unavailable(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'INTERNAL',
        message: 'سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
      },
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '2' },
    },
  );
}

function logFailure(phase: 'startup' | 'request', request: Request, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'cloudflare-worker failure',
      phase,
      method: request.method,
      path: new URL(request.url).pathname,
      name: e.name,
      error: e.message.slice(0, 500),
      stack: (e.stack ?? '').split('\n').slice(0, 4).join(' | '),
    }),
  );
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
      let handler: FetchHandler;
      try {
        handler = await getHandler(env ?? {});
      } catch (err) {
        logFailure('startup', request, err);
        return unavailable();
      }
      try {
        return await handler(request);
      } catch (err) {
        logFailure('request', request, err);
        return unavailable();
      }
    }

    // Serve static frontend assets (when deployed as a Cloudflare Worker with Static Assets)
    if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) return assetRes;
      // SPA fallback for extensionless GET routes
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        !/\.[a-z0-9]+$/i.test(url.pathname)
      ) {
        return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
      }
      return assetRes;
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Cloudflare Cron Triggers (`[triggers] crons` in wrangler.toml). Without this handler none of
   * the reminder / deadline / digest jobs run on the deployed Worker, so nothing the admin
   * configures under «سیاست‌ها» ever reaches a marketer's phone.
   */
  async scheduled(
    event: CronTriggerEvent,
    env: CloudflareEnv,
    ctx: ExecutionContextLike,
  ): Promise<void> {
    ctx.waitUntil(
      getDeps(env ?? {})
        .then((deps) => runCron(deps, event.cron))
        .then((r) => console.info('[cron]', JSON.stringify(r)))
        .catch((err) => console.error('[cron] startup/run failed', err)),
    );
  },
};
