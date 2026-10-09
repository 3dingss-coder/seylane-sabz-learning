import { ids } from '../lib/ids';
import { withD1CallTimeout, type D1Database } from '../store/d1';
import type { RateLimitStore } from './rateLimit';

/** D1-backed, cross-isolate fixed-window limiter. Only SHA-256 key hashes are stored. */
export class D1RateLimitStore implements RateLimitStore {
  private cleanupAfter = 0;

  constructor(private readonly db: D1Database) {}

  async hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    if (windowMs <= 0 || !Number.isFinite(windowMs)) throw new Error('Invalid rate-limit window');
    if (now >= this.cleanupAfter) {
      const attemptedUntil = now + 60_000;
      this.cleanupAfter = attemptedUntil;
      try {
        await withD1CallTimeout(
          Promise.resolve().then(() =>
            this.db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?1').bind(now).run(),
          ),
          'D1 rate-limit cleanup',
        );
      } catch (err) {
        // A stale failing cleanup must not erase a newer caller's cleanup lease.
        if (this.cleanupAfter === attemptedUntil) this.cleanupAfter = 0;
        throw err;
      }
    }

    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    // This UPSERT is the serialization boundary: SQLite atomically increments the shared counter.
    // Do not put it behind a process-local promise chain; one abandoned request must not poison
    // every later limiter call in this isolate. A timed-out hit fails closed at the middleware.
    const row = await withD1CallTimeout(
      Promise.resolve().then(() =>
        this.db
          .prepare(
            `INSERT INTO rate_limits (key, window_start, count, reset_at)
             VALUES (?1, ?2, 1, ?3)
             ON CONFLICT (key) DO UPDATE SET
               count = CASE
                 WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1
                 ELSE 1
               END,
               window_start = excluded.window_start,
               reset_at = excluded.reset_at
             RETURNING count`,
          )
          .bind(ids.hash(key), windowStart, resetAt)
          .first<{ count: number }>(),
      ),
      'D1 rate-limit update',
    );

    if (!row) throw new Error('D1 rate-limit update did not return a counter');
    return Number(row.count) <= limit;
  }
}
