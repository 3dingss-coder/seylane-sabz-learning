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

type RefreshResult = { idToken: string; refreshToken: string; expiresIn: number };
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

/** Single-flight refresh; returns false when the refresh token is invalid. */
export async function refreshSession(): Promise<boolean> {
  const rt = session.refresh;
  if (!rt) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) session.clear();
        return false;
      }
      const { data } = (await res.json()) as { data: RefreshResult };
      session.setAccess(data.idToken, data.expiresIn);
      session.setRefresh(data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip auth header (public endpoints). */
  anonymous?: boolean;
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    if (!session.access && session.refresh) await refreshSession();
    if (session.access) headers.Authorization = `Bearer ${session.access}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('NETWORK', NETWORK_MESSAGE, 0);
  }
  if (res.status === 401 && !opts.anonymous && !retried) {
    if (await refreshSession()) return request<T>(path, opts, true);
    session.clear();
    onSessionExpired?.();
  }
  if (res.status === 204) return undefined as T;
  let json: { data?: T; error?: { code: ErrorCode; message: string; details?: unknown } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new ApiError('INTERNAL', 'پاسخ سرور نامعتبر است. کمی بعد دوباره تلاش کنید.', res.status);
  }
  if (!res.ok || json.error) {
    const err = json.error ?? {
      code: 'INTERNAL' as const,
      message: 'خطایی رخ داد. دوباره تلاش کنید.',
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
