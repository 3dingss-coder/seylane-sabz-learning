import { MemoryAuthProvider } from './auth/memory';
import { CloudflareBlobStore, type R2BucketLike } from './blob/cloudflare';
import { loadConfig, type AppConfig } from './config';
import { authenticate } from './http/auth';
import { ApiError, toErrorBody } from './http/errors';
import { RateLimiter, rateLimit } from './http/rateLimit';
import { Router } from './http/router';
import { randomBytesBase64Url, utf8ByteLength } from './lib/crypto';
import { systemClock } from './lib/time';
import { GeminiClient } from './llm/gemini';
import { DisabledMailer } from './mail/types';
import { FcmHttpPushSender, parseServiceAccount } from './push/fcm-http';
import { UnconfiguredPushSender, type PushSender } from './push/types';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { managerRouter } from './routes/manager';
import { meRouter } from './routes/me';
import type { Deps } from './services/context';
import { D1Store, type D1Database } from './store/d1';
import { InMemoryStore } from './store/helpers';
import type { Data, DocStore } from './store/types';

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

async function resolveSigningSecret(store: DocStore, envSecret?: string): Promise<string> {
  if (envSecret && envSecret.trim().length >= 16) return envSecret.trim();
  const key = '_system/auth_secret';
  const existing = await store.get<{ value: string }>(key);
  if (existing?.value) return existing.value;
  const generated = randomBytesBase64Url(48);
  try {
    await store.create(key, { value: generated, createdAt: new Date().toISOString() });
  } catch {
    // Created concurrently by another worker isolate
  }
  const saved = await store.get<{ value: string }>(key);
  return saved?.value ?? generated;
}

/**
 * Builds `Deps` backed by Cloudflare D1 (with automatic schema creation + initial catalog seed).
 * Falls back to in-memory seeded store if `env.DB` is not bound yet so previews never 500.
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
  const config = loadConfig({
    ...stringEnv,
    DATA_BACKEND: db ? 'd1' : 'memory',
    APP_ENV: stringEnv.APP_ENV ?? 'dev',
    PLAYBACK_BUDGET: stringEnv.PLAYBACK_BUDGET ?? 'off',
    RATE_LIMIT_SCALE: stringEnv.RATE_LIMIT_SCALE ?? '20',
  });
  const store: DocStore = db ? new D1Store(db, seedSnapshot) : new InMemoryStore(seedSnapshot);
  const secret = await resolveSigningSecret(store, stringEnv.LOCAL_AUTH_SECRET);
  const finalConfig: AppConfig = { ...config, localSecret: secret };
  return {
    config: finalConfig,
    store,
    auth: new MemoryAuthProvider(store, secret, () => systemClock().getTime()),
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

/** Real FCM delivery only when a valid service account is configured; never blocks startup.
 * Without one, sends fail loudly instead of being silently recorded as delivered. */
function buildPushSender(env: Record<string, string | undefined>): PushSender {
  const sa = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
  if (!sa) {
    console.warn(
      env.FCM_SERVICE_ACCOUNT_JSON
        ? '[push] FCM_SERVICE_ACCOUNT_JSON is set but invalid; push sends will fail'
        : '[push] FCM_SERVICE_ACCOUNT_JSON is missing; push sends will fail',
    );
    return new UnconfiguredPushSender();
  }
  return new FcmHttpPushSender(sa, env.APP_URL ?? '');
}

function isOriginAllowed(origin: string, requestUrl: URL, allowedOrigins: string[]): boolean {
  const clean = origin.replace(/\/$/, '');
  if (clean === requestUrl.origin) return true;
  if (allowedOrigins.includes(clean)) return true;
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
  if (origin && isOriginAllowed(origin, requestUrl, config.allowedOrigins)) {
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
 * that executes all `/v1/*` API routes directly in memory.
 */
export function createFetchHandler(
  deps: Deps,
  handles: { limiter?: RateLimiter } = {},
): (request: Request) => Promise<Response> {
  const config = deps.config;
  const limiter =
    handles.limiter ?? new RateLimiter(() => deps.clock().getTime(), deps.config.rateLimitScale);

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
          const bytes = new Uint8Array(await request.arrayBuffer());
          if (bytes.byteLength > t.max)
            throw new ApiError('VALIDATION', 'حجم فایل بیش از حد مجاز است.');
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
