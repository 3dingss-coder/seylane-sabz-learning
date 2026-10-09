import { webpushLink } from './fcm';
import type { PushMessage, PushSender } from './types';

/**
 * FCM HTTP v1 sender that runs on Cloudflare Workers (no firebase-admin, no Node APIs):
 * service-account JWT signed with WebCrypto -> OAuth access token -> one POST per device token.
 */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const CONCURRENCY = 8;

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (j.project_id && j.client_email && j.private_key) {
      return {
        project_id: j.project_id,
        client_email: j.client_email,
        private_key: j.private_key,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlText = (t: string): string => b64url(new TextEncoder().encode(t));

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export class FcmHttpPushSender implements PushSender {
  private accessToken: { value: string; expiresAt: number } | null = null;
  private inflightToken: Promise<string> | null = null;
  private key: Promise<SigningKey> | null = null;

  constructor(
    private readonly sa: ServiceAccount,
    private readonly appUrl = '',
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
    private readonly now: () => number = () => Date.now(),
  ) {}

  private signingKey(): Promise<SigningKey> {
    this.key ??= crypto.subtle.importKey(
      'pkcs8',
      pemToDer(this.sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return this.key;
  }

  async buildAssertion(): Promise<string> {
    const iat = Math.floor(this.now() / 1000);
    const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64urlText(
      JSON.stringify({
        iss: this.sa.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    );
    const unsigned = `${header}.${claims}`;
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      await this.signingKey(),
      new TextEncoder().encode(unsigned),
    );
    return `${unsigned}.${b64url(sig)}`;
  }

  private getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > this.now()) {
      return Promise.resolve(this.accessToken.value);
    }
    this.inflightToken ??= (async () => {
      try {
        const res = await this.fetchImpl(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: await this.buildAssertion(),
          }).toString(),
        });
        if (!res.ok) throw new Error(`fcm oauth failed: HTTP ${res.status}`);
        const j = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!j.access_token) throw new Error('fcm oauth failed: no access_token');
        this.accessToken = {
          value: j.access_token,
          expiresAt: this.now() + (j.expires_in ?? 3600) * 1000,
        };
        return j.access_token;
      } finally {
        this.inflightToken = null;
      }
    })();
    return this.inflightToken;
  }

  private body(token: string, msg: PushMessage) {
    const link = webpushLink(this.appUrl, msg.data?.link);
    return {
      message: {
        token,
        notification: { title: msg.title, body: msg.body, ...(msg.imageUrl ? { image: msg.imageUrl } : {}) },
        data: msg.data ?? {},
        android: { priority: 'HIGH' },
        webpush: {
          notification: { icon: '/icons/icon-192.png', dir: 'rtl', lang: 'fa', ...(msg.imageUrl ? { image: msg.imageUrl } : {}) },
          ...(link ? { fcm_options: { link } } : {}),
        },
      },
    };
  }

  /** true = token is permanently dead; false = delivered or a transient/unrelated failure. */
  private async sendOne(
    access: string,
    token: string,
    msg: PushMessage,
  ): Promise<'sent' | 'invalid' | 'failed'> {
    const res = await this.fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.sa.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.body(token, msg)),
      },
    );
    if (res.ok) return 'sent';
    let code = '';
    let message = '';
    try {
      const j = (await res.json()) as {
        error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
      };
      code = j.error?.details?.find((d) => d.errorCode)?.errorCode ?? j.error?.status ?? '';
      message = j.error?.message ?? '';
    } catch {
      // non-JSON error body
    }
    // Only prune when FCM says the token itself is dead, never for a bad message/link.
    if (code === 'UNREGISTERED' || res.status === 404) return 'invalid';
    if (code === 'INVALID_ARGUMENT' && /registration token/i.test(message)) return 'invalid';
    return 'failed';
  }

  async send(tokens: string[], msg: PushMessage) {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };
    const access = await this.getAccessToken();
    let sent = 0;
    const invalidTokens: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < tokens.length) {
        const t = tokens[next++] as string;
        try {
          const r = await this.sendOne(access, t, msg);
          if (r === 'sent') sent++;
          else if (r === 'invalid') invalidTokens.push(t);
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              msg: 'fcm send failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker));
    return { sent, invalidTokens };
  }
}
