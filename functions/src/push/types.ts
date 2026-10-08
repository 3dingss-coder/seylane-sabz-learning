export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}
export interface PushSender {
  /** False when this deployment has no real push transport configured (prevents fake delivery status). */
  readonly enabled?: boolean;
  /** Returns tokens that are permanently invalid and should be removed. */
  send(tokens: string[], msg: PushMessage): Promise<{ sent: number; invalidTokens: string[] }>;
}

/** Records messages instead of sending (tests / local). */
export class RecordingPushSender implements PushSender {
  readonly enabled = true;
  readonly sent: Array<{ tokens: string[]; msg: PushMessage }> = [];
  async send(tokens: string[], msg: PushMessage) {
    this.sent.push({ tokens, msg });
    return { sent: tokens.length, invalidTokens: tokens.filter((t) => t.startsWith('invalid')) };
  }
}

/** Cloudflare currently has no configured sender; never pretend an FCM delivery occurred. */
export class DisabledPushSender implements PushSender {
  readonly enabled = false;
  async send() {
    return { sent: 0, invalidTokens: [] };
  }
}
