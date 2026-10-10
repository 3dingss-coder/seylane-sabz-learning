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
