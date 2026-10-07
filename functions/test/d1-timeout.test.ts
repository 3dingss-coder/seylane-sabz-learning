import { afterEach, describe, expect, it, vi } from 'vitest';
import { D1Store, D1_CALL_TIMEOUT_MS } from '../src/store/d1';
import type { D1Database } from '../src/store/d1';
import { describeError } from '../src/services/cron';

/** A D1 stub: the first first() never settles, later ones answer. */
function stubDb(): D1Database {
  let calls = 0;
  return {
    prepare: () => ({
      bind() {
        return this;
      },
      first: () => (calls++ === 0 ? new Promise(() => {}) : Promise.resolve({ data: '{"a":1}' })),
      all: async () => ({ results: [], success: true }),
      run: async () => ({ success: true }),
    }),
    batch: async () => [],
  } as unknown as D1Database;
}

afterEach(() => vi.useRealTimers());

describe('D1 call timeout', () => {
  it('a stalled call fails fast and does not freeze the queue behind it', async () => {
    vi.useFakeTimers();
    const store = new D1Store(stubDb()) as unknown as {
      readRaw(c: string, i: string): Promise<unknown>;
    };
    const first = store.readRaw('users', 'a');
    const second = store.readRaw('users', 'b');
    const firstResult = expect(first).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 10);
    await firstResult;
    await expect(second).resolves.toEqual({ a: 1 });
  });
});

describe('cron error logging', () => {
  it('keeps the message and cause that Workers drops', () => {
    const err = new Error('boom', { cause: new Error('root cause') });
    const text = describeError(err);
    expect(text).toContain('boom');
    expect(text).toContain('root cause');
  });
  it('handles non-Error throws', () => {
    expect(describeError('plain')).toContain('plain');
  });
});
