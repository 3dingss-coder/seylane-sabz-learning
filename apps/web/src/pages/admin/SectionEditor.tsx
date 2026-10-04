import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Library, Link2, Upload } from 'lucide-react';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { Select, Tabs, Textarea } from '@/components/common/Field';
import { MediaPicker } from '@/components/admin/MediaPicker';
import { Uploader } from '@/components/admin/Uploader';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faDuration } from '@/lib/format';
import type { AdminSection } from '@/lib/types';
import type { UploadedMedia } from '@/lib/upload';
import { ak } from './adminQueries';

/** A3 — افزودن/ویرایش قسمت: YouTube link or uploaded file (any video format, m4a/mp3 audio — D31). */
export function SectionEditor({
  open,
  onClose,
  packageId,
  brandId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  packageId: string;
  /** The package's brand — the library picker opens filtered to it. */
  brandId?: string | null;
  initial?: AdminSection;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [transcript, setTranscript] = useState(initial?.transcript ?? '');
  const [mediaType, setMediaType] = useState<'video' | 'audio'>(initial?.mediaType ?? 'video');
  const [source, setSource] = useState<'youtube' | 'file'>(initial?.mediaSource ?? 'file');
  const [youtubeUrl, setYoutubeUrl] = useState(initial?.youtubeUrl ?? '');
  const [media, setMedia] = useState<UploadedMedia | null>(null);
  const [picking, setPicking] = useState(false);
  const [minutes, setMinutes] = useState(
    initial?.durationSec ? String(Math.round((initial.durationSec / 60) * 10) / 10) : '',
  );
  // The field shows minutes with one decimal, which cannot represent every second count. Editing
  // the section used to round-trip the stored duration through it (305s → 5.1 → 306s), quietly
  // moving the completion threshold. Only a touched field may change the duration now.
  const [minutesEdited, setMinutesEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();

  const hasFile = Boolean(
    media ??
    (initial?.mediaSource === 'file' && initial.mediaId && initial.mediaType === mediaType),
  );
  const durationSec =
    media?.durationSec ??
    (minutesEdited && minutes
      ? Math.round(Number(minutes) * 60)
      : (initial?.durationSec ?? undefined));

  const m = useMutation({
    mutationFn: (picked?: UploadedMedia) => {
      const mm = picked ?? media;
      const dur = picked?.durationSec ?? durationSec;
      const body: Record<string, unknown> = {
        title: title.trim() || picked?.originalName || '',
        description: description.trim(),
        transcript: transcript.trim(),
        mediaType,
        mediaSource: source,
        youtubeUrl: source === 'youtube' ? youtubeUrl.trim() : null,
        ...(mm ? { mediaId: mm.id } : {}),
        ...(dur ? { durationSec: dur } : {}),
      };
      return initial
        ? api.patch(`/admin/packages/${packageId}/sections/${initial.id}`, body)
        : api.post(`/admin/packages/${packageId}/sections`, body);
    },
    onSuccess: () => {
      // The section list lives on the package screen, but the counts on the content tree and the
      // brand page are derived from it too.
      void qc.invalidateQueries({ queryKey: ak.pkg(packageId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'tree'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'packages'] });
      toast.show({
        type: 'success',
        message: initial ? 'قسمت ذخیره شد.' : 'قسمت اضافه شد. حالا سؤال‌های آزمون را بنویسید.',
      });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });

  const canSave =
    title.trim().length >= 2 && (source === 'youtube' ? youtubeUrl.trim().length > 0 : hasFile);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش قسمت' : 'قسمت جدید'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={m.isPending} disabled={!canSave} onClick={() => m.mutate(undefined)}>
            ذخیره قسمت
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="عنوان قسمت"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
        />
        <Select
          label="نوع رسانه"
          value={mediaType}
          onChange={(e) => {
            const v = e.target.value as 'video' | 'audio';
            setMediaType(v);
            setMedia(null);
            if (v === 'audio') setSource('file');
          }}
          error={errors.mediaType}
        >
          <option value="video">ویدیو</option>
          <option value="audio">صوت</option>
        </Select>
        {mediaType === 'video' && (
          <Tabs
            label="منبع ویدیو"
            value={source}
            onChange={setSource}
            items={[
              { value: 'file', label: 'آپلود فایل' },
              { value: 'youtube', label: 'لینک یوتیوب' },
            ]}
          />
        )}
        {source === 'youtube' ? (
          <Input
            label="لینک یوتیوب"
            ltr
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            error={errors.youtubeUrl}
            icon={<Link2 className="size-5" />}
            placeholder="https://youtu.be/..."
            hint="ویدیو باید Unlisted یا Public باشد."
          />
        ) : (
          <div className="flex flex-col gap-2 rounded-card border border-dashed border-border p-3">
            {media ? (
              <p className="flex items-center gap-2 text-sm text-success-fg">
                <CheckCircle2 className="size-4" aria-hidden /> {media.originalName} آپلود شد
                {media.durationSec ? ` (${faDuration(media.durationSec)})` : ''}.
              </p>
            ) : (
              hasFile && (
                <p className="flex items-center gap-2 text-sm text-text-secondary">
                  <Upload className="size-4" aria-hidden /> فایل فعلی: {initial?.mediaMime}{' '}
                  {initial?.mediaSizeBytes
                    ? `• ${toPersianDigits(Math.round(initial.mediaSizeBytes / 1024 / 1024))} مگابایت`
                    : ''}
                </p>
              )
            )}
            <Uploader
              kind={mediaType}
              target={{ type: 'section', id: initial?.id ?? null }}
              label={hasFile ? 'جایگزینی فایل' : 'انتخاب فایل'}
              onUploaded={(u) => setMedia(u)}
            />
            <Button
              variant="secondary"
              onClick={() => setPicking(true)}
              icon={<Library className="size-4" aria-hidden />}
            >
              انتخاب از کتابخانه رسانه
            </Button>
            {errors.mediaId && <p className="text-xs text-danger">{errors.mediaId}</p>}
          </div>
        )}
        {!media?.durationSec && (
          <Input
            label="مدت (دقیقه)"
            type="number"
            ltr
            min={0}
            step={0.1}
            value={minutes}
            onChange={(e) => {
              setMinutesEdited(true);
              setMinutes(e.target.value);
            }}
            error={errors.durationSec}
            hint={
              source === 'youtube'
                ? 'برای یوتیوب مدت را وارد کنید.'
                : 'اگر خودکار تشخیص داده نشد، وارد کنید.'
            }
          />
        )}
        <Textarea
          label="توضیح قسمت"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <Textarea
          label="متن آموزشی (برای منتور هوشمند)"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          error={errors.transcript}
          hint="منتور فقط از همین متن‌های تأییدشده پاسخ می‌دهد."
          className="min-h-32"
        />
      </div>
      {picking && (
        <MediaPicker
          kind={mediaType}
          brandId={brandId}
          currentId={media?.id ?? initial?.mediaId}
          onClose={() => setPicking(false)}
          onPick={(it) => {
            setMedia({
              id: it.id,
              kind: it.kind,
              status: 'ready',
              mime: it.mime,
              sizeBytes: it.sizeBytes,
              durationSec: it.durationSec,
              originalName: it.title,
            });
            if (!title.trim()) setTitle(it.title);
            setPicking(false);
            // A new section is created right away — choosing the file IS the decision. (When
            // editing an existing section the admin still confirms with «ذخیره قسمت».)
            if (!initial && mediaType === it.kind)
              m.mutate({
                id: it.id,
                kind: it.kind,
                status: 'ready',
                mime: it.mime,
                sizeBytes: it.sizeBytes,
                durationSec: it.durationSec,
                originalName: it.title,
              });
          }}
        />
      )}
    </Modal>
  );
}
