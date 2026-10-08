import { afterEach, describe, expect, it, vi } from 'vitest';
import { D1Store, D1_CALL_TIMEOUT_MS, ensureD1Schema } from '../src/store/d1';
import type { D1Database } from '../src/store/d1';
import { describeError } from '../src/services/cron';
import { D1RateLimitStore } from '../src/http/rateLimitD1';
import { CloudflareBlobStore } from '../src/blob/cloudflare';

/** A D1 stub: the first two first() calls never settle; the third answers. */
function stubDb(): D1Database {
  let calls = 0;
  return {
    prepare: () => ({
      bind() {
        return this;
      },
      first: () => (calls++ < 2 ? new Promise(() => {}) : Promise.resolve({ data: '{"a":1}' })),
      all: async () => ({ results: [], success: true }),
      run: async () => ({ success: true }),
    }),
    batch: async () => [],
  } as unknown as D1Database;
}

afterEach(() => vi.useRealTimers());

describe('D1 call timeout', () => {
  it('bounds both D1 execution and queue wait without freezing later calls', async () => {
    vi.useFakeTimers();
    const store = new D1Store(stubDb()) as unknown as {
      readRaw(c: string, i: string): Promise<unknown>;
    };
    const first = store.readRaw('users', 'a');
    await vi.advanceTimersByTimeAsync(1);
    const second = store.readRaw('users', 'b');
    const firstResult = expect(first).rejects.toThrow(/timed out/);
    const secondResult = expect(second).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 10);
    await Promise.all([firstResult, secondResult]);

    await expect(store.readRaw('users', 'c')).resolves.toEqual({ a: 1 });
  });
});

describe('D1-backed blob read timeout', () => {
  it('bounds the direct D1 stat used by the scheduled media extractor', async () => {
    vi.useFakeTimers();
    let statCalls = 0;
    const db = {
      prepare: () => ({
        bind() {
          return this;
        },
        first: () => {
          statCalls++;
          return new Promise(() => {});
        },
        all: async () => ({ results: [], success: true }),
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    } as unknown as D1Database;
    await ensureD1Schema(db);
    const blobs = new CloudflareBlobStore('test-secret', { db });
    const stat = blobs.stat('media/video/test.mp4');
    const statResult = expect(stat).rejects.toThrow(/D1 blob stat timed out/);

    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 10);
    await statResult;
    expect(statCalls).toBe(1);
  });
});

describe('D1-backed rate limiter timeout', () => {
  it('bounds a stalled counter update and does not start queued SQL after its deadline', async () => {
    vi.useFakeTimers();
    let updateCalls = 0;
    const db = {
      prepare: () => ({
        bind() {
          return this;
        },
        first: () => {
          updateCalls++;
          return new Promise(() => {});
        },
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    } as unknown as D1Database;
    const store = new D1RateLimitStore(db);
    const first = store.hit('user:first', 20, 60_000, 1_000);
    const second = store.hit('user:second', 20, 60_000, 1_000);
    const firstResult = expect(first).rejects.toThrow(/D1 rate-limit update timed out/);
    const secondResult = expect(second).rejects.toThrow(/D1 rate-limit update timed out/);

    await vi.advanceTimersByTimeAsync(D1_CALL_TIMEOUT_MS + 10);
    await Promise.all([firstResult, secondResult]);
    expect(updateCalls).toBe(1);
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
