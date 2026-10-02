export type LibraryKind = 'video' | 'audio';

export interface PlanInput {
  kind: LibraryKind;
  fileName: string;
  mime: string;
  sizeBytes: number;
  /** null when the browser could not read the duration. */
  durationSec: number | null;
}

export interface Plan {
  compress: boolean;
  outExt: string;
  outMime: string;
}

/** Server cap on a library file (functions/src/services/media-library.ts). */
export const LIBRARY_MAX_BYTES = 64 * 1024 * 1024;

const AUDIO_SKIP_KBPS = 80;
const VIDEO_SKIP_KBPS = 1500;
const VIDEO_SKIP_MAX_BYTES = 24 * 1024 * 1024;

export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/**
 * Decide whether a file needs compression. Files that are already small/efficient are uploaded
 * untouched (re-encoding would only lose quality); everything else is shrunk to a size that is
 * cheap to store in D1 and fast to stream (video: 480p H.264, audio: 64 kbps mono AAC).
 */
export function planProcessing(i: PlanInput): Plan {
  const ext = extOf(i.fileName);
  const kbps = i.durationSec ? (i.sizeBytes * 8) / 1000 / i.durationSec : null;
  const tooBig = i.sizeBytes > LIBRARY_MAX_BYTES;
  const compressed =
    i.kind === 'audio'
      ? ['m4a', 'aac', 'mp3'].includes(ext) && kbps !== null && kbps <= AUDIO_SKIP_KBPS
      : ext === 'mp4' &&
        kbps !== null &&
        kbps <= VIDEO_SKIP_KBPS &&
        i.sizeBytes <= VIDEO_SKIP_MAX_BYTES;
  if (compressed && !tooBig) return { compress: false, outExt: ext, outMime: i.mime };
  return i.kind === 'audio'
    ? { compress: true, outExt: 'm4a', outMime: 'audio/mp4' }
    : { compress: true, outExt: 'mp4', outMime: 'video/mp4' };
}

/** ffmpeg argv (no shell involved, so the filter comma is escaped for ffmpeg itself). */
export function ffmpegArgs(kind: LibraryKind, input: string, output: string): string[] {
  if (kind === 'audio')
    return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', '-y', output];
  return [
    '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-vf', 'scale=-2:min(480\\,ih)',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
    '-movflags', '+faststart',
    '-y', output,
  ];
}
