import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { FcmHttpPushSender, parseServiceAccount } from '../src/push/fcm-http';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = {
  project_id: 'proj-1',
  client_email: 'svc@proj-1.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function harness(sendResponder: (token: string) => Response) {
  const calls: Array<{ url: string; body: string; auth?: string }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? '');
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    calls.push({ url, body, auth });
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return json(200, { access_token: 'ya29.test', expires_in: 3600 });
    const token = (JSON.parse(body) as { message: { token: string } }).message.token;
    return sendResponder(token);
  };
  return { calls, fetchImpl };
}

describe('FcmHttpPushSender', () => {
  it('signs a valid RS256 service-account assertion', async () => {
    const s = new FcmHttpPushSender(sa, '', async () => json(200, {}));
    const jwt = await s.buildAssertion();
    const [h, c, sig] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toMatchObject({ alg: 'RS256' });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    });
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('sends one v1 request per token with the HTTPS link and reuses the access token', async () => {
    const { calls, fetchImpl } = harness(() => json(200, { name: 'm' }));
    const s = new FcmHttpPushSender(sa, 'https://academy-seylaneh.site', fetchImpl);
    const r1 = await s.send(['a', 'b'], { title: 't', body: 'b', data: { link: '/messages' } });
    const r2 = await s.send(['c'], { title: 't', body: 'b' });
    expect(r1).toEqual({ sent: 2, invalidTokens: [] });
    expect(r2.sent).toBe(1);
    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    const sendCall = calls.find((c) => c.url.includes('messages:send'));
    expect(sendCall).toBeDefined();
    const first = JSON.parse(sendCall?.body ?? '{}');
    expect(first.message.webpush.fcm_options.link).toBe('https://academy-seylaneh.site/messages');
    expect(sendCall?.auth).toBe('Bearer ya29.test');
    expect(calls.some((c) => c.url.includes('/v1/projects/proj-1/messages:send'))).toBe(true);
  });

  it('prunes only dead tokens, never tokens that failed for other reasons', async () => {
    const { fetchImpl } = harness((t) => {
      if (t === 'dead')
        return json(404, {
          error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] },
        });
      if (t === 'badtoken')
        return json(400, {
          error: {
            status: 'INVALID_ARGUMENT',
            message: 'The registration token is not a valid FCM registration token',
          },
        });
      if (t === 'badmsg')
        return json(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid link' } });
      if (t === 'quota') return json(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
      return json(200, {});
    });
    const s = new FcmHttpPushSender(sa, '', fetchImpl);
    const r = await s.send(['ok', 'dead', 'badtoken', 'badmsg', 'quota'], {
      title: 't',
      body: 'b',
    });
    expect(r.sent).toBe(1);
    expect(r.invalidTokens.sort()).toEqual(['badtoken', 'dead']);
  });

  it('parses the service account safely', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('not json')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: 'p' }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify(sa))?.project_id).toBe('proj-1');
  });
});
