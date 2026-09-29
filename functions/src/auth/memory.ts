import {
  base64UrlToString,
  hashPassword,
  hmacSha256Base64Url,
  randomBytesBase64Url,
  sha256Hex,
  stringToBase64Url,
  timingSafeEqualStr,
  verifyPassword,
} from '../lib/crypto';
import type { DocStore } from '../store/types';
import type { AuthProvider, AuthTokens, SignInResult } from './types';

interface Account {
  email: string;
  passwordHash: string;
  displayName: string;
  disabled: boolean;
  claims: Record<string, unknown>;
  /** epoch seconds; tokens issued before are invalid */
  validAfter: number;
}

const REFRESH_GRACE_MS = 30_000;
const TOKEN_TTL = 3600;

const b64 = (o: unknown) => stringToBase64Url(JSON.stringify(o));
const sha = (s: string) => sha256Hex(s);

/** Self-contained auth (HS256 JWT + opaque refresh tokens) persisted in the DocStore. */
export class MemoryAuthProvider implements AuthProvider {
  constructor(
    private readonly store: DocStore,
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private sign(uid: string, iat: number, gen: number): string {
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ sub: uid, iat, exp: iat + TOKEN_TTL, gen });
    const sig = hmacSha256Base64Url(this.secret, `${head}.${body}`);
    return `${head}.${body}.${sig}`;
  }

  private async issue(uid: string): Promise<AuthTokens> {
    const iat = Math.floor(this.now() / 1000);
    const acc = await this.store.get<Account>(`_auth/${uid}`);
    const gen = acc?.validAfter ?? 0;
    const rtPayload = b64({ uid, gen, n: randomBytesBase64Url(12) });
    const rtSig = hmacSha256Base64Url(this.secret, `rt.${rtPayload}`);
    const refreshToken = `${rtPayload}.${rtSig}`;
    await this.store.set(`_auth_refresh/${sha(refreshToken)}`, {
      uid,
      createdAt: new Date(this.now()).toISOString(),
    });
    return {
      idToken: this.sign(uid, iat, gen),
      refreshToken,
      expiresIn: TOKEN_TTL,
    };
  }

  async createUser(p: { email: string; password: string; displayName: string }) {
    const email = p.email.toLowerCase();
    const deterministicId = `u_${sha(email).slice(0, 18)}`;
    const uid = (await this.store.get(`_auth/${deterministicId}`))
      ? this.store.newId()
      : deterministicId;
    await this.store.create(`_auth_email/${sha(email)}`, { uid });
    await this.store.create(`_auth/${uid}`, {
      email,
      passwordHash: hashPassword(p.password),
      displayName: p.displayName,
      disabled: false,
      claims: {},
      validAfter: 0,
    } satisfies Account);
    return uid;
  }

  async deleteUser(uid: string) {
    const acc = await this.store.get<Account>(`_auth/${uid}`);
    if (!acc) return;
    await this.store.delete(`_auth_email/${sha(acc.email)}`);
    await this.store.delete(`_auth/${uid}`);
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const link = await this.store.get<{ uid: string }>(`_auth_email/${sha(email.toLowerCase())}`);
    const acc = link ? await this.store.get<Account>(`_auth/${link.uid}`) : null;
    if (!link || !acc || !verifyPassword(password, acc.passwordHash))
      return { ok: false, reason: 'invalid' };
    if (acc.disabled) return { ok: false, reason: 'disabled' };
    return { ok: true, uid: link.uid, tokens: await this.issue(link.uid) };
  }

  /** Phone-only login for the MemoryAuthProvider (local + Cloudflare D1), never Firebase Auth. */
  async demoSignIn(email: string): Promise<SignInResult> {
    const link = await this.store.get<{ uid: string }>(`_auth_email/${sha(email.toLowerCase())}`);
    const acc = link ? await this.store.get<Account>(`_auth/${link.uid}`) : null;
    if (!link || !acc) return { ok: false, reason: 'invalid' };
    if (acc.disabled) return { ok: false, reason: 'disabled' };
    return { ok: true, uid: link.uid, tokens: await this.issue(link.uid) };
  }

  async refresh(refreshToken: string) {
    const key = `_auth_refresh/${sha(refreshToken)}`;
    let rec: { uid: string; rotatedAt?: number; revoked?: boolean } | null = await this.store.get<{
      uid: string;
      rotatedAt?: number;
      revoked?: boolean;
    }>(key);
    if (rec?.revoked) return null;
    if (!rec) {
      const parts = refreshToken.split('.');
      if (parts.length !== 2) return null;
      const [rtPayload, rtSig] = parts as [string, string];
      const expected = hmacSha256Base64Url(this.secret, `rt.${rtPayload}`);
      if (!timingSafeEqualStr(rtSig, expected)) return null;
      try {
        const parsed = JSON.parse(base64UrlToString(rtPayload)) as {
          uid?: string;
          gen?: number;
        };
        if (!parsed.uid) return null;
        const accCheck = await this.store.get<Account>(`_auth/${parsed.uid}`);
        if (!accCheck || accCheck.disabled || (parsed.gen ?? 0) !== accCheck.validAfter)
          return null;
        rec = { uid: parsed.uid };
      } catch {
        return null;
      }
    }
    if (!rec) return null;
    // Rotation with a short grace window: a refresh interrupted by a page reload (response
    // never stored by the client) must not log the user out, but old tokens die quickly.
    if (rec.rotatedAt !== undefined && this.now() - rec.rotatedAt > REFRESH_GRACE_MS) {
      await this.store.set(key, { uid: rec.uid, revoked: true });
      return null;
    }
    const acc = await this.store.get<Account>(`_auth/${rec.uid}`);
    if (!acc || acc.disabled) return null;
    if (rec.rotatedAt === undefined) {
      await this.store.set(key, { ...rec, rotatedAt: this.now() }, { merge: true });
    }
    return { uid: rec.uid, tokens: await this.issue(rec.uid) };
  }

  async verify(idToken: string) {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [head, body, sig] = parts as [string, string, string];
    const expected = hmacSha256Base64Url(this.secret, `${head}.${body}`);
    if (!timingSafeEqualStr(sig, expected)) return null;
    let payload: { sub?: string; iat?: number; exp?: number; gen?: number };
    try {
      payload = JSON.parse(base64UrlToString(body)) as typeof payload;
    } catch {
      return null;
    }
    if (!payload.sub || !payload.exp || !payload.iat || payload.exp < this.now() / 1000)
      return null;
    const acc = await this.store.get<Account>(`_auth/${payload.sub}`);
    // validAfter is a revocation generation counter: revoke() invalidates every earlier token.
    if (!acc || acc.disabled || (payload.gen ?? 0) !== acc.validAfter) return null;
    return { uid: payload.sub };
  }

  async revoke(uid: string) {
    const acc = await this.store.get<Account>(`_auth/${uid}`);
    await this.store.update(`_auth/${uid}`, { validAfter: (acc?.validAfter ?? 0) + 1 });
    const tokens = await this.store.query<{ uid: string }>({
      collection: '_auth_refresh',
      where: [['uid', '==', uid]],
    });
    for (const t of tokens) await this.store.delete(`_auth_refresh/${t.id}`);
  }
  async setDisabled(uid: string, disabled: boolean) {
    await this.store.update(`_auth/${uid}`, { disabled });
  }
  async setPassword(uid: string, password: string) {
    await this.store.update(`_auth/${uid}`, { passwordHash: hashPassword(password) });
  }
  async setClaims(uid: string, claims: Record<string, unknown>) {
    await this.store.update(`_auth/${uid}`, { claims });
  }
  async sendPasswordResetEmail(email: string) {
    // Local mode has no mail transport; the link would be logged by a real provider.
    console.info(`[auth:memory] password reset requested for ${email.replace(/(.).+@/, '$1***@')}`);
  }
}
