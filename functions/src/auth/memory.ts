import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
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

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(password: string, stored: string): boolean {
  const [, saltB64, keyB64] = stored.split('$');
  if (!saltB64 || !keyB64) return false;
  const key = scryptSync(password, Buffer.from(saltB64, 'base64'), 32);
  const expected = Buffer.from(keyB64, 'base64');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

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
    const sig = createHmac('sha256', this.secret).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
  }

  private async issue(uid: string): Promise<AuthTokens> {
    const iat = Math.floor(this.now() / 1000);
    const acc = await this.store.get<Account>(`_auth/${uid}`);
    const refreshToken = randomBytes(32).toString('base64url');
    await this.store.set(`_auth_refresh/${sha(refreshToken)}`, {
      uid,
      createdAt: new Date(this.now()).toISOString(),
    });
    return {
      idToken: this.sign(uid, iat, acc?.validAfter ?? 0),
      refreshToken,
      expiresIn: TOKEN_TTL,
    };
  }

  async createUser(p: { email: string; password: string; displayName: string }) {
    const email = p.email.toLowerCase();
    const uid = this.store.newId();
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

  async refresh(refreshToken: string) {
    const key = `_auth_refresh/${sha(refreshToken)}`;
    const rec = await this.store.get<{ uid: string; rotatedAt?: number }>(key);
    if (!rec) return null;
    // Rotation with a short grace window: a refresh interrupted by a page reload (response
    // never stored by the client) must not log the user out, but old tokens die quickly.
    if (rec.rotatedAt !== undefined && this.now() - rec.rotatedAt > REFRESH_GRACE_MS) {
      await this.store.delete(key);
      return null;
    }
    const acc = await this.store.get<Account>(`_auth/${rec.uid}`);
    if (!acc || acc.disabled) return null;
    if (rec.rotatedAt === undefined) await this.store.update(key, { rotatedAt: this.now() });
    return { uid: rec.uid, tokens: await this.issue(rec.uid) };
  }

  async verify(idToken: string) {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [head, body, sig] = parts as [string, string, string];
    const expected = createHmac('sha256', this.secret)
      .update(`${head}.${body}`)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    let payload: { sub?: string; iat?: number; exp?: number; gen?: number };
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof payload;
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
