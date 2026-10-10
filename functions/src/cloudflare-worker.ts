import { runPushCampaigns } from './services/push-campaigns';
import {
  buildCloudflareDeps,
  createFetchHandler,
  type CloudflareEnv,
  type RequestContext,
} from './web-handler';
import { DeadlineError, withTimeout } from './lib/bounded';
import { randomBytesBase64Url } from './lib/crypto';
import { CRON_BUDGET_MS, runCron } from './services/cron';
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
 * Deadline for the progress heartbeat. It is NOT a race around the handler (a race cannot cancel the
 * handler, so a timed-out request could still commit afterwards). It is passed into the workflow,
 * which checks it before starting each new read or write; once it has passed, nothing further is
 * started. A commit already sent to D1 is bounded by the store's own per-call limit and its outcome is
 * reported as unknown; the client's retry is safe because the write is idempotent (see learning.ts).
 * Only this route is bounded: uploads, media streaming and AI calls keep their own limits.
 */
export const PROGRESS_BUDGET_MS = 25_000;
/** How long ONE caller waits for the shared startup before giving up. Each caller owns its own timer. */
export const STARTUP_WAIT_MS = 35_000;

/** Deadline (epoch ms) for a request, or null when the route has none. */
export function progressDeadlineMs(
  method: string,
  pathname: string,
  now: number = Date.now(),
): number | null {
  if (method === 'POST' && /^\/v1\/me\/sections\/[^/]+\/progress\/?$/.test(pathname)) {
    return now + PROGRESS_BUDGET_MS;
  }
  return null;
}

type FetchHandler = (request: Request, rctx?: RequestContext) => Promise<Response>;
interface Runtime {
  deps: Deps;
  handler: FetchHandler;
}
interface Startup {
  hasD1: boolean;
  promise: Promise<Runtime>;
}

/**
 * The single startup mechanism for fetch AND scheduled. One shared promise per isolate builds deps
 * and the router. If the request that started it is cancelled the promise may never settle, so no
 * caller waits on it unbounded: each waits with its own timer, and on failure drops the startup only
 * if it is still the current one (identity guard), so a late result from an abandoned startup can
 * never clear or overwrite a newer one.
 */
let starting: Startup | null = null;

export function resetRuntimeForTests(): void {
  starting = null;
}

function startRuntime(env: CloudflareEnv): Startup {
  const hasD1 = Boolean(env.DB && typeof env.DB.prepare === 'function');
  const promise = buildCloudflareDeps(env, seedSnapshot).then((deps) => ({
    deps,
    handler: createFetchHandler(deps),
  }));
  const startup: Startup = { hasD1, promise };
  // A failed startup must not stay cached; clear only if still current.
  promise.catch(() => {
    if (starting === startup) starting = null;
  });
  return startup;
}

export async function acquireRuntime(
  env: CloudflareEnv,
  opts: { waitMs?: number; attempts?: number } = {},
): Promise<Runtime> {
  const waitMs = opts.waitMs ?? STARTUP_WAIT_MS;
  const attempts = opts.attempts ?? 1;
  const hasD1 = Boolean(env.DB && typeof env.DB.prepare === 'function');
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (!starting || starting.hasD1 !== hasD1) starting = startRuntime(env);
    const mine = starting;
    try {
      return await withTimeout(mine.promise, waitMs, 'worker startup');
    } catch (err) {
      lastErr = err;
      if (starting === mine) starting = null;
    }
  }
  throw lastErr;
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
  async fetch(request: Request, env: CloudflareEnv, ctx?: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
      const requestId = requestIdFor(request);
      let runtime: Runtime;
      try {
        runtime = await acquireRuntime(env ?? {});
      } catch (err) {
        logFailure('startup', request, err, requestId);
        return unavailable(requestId);
      }
      try {
        const res = await runtime.handler(request, {
          requestId,
          deadlineAtMs: progressDeadlineMs(request.method, url.pathname),
        });
        // Admin "send now" only enqueues; drain the queue right after the response is sent so
        // delivery starts immediately instead of waiting for the 15-minute cron. Claims keep it
        // idempotent. Uses the already-acquired runtime (no further wait on the shared startup).
        if (
          ctx &&
          res.ok &&
          request.method === 'POST' &&
          /^\/v1\/admin\/push-campaigns\/[^/]+\/send$/.test(url.pathname)
        )
          ctx.waitUntil(
            runPushCampaigns(runtime.deps).catch((err) =>
              console.error('[push-campaigns] background run failed', err),
            ),
          );
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
    void ctx;
    const startedAt = Date.now();
    // Startup is bounded per caller like fetch; cron may retry once because nobody is waiting on it.
    const runtime = await acquireRuntime(env ?? {}, { attempts: 2 });
    const result = await runCron(runtime.deps, event.cron, {
      deadlineAtMs: startedAt + CRON_BUDGET_MS,
    });
    console.info('[cron]', JSON.stringify(result));
    const failed = Object.entries(result.jobs).filter(([, j]) => !j.ok);
    // Fail the invocation so it shows as an error in the dashboard instead of a silent success.
    if (failed.length) throw new Error(`cron jobs failed: ${failed.map(([n]) => n).join(',')}`);
  },
};
