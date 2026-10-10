import { useEffect, useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PushPreviewProps {
  title: string;
  body: string;
  imageUrl: string;
  actionRef: string;
  appName?: string;
}

const PLACEHOLDER_TITLE = 'عنوان اعلان شما';
const PLACEHOLDER_BODY = 'متن اعلان اینجا نمایش داده می‌شود.';

/**
 * Approximate visual model of a push notification. Real rendering is decided by the operating
 * system and browser (Chrome, Android, Windows, macOS…), which can truncate text, hide images or
 * ignore the icon. The admin is told this in the UI; this component is never a real screenshot.
 * The destination is shown as information only — the preview never opens it.
 */
export function PushNotificationPreview(props: PushPreviewProps) {
  const { title, body, imageUrl, actionRef, appName = 'آکادمی سیلانه' } = props;
  const img = imageUrl.trim();
  const showImage = /^https:\/\//i.test(img);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [img]);

  const shownTitle = title.trim() || PLACEHOLDER_TITLE;
  const shownBody = body.trim() || PLACEHOLDER_BODY;

  return (
    <section aria-label="پیش‌نمایش اعلان" dir="rtl" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs font-bold text-text-secondary">
            نمای موبایل (تقریبی)
          </figcaption>
          <div className="mx-auto w-full max-w-[18rem] rounded-[1.75rem] border-4 border-text/80 bg-background p-3 shadow-md">
            <div className="mb-2 text-center text-[11px] text-muted-fg">۱۰:۰۰</div>
            <NotificationCard
              appName={appName}
              title={shownTitle}
              body={shownBody}
              image={showImage && !imgFailed ? img : null}
              imageState={showImage ? (imgFailed ? 'failed' : 'ok') : 'none'}
              onImageError={() => setImgFailed(true)}
              compact
            />
          </div>
        </figure>
        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs font-bold text-text-secondary">
            نمای دسکتاپ (تقریبی)
          </figcaption>
          <div className="rounded-card border border-border bg-surface-2 p-3">
            <NotificationCard
              appName={appName}
              title={shownTitle}
              body={shownBody}
              image={showImage && !imgFailed ? img : null}
              imageState={showImage ? (imgFailed ? 'failed' : 'ok') : 'none'}
              onImageError={() => setImgFailed(true)}
            />
          </div>
        </figure>
      </div>
      <p className="flex flex-wrap items-center gap-2 rounded-input bg-background px-3 py-2 text-xs text-text-secondary">
        <ExternalLink className="size-4 shrink-0" aria-hidden />
        <span>
          مقصد پس از کلیک:{' '}
          <bdi dir="ltr" className="font-mono font-bold text-text">
            {actionRef || '/messages'}
          </bdi>
          {' — '}این فقط اطلاعات مدیریتی است و پیش‌نمایش آن را باز نمی‌کند.
        </span>
      </p>
      <p className="text-xs leading-6 text-muted-fg">
        این پیش‌نمایش تقریبی است. ظاهر واقعی اعلان بین Chrome، Android، Windows، macOS و سایر
        مرورگرها متفاوت است و سیستم‌عامل ممکن است متن را کوتاه کند، تصویر را نشان ندهد یا آیکون را
        تغییر دهد. این پیش‌نمایش اسکرین‌شات واقعی از سیستم‌عامل نیست.
      </p>
    </section>
  );
}

function NotificationCard({
  appName,
  title,
  body,
  image,
  imageState,
  onImageError,
  compact,
}: {
  appName: string;
  title: string;
  body: string;
  image: string | null;
  imageState: 'ok' | 'failed' | 'none';
  onImageError: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-surface shadow-sm',
        compact ? 'text-[13px]' : 'text-sm',
      )}
    >
      <div className="flex items-start gap-2.5 p-2.5">
        <img
          src="/icons/icon-192.png"
          alt=""
          className="size-9 shrink-0 rounded-lg"
          width={36}
          height={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-fg">
            <span className="truncate font-semibold">{appName}</span>
            <span>اکنون</span>
          </div>
          <p className="mt-0.5 truncate font-bold text-text" data-testid="preview-title">
            {title}
          </p>
          <p
            className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-text-secondary"
            data-testid="preview-body"
          >
            {body}
          </p>
        </div>
      </div>
      {image && (
        <img
          src={image}
          alt="تصویر اعلان"
          className="max-h-40 w-full object-cover"
          onError={onImageError}
          loading="lazy"
        />
      )}
      {imageState === 'failed' && (
        <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-warning-fg">
          <ImageOff className="size-4 shrink-0" aria-hidden />
          تصویر بارگذاری نشد؛ اعلان بدون تصویر نمایش داده می‌شود. آدرس تصویر را بررسی کنید.
        </p>
      )}
    </div>
  );
}
