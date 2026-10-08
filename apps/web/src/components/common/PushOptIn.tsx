import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button, Card, useToast } from '@/components/ui';
import { enableWebPush, webPushState, type WebPushState } from '@/lib/webPush';

/** Browser/PWA notification opt-in. Hidden when Web Push isn't configured or supported. */
export function PushOptIn() {
  const toast = useToast();
  const [state, setState] = useState<WebPushState>(() => webPushState());
  const [busy, setBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  if (state === 'unavailable') return null;

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Bell className="size-5 text-primary" aria-hidden />
        اعلان‌های گوشی/مرورگر
      </h2>
      {registrationError && state !== 'granted' && (
        <p role="alert" className="text-sm text-danger-fg">
          {registrationError}
        </p>
      )}
      {state === 'granted' && (
        <p role={registrationError ? 'alert' : undefined} className="text-sm text-text-secondary">
          {registrationError || 'فعال است. مهلت‌ها و آموزش‌های جدید را خبر می‌دهیم.'}
        </p>
      )}
      {state === 'denied' && (
        <p className="text-sm text-text-secondary">
          اعلان‌ها در تنظیمات مرورگر مسدود شده‌اند. برای فعال‌سازی، از تنظیمات سایت اجازه بدهید.
        </p>
      )}
      {state === 'default' && (
        <>
          <p className="text-sm text-text-secondary">
            تا مهلت آموزش‌ها از دستت نرود، اعلان‌ها را روشن کن.
          </p>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setRegistrationError('');
                const next = await enableWebPush();
                setState(next);
                if (next === 'granted')
                  toast.show({ type: 'success', message: 'اعلان‌ها فعال شد.' });
              } catch (err) {
                const message =
                  err instanceof Error
                    ? err.message
                    : 'فعال‌سازی اعلان انجام نشد. دوباره تلاش کنید.';
                setRegistrationError(message);
                toast.show({ type: 'error', message });
              } finally {
                setBusy(false);
              }
            }}
          >
            روشن کردن اعلان‌ها
          </Button>
        </>
      )}
    </Card>
  );
}
