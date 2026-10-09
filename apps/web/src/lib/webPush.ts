import { api } from './api';
import { isNative, setPushToken } from './native';

/**
 * Web / PWA push via FCM (spec §22: Android = Capacitor push, web & iOS-PWA = Web Push).
 *
 * Enabled only when the Firebase web config + VAPID key are provided at build time
 * (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_MESSAGING_SENDER_ID,
 * VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY). The Firebase SDK is imported lazily, and the
 * token is bound to our own PWA service worker whose `push-sw.js` shows the notification —
 * no third-party script in the worker. In-app notifications keep working without any of this.
 */
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
const vapidKey = env.VITE_FIREBASE_VAPID_KEY as string | undefined;

export type WebPushState = 'unavailable' | 'default' | 'granted' | 'denied';

export function webPushState(): WebPushState {
  const configured = Object.values(config).every(Boolean) && !!vapidKey;
  if (
    !configured ||
    isNative() ||
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  )
    return 'unavailable';
  return Notification.permission;
}

async function subscribe(): Promise<boolean> {
  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  if (!(await isSupported())) {
    throw new Error('Firebase Messaging is not supported in this browser.');
  }
  const app = getApps()[0] ?? initializeApp(config);
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('Firebase did not return a web push token.');
  // Do not mark the device as registered until the API has persisted the token successfully.
  await api.post('/me/devices', { token, platform: 'web' });
  setPushToken(token);
  return true;
}

/** User-initiated opt-in (browsers require a gesture for the permission prompt). */
export async function enableWebPush(): Promise<WebPushState> {
  if (webPushState() === 'unavailable') return 'unavailable';
  const perm = await Notification.requestPermission();
  if (perm === 'granted') await subscribe();
  return perm;
}

/** On app start: refresh the token silently if the user already allowed notifications. */
export async function resumeWebPush() {
  if (webPushState() !== 'granted') return;
  try {
    await subscribe();
  } catch {
    /* offline or FCM unreachable — retry next start */
  }
}
