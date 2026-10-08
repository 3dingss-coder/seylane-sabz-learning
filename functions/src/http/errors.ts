/**
 * Standard API error model (spec §21):
 *   success → { data: ... }
 *   error   → { error: { code, message (Persian), details? } }
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Default user-facing Persian messages (simple language, no technical jargon). */
export const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: 'اطلاعات واردشده درست نیست. لطفاً بررسی کنید.',
  UNAUTHENTICATED: 'لطفاً دوباره وارد حساب خود شوید.',
  FORBIDDEN: 'شما اجازه دسترسی به این بخش را ندارید.',
  NOT_FOUND: 'موردی که دنبالش هستید پیدا نشد.',
  CONFLICT: 'این درخواست با وضعیت فعلی سازگار نیست.',
  RATE_LIMIT: 'درخواست‌ها زیاد بود. کمی صبر کنید و دوباره تلاش کنید.',
  UNAVAILABLE: 'این خدمت فعلاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
  INTERNAL: 'مشکلی پیش آمد. لطفاً کمی بعد دوباره تلاش کنید.',
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function toErrorBody(err: ApiError): ErrorBody {
  const body: ErrorBody = { error: { code: err.code, message: err.message } };
  if (err.details !== undefined) body.error.details = err.details;
  return body;
}
