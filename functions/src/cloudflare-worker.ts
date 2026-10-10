import { runPushCampaigns } from './services/push-campaigns';
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

type FetchHandler = (request: Request) => Promise<Response>;
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
  async fetch(request: Request, env: CloudflareEnv, ctx?: ExecutionContextLike): Promise<Response> {
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
        const res = await handler(request);
        // Admin "send now" only enqueues; drain the queue right after the response is sent so
        // delivery starts immediately instead of waiting for the 15-minute cron. Claims keep it idempotent.
        if (
          ctx &&
          res.ok &&
          request.method === 'POST' &&
          /^\/v1\/admin\/push-campaigns\/[^/]+\/send$/.test(url.pathname)
        )
          ctx.waitUntil(
            getDeps(env ?? {})
              .then((deps) => runPushCampaigns(deps))
              .catch((err) => console.error('[push-campaigns] background run failed', err)),
          );
        return res;
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
