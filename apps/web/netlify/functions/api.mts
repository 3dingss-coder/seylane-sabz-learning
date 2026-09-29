import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Config, Context } from '@netlify/functions';
import { createApp } from '../../../../functions/src/app';
import { MemoryAuthProvider } from '../../../../functions/src/auth/memory';
import { loadConfig } from '../../../../functions/src/config';
import { GeminiClient } from '../../../../functions/src/llm/gemini';
import { DisabledMailer, type Mailer } from '../../../../functions/src/mail/types';
import type { PushSender } from '../../../../functions/src/push/types';
import type { Deps } from '../../../../functions/src/services/context';
import { systemClock } from '../../../../functions/src/lib/time';
import { NetlifyBlobStore, netlifyFilesRouter } from '../api/blob-store';
import { PgStore } from '../api/pg-store';

/** Web push needs Firebase Cloud Messaging, which isn't configured on Netlify. */
const noPush: PushSender = { send: async () => ({ sent: 0, invalidTokens: [] }) };

/** Token-signing secret: LOCAL_AUTH_SECRET if set, else one generated once and kept in the DB. */
async function signingSecret(store: PgStore): Promise<string> {
  if (process.env.LOCAL_AUTH_SECRET) return process.env.LOCAL_AUTH_SECRET;
  const path = '_system/auth_secret';
  const existing = await store.get<{ value: string }>(path);
  if (existing) return existing.value;
  try {
    await store.create(path, { value: randomBytes(48).toString('base64url') });
  } catch {
    /* created concurrently by another instance */
  }
  return (await store.get<{ value: string }>(path))!.value;
}

async function buildDeps(): Promise<Deps> {
  const config = loadConfig({ ...process.env, APP_ENV: process.env.APP_ENV ?? 'prod' });
  const store = new PgStore();
  const secret = await signingSecret(store);
  let mail: Mailer = new DisabledMailer();
  if (config.smtpUrl) {
    const { SmtpMailer } = await import('../../../../functions/src/mail/smtp');
    mail = new SmtpMailer(config.smtpUrl, config.mailFrom);
  }
  return {
    config: { ...config, localSecret: secret },
    store,
    auth: new MemoryAuthProvider(store, secret),
    blob: new NetlifyBlobStore(secret),
    push: noPush,
    mail,
    llm: config.geminiApiKey ? new GeminiClient(config.geminiApiKey, config.geminiModel) : null,
    clock: systemClock,
  };
}

/**
 * The Express API (functions/src/app.ts) runs on a loopback server inside the function and
 * requests are forwarded to it, so all routes, middleware and error handling stay unchanged.
 */
let origin: Promise<string> | null = null;
function server(): Promise<string> {
  origin ??= (async () => {
    const deps = await buildDeps();
    const app = createApp(deps, { filesRouter: netlifyFilesRouter(deps.blob as NetlifyBlobStore) });
    const srv = http.createServer(app);
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  })().catch((e: unknown) => {
    origin = null;
    throw e;
  });
  return origin;
}

const HOP_BY_HOP = ['host', 'connection', 'content-length', 'transfer-encoding', 'x-forwarded-for'];

export default async (req: Request, context: Context) => {
  let base: string;
  try {
    base = await server();
  } catch (e) {
    console.error('[api] startup failed', e);
    return Response.json(
      { error: { code: 'INTERNAL', message: 'سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.' } },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set('x-forwarded-for', context.ip);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await fetch(`${base}${url.pathname}${url.search}`, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const out = new Headers(res.headers);
  out.delete('content-length');
  out.delete('content-encoding');
  out.delete('transfer-encoding');
  out.delete('connection');
  return new Response(res.body, { status: res.status, headers: out });
};

export const config: Config = {
  path: '/v1/*',
};
