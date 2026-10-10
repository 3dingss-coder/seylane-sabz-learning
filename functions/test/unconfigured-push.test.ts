import { describe, expect, it } from 'vitest';
import { UnconfiguredPushSender } from '../src/push/types';

describe('UnconfiguredPushSender', () => {
  it('never reports a delivery when FCM is not configured', async () => {
    const sender = new UnconfiguredPushSender();
    await expect(sender.send(['token-1'], { title: 't', body: 'b' })).rejects.toThrow(
      'FCM_SERVICE_ACCOUNT_JSON',
    );
  });

  it('is a no-op for an empty token list', async () => {
    const sender = new UnconfiguredPushSender();
    await expect(sender.send([], { title: 't', body: 'b' })).resolves.toEqual({
      sent: 0,
      invalidTokens: [],
    });
  });
});
