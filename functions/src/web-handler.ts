import { MemoryAuthProvider } from './auth/memory';
import { CloudflareBlobStore, type R2BucketLike } from './blob/cloudflare';
import { loadConfig, type AppConfig } from './config';
import { authenticate } from './http/auth';
import { ApiError, toErrorBody } from './http/errors';
import { RateLimiter, rateLimit } from './http/rateLimit';
import { D1RateLimitStore } from './http/rateLimitD1';
import { Router } from './http/router';
import { randomBytesBase64Url, utf8ByteLength } from './lib/crypto';
import { systemClock } from './lib/time';
import { GeminiClient } from './llm/gemini';
import { DisabledMailer } from './mail/types';
import { FcmHttpPushSender, parseServiceAccount } from './push/fcm-http';
import { DisabledPushSender, type PushSender } from './push/types';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { managerRouter } from './routes/manager';
import { meRouter } from './routes/me';
import type { Deps } from './services/context';
import { D1Store, type D1Database } from './store/d1';
import { InMemoryStore } from './store/helpers';
import { StoreConflictError, type Data, type DocStore } from './store/types';

export interface CloudflareEnv {
  DB?: D1Database;
  MEDIA_BUCKET?: R2BucketLike;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  APP_ENV?: string;
  APP_VERSION?: string;
  ALLOWED_ORIGINS?: string;
  LOCAL_AUTH_SECRET?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  APP_URL?: string;
  PLAYBACK_BUDGET?: string;
  RATE_LIMIT_SCALE?: string;
  [key: string]: unknown;
}

export async function resolveSigningSecret(store: DocStore, envSecret?: string): Promise<string> {
  if (envSecret && envSecret.trim().length >= 16) return envSecret.trim();
  const key = '_system/auth_secret';
  const readStoredSecret = async (): Promise<string | null> => {
    const record = await store.get<{ value: string }>(key);
    if (!record) return null;
    if (typeof record.value !== 'string' || record.value.trim().length < 16) {
      throw new Error(
        'Stored local auth signing secret is invalid; refusing to use an unstable key.',
      );
    }
    return record.value.trim();
  };

  const existing = await readStoredSecret();
  if (existing) return existing;

  const generated = randomBytesBase64Url(48);
  try {
    await store.create(key, { value: generated, createdAt: new Date().toISOString() });
    return generated;
  } catch (err) {
    // Only an explicit uniqueness conflict means another isolate initialized the stable key.
    // Timeouts and storage failures have unknown commit outcomes and must not use a local fallback.
    if (!(err instanceof StoreConflictError)) throw err;
  }

  const saved = await readStoredSecret();
  if (!saved)
    throw new Error('Concurrent local auth signing secret creation was not visible in storage.');
  return saved;
}

/**
 * Builds Cloudflare dependencies. Production fails closed when D1 is absent; in-memory fallback is
 * limited to explicitly non-production previews/local runs.
 */
export async function buildCloudflareDeps(
  env: CloudflareEnv,
  seedSnapshot?: Record<string, Record<string, Data>>,
): Promise<Deps> {
  const stringEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') stringEnv[k] = v;
  }
  const db = env.DB && typeof env.DB.prepare === 'function' ? env.DB : undefined;
  const requestedEnv = stringEnv.APP_ENV ?? 'dev';
  const config = loadConfig({
    ...stringEnv,
    DATA_BACKEND: db ? 'd1' : 'memory',
    APP_ENV: requestedEnv,
    PLAYBACK_BUDGET: stringEnv.PLAYBACK_BUDGET ?? (requestedEnv === 'prod' ? 'on' : 'off'),
    RATE_LIMIT_SCALE: stringEnv.RATE_LIMIT_SCALE ?? '1',
  });
  if (config.env === 'prod' && !db)
    throw new Error(
      'Cloudflare production requires the D1 binding `DB`; memory fallback is disabled.',
    );
  const store: DocStore = db ? new D1Store(db, seedSnapshot) : new InMemoryStore(seedSnapshot);
  const secret = await resolveSigningSecret(store, stringEnv.LOCAL_AUTH_SECRET);
  const finalConfig: AppConfig = { ...config, localSecret: secret };
  return {
    config: finalConfig,
    store,
    auth: new MemoryAuthProvider(store, secret, () => systemClock().getTime()),
    ...(db ? { rateLimitStore: new D1RateLimitStore(db) } : {}),
    blob: new CloudflareBlobStore(secret, {
      db,
      r2: env.MEDIA_BUCKET,
      purgeAfterMigrate: stringEnv.R2_MIGRATE_PURGE === 'on',
      now: () => systemClock().getTime(),
    }),
    push: buildPushSender(stringEnv),
    mail: new DisabledMailer(),
    llm: finalConfig.geminiApiKey
      ? new GeminiClient(finalConfig.geminiApiKey, finalConfig.geminiModel)
      : null,
    clock: systemClock,
  };
}

/** Real FCM delivery only when a valid service account is configured; never blocks startup. */
function buildPushSender(env: Record<string, string | undefined>): PushSender {
  const sa = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
  if (!sa) {
    if (env.FCM_SERVICE_ACCOUNT_JSON) {
      console.warn('[push] FCM_SERVICE_ACCOUNT_JSON is set but invalid; push is disabled');
    }
    return new DisabledPushSender();
  }
  return new FcmHttpPushSender(sa, env.APP_URL ?? '');
}

function isOriginAllowed(origin: string, requestUrl: URL, config: AppConfig): boolean {
  const clean = origin.replace(/\/$/, '');
  if (clean === requestUrl.origin) return true;
  if (config.allowedOrigins.includes(clean)) return true;
  // Preview hosts are convenient for local/staging review but must be explicitly allowlisted in
  // production; otherwise any user-created *.pages.dev / *.workers.dev site could call the API.
  if (config.env === 'prod') return false;
  try {
    const u = new URL(clean);
    if (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname.endsWith('.pages.dev') ||
      u.hostname.endsWith('.workers.dev') ||
      u.hostname.endsWith('.github.io')
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function securityHeaders(origin: string | null, requestUrl: URL, config: AppConfig): Headers {
  const h = new Headers({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  if (origin && isOriginAllowed(origin, requestUrl, config)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set(
      'Access-Control-Allow-Headers',
      'Authorization, X-Access-Token, Content-Type, Idempotency-Key',
    );
    h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    h.set('Access-Control-Max-Age', '600');
    h.set('Vary', 'Origin');
  }
  return h;
}

function jsonResponse(body: unknown, status: number, baseHeaders: Headers): Response {
  const h = new Headers(baseHeaders);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function serveBytes(
  request: Request,
  data: Uint8Array,
  contentType: string,
  baseHeaders: Headers,
  cacheControl = 'private, max-age=3600',
): Response {
  const h = new Headers(baseHeaders);
  h.set('Content-Type', contentType);
  h.set('Cache-Control', cacheControl);
  h.set('Accept-Ranges', 'bytes');
  const size = data.byteLength;
  const range = request.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && size > 0) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      h.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers: h });
    }
    h.set('Content-Range', `bytes ${start}-${end}/${size}`);
    const slice = data.subarray(start, end + 1);
    return new Response(new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength), {
      status: 206,
      headers: h,
    });
  }
  return new Response(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), {
    status: 200,
    headers: h,
  });
}

/**
 * Creates a zero-socket Web Fetch handler (`(request: Request) => Promise<Response>`)
 * that executes `/v1/*` routes against the configured D1/local store and R2/blob bindings.
 */
export function createFetchHandler(
  deps: Deps,
  handles: { limiter?: RateLimiter } = {},
): (request: Request) => Promise<Response> {
  const config = deps.config;
  const limiter =
    handles.limiter ??
    new RateLimiter(() => deps.clock().getTime(), deps.config.rateLimitScale, deps.rateLimitStore);

  const v1 = Router();
  v1.use(healthRouter(config));
  v1.use(authRouter(deps, limiter));
  v1.use(
    ['/me', '/manager', '/admin'],
    authenticate(deps),
    rateLimit(limiter, 'general', 60, 60_000, (req) => req.user?.id ?? req.ip ?? 'anon'),
  );
  v1.use(meRouter(deps, limiter));
  v1.use(managerRouter(deps, limiter));
  v1.use(adminRouter(deps, limiter));

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const baseHeaders = securityHeaders(origin, url, config);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders });
    }

    let subPath = url.pathname;
    for (const prefix of ['/.netlify/functions/api', '/api']) {
      if (subPath === prefix || subPath.startsWith(`${prefix}/`)) {
        subPath = subPath.slice(prefix.length) || '/';
        break;
      }
    }
    if (subPath === '/v1' || subPath.startsWith('/v1/')) {
      subPath = subPath.slice(3) || '/';
    } else {
      return jsonResponse(toErrorBody(new ApiError('NOT_FOUND')), 404, baseHeaders);
    }

    // Handle binary blob endpoints (uploads, signed reads, public catalog reads)
    if (deps.blob instanceof CloudflareBlobStore) {
      const blob = deps.blob;
      const uploadMatch = /^\/uploads\/([^/]+)$/.exec(subPath);
      if (uploadMatch && request.method === 'PUT') {
        try {
          const token = decodeURIComponent(uploadMatch[1] ?? '');
          const t = blob.verifyTicket(token, 'put');
          if (!t) throw new ApiError('FORBIDDEN', 'لینک آپلود منقضی یا نامعتبر است.');
          const libraryPart = /^uploads\/([^/]+)\/(\d+)$/.exec(t.p);
          const expectedPartSize = async (): Promise<number | null> => {
            if (!libraryPart) return null;
            const media = await deps.store.get<{
              library?: boolean;
              status?: string;
              declaredSize?: number;
              partSize?: number;
              totalParts?: number;
            }>(`media/${libraryPart[1]}`);
            const index = Number(libraryPart[2]);
            const partSize = media?.partSize ?? 1024 * 1024;
            const totalParts = media?.totalParts ?? 0;
            const declaredSize = media?.declaredSize;
            if (
              !media?.library ||
              media.status !== 'pending' ||
              !Number.isSafeInteger(index) ||
              index < 0 ||
              !Number.isSafeInteger(totalParts) ||
              totalParts <= 0 ||
              index >= totalParts ||
              typeof declaredSize !== 'number' ||
              !Number.isSafeInteger(declaredSize) ||
              !Number.isSafeInteger(partSize) ||
              partSize <= 0
            ) {
              throw new ApiError('CONFLICT', 'این آپلود دیگر فعال نیست.');
            }
            const size =
              index < totalParts - 1 ? partSize : declaredSize - partSize * (totalParts - 1);
            if (size <= 0 || size !== t.max)
              throw new ApiError('FORBIDDEN', 'پیوند بخش آپلود با این فایل هم‌خوانی ندارد.');
            return size;
          };
          const expected = await expectedPartSize();
          const bytes = new Uint8Array(await request.arrayBuffer());
          if (bytes.byteLength > t.max || (expected !== null && bytes.byteLength !== expected))
            throw new ApiError('VALIDATION', 'حجم فایل با بخش درخواستی مطابقت ندارد.');
          // Re-check after reading the body so an expired/aborted upload cannot write a late part.
          await expectedPartSize();
          await blob.put(t.p, bytes, t.ct);
          return jsonResponse({ data: { ok: true, size: bytes.byteLength } }, 200, baseHeaders);
        } catch (e) {
          const err =
            e instanceof ApiError
              ? e
              : new ApiError('VALIDATION', 'آپلود ناموفق بود. دوباره تلاش کنید.');
          return jsonResponse(toErrorBody(err), err.status, baseHeaders);
        }
      }

      const signedMatch = /^\/files\/signed\/([^/]+)$/.exec(subPath);
      if (signedMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        const token = decodeURIComponent(signedMatch[1] ?? '');
        const t = blob.verifyTicket(token, 'get');
        if (!t) {
          const err = new ApiError(
            'FORBIDDEN',
            'لینک فایل منقضی شده است. صفحه را دوباره باز کنید.',
          );
          return jsonResponse(toErrorBody(err), err.status, baseHeaders);
        }
        // Players seek with Range requests. Loading the whole file from D1 for each one is slow and
        // memory-hungry, so serve just the requested window (capped), reading only those chunks.
        const rangeHeader = request.headers.get('range');
        const rm = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;
        if (rm && (rm[1] || rm[2])) {
          const meta = await blob.stat(t.p);
          if (meta && meta.size > 0) {
            const MAX_WINDOW = 4 * 1024 * 1024;
            let start = rm[1] ? Number(rm[1]) : Math.max(0, meta.size - Number(rm[2]));
            let end = rm[1] && rm[2] ? Number(rm[2]) : meta.size - 1;
            end = Math.min(meta.size - 1, end, start + MAX_WINDOW - 1);
            start = Math.max(0, start);
            const h = new Headers(baseHeaders);
            h.set('Content-Type', meta.contentType);
            h.set('Cache-Control', 'private, max-age=3600');
            h.set('Accept-Ranges', 'bytes');
            if (start > end) {
              h.set('Content-Range', `bytes */${meta.size}`);
              return new Response(null, { status: 416, headers: h });
            }
            const slice = await blob.readRange(t.p, start, end);
            h.set('Content-Range', `bytes ${start}-${end}/${meta.size}`);
            return new Response(new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength), {
              status: 206,
              headers: h,
            });
          }
        }
        const file = await blob.read(t.p);
        if (!file) {
          const err = new ApiError('NOT_FOUND');
          return jsonResponse(toErrorBody(err), err.status, baseHeaders);
        }
        return serveBytes(request, file.data, file.contentType, baseHeaders);
      }

      const pubMatch = /^\/files\/public\/((?:brands|products|branding)\/.+)$/.exec(subPath);
      if (pubMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        const rawPath = (pubMatch[1] ?? '')
          .split('/')
          .map((seg) => decodeURIComponent(seg))
          .join('/');
        if (rawPath.includes('..')) {
          const err = new ApiError('NOT_FOUND');
          return jsonResponse(toErrorBody(err), err.status, baseHeaders);
        }
        const uploaded = await blob.read(rawPath);
        if (uploaded) {
          return serveBytes(
            request,
            uploaded.data,
            uploaded.contentType,
            baseHeaders,
            // Public catalog images: let browsers and the Cloudflare edge reuse them.
            'public, max-age=86400, stale-while-revalidate=604800',
          );
        }
        if (rawPath === 'branding/holding-logo.png') {
          const h = new Headers(baseHeaders);
          h.set('Location', '/icons/logo-full.png');
          return new Response(null, { status: 302, headers: h });
        }
        if (rawPath.startsWith('brands/') || rawPath.startsWith('products/')) {
          const h = new Headers(baseHeaders);
          h.set('Location', `/catalog/${rawPath}`);
          return new Response(null, { status: 302, headers: h });
        }
        const err = new ApiError('NOT_FOUND');
        return jsonResponse(toErrorBody(err), err.status, baseHeaders);
      }
    }

    // Parse JSON body for non-GET/HEAD requests (1 MB limit, matching spec §24)
    let parsedBody: unknown = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const rawText = await request.text();
      if (utf8ByteLength(rawText) > 1024 * 1024) {
        const err = new ApiError('VALIDATION', 'حجم اطلاعات ارسالی بیش از حد مجاز است.');
        return jsonResponse(toErrorBody(err), 413, baseHeaders);
      }
      if (rawText.trim().length > 0) {
        try {
          parsedBody = JSON.parse(rawText);
        } catch {
          const err = new ApiError('VALIDATION');
          return jsonResponse(toErrorBody(err), err.status, baseHeaders);
        }
      } else {
        parsedBody = {};
      }
    }

    // Dispatch to the Router in memory
    const headersObj: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });
    const clientIp =
      headersObj['cf-connecting-ip'] ||
      headersObj['x-forwarded-for']?.split(',')[0]?.trim() ||
      '127.0.0.1';
    const queryObj: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      queryObj[k] = v;
    });

    return new Promise<Response>((resolve) => {
      const outHeaders = new Headers(baseHeaders);
      let statusCode = 200;
      let headersSent = false;

      const req = {
        method: request.method,
        url: subPath + url.search,
        originalUrl: '/v1' + subPath + url.search,
        path: subPath,
        query: queryObj,
        params: {} as Record<string, string>,
        headers: headersObj,
        body: parsedBody,
        ip: clientIp,
        get(name: string) {
          return headersObj[name.toLowerCase()];
        },
        header(name: string) {
          return headersObj[name.toLowerCase()];
        },
      };

      const finish = (body: string | Uint8Array | null) => {
        headersSent = true;
        resolve(
          new Response(statusCode === 204 ? null : body, {
            status: statusCode,
            headers: outHeaders,
          }),
        );
      };

      const res = {
        get statusCode() {
          return statusCode;
        },
        set statusCode(c: number) {
          statusCode = c;
        },
        get headersSent() {
          return headersSent;
        },
        status(c: number) {
          statusCode = c;
          return res;
        },
        setHeader(k: string, v: string) {
          outHeaders.set(k, String(v));
          return res;
        },
        getHeader(k: string) {
          return outHeaders.get(k) ?? undefined;
        },
        set(k: string, v: string) {
          outHeaders.set(k, String(v));
          return res;
        },
        json(obj: unknown) {
          outHeaders.set('Content-Type', 'application/json; charset=utf-8');
          finish(JSON.stringify(obj));
          return res;
        },
        send(data: unknown) {
          if (data instanceof Uint8Array) {
            finish(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          } else if (typeof data === 'string') {
            finish(data);
          } else if (data === undefined || data === null) {
            finish(null);
          } else {
            outHeaders.set('Content-Type', 'application/json; charset=utf-8');
            finish(JSON.stringify(data));
          }
          return res;
        },
        end(data?: unknown) {
          if (data instanceof Uint8Array) {
            finish(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          } else if (typeof data === 'string') {
            finish(data);
          } else {
            finish(null);
          }
          return res;
        },
        redirect(codeOrUrl: number | string, maybeUrl?: string) {
          if (typeof codeOrUrl === 'number') {
            statusCode = codeOrUrl;
            outHeaders.set('Location', maybeUrl ?? '/');
          } else {
            statusCode = 302;
            outHeaders.set('Location', codeOrUrl);
          }
          finish(null);
          return res;
        },
      };

      (v1 as unknown as (req: unknown, res: unknown, next: (err?: unknown) => void) => void)(
        req,
        res,
        (err?: unknown) => {
          if (headersSent) return;
          if (!err) {
            const notFound = new ApiError('NOT_FOUND');
            resolve(jsonResponse(toErrorBody(notFound), notFound.status, outHeaders));
            return;
          }
          if (err instanceof ApiError) {
            resolve(jsonResponse(toErrorBody(err), err.status, outHeaders));
            return;
          }
          console.error('Unhandled API error', err);
          const internal = new ApiError('INTERNAL');
          resolve(jsonResponse(toErrorBody(internal), internal.status, outHeaders));
        },
      );
    });
  };
}
