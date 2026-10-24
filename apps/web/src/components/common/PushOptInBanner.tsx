import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { enableWebPush, webPushState } from '@/lib/webPush';

/** iPhone/iPad browser tab: Apple only allows Web Push for a site added to the Home Screen. */
function needsHomeScreenInstall(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * Shown to every signed-in user who has not yet decided about notifications, so nobody has to
 * find the switch in the profile. The button is the user gesture the browser requires for its
 * native "Allow" prompt (iOS refuses the prompt without one).
 */
export function PushOptInBanner() {
  const { status } = useAuth();
  const toast = useToast();
  // ✕ only hides the banner for this visit; it is never remembered, so every new entry or
  // reload asks again until the user allows notifications.
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(webPushState);

  if (status !== 'authenticated' || hidden) return null;
  const install = state === 'unavailable' && needsHomeScreenInstall();
  if (state !== 'default' && !install) return null;

  const later = () => setHidden(true);

  return (
    <div
      role="region"
      aria-label="فعال‌سازی اعلان‌ها"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-3"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
    >
      <div className="flex w-full max-w-xl items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-lg">
        <Bell className="size-6 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium text-text">
          {install
            ? 'برای دریافت اعلان در آیفون: دکمه‌ی اشتراک‌گذاری (Share) را بزن، «Add to Home Screen» را انتخاب کن و برنامه را از آیکونش باز کن.'
            : 'اعلان‌ها را روشن کن تا مهلت آموزش‌ها و پیام‌های مهم از دستت نرود.'}
        </p>
        {!install && (
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await enableWebPush();
                setState(next);
                if (next === 'granted')
                  toast.show({ type: 'success', message: 'اعلان‌ها فعال شد.' });
              } catch {
                toast.show({
                  type: 'error',
                  message: 'فعال‌سازی اعلان انجام نشد. دوباره تلاش کنید.',
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            فعال‌سازی
          </Button>
        )}
        <button
          type="button"
          onClick={later}
          aria-label="بعداً"
          className="shrink-0 rounded-full p-1 text-text-secondary hover:bg-border/40"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
