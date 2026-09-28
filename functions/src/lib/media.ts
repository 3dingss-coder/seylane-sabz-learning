/** Server-side media inspection (D28): magic-byte sniffing + MP4 duration (mvhd). */

export type MediaKind = 'video' | 'audio' | 'image';

export const MEDIA_RULES: Record<MediaKind, { mimes: string[]; maxBytes: number; label: string }> = {
  audio: { mimes: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg'], maxBytes: 100 * 1024 * 1024, label: 'صوت' },
  video: { mimes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp', 'video/x-msvideo', 'video/avi'], maxBytes: 500 * 1024 * 1024, label: 'ویدیو' },
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024, label: 'تصویر' },
};

export const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/3gpp': '3gp',
  'video/x-msvideo': 'avi',
  'video/avi': 'avi',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Returns the detected canonical MIME and the kinds it may serve, or null if unknown. */
export function sniff(buf: Buffer): { mime: string; kinds: MediaKind[] } | null {
  if (buf.length < 12) return null;
  const ascii = (s: number, e: number) => buf.subarray(s, e).toString('latin1');
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'M4A ' || brand === 'M4B ') return { mime: 'audio/mp4', kinds: ['audio'] };
    if (brand === 'qt  ') return { mime: 'video/quicktime', kinds: ['video'] };
    if (brand.startsWith('3g')) return { mime: 'video/3gpp', kinds: ['video', 'audio'] };
    return { mime: 'video/mp4', kinds: ['video', 'audio'] };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return ascii(0, Math.min(buf.length, 64)).includes('webm') ? { mime: 'video/webm', kinds: ['video', 'audio'] } : { mime: 'video/x-matroska', kinds: ['video'] };
  }
  if (ascii(0, 4) === 'RIFF') {
    const sub = ascii(8, 12);
    if (sub === 'AVI ') return { mime: 'video/x-msvideo', kinds: ['video'] };
    if (sub === 'WAVE') return { mime: 'audio/wav', kinds: ['audio'] };
    if (sub === 'WEBP') return { mime: 'image/webp', kinds: ['image'] };
  }
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', kinds: ['audio'] };
  if (ascii(0, 3) === 'ID3') return { mime: 'audio/mpeg', kinds: ['audio'] };
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xf6) === 0xf0) return { mime: 'audio/aac', kinds: ['audio'] };
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0) return { mime: 'audio/mpeg', kinds: ['audio'] };
  if (buf[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', kinds: ['image'] };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', kinds: ['image'] };
  return null;
}

/** Finds `mvhd` in a buffer (moov may be at start or end) → duration in seconds. */
export function mp4DurationFromBuffer(buf: Buffer): number | null {
  const idx = buf.indexOf('mvhd', 0, 'latin1');
  if (idx < 4) return null;
  const version = buf[idx + 4];
  try {
    if (version === 1) {
      const timescale = buf.readUInt32BE(idx + 4 + 4 + 16);
      const duration = Number(buf.readBigUInt64BE(idx + 4 + 4 + 16 + 4));
      return timescale ? Math.round((duration / timescale) * 10) / 10 : null;
    }
    const timescale = buf.readUInt32BE(idx + 4 + 4 + 8);
    const duration = buf.readUInt32BE(idx + 4 + 4 + 8 + 4);
    return timescale ? Math.round((duration / timescale) * 10) / 10 : null;
  } catch {
    return null;
  }
}
