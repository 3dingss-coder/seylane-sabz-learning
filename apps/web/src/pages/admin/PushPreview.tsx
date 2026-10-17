import { useEffect, useState } from 'react';
import { Bell, ImageOff, MonitorSmartphone, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type PreviewChannel = 'web' | 'android';

export interface PushPreviewProps {
  title: string;
  body: string;
  imageUrl: string;
  actionRef: string;
  appName?: string;
  channel?: PreviewChannel;
  onChannelChange?: (c: PreviewChannel) => void;
  className?: string;
}

const PLACEHOLDER_TITLE = 'عنوان اعلان شما';
const PLACEHOLDER_BODY = 'متن اعلان اینجا نمایش داده می‌شود.';
const CHANNEL_LABEL: Record<PreviewChannel, string> = { web: 'وب', android: 'اندروید' };

/**
 * Push notification preview with a «وب | اندروید» switch (design reference: «تمپلیت پوش نوتیف‌ها»).
 *
 * Like `components/admin/PushNotificationPreview`, this is an APPROXIMATION: the real rendering is
 * decided by the OS and the browser, which may truncate text, hide the image or change the icon.
 * The destination is information only — the preview never opens it.
 */
export function PushPreview({
  title,
  body,
  imageUrl,
  actionRef,
  appName = 'آکادمی سیلانه',
  channel,
  onChannelChange,
  className,
}: PushPreviewProps) {
  const [inner, setInner] = useState<PreviewChannel>('web');
  const active = channel ?? inner;
  const setChannel = (c: PreviewChannel) => {
    setInner(c);
    onChannelChange?.(c);
  };
  const img = imageUrl.trim();
  const showImage = /^https:\/\//i.test(img);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [img]);

  const shownTitle = title.trim() || PLACEHOLDER_TITLE;
  const shownBody = body.trim() || PLACEHOLDER_BODY;

  return (
    <section
      aria-label="پیش‌نمایش اعلان"
      dir="rtl"
      data-testid="push-preview"
      className={cn('flex flex-col gap-3', className)}
    >
      <ChannelSwitch value={active} onChange={setChannel} />
      {active === 'web' ? (
        <WebNotification
          appName={appName}
          title={shownTitle}
          body={shownBody}
          image={showImage && !imgFailed ? img : null}
          imageState={showImage ? (imgFailed ? 'failed' : 'ok') : 'none'}
          onImageError={() => setImgFailed(true)}
        />
      ) : (
        <AndroidNotification
          appName={appName}
          title={shownTitle}
          body={shownBody}
          image={showImage && !imgFailed ? img : null}
          imageState={showImage ? (imgFailed ? 'failed' : 'ok') : 'none'}
          onImageError={() => setImgFailed(true)}
        />
      )}
      <p className="text-xs leading-6 text-muted-fg">
        مقصد پس از کلیک:{' '}
        <bdi dir="ltr" className="font-mono font-bold text-text">
          {actionRef || '/messages'}
        </bdi>{' '}
        — این پیش‌نمایش تقریبی است و مقصد را باز نمی‌کند. ظاهر واقعی اعلان بین مرورگرها و نسخه‌های
        اندروید متفاوت است.
      </p>
    </section>
  );
}

/** «وب | اندروید» — two real buttons (not colour alone), keyboard reachable. */
export function ChannelSwitch({
  value,
  onChange,
  label = 'نمایش پیش‌نمایش',
}: {
  value: PreviewChannel;
  onChange: (c: PreviewChannel) => void;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex w-fit gap-1 rounded-input border border-border bg-surface-2 p-1"
    >
      {(Object.keys(CHANNEL_LABEL) as PreviewChannel[]).map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'pressable inline-flex min-h-12 items-center gap-1.5 rounded-input px-3 text-xs font-bold',
            value === c
              ? 'bg-surface text-primary-fg shadow-xs'
              : 'text-text-secondary hover:bg-surface',
          )}
        >
          {c === 'web' ? (
            <MonitorSmartphone className="size-3.5" aria-hidden />
          ) : (
            <Smartphone className="size-3.5" aria-hidden />
          )}
          {CHANNEL_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

interface NotificationParts {
  appName: string;
  title: string;
  body: string;
  image: string | null;
  imageState: 'ok' | 'failed' | 'none';
  onImageError: () => void;
}

/** Chrome/Edge desktop toast: app row on top, text + a square side thumbnail (as in the design). */
function WebNotification(p: NotificationParts) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs font-bold text-text-secondary">
        نمای وب (مرورگر دسکتاپ، تقریبی)
      </figcaption>
      <div className="rounded-card border border-border bg-surface-2 p-3">
        <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="flex items-start gap-2.5 p-3">
            <img
              src="/push-icons/push-icon-192.png"
              alt=""
              className="size-8 shrink-0 rounded-lg"
              width={32}
              height={32}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-fg">
                <span className="truncate font-semibold">{p.appName}</span>
                <span className="flex items-center gap-1.5">
                  <span>اکنون</span>
                  <X className="size-3" aria-hidden />
                </span>
              </div>
              <div className="mt-1 flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text" data-testid="preview-title">
                    {p.title}
                  </p>
                  <p
                    className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap break-words text-text-secondary"
                    data-testid="preview-body"
                  >
                    {p.body}
                  </p>
                </div>
                {p.image && (
                  <img
                    src={p.image}
                    alt="تصویر اعلان"
                    className="size-20 shrink-0 rounded-lg object-cover"
                    onError={p.onImageError}
                    loading="lazy"
                  />
                )}
              </div>
            </div>
          </div>
          {p.imageState === 'failed' && <ImageFailed />}
        </div>
      </div>
    </figure>
  );
}

/** Android (Material) notification: small icon + app name header, expanded text, big picture. */
function AndroidNotification(p: NotificationParts) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs font-bold text-text-secondary">
        نمای اندروید (اپلیکیشن، تقریبی)
      </figcaption>
      <div className="rounded-[1.5rem] border-4 border-text/70 bg-background p-2">
        <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] text-muted-fg">
          <span>۱۰:۰۰</span>
          <Bell className="size-3" aria-hidden />
        </div>
        <div className="overflow-hidden rounded-xl bg-surface shadow-sm">
          <div className="flex items-center gap-2 px-3 pt-2 text-[11px] text-muted-fg">
            <img
              src="/push-icons/push-icon-192.png"
              alt=""
              className="size-4 shrink-0 rounded"
              width={16}
              height={16}
            />
            <span className="truncate font-semibold">{p.appName}</span>
            <span className="ms-auto shrink-0">اکنون</span>
          </div>
          <div className="px-3 pt-1 pb-2.5">
            <p className="text-sm font-bold text-text" data-testid="preview-title">
              {p.title}
            </p>
            <p
              className="mt-1 text-sm whitespace-pre-wrap break-words text-text-secondary"
              data-testid="preview-body"
            >
              {p.body}
            </p>
          </div>
          <NotificationImage {...p} />
        </div>
      </div>
    </figure>
  );
}

function ImageFailed() {
  return (
    <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-warning-fg">
      <ImageOff className="size-4 shrink-0" aria-hidden />
      تصویر بارگذاری نشد؛ اعلان بدون تصویر نمایش داده می‌شود. آدرس تصویر را بررسی کنید.
    </p>
  );
}

/** Android big-picture block under the text. */
function NotificationImage({ image, imageState, onImageError }: NotificationParts) {
  return (
    <>
      {image && (
        <img
          src={image}
          alt="تصویر اعلان"
          className="max-h-40 w-full object-cover"
          onError={onImageError}
          loading="lazy"
        />
      )}
      {imageState === 'failed' && <ImageFailed />}
    </>
  );
}
