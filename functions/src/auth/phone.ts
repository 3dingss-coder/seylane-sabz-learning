/**
 * Port for a real SMS/OTP provider. Implementations must send a one-time challenge, bind it to the
 * normalized phone number, enforce expiry/attempt limits, and make verification single-use. There is
 * intentionally no fake/default implementation: production phone sign-in fails closed until one is
 * wired into Deps.
 */
export interface PhoneVerificationProvider {
  requestCode(phone: string): Promise<{ challengeId: string; expiresInSec: number }>;
  verifyCode(input: { phone: string; challengeId: string; code: string }): Promise<boolean>;
}
