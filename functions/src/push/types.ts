export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Optional HTTPS image URL for rich push notifications. */
  imageUrl?: string;
}
export interface PushSender {
  /** Returns tokens that are permanently invalid and should be removed. */
  send(tokens: string[], msg: PushMessage): Promise<{ sent: number; invalidTokens: string[] }>;
  /**
   * Identity of the delivery service for the admin health card. Reports only *which* provider is
   * wired up and whether it is usable — never a key, a token or any other secret (services/
   * system-health.ts). Optional: a sender without it is treated as configured-but-unknown.
   */
  describe?(): { provider: 'fcm' | 'unconfigured' | 'recording'; configured: boolean };
}

/** Records messages instead of sending (tests / local). */
export class RecordingPushSender implements PushSender {
  readonly sent: Array<{ tokens: string[]; msg: PushMessage }> = [];
  async send(tokens: string[], msg: PushMessage) {
    this.sent.push({ tokens, msg });
    const invalidTokens = tokens.filter((t) => t.startsWith('invalid'));
    return { sent: tokens.length - invalidTokens.length, invalidTokens };
  }
  describe() {
    return { provider: 'recording' as const, configured: true };
  }
}

/**
 * Used by deployed Workers when no valid FCM service account is configured.
 * Unlike RecordingPushSender it never pretends a push was delivered: any attempt to send
 * to a device throws, so campaigns and notifications record a real failure.
 */
export class UnconfiguredPushSender implements PushSender {
  async send(
    tokens: string[],
    _msg: PushMessage,
  ): Promise<{ sent: number; invalidTokens: string[] }> {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };
    throw new Error(
      'سرویس Push پیکربندی نشده است: Secret با نام FCM_SERVICE_ACCOUNT_JSON روی این Worker (یا محیط Preview آن) تنظیم نشده یا نامعتبر است.',
    );
  }
  describe() {
    return { provider: 'unconfigured' as const, configured: false };
  }
}
