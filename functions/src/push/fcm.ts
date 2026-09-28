import type { Messaging } from 'firebase-admin/messaging';
import type { PushMessage, PushSender } from './types';

const INVALID = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * FCM requires `webpush.fcmOptions.link` to be an absolute HTTPS URL; a relative link fails the
 * send with `invalid-argument` (which would also wrongly prune the token). Build it from APP_URL.
 */
export function webpushLink(appUrl: string, link: string | undefined): string | undefined {
  if (!appUrl.startsWith('https://')) return undefined;
  const path = link?.startsWith('/') ? link : '/';
  return appUrl.replace(/\/$/, '') + path;
}

export class FcmPushSender implements PushSender {
  constructor(
    private readonly messaging: Messaging,
    private readonly appUrl = '',
  ) {}
  async send(tokens: string[], msg: PushMessage) {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };
    const link = webpushLink(this.appUrl, msg.data?.link);
    const res = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data: msg.data ?? {},
      android: { priority: 'high' },
      webpush: {
        notification: { icon: '/icons/icon-192.png', dir: 'rtl', lang: 'fa' },
        ...(link ? { fcmOptions: { link } } : {}),
      },
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      const t = tokens[i];
      if (!r.success && t && r.error && INVALID.has(r.error.code)) invalidTokens.push(t);
    });
    return { sent: res.successCount, invalidTokens };
  }
}
