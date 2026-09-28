import { ApiError, api, uploadToSignedUrl } from './api';

export type MediaKind = 'video' | 'audio' | 'image';
export interface UploadedMedia {
  id: string;
  kind: MediaKind;
  status: string;
  mime: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  originalName: string;
}

// Browsers often report '' for m4a/mkv/avi — fall back to the extension (D31: any video format, m4a).
const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  avi: 'video/x-msvideo',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function mimeOf(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const byExt = EXT_MIME[ext];
  // m4a is frequently labelled video/mp4 or audio/x-m4a by the OS; keep the extension's intent.
  if (ext === 'm4a') return 'audio/mp4';
  return file.type || byExt || 'application/octet-stream';
}

export function kindOf(file: File): MediaKind | null {
  const m = mimeOf(file);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return null;
}

/** Reads duration in the browser (works for most formats the device can decode). */
export function probeDuration(file: File, kind: 'audio' | 'video'): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const t = window.setTimeout(() => done(null), 8000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      window.clearTimeout(t);
      done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : null);
    };
    el.onerror = () => {
      window.clearTimeout(t);
      done(null);
    };
    el.src = url;
  });
}

/** create upload URL → PUT (with progress) → finalize (server sniffs type + size). */
export async function uploadMedia(
  file: File,
  kind: MediaKind,
  target: { type: 'section' | 'brand_logo' | 'product_image'; id?: string | null },
  onProgress?: (pct: number) => void,
): Promise<UploadedMedia> {
  const detected = kindOf(file);
  if (kind === 'image' && detected !== 'image')
    throw new ApiError('VALIDATION', 'فقط تصویر PNG، JPEG یا WebP مجاز است.', 400);
  const durationSec = kind === 'image' ? null : await probeDuration(file, kind);
  const { mediaId, upload } = await api.post<{
    mediaId: string;
    upload: { url: string; method: string; headers: Record<string, string> };
  }>('/admin/media/upload-url', {
    kind,
    fileName: file.name,
    mime: mimeOf(file),
    sizeBytes: file.size,
    target,
  });
  await uploadToSignedUrl(upload, file, onProgress);
  return api.post<UploadedMedia>(
    `/admin/media/${mediaId}/finalize`,
    durationSec ? { durationSec } : {},
  );
}
