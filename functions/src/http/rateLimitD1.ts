import { ids } from '../lib/ids';
import { D1_CALL_TIMEOUT_MS, type D1Database } from '../store/d1';
import type { RateLimitStore } from './rateLimit';

/** D1-backed, cross-isolate fixed-window limiter. Only SHA-256 key hashes are stored. */
export class D1RateLimitStore implements RateLimitStore {
  private cleanupAfter = 0;
  /** Keep direct rate-limit SQL bounded and serial within an isolate, like the main D1 store. */
  private io: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: D1Database) {}

  private enqueue<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`${label} timed out after ${D1_CALL_TIMEOUT_MS}ms`));
      }, D1_CALL_TIMEOUT_MS);
    });
    const work = this.io.then(
      () => {
        if (timedOut) throw new Error(`${label} timed out while queued`);
        return fn();
      },
      () => {
        if (timedOut) throw new Error(`${label} timed out while queued`);
        return fn();
      },
    );
    // Keep the serial queue tied to the actual D1 promise, not the timeout race. If a D1
    // promise stalls, waiting requests fail at their own deadline without opening more calls.
    this.io = work.then(
      () => undefined,
      () => undefined,
    );
    return Promise.race([work, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    if (windowMs <= 0 || !Number.isFinite(windowMs)) throw new Error('Invalid rate-limit window');
    if (now >= this.cleanupAfter) {
      this.cleanupAfter = now + 60_000;
      try {
        await this.enqueue(
          () => this.db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?1').bind(now).run(),
          'D1 rate-limit cleanup',
        );
      } catch (err) {
        this.cleanupAfter = 0;
        throw err;
      }
    }

    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const row = await this.enqueue(
      () =>
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
      'D1 rate-limit update',
    );

    if (!row) throw new Error('D1 rate-limit update did not return a counter');
    return Number(row.count) <= limit;
  }
}
