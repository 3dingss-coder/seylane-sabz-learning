import { ApiError } from './api';

/** Persian, user-facing message for any thrown value. */
export function errMsg(e: unknown, fallback = 'خطایی رخ داد. دوباره تلاش کنید.'): string {
  return e instanceof ApiError ? e.message : fallback;
}
