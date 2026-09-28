import type { Auth } from 'firebase-admin/auth';
import type { AuthProvider, AuthTokens, SignInResult } from './types';

/**
 * Firebase Auth adapter (D35): Admin SDK for management, Identity Toolkit REST for
 * password sign-in / token refresh (the Admin SDK cannot verify passwords).
 * Works against the Auth emulator when FIREBASE_AUTH_EMULATOR_HOST is set.
 */
export class FirebaseAuthProvider implements AuthProvider {
  private readonly idtBase: string;
  private readonly stsBase: string;

  constructor(
    private readonly auth: Auth,
    private readonly apiKey: string,
    emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST,
  ) {
    this.idtBase = emulatorHost
      ? `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`
      : 'https://identitytoolkit.googleapis.com/v1';
    this.stsBase = emulatorHost
      ? `http://${emulatorHost}/securetoken.googleapis.com/v1`
      : 'https://securetoken.googleapis.com/v1';
  }

  async createUser(p: { email: string; password: string; displayName: string }) {
    const u = await this.auth.createUser({
      email: p.email.toLowerCase(),
      password: p.password,
      displayName: p.displayName,
    });
    return u.uid;
  }
  async deleteUser(uid: string) {
    await this.auth.deleteUser(uid).catch(() => undefined);
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const res = await fetch(`${this.idtBase}/accounts:signInWithPassword?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = (await res.json()) as {
      localId?: string;
      idToken?: string;
      refreshToken?: string;
      expiresIn?: string;
      error?: { message?: string };
    };
    if (!res.ok || !body.localId || !body.idToken || !body.refreshToken) {
      const msg = body.error?.message ?? '';
      if (msg.startsWith('USER_DISABLED')) return { ok: false, reason: 'disabled' };
      if (msg.startsWith('TOO_MANY_ATTEMPTS')) return { ok: false, reason: 'locked' };
      if (/EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|INVALID_EMAIL/.test(msg))
        return { ok: false, reason: 'invalid' };
      throw new Error(`Identity Toolkit sign-in failed: ${msg || res.status}`);
    }
    return {
      ok: true,
      uid: body.localId,
      tokens: {
        idToken: body.idToken,
        refreshToken: body.refreshToken,
        expiresIn: Number(body.expiresIn ?? 3600),
      },
    };
  }

  async refresh(refreshToken: string): Promise<{ uid: string; tokens: AuthTokens } | null> {
    const res = await fetch(`${this.stsBase}/token?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;
    const b = (await res.json()) as {
      id_token: string;
      refresh_token: string;
      expires_in: string;
      user_id: string;
    };
    return {
      uid: b.user_id,
      tokens: {
        idToken: b.id_token,
        refreshToken: b.refresh_token,
        expiresIn: Number(b.expires_in),
      },
    };
  }

  async verify(idToken: string) {
    try {
      const d = await this.auth.verifyIdToken(idToken, true);
      return { uid: d.uid };
    } catch {
      return null;
    }
  }
  async revoke(uid: string) {
    await this.auth.revokeRefreshTokens(uid);
  }
  async setDisabled(uid: string, disabled: boolean) {
    await this.auth.updateUser(uid, { disabled });
  }
  async setPassword(uid: string, password: string) {
    await this.auth.updateUser(uid, { password });
  }
  async setClaims(uid: string, claims: Record<string, unknown>) {
    await this.auth.setCustomUserClaims(uid, claims);
  }
  async sendPasswordResetEmail(email: string) {
    await fetch(`${this.idtBase}/accounts:sendOobCode?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
  }
}
