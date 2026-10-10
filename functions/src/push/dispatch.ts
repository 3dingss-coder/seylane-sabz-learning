import type { PushMessage, PushResult, PushSender } from './types';

export interface DeviceRef {
  token: string;
  platform: 'web' | 'android';
}

/**
 * Sends one message to a user's devices, split by platform: web devices get a data-only message
 * (drawn by our service worker), native devices keep the regular FCM `notification` payload.
 */
export async function sendToDevices(
  push: PushSender,
  devices: DeviceRef[],
  msg: PushMessage,
): Promise<{
  sent: number;
  invalidTokens: string[];
  details: Array<PushResult & { platform: 'web' | 'android' }>;
}> {
  let sent = 0;
  const invalidTokens: string[] = [];
  const details: Array<PushResult & { platform: 'web' | 'android' }> = [];
  for (const platform of ['web', 'android'] as const) {
    const group = devices.filter((x) => x.platform === platform);
    if (!group.length) continue;
    const res = await push.send(
      group.map((x) => x.token),
      { ...msg, platform },
    );
    sent += res.sent;
    invalidTokens.push(...res.invalidTokens);
    group.forEach((_x, i) => {
      const r = res.results?.[i];
      details.push({ platform, result: r?.result ?? 'failed', ...(r ?? {}) });
    });
  }
  return { sent, invalidTokens, details };
}
