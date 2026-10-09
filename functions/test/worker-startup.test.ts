import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ build: vi.fn(), create: vi.fn() }));

vi.mock('../src/web-handler', () => ({
  buildCloudflareDeps: state.build,
  createFetchHandler: state.create,
}));

import worker from '../src/cloudflare-worker';
import type { CloudflareEnv } from '../src/web-handler';
import { D1_INIT_TIMEOUT_MS } from '../src/store/d1';

const request = () => new Request('https://worker.test/v1/health');

describe('Cloudflare Worker startup cache', () => {
  it('keeps a late stale failure from clearing dependencies built for a newer D1 binding', async () => {
    const db1 = { prepare: vi.fn() } as unknown as NonNullable<CloudflareEnv['DB']>;
    const db2 = { prepare: vi.fn() } as unknown as NonNullable<CloudflareEnv['DB']>;
    let rejectFirst!: (reason: Error) => void;
    const firstBuild = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.build.mockReset();
    state.create.mockReset().mockImplementation(() => async () => new Response('ok'));
    state.build.mockImplementationOnce(() => firstBuild).mockResolvedValueOnce({} as never);

    try {
      const staleRequest = worker.fetch(request(), { DB: db1 });
      expect(state.build).toHaveBeenCalledTimes(1);

      const current = await worker.fetch(request(), { DB: db2 });
      expect(current.status).toBe(200);
      expect(await current.text()).toBe('ok');

      rejectFirst(new Error('late stale initialization failure'));
      expect((await staleRequest).status).toBe(503);

      const reused = await worker.fetch(request(), { DB: db2 });
      expect(reused.status).toBe(200);
      expect(state.build).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it('bounds a stalled shared startup and permits a fresh attempt after the caller deadline', async () => {
    vi.useFakeTimers();
    const db = { prepare: vi.fn() } as unknown as NonNullable<CloudflareEnv['DB']>;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.build.mockReset();
    state.create.mockReset().mockImplementation(() => async () => new Response('ok'));
    state.build
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({} as never);

    try {
      const stalled = worker.fetch(request(), { DB: db });
      expect(state.build).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(D1_INIT_TIMEOUT_MS + 1);
      expect((await stalled).status).toBe(503);

      const retried = await worker.fetch(request(), { DB: db });
      expect(retried.status).toBe(200);
      expect(state.build).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      log.mockRestore();
    }
  });
});
