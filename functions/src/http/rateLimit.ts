import type { Request, RequestHandler } from 'express';
import { ApiError } from './errors';

/**
 * Fixed-window in-memory limiter (per function instance). Good enough for the MVP scale
 * (maxInstances=10) — documented limitation; a Firestore-backed limiter is V1.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly scale = 1,
  ) {}

  hit(key: string, baseLimit: number, windowMs: number): boolean {
    const limit = baseLimit * this.scale;
    const t = this.now();
    if (this.buckets.size > 20_000) {
      for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
    }
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      this.buckets.set(key, { count: 1, resetAt: t + windowMs });
      return true;
    }
    b.count++;
    return b.count <= limit;
  }
  reset() {
    this.buckets.clear();
  }
}

export function rateLimit(
  limiter: RateLimiter,
  name: string,
  limit: number,
  windowMs: number,
  keyFn: (req: Request) => string,
  message?: string,
): RequestHandler {
  return (req, _res, next) => {
    if (!limiter.hit(`${name}:${keyFn(req)}`, limit, windowMs))
      return next(new ApiError('RATE_LIMIT', message));
    next();
  };
}
