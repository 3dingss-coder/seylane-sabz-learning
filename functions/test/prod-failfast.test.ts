import { describe, expect, it } from 'vitest';
import { buildCloudflareDeps, createFetchHandler } from '../src/web-handler';
import type { D1Database } from '../src/store/d1';

const failingDb = {
  prepare() {
    throw new Error('d1 down');
  },
  async batch() {
    throw new Error('d1 down');
  },
} as unknown as D1Database;

describe('production fail-fast', () => {
  it('refuses in-memory fallback when APP_ENV=prod and DB is missing', async () => {
    await expect(
      buildCloudflareDeps({ APP_ENV: 'prod', LOCAL_AUTH_SECRET: 'x'.repeat(32) }),
    ).rejects.toThrow(/DB/);
  });

  it('still falls back to memory outside production', async () => {
    const deps = await buildCloudflareDeps({ APP_ENV: 'dev' });
    expect(deps.config.backend).toBe('memory');
  });

  it('refuses to derive the signing secret from D1 in production', async () => {
    const { InMemoryStore } = await import('../src/store/helpers');
    void InMemoryStore;
    const okDb = {
      prepare: () => ({
        bind() {
          return this;
        },
        first: async () => ({ ok: 1 }),
        all: async () => ({ results: [], success: true }),
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    } as unknown as D1Database;
    await expect(buildCloudflareDeps({ APP_ENV: 'prod', DB: okDb })).rejects.toThrow(
      /LOCAL_AUTH_SECRET/,
    );
  });

  it('health returns 503/degraded when the D1 probe fails', async () => {
    const deps = await buildCloudflareDeps({ APP_ENV: 'dev' });
    deps.health = { d1: async () => false };
    const res = await createFetchHandler(deps)(new Request('https://x.test/v1/health'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { data: { status: string; dependencies: { d1: boolean } } };
    expect(body.data.status).toBe('degraded');
    expect(body.data.dependencies.d1).toBe(false);
    void failingDb;
  });

  it('health returns 200 with healthy probes', async () => {
    const deps = await buildCloudflareDeps({ APP_ENV: 'dev' });
    deps.health = { d1: async () => true, r2: async () => true };
    const res = await createFetchHandler(deps)(new Request('https://x.test/v1/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { dependencies: { d1: boolean; r2: boolean } } };
    expect(body.data.dependencies).toEqual({ d1: true, r2: true });
  });
});
