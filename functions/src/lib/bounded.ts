/**
 * Bounded waiting for promises shared by concurrent requests in one Worker isolate.
 * A deadline ends the wait; it does not cancel the operation. Callers handling mutations must
 * use an atomic compare-and-swap/idempotency key because the underlying work may finish later.
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

/** Race a waiter-owned deadline against work; the work itself is not cancelled. */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Resolve when `prev` settles or this caller's bounded wait expires. */
export function waitSettled(
  prev: Promise<unknown>,
  ms: number,
): Promise<{ timedOut: boolean; waitedMs: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ timedOut: true, waitedMs: Date.now() - start });
    }, ms);
    const settled = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ timedOut: false, waitedMs: Date.now() - start });
    };
    void prev.then(settled, settled);
  });
}

/** A FIFO gate used to bound a queue without making the queue's tail depend on D1 settling. */
export function createGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
