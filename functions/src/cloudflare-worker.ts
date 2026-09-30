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

function getHandler(env: CloudflareEnv): Promise<(request: Request) => Promise<Response>> {
  return getDeps(env)
    .then((deps) => createFetchHandler(deps))
    .catch((err) => {
      cachedDeps = null;
      throw err;
    });
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
      try {
        const handler = await getHandler(env ?? {});
        return await handler(request);
      } catch (err) {
        console.error('[cloudflare:worker] unhandled startup/request error', err);
        return new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL',
              message: 'سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
            },
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          },
        );
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
