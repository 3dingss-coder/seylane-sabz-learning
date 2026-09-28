import { Capacitor } from '@capacitor/core';
import { api } from './api';
import { track } from './telemetry';

export const isNative = () => Capacitor.isNativePlatform();

let pushToken: string | null = null;

/**
 * Android push (FCM via Capacitor). Needs `google-services.json` in android/app — until the
 * Firebase project exists registration fails silently and in-app notifications still work.
 */
export async function registerPush(navigate: (to: string) => void) {
  // Without google-services.json the native FCM init crashes the app, so CI sets this flag
  // only when the Firebase config secret exists.
  if (!isNative() || import.meta.env.VITE_PUSH_ENABLED !== 'true') return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', (t) => {
      pushToken = t.value;
      api.post('/me/devices', { token: t.value, platform: 'android' }).catch(() => undefined);
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const ref = (a.notification.data as { actionRef?: string } | undefined)?.actionRef;
      track('notification_cta_clicked', { source: 'push' });
      if (ref?.startsWith('/')) navigate(ref);
    });
    await PushNotifications.register();
  } catch {
    /* no google-services.json yet */
  }
}

export async function unregisterPush() {
  if (!pushToken) return;
  await api.del('/me/devices', { token: pushToken }).catch(() => undefined);
  pushToken = null;
}

/** Android hardware back: navigate back inside the app; exit from a root screen. */
export async function initBackButton() {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
