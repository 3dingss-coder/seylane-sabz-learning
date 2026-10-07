import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps } from '../src/services/context';

const never = () => new Promise<never>(() => undefined);
const builds = { n: 0, hangFirst: true };

vi.mock('../src/web-handler', () => ({
  buildCloudflareDeps: vi.fn(() => {
    builds.n++;
    if (builds.hangFirst && builds.n === 1) return never(); // request A, cancelled
    return Promise.resolve({ id: `deps-${builds.n}` } as unknown as Deps);
  }),
  createFetchHandler: vi.fn(() => async () => new Response('ok')),
}));

const req = (path = '/v1/health') => new Request(`https://example.com${path}`);
const env = { DB: { prepare: () => undefined } } as never;

describe('Worker entry: cold start with a cancelled first request', () => {
  beforeEach(() => {
    builds.n = 0;
    builds.hangFirst = true;
    vi.resetModules();
  });

  it('later requests are served even though the first build never finished', async () => {
    const { default: worker } = await import('../src/cloudflare-worker');
    void worker.fetch(req(), env); // request A: never completes
    const b = await worker.fetch(req(), env); // request B must not hang
    expect(b.status).toBe(200);
    expect(await b.text()).toBe('ok');
  });

  it('after the first successful build everyone reuses it (no rebuild per request)', async () => {
    builds.hangFirst = false;
    const { default: worker } = await import('../src/cloudflare-worker');
    for (let i = 0; i < 5; i++) expect((await worker.fetch(req(), env)).status).toBe(200);
    expect(builds.n).toBe(1);
  });

  it('a failed build answers 503 and the next request retries', async () => {
    builds.hangFirst = false;
    const web = await import('../src/web-handler');
    vi.mocked(web.buildCloudflareDeps).mockRejectedValueOnce(new Error('d1 down'));
    const { default: worker } = await import('../src/cloudflare-worker');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await worker.fetch(req(), env)).status).toBe(503);
    expect((await worker.fetch(req(), env)).status).toBe(200);
    spy.mockRestore();
  });
});
