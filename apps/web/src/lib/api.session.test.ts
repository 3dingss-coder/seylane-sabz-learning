import { beforeEach, describe, expect, it, vi } from 'vitest';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauth = { error: { code: 'UNAUTHENTICATED', message: 'x' } };

/** Fresh module graph per test: api.ts keeps single-flight refresh state at module level. */
async function load() {
  vi.resetModules();
  const { session } = await import('./session');
  const api = await import('./api');
  session.clear();
  session.setRefresh('refresh-token-aaaaaaaaaa');
  return { session, ...api };
}

describe('session survives transient failures', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the refresh token when /auth/refresh answers 503', async () => {
    const { session, request, setSessionExpiredHandler } = await load();
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/auth/refresh')
        ? json(503, { error: { code: 'INTERNAL', message: 'x' } })
        : json(401, unauth),
    );
    await expect(request('/me')).rejects.toBeTruthy();
    expect(session.refresh).toBe('refresh-token-aaaaaaaaaa');
    expect(expired).not.toHaveBeenCalled();
  });

  it('logs out when /auth/refresh answers 401', async () => {
    const { session, request, setSessionExpiredHandler } = await load();
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(401, unauth));
    await expect(request('/me')).rejects.toBeTruthy();
    expect(session.refresh).toBeNull();
    expect(expired).toHaveBeenCalled();
  });

  it('retries phone-login once on 503', async () => {
    const { request } = await load();
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ++n === 1 ? json(503, { error: { code: 'INTERNAL', message: 'x' } }) : json(200, { data: { ok: 1 } }),
    );
    await expect(
      request('/auth/phone-login', { method: 'POST', body: { phone: '0912' }, anonymous: true }),
    ).resolves.toEqual({ ok: 1 });
    expect(n).toBe(2);
  });
});
