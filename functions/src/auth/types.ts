export interface AuthTokens {
  idToken: string;
  refreshToken: string;
  /** seconds */
  expiresIn: number;
}

/**
 * Identity port. The public API has no password, OTP, or phone-login credential exchange.
 * Phone registration may create only an inactive marketer record; it never issues a session.
 */
export interface AuthProvider {
  createUser(p: { email: string; displayName: string }): Promise<string>;
  deleteUser(uid: string): Promise<void>;
  refresh(refreshToken: string): Promise<{ uid: string; tokens: AuthTokens } | null>;
  verify(idToken: string): Promise<{ uid: string } | null>;
  revoke(uid: string): Promise<void>;
  setDisabled(uid: string, disabled: boolean): Promise<void>;
  setClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
}
