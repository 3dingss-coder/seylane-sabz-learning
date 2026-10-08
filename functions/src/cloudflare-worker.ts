import { buildCloudflareDeps, createFetchHandler, type CloudflareEnv } from './web-handler';
import { DeadlineError, withTimeout } from './lib/bounded';
import { randomBytesBase64Url } from './lib/crypto';
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

/**
 * Whole-request ceiling for the progress heartbeat. It sits above one D1 call (15s) so a single
 * slow call is reported by the store first, and below what a client would wait. Provisional: tune
 * it from the `progress` log lines. Only this route is capped: uploads, media streaming and AI
 * calls legitimately run longer and keep their own limits.
 */
export const PROGRESS_BUDGET_MS = 25_000;
/**
 * How long one request waits for the shared startup promise before it gives up and retries fresh.
 * It is above the store's own init limit (30s) so a slow-but-alive init is judged by that limit,
 * and this one only catches a startup whose starting request was cancelled.
 */
export const STARTUP_WAIT_MS = 35_000;

/** Budget for a request, or null when the route has no whole-request cap. */
export function requestBudgetMs(method: string, pathname: string): number | null {
  if (method === 'POST' && /^\/v1\/me\/sections\/[^/]+\/progress\/?$/.test(pathname)) {
    return PROGRESS_BUDGET_MS;
  }
  return null;
}

let cachedDeps: Promise<Deps> | null = null;
let cachedHasD1: boolean | null = null;

/** Deps (store + services) are built once per isolate and reused by the fetch and cron entrypoints. */
function getDeps(env: CloudflareEnv): Promise<Deps> {
  const hasD1 = Boolean(env.DB && typeof env.DB.prepare === 'function');
  if (!cachedDeps || cachedHasD1 !== hasD1) {
    cachedHasD1 = hasD1;
    cachedDeps = buildCloudflareDeps(env, seedSnapshot).catch((err) => {
      cachedDeps = null;
      throw err;
    });
  }
  return cachedDeps;
}

type FetchHandler = (request: Request, requestId?: string) => Promise<Response>;
let cachedHandler: { deps: Promise<Deps>; handler: Promise<FetchHandler> } | null = null;

/**
 * The router and its rate limiter are built once per isolate (not per request), so route setup
 * is not repeated and the in-memory rate limits actually accumulate across requests.
 */
function getHandler(env: CloudflareEnv): Promise<FetchHandler> {
  const deps = getDeps(env);
  if (!cachedHandler || cachedHandler.deps !== deps) {
    const handler = deps.then((d) => createFetchHandler(d));
    cachedHandler = { deps, handler };
    handler.catch(() => {
      if (cachedHandler?.handler === handler) cachedHandler = null;
      cachedDeps = null;
    });
  }
  return cachedHandler.handler;
}

function unavailable(requestId?: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'INTERNAL',
        message: 'سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
      },
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': '2',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
    },
  );
}

/** Correlation ID: Cloudflare's ray ID when present (so it matches the dashboard), else random. */
function requestIdFor(request: Request): string {
  return request.headers.get('cf-ray') ?? randomBytesBase64Url(9);
}

function withRequestId(res: Response, requestId: string): Response {
  if (res.headers.has('X-Request-Id')) return res;
  const out = new Response(res.body, res);
  out.headers.set('X-Request-Id', requestId);
  return out;
}

function logFailure(
  phase: 'startup' | 'request',
  request: Request,
  err: unknown,
  requestId?: string,
): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'cloudflare-worker failure',
      requestId: requestId ?? null,
      timeout: err instanceof DeadlineError,
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
      const requestId = requestIdFor(request);
      let handler: FetchHandler;
      try {
        // The startup promise is shared by every request in the isolate. Wait for it with a timer
        // of this request's own: if the request that started it was cancelled it never settles.
        handler = await withTimeout(getHandler(env ?? {}), STARTUP_WAIT_MS, 'worker startup');
      } catch (err) {
        cachedHandler = null;
        cachedDeps = null;
        logFailure('startup', request, err, requestId);
        return unavailable(requestId);
      }
      try {
        // Every request ends as a response, a controlled error, or a controlled timeout.
        const budget = requestBudgetMs(request.method, url.pathname);
        const pending = handler(request, requestId);
        const res = budget === null ? await pending : await withTimeout(pending, budget, 'request');
        return withRequestId(res, requestId);
      } catch (err) {
        logFailure('request', request, err, requestId);
        return unavailable(requestId);
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
