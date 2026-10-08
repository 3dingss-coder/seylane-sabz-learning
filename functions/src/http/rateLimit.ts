import type { Request, RequestHandler } from 'express';
import { ApiError } from './errors';

export interface RateLimitStore {
  /** Atomically increment a fixed-window bucket in a shared store. `limit` is already scaled. */
  hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;
}

/**
 * Fixed-window limiter. Local/test mode uses an in-memory map; Cloudflare production injects a D1
 * store so limits apply across Worker isolates instead of resetting on every cold start.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly scale = 1,
    private readonly shared?: RateLimitStore,
  ) {}

  private hitMemory(key: string, limit: number, windowMs: number, t: number): boolean {
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

  /** Synchronous helper retained for simple in-memory tests and local diagnostics. */
  hit(key: string, baseLimit: number, windowMs: number): boolean {
    return this.hitMemory(key, baseLimit * this.scale, windowMs, this.now());
  }

  async allow(key: string, baseLimit: number, windowMs: number): Promise<boolean> {
    const now = this.now();
    const limit = baseLimit * this.scale;
    return this.shared
      ? this.shared.hit(key, limit, windowMs, now)
      : this.hitMemory(key, limit, windowMs, now);
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
    void limiter
      .allow(`${name}:${keyFn(req)}`, limit, windowMs)
      .then((allowed) => {
        if (!allowed) next(new ApiError('RATE_LIMIT', message));
        else next();
      })
      .catch((err: unknown) => {
        console.error(
          '[rate-limit] shared store unavailable',
          err instanceof Error ? err.message : 'error',
        );
        next(new ApiError('UNAVAILABLE', 'سامانهٔ محدودکنندهٔ درخواست موقتاً در دسترس نیست.'));
      });
  };
}
