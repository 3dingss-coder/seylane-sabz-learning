import type { Auth } from 'firebase-admin/auth';
import type { AuthProvider } from './types';

/**
 * Legacy Firebase Auth adapter used by the Functions runtime for existing sessions and trusted
 * account provisioning. It deliberately provides no password sign-in, phone verification, or
 * initial session issuer, so public phone-only registration is disabled on this adapter.
 */
export class FirebaseAuthProvider implements AuthProvider {
  private readonly stsBase: string;

  constructor(
    private readonly auth: Auth,
    private readonly apiKey: string,
    emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST,
  ) {
    this.stsBase = emulatorHost
      ? `http://${emulatorHost}/securetoken.googleapis.com/v1`
      : 'https://securetoken.googleapis.com/v1';
  }

  async createUser(p: { email: string; displayName: string }) {
    // No password credential is created. A future approved identity provider must explicitly
    // establish identity before this account can receive a session.
    const u = await this.auth.createUser({
      email: p.email.toLowerCase(),
      displayName: p.displayName,
    });
    return u.uid;
  }

  async deleteUser(uid: string) {
    await this.auth.deleteUser(uid).catch(() => undefined);
  }

  async refresh(refreshToken: string) {
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

  async setClaims(uid: string, claims: Record<string, unknown>) {
    await this.auth.setCustomUserClaims(uid, claims);
  }
}
