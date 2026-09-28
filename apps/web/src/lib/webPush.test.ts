import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn(async () => ({}));
vi.mock('./api', () => ({ api: { post } }));
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/messaging', () => ({
  isSupported: async () => true,
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(async () => 'web-token-123456'),
}));

const ENV = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 's',
  VITE_FIREBASE_APP_ID: 'a',
  VITE_FIREBASE_VAPID_KEY: 'v',
};

function browserPush(permission: NotificationPermission, answer: NotificationPermission) {
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn(async () => answer) });
  vi.stubGlobal('PushManager', {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({}) },
  });
}

beforeEach(() => {
  vi.resetModules();
  post.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('web push', () => {
  it('is unavailable (and the opt-in hidden) until the Firebase web config is provided', async () => {
    browserPush('default', 'granted');
    const { webPushState } = await import('./webPush');
    expect(webPushState()).toBe('unavailable');
  });

  it('opt-in asks permission, gets an FCM token on our SW and registers it as a web device', async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    browserPush('default', 'granted');
    const { enableWebPush, webPushState } = await import('./webPush');
    expect(webPushState()).toBe('default');
    expect(await enableWebPush()).toBe('granted');
    expect(post).toHaveBeenCalledWith('/me/devices', { token: 'web-token-123456', platform: 'web' });
  });

  it('does not register when the user blocks notifications', async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    browserPush('default', 'denied');
    const { enableWebPush } = await import('./webPush');
    expect(await enableWebPush()).toBe('denied');
    expect(post).not.toHaveBeenCalled();
  });
});
