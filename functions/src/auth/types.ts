export interface AuthTokens {
  idToken: string;
  refreshToken: string;
  /** seconds */
  expiresIn: number;
}

export type SignInResult =
  | { ok: true; uid: string; tokens: AuthTokens }
  | { ok: false; reason: 'invalid' | 'disabled' | 'locked' };

/**
 * Identity port (D35). The API is the only gateway: clients never talk to Firebase Auth
 * directly. Firebase implementation uses Admin SDK + Identity Toolkit REST; the memory
 * implementation is used for tests and the no-emulator local server.
 */
export interface AuthProvider {
  /** `passwordless`: phone-only account — no password is ever checked, so skip the costly hash. */
  createUser(p: {
    email: string;
    password: string;
    displayName: string;
    passwordless?: boolean;
  }): Promise<string>;
  deleteUser(uid: string): Promise<void>;
  signIn(email: string, password: string): Promise<SignInResult>;
  refresh(refreshToken: string): Promise<{ uid: string; tokens: AuthTokens } | null>;
  verify(idToken: string): Promise<{ uid: string } | null>;
  revoke(uid: string): Promise<void>;
  setDisabled(uid: string, disabled: boolean): Promise<void>;
  setPassword(uid: string, password: string): Promise<void>;
  setClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  /** Email users only (phone users are reset by an admin — D35). */
  sendPasswordResetEmail(email: string): Promise<void>;
}
