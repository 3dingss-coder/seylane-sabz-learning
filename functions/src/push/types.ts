export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Optional HTTPS image URL for rich push notifications. */
  imageUrl?: string;
  /** `web` => data-only message (the service worker draws the notification); otherwise FCM draws it. */
  platform?: 'web' | 'android';
}

/** Per-token outcome, safe to show to an admin (never contains the token). */
export interface PushResult {
  result: 'sent' | 'invalid' | 'failed';
  status?: number;
  code?: string;
}
export interface PushSender {
  /** Returns tokens that are permanently invalid and should be removed. */
  send(
    tokens: string[],
    msg: PushMessage,
  ): Promise<{ sent: number; invalidTokens: string[]; results?: PushResult[] }>;
}

/** Records messages instead of sending (tests / local). */
export class RecordingPushSender implements PushSender {
  readonly sent: Array<{ tokens: string[]; msg: PushMessage }> = [];
  async send(tokens: string[], msg: PushMessage) {
    this.sent.push({ tokens, msg });
    const invalidTokens = tokens.filter((t) => t.startsWith('invalid'));
    return { sent: tokens.length - invalidTokens.length, invalidTokens };
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
}
