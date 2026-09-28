import { vi } from 'vitest';

type Handler = (
  body: unknown,
  init: RequestInit,
) => { status?: number; data?: unknown; error?: { code: string; message: string } };

/** Minimal fetch router for page tests: `{ 'POST /v1/auth/login': () => ({ data }) }`. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Array<{ key: string; body: unknown; headers: Record<string, string> }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body, headers: (init.headers ?? {}) as Record<string, string> });
    const h = routes[key] ?? routes[`${init.method ?? 'GET'} ${url.pathname}${url.search}`];
    if (!h)
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: `no mock for ${key}` } }),
        { status: 404 },
      );
    const r = h(body, init);
    const status = r.status ?? (r.error ? 400 : 200);
    return new Response(JSON.stringify(r.error ? { error: r.error } : { data: r.data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
