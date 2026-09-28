import type { Messaging } from 'firebase-admin/messaging';
import type { PushMessage, PushSender } from './types';

const INVALID = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export class FcmPushSender implements PushSender {
  constructor(private readonly messaging: Messaging) {}
  async send(tokens: string[], msg: PushMessage) {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };
    const res = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data: msg.data ?? {},
      android: { priority: 'high' },
      webpush: { fcmOptions: { link: msg.data?.link ?? '/' } },
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      const t = tokens[i];
      if (!r.success && t && r.error && INVALID.has(r.error.code)) invalidTokens.push(t);
    });
    return { sent: res.successCount, invalidTokens };
  }
}
