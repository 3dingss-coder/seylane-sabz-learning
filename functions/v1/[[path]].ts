import { buildCloudflareDeps, createFetchHandler, type CloudflareEnv } from '../src/web-handler';
import type { Data } from '../src/store/types';
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

export const onRequest = async (context: {
  request: Request;
  env: CloudflareEnv;
}): Promise<Response> => {
  try {
    const handler = await getHandler(context.env ?? {});
    return await handler(context.request);
  } catch (err) {
    console.error('[cloudflare:api] unhandled startup/request error', err);
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
};
