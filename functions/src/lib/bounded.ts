/**
 * Bounded-wait primitives for state that is shared by every request in a Worker isolate.
 *
 * Why a timer owned by the *waiter* matters: in Cloudflare Workers a request that is cancelled
 * mid-call (client disconnect, "Network connection lost") takes its pending I/O and its own timers
 * with it. A promise that request left behind in shared state then never settles, and a timeout
 * that was registered by the cancelled request never fires. Any other request awaiting that shared
 * promise has no events left in its own loop and the runtime reports "Worker code hung". So every
 * wait on shared state must race a timer created by the request that is waiting.
 *
 * What a timeout does NOT do: it never cancels the work. D1 and `fetch` offer no cancellation, so
 * after `withTimeout` rejects the underlying operation may still finish later ("late completion").
 * Every call site therefore has to be safe against that, either because the work is idempotent, or
 * because its write is a compare-and-swap that a stale writer cannot win (see D1Store.runTransaction),
 * or because the caller reports the outcome as unknown. `onLate` makes late completions visible.
 */

export type DeadlineKind = 'timeout' | 'deadline';

export class DeadlineError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
    readonly kind: DeadlineKind = 'timeout',
  ) {
    super(
      kind === 'deadline'
        ? `${label}: request deadline reached`
        : `${label} timed out after ${ms}ms`,
    );
    this.name = 'DeadlineError';
  }
}

export interface LateOutcome {
  ok: boolean;
  /** How long after the timeout fired the work finished. */
  lateMs: number;
  error?: unknown;
}

export interface TimeoutOptions {
  /** Called when the work settles AFTER the timeout already rejected the caller. */
  onLate?: (outcome: LateOutcome) => void;
}

/** Rejects with DeadlineError after `ms`; the timer is always cleared. The work itself is not cancelled. */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
  opts: TimeoutOptions = {},
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firedAt: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      firedAt = Date.now();
      reject(new DeadlineError(label, ms));
    }, ms);
  });
  if (opts.onLate) {
    const onLate = opts.onLate;
    work.then(
      () => {
        if (firedAt !== null) onLate({ ok: true, lateMs: Date.now() - firedAt });
      },
      (error: unknown) => {
        if (firedAt !== null) onLate({ ok: false, lateMs: Date.now() - firedAt, error });
      },
    );
  }
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Waits until `prev` settles (fulfilled or rejected) or `ms` elapsed, whichever comes first. Never
 * rejects. `timedOut` tells the caller the predecessor never finished, i.e. it is slow or abandoned.
 */
export function waitSettled(
  prev: Promise<unknown>,
  ms: number,
): Promise<{ timedOut: boolean; waitedMs: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    let finished = false;
    const done = (timedOut: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ timedOut, waitedMs: Date.now() - start });
    };
    const timer = setTimeout(() => done(true), ms);
    prev.then(
      () => done(false),
      () => done(false),
    );
  });
}

/**
 * A gate in a chain: `release()` lets the next waiter go. Callers MUST call it in a `finally`; a
 * waiter whose predecessor never releases (abandoned request) gives up after its own bounded wait.
 */
export function createGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * A request-level deadline. It does not cancel anything; it is checked before NEW work starts, so
 * once it has passed no further read or write is begun by that request. Work already in flight is
 * bounded separately by its own per-call limit.
 */
export class Deadline {
  constructor(readonly atMs: number | null) {}
  static after(ms: number, now: number = Date.now()): Deadline {
    return new Deadline(now + ms);
  }
  static none(): Deadline {
    return new Deadline(null);
  }
  remainingMs(now: number = Date.now()): number {
    return this.atMs === null ? Number.POSITIVE_INFINITY : this.atMs - now;
  }
  expired(now: number = Date.now()): boolean {
    return this.remainingMs(now) <= 0;
  }
  /** Throws DeadlineError (kind "deadline") if the deadline has passed. Call before starting work. */
  check(phase: string): void {
    if (this.expired()) throw new DeadlineError(phase, 0, 'deadline');
  }
}
