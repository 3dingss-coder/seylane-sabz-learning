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

  it('does not retry phone-login on 503 because POST retries are not implicit', async () => {
    const { request } = await load();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(503, { error: { code: 'INTERNAL', message: 'x' } }),
    );
    await expect(
      request('/auth/phone-login', { method: 'POST', body: { phone: '0912' }, anonymous: true }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a clear message for Cloudflare edge JSON errors (no `error` field)', async () => {
    const { request } = await load();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(503, { title: 'Error 1102: Worker exceeded resource limits', status: 503 }),
    );
    await expect(
      request('/auth/phone-login', { method: 'POST', body: { phone: '0912' }, anonymous: true }),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 503, message: expect.stringContaining('شلوغ') });
  });
});
