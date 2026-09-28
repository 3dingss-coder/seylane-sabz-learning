import { Capacitor } from '@capacitor/core';
import { api } from './api';
import { session } from './session';

/** Client-side analytics events allowed by the API (spec §25.2); fire-and-forget. */
export type ClientEvent =
  | 'app_opened'
  | 'signup_started'
  | 'next_item_cta_clicked'
  | 'notification_cta_clicked'
  | 'mentor_chat_opened'
  | 'playback_error'
  | 'manager_digest_opened'
  | 'report_filtered'
  | 'youtube_blocked_reported'
  | 'client_error';

export function track(name: ClientEvent, props?: Record<string, string | number | boolean>) {
  if (!session.access && !session.refresh) return; // events are per signed-in user only
  api.post('/me/events', { name, props }).catch(() => {
    /* analytics must never break the UX */
  });
}

let reported = 0;
/**
 * Error monitoring (§ PROMPT 015): uncaught errors are reported as `client_error` events
 * (visible in Cloud Logging). If VITE_SENTRY_DSN is set, Sentry (free tier) is loaded lazily.
 */
export function initMonitoring() {
  const report = (message: string, source: string) => {
    if (reported++ > 5) return; // avoid loops / floods
    track('client_error', { message: message.slice(0, 100), source: source.slice(0, 100) });
  };
  window.addEventListener('error', (e) => {
    report(String(e.message), `${e.filename}:${e.lineno}`);
    void crashlytics((c) => c.recordException({ message: String(e.message).slice(0, 500) }));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const message = String((e.reason as Error | undefined)?.message ?? e.reason);
    report(message, 'promise');
    void crashlytics((c) => c.recordException({ message: message.slice(0, 500) }));
  });
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (dsn) {
    void import('@sentry/react')
      .then((Sentry) =>
        Sentry.init({
          dsn,
          environment: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'dev',
          tracesSampleRate: 0,
          sendDefaultPii: false,
        }),
      )
      .catch(() => undefined);
  }
}

type CrashlyticsApi = (typeof import('@capacitor-firebase/crashlytics'))['FirebaseCrashlytics'];

/**
 * Firebase Crashlytics on the Android app (spec §22/§35). Native crashes are captured by the SDK
 * itself; JS errors are forwarded here. Enabled only in APKs built with google-services.json
 * (CI sets VITE_CRASHLYTICS_ENABLED); the plugin is imported lazily, so web builds never load it.
 */
async function crashlytics(fn: (c: CrashlyticsApi) => Promise<unknown>) {
  if (import.meta.env.VITE_CRASHLYTICS_ENABLED !== 'true') return;
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
    await fn(FirebaseCrashlytics);
  } catch {
    /* monitoring must never break the app */
  }
}

/** Tag crash reports with the (opaque) user id — no phone/name (§24 minimal PII). */
export function setCrashUser(uid: string | null) {
  void crashlytics((c) => c.setUserId({ userId: uid ?? '' }));
}
