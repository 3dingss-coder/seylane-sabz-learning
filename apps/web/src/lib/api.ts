import { session } from './session';

/**
 * API client for /v1. In dev the Vite server proxies relative `/v1` to the local API; in
 * production VITE_API_BASE points at the Cloud Function (e.g. https://…run.app).
 */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'UNAVAILABLE'
  | 'INTERNAL'
  | 'NETWORK';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  /** Field errors from zod validation: { field: message }. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as Array<{ field?: string; message?: string }>) {
        if (d.field && d.message && !out[d.field] && /[\u0600-\u06FF]/.test(d.message))
          out[d.field] = d.message;
      }
    }
    return out;
  }
}

const NETWORK_MESSAGE = 'اتصال اینترنت برقرار نیست. دوباره تلاش کنید.';

/** Resolves API-relative file URLs (`/v1/files/...`) against the API origin. */
export function fileUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${API_BASE}${url}`;
}

const REFRESH_TIMEOUT_MS = 15_000;

type RefreshResult = { idToken: string; refreshToken: string; expiresIn: number };
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

type RefreshOutcome = 'ok' | 'invalid' | 'transient';
let refreshingOutcome: Promise<RefreshOutcome> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTransientStatus = (s: number) => s === 429 || s === 408 || s >= 500;

async function refreshOnce(rt: string): Promise<RefreshOutcome> {
  // Without a deadline a hung server keeps AuthProvider in 'loading' → endless full-page spinner.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      signal: ctl.signal,
    });
    if (res.status === 401 || res.status === 403) return 'invalid';
    if (!res.ok) return 'transient';
    const { data } = (await res.json()) as { data: RefreshResult };
    session.setAccess(data.idToken, data.expiresIn);
    session.setRefresh(data.refreshToken);
    return 'ok';
  } catch {
    // Network drop, Worker cold-start failure (1101/1102/503) or unparsable body: not a verdict
    // on the token, so the session must be kept.
    return 'transient';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single-flight refresh. Only a definitive 401/403 from /auth/refresh clears the session;
 * transient failures are retried once and then reported as 'transient' without logging out.
 */
export function refreshSessionOutcome(): Promise<RefreshOutcome> {
  const rt = session.refresh;
  if (!rt) return Promise.resolve('invalid');
  refreshingOutcome ??= (async () => {
    try {
      let out = await refreshOnce(rt);
      if (out === 'transient') {
        await sleep(700);
        out = await refreshOnce(session.refresh ?? rt);
      }
      if (out === 'invalid') session.clear();
      return out;
    } finally {
      setTimeout(() => (refreshingOutcome = null), 0);
    }
  })();
  return refreshingOutcome;
}

/** Returns true when a fresh access token is available. */
export async function refreshSession(): Promise<boolean> {
  return (await refreshSessionOutcome()) === 'ok';
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip auth header (public endpoints). */
  anonymous?: boolean;
  /** Abort and fail with a NETWORK error after this many ms (default: no deadline). */
  timeoutMs?: number;
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
  retried = false,
  attempt = 0,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    if (!session.access && session.refresh) await refreshSession();
    if (session.access) {
      headers.Authorization = `Bearer ${session.access}`;
      // Same token again for proxies that strip Authorization (see functions/src/http/auth.ts).
      headers['X-Access-Token'] = session.access;
    }
  }
  let res: Response;
  let timedOut = false;
  let signal = opts.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts.timeoutMs) {
    const ctl = new AbortController();
    timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, opts.timeoutMs);
    opts.signal?.addEventListener('abort', () => ctl.abort(), { once: true });
    signal = ctl.signal;
  }
  try {
    res = await fetch(`${API_BASE}/v1${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError' && !timedOut) throw e;
    throw new ApiError('NETWORK', NETWORK_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && !opts.anonymous && !retried) {
    const outcome = await refreshSessionOutcome();
    if (outcome === 'ok') return request<T>(path, opts, true);
    // Log out only when the server says the refresh token is invalid; a cold-start 503 or a
    // dropped connection must not destroy a valid session.
    if (outcome === 'invalid') {
      session.clear();
      onSessionExpired?.();
    }
  }
  // Quiet bounded retries for idempotent GETs only. Never retry signup or session mutations:
  // client timeouts do not cancel their server-side D1 work.
  if (attempt < 2 && isTransientStatus(res.status) && (opts.method ?? 'GET') === 'GET') {
    await sleep(attempt === 0 ? 600 : 1500);
    return request<T>(path, opts, retried, attempt + 1);
  }
  if (res.status === 204) return undefined as T;
  let json: { data?: T; error?: { code: ErrorCode; message: string; details?: unknown } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new ApiError('INTERNAL', 'پاسخ سرور نامعتبر است. کمی بعد دوباره تلاش کنید.', res.status);
  }
  if (!res.ok || json.error) {
    // Cloudflare edge/platform errors (1101/1102/1015…) arrive as JSON without our `error` field.
    const err = json.error ?? {
      code: (res.status === 429 ? 'RATE_LIMIT' : 'INTERNAL') as ErrorCode,
      message:
        res.status >= 500 || res.status === 429
          ? 'سرور موقتاً شلوغ است. چند ثانیه بعد دوباره تلاش کنید.'
          : 'خطایی رخ داد. دوباره تلاش کنید.',
    };
    throw new ApiError(err.code, err.message, res.status, err.details);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: body ?? {}, headers }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
};

/** Uploads a file to a signed URL with progress (local API or Cloud Storage v4 URL). */
export function uploadToSignedUrl(
  ticket: { url: string; method: string; headers: Record<string, string> },
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, fileUrl(ticket.url));
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError('VALIDATION', 'آپلود ناموفق بود. دوباره تلاش کنید.', xhr.status));
    xhr.onerror = () => reject(new ApiError('NETWORK', NETWORK_MESSAGE, 0));
    xhr.send(file);
  });
}
