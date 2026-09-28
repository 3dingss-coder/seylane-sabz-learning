import { useRef, useState } from 'react';
import { ImageUp, Upload } from 'lucide-react';
import { Button, ProgressBar } from '@/components/ui';
import { errMsg } from '@/lib/errors';
import { uploadMedia, type MediaKind, type UploadedMedia } from '@/lib/upload';
import { toPersianDigits } from '@/lib/digits';

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/png,image/jpeg,image/webp',
  audio: 'audio/*,.m4a,.mp3,.aac,.wav,.ogg',
  video: 'video/*,.mp4,.mov,.mkv,.webm,.avi,.3gp',
};

/** File picker + signed-URL upload with progress (A3 media, logos, product images). */
export function Uploader({
  kind,
  target,
  onUploaded,
  label,
  compact,
}: {
  kind: MediaKind;
  target: { type: 'section' | 'brand_logo' | 'product_image'; id?: string | null };
  onUploaded: (m: UploadedMedia) => unknown;
  label?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setName(f.name);
    setPct(0);
    try {
      const m = await uploadMedia(f, kind, target, setPct);
      await onUploaded(m);
    } catch (e) {
      setError(errMsg(e, 'آپلود ناموفق بود. دوباره تلاش کنید.'));
    } finally {
      setPct(null);
      if (input.current) input.current.value = '';
    }
  };
  const busy = pct !== null;
  const Icon = kind === 'image' ? ImageUp : Upload;
  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void pick(e.target.files?.[0])}
        aria-label={label ?? 'انتخاب فایل'}
      />
      <Button
        type="button"
        variant="secondary"
        loading={busy}
        onClick={() => input.current?.click()}
        icon={<Icon className="size-4" aria-hidden />}
        className={compact ? 'min-h-12 px-3 text-xs' : undefined}
      >
        {busy ? `در حال آپلود ${toPersianDigits(pct)}٪` : (label ?? 'انتخاب فایل')}
      </Button>
      {busy && (
        <div className="flex flex-col gap-1">
          <ProgressBar value={pct} label="پیشرفت آپلود" />
          <p className="truncate text-xs text-text-secondary" dir="auto">
            {name}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {!compact && !busy && (
        <p className="text-xs text-text-secondary">
          {kind === 'image'
            ? 'PNG، JPEG یا WebP — حداکثر ۵ مگابایت'
            : kind === 'audio'
              ? 'MP3، M4A، AAC، WAV، OGG — حداکثر ۱۰۰ مگابایت'
              : 'MP4، MOV، MKV، WebM، AVI، 3GP — حداکثر ۵۰۰ مگابایت'}
        </p>
      )}
    </div>
  );
}
