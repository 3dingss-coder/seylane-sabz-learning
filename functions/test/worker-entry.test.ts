import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { acquireRuntime, resetRuntimeForTests } from '../src/cloudflare-worker';
import type { CloudflareEnv } from '../src/web-handler';
import { createSqliteD1, withFaults, type FaultAction } from './support/sqlite-d1';

/**
 * Startup path shared by fetch and scheduled: every caller waits with its OWN timer, a startup whose
 * starting request vanished never blocks anyone, and a late result of an abandoned startup cannot
 * clobber a newer one. MODELLED with an emulated D1 whose first DDL batch never settles; this does
 * not prove the Cloudflare runtime behaviour, it proves our code does not depend on it.
 */

let ddlBatches = 0;
const mkEnv = (first: FaultAction): CloudflareEnv => {
  ddlBatches = 0;
  const db = withFaults(createSqliteD1(), {
    before: (kind) => (kind === 'batch' && ddlBatches++ === 0 ? first : 'ok'),
  });
  return { DB: db, APP_ENV: 'dev', JWT_SECRET: 'x'.repeat(40) } as unknown as CloudflareEnv;
};

const ctx = { waitUntil: () => undefined };
let logs: string[] = [];

beforeEach(() => {
  resetRuntimeForTests();
  logs = [];
  for (const m of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, m).mockImplementation(
      (...a: unknown[]) => void logs.push(a.map(String).join(' ')),
    );
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('shared startup (fetch + scheduled)', () => {
  it('abandoned startup: A hangs, B times out on its own timer, C starts fresh and succeeds', async () => {
    const env = mkEnv('hang');
    // A and B share the one startup; B's wait is bounded by B's own timer.
    void acquireRuntime(env, { waitMs: 5_000 }).catch(() => undefined);
    await expect(acquireRuntime(env, { waitMs: 80 })).rejects.toThrow(/worker startup timed out/);
    const rt = await acquireRuntime(env, { waitMs: 2_000 });
    expect(rt.handler).toBeTypeOf('function');
  });

  it('a late result of the abandoned startup does not clobber the newer one', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const env = mkEnv({ holdUntil: gate });
    const a = acquireRuntime(env, { waitMs: 60 }).catch(() => 'a-timeout');
    expect(await a).toBe('a-timeout');
    const c = await acquireRuntime(env, { waitMs: 2_000 });
    release(); // A's startup finishes late
    await new Promise((r) => setTimeout(r, 30));
    expect(await acquireRuntime(env, { waitMs: 2_000 })).toBe(c); // identity kept
  });

  it('cron after an abandoned startup: bounded, retries fresh, and runs', async () => {
    const env = mkEnv('hang');
    void acquireRuntime(env, { waitMs: 5_000 }).catch(() => undefined);
    // scheduled() uses the default wait; use a cron expression with no jobs so it only exercises startup.
    const t0 = Date.now();
    vi.useFakeTimers();
    const run = worker.scheduled({ cron: 'none', scheduledTime: t0 }, env, ctx);
    const settled = run.then(
      () => 'ok',
      (e: Error) => `err:${e.message}`,
    );
    await vi.advanceTimersByTimeAsync(40_000);
    expect(await settled).toBe('ok');
    vi.useRealTimers();
  });

  it('cron fails the invocation (not a silent success) when startup never succeeds', async () => {
    const env = {
      DB: { prepare: () => ({}), batch: () => new Promise(() => {}) },
    } as unknown as CloudflareEnv;
    vi.useFakeTimers();
    const settled = worker.scheduled({ cron: 'x', scheduledTime: 0 }, env, ctx).then(
      () => 'ok',
      () => 'failed',
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await settled).toBe('failed');
    vi.useRealTimers();
  });
});

describe('X-Request-Id and logging', () => {
  it('always returns X-Request-Id: cf-ray when present, generated otherwise', async () => {
    const env = mkEnv('ok');
    const a = await worker.fetch(
      new Request('https://x.test/v1/health', { headers: { 'cf-ray': '8abc-FRA' } }),
      env,
    );
    expect(a.headers.get('X-Request-Id')).toBe('8abc-FRA');
    const b = await worker.fetch(new Request('https://x.test/v1/health'), env);
    expect(b.headers.get('X-Request-Id')).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    const nf = await worker.fetch(new Request('https://x.test/v1/does-not-exist'), env);
    expect(nf.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('startup failure answers 503 + Retry-After + X-Request-Id and logs no secrets', async () => {
    resetRuntimeForTests();
    const env = {
      DB: { prepare: () => ({}), batch: () => Promise.reject(new Error('boom')) },
      JWT_SECRET: 'super-secret-signing-key-value-1234567890',
    } as unknown as CloudflareEnv;
    const res = await worker.fetch(
      new Request('https://x.test/v1/me/sections/s1/progress', {
        method: 'POST',
        headers: { authorization: 'Bearer SECRET-TOKEN-VALUE', 'cf-ray': 'ray-1' },
        body: '{"positionSec":1,"playedDeltaSec":1}',
      }),
      env,
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('2');
    expect(res.headers.get('X-Request-Id')).toBe('ray-1');
    const all = logs.join('\n');
    expect(all).toContain('ray-1');
    expect(all).not.toContain('SECRET-TOKEN-VALUE');
    expect(all).not.toContain('super-secret-signing-key');
  });
});
