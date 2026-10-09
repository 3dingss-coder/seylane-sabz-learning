import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button, Card, useToast } from '@/components/ui';
import { enableWebPush, retryWebPush, webPushState, type WebPushState } from '@/lib/webPush';

/** Browser/PWA notification opt-in. Hidden when Web Push isn't configured or supported. */
export function PushOptIn() {
  const toast = useToast();
  const [state, setState] = useState<WebPushState>(() => webPushState());
  const [busy, setBusy] = useState(false);
  if (state === 'unavailable') return null;

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Bell className="size-5 text-primary" aria-hidden />
        اعلان‌های گوشی/مرورگر
      </h2>
      {state === 'granted' && (
        <p className="text-sm text-text-secondary">
          اجازه اعلان در مرورگر داده شده است؛ این به‌تنهایی تحویل اعلان را تضمین نمی‌کند. اگر اعلان‌ها نمی‌رسند، ثبت دستگاه را دوباره امتحان کنید.
        </p>
      )}
      {state === 'granted' && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await retryWebPush();
              toast.show({ type: 'success', message: 'ثبت دستگاه برای دریافت اعلان انجام شد.' });
            } catch {
              toast.show({
                type: 'error',
                message: 'ثبت دستگاه انجام نشد. اتصال اینترنت و تنظیمات Firebase را بررسی کنید.',
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          تلاش دوباره برای فعال‌سازی
        </Button>
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
            روشن کردن اعلان‌ها
          </Button>
        </>
      )}
    </Card>
  );
}
