import { buildCloudflareDeps, createFetchHandler, type CloudflareEnv } from './web-handler';
import type { Data } from './store/types';
import seedSnapshotJson from '../lib/seed-snapshot.json';

const seedSnapshot = seedSnapshotJson as unknown as Record<string, Record<string, Data>>;

let cachedHandler: Promise<(request: Request) => Promise<Response>> | null = null;
let cachedHasD1: boolean | null = null;

function getHandler(env: CloudflareEnv): Promise<(request: Request) => Promise<Response>> {
  const hasD1 = Boolean(env.DB && typeof env.DB.prepare === 'function');
  if (!cachedHandler || cachedHasD1 !== hasD1) {
    cachedHasD1 = hasD1;
    cachedHandler = buildCloudflareDeps(env, seedSnapshot)
      .then((deps) => createFetchHandler(deps))
      .catch((err) => {
        cachedHandler = null;
        throw err;
      });
  }
  return cachedHandler;
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
};
