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
  window.addEventListener('error', (e) => report(String(e.message), `${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error | undefined)?.message ?? e.reason), 'promise'));
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
