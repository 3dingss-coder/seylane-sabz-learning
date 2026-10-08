/**
 * Bounded-wait primitives for state that is shared by every request in a Worker isolate.
 *
 * Why a timer owned by the *waiter* matters: in Cloudflare Workers a request that is cancelled
 * mid-call (client disconnect, "Network connection lost") takes its pending I/O and its own timers
 * with it. A promise that request left behind in shared state then never settles, and a timeout
 * that was registered by the cancelled request never fires. Any other request awaiting that shared
 * promise has no events left in its own loop and the runtime reports "Worker code hung". So every
 * wait on shared state must race a timer created by the request that is waiting.
 */

export class DeadlineError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'DeadlineError';
  }
}

/** Rejects with DeadlineError after `ms`; the timer is always cleared. The work itself is not cancelled. */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
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
