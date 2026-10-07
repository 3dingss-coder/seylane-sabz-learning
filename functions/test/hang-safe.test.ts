import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeadlineError, DeadlineMutex, waitAtMost, withDeadline } from '../src/lib/hang-safe';

const never = () => new Promise<never>(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('withDeadline / waitAtMost', () => {
  it('passes through a value that arrives in time', async () => {
    await expect(withDeadline(Promise.resolve(7), 1000, 'x')).resolves.toBe(7);
    await expect(waitAtMost(Promise.resolve(), 1000)).resolves.toBe(true);
  });

  it('rejects / reports false for a promise that never settles', async () => {
    const d = withDeadline(never(), 500, 'stuck call');
    const assertion = expect(d).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    const w = waitAtMost(never(), 500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(w).resolves.toBe(false);
  });

  it('does not leave timers behind', async () => {
    await withDeadline(Promise.resolve(1), 1000, 'x');
    await waitAtMost(Promise.resolve(), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('DeadlineMutex', () => {
  it('runs callers one at a time, in order', async () => {
    const m = new DeadlineMutex(1000);
    const log: string[] = [];
    const task = (name: string, ms: number) =>
      m.run(async () => {
        log.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, ms));
        log.push(`${name}:end`);
      });
    const all = Promise.all([task('a', 100), task('b', 10), task('c', 10)]);
    await vi.advanceTimersByTimeAsync(500);
    await all;
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('a holder that never finishes (cancelled request) delays the next caller once, not forever', async () => {
    const m = new DeadlineMutex(1000);
    void m.run(never); // request A, cancelled while holding the lock
    let bDone = false;
    const b = m.run(async () => {
      bDone = true;
      return 'b';
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(bDone).toBe(false); // still politely waiting
    await vi.advanceTimersByTimeAsync(1);
    await expect(b).resolves.toBe('b');
    // The chain healed: the next caller does not pay the deadline again.
    const c = m.run(async () => 'c');
    await vi.advanceTimersByTimeAsync(0);
    await expect(c).resolves.toBe('c');
  });

  it('releases the lock when the callback throws', async () => {
    const m = new DeadlineMutex(1000);
    await expect(
      m.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(m.run(async () => 'ok')).resolves.toBe('ok');
  });
});
