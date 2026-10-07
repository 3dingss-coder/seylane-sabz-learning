/**
 * Helpers that keep one request from freezing the others on a Cloudflare Worker.
 *
 * Why this exists: a Worker isolate serves many requests, and module-level state outlives each of
 * them. A promise that was started by request A (a D1 query, a lock hand-off, a cold-start
 * initialisation) is only ever settled by request A's own I/O. If A is cancelled (the client
 * disconnects, a deploy rolls over) that promise never settles, and every request B that awaits
 * it has nothing left to wait on — the runtime then reports
 * «Worker's code had hung» and cancels B as well. One stuck request cascades to everyone behind
 * it. The rules used here:
 *   1. Never make request B await a promise that only request A can settle — or, if B must wait
 *      (a lock), wait with a deadline that B's own timer enforces.
 *   2. Cache results, not in-flight promises.
 */

/** Rejected by {@link withDeadline} when the wrapped promise did not settle in time. */
export class DeadlineError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`${label} did not finish within ${ms} ms`);
    this.name = 'DeadlineError';
  }
}

/** Resolves/rejects like `p`, but rejects with {@link DeadlineError} after `ms`. */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Waits for `p` for at most `ms` and never rejects. Returns true when `p` settled in time. */
export function waitAtMost(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    p.then(done, done);
  });
}

/**
 * A FIFO mutex whose waiters give up on a stuck predecessor.
 *
 * Normal case: callers run one at a time, in order. If the holder never releases (its request
 * was cancelled while holding the lock), the next caller waits at most `waitMs` on its OWN timer
 * and then runs anyway, so a lost holder costs one delay instead of freezing every later request.
 */
export class DeadlineMutex {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly waitMs: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await waitAtMost(previous, this.waitMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
