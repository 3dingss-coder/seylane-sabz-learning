/** Server-side media inspection (D28): magic-byte sniffing + MP4 duration (mvhd). */

export type MediaKind = 'video' | 'audio' | 'image';

export const MEDIA_RULES: Record<MediaKind, { mimes: string[]; maxBytes: number; label: string }> =
  {
    audio: {
      mimes: [
        'audio/mpeg',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'audio/aac',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/ogg',
      ],
      maxBytes: 100 * 1024 * 1024,
      label: 'صوت',
    },
    video: {
      mimes: [
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'video/x-matroska',
        'video/3gpp',
        'video/x-msvideo',
        'video/avi',
      ],
      maxBytes: 500 * 1024 * 1024,
      label: 'ویدیو',
    },
    image: {
      mimes: ['image/png', 'image/jpeg', 'image/webp'],
      maxBytes: 5 * 1024 * 1024,
      label: 'تصویر',
    },
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

function asciiSlice(buf: Uint8Array, s: number, e: number): string {
  let out = '';
  const end = Math.min(buf.length, e);
  for (let i = s; i < end; i++) {
    out += String.fromCharCode(buf[i] ?? 0);
  }
  return out;
}

/** Returns the detected canonical MIME and the kinds it may serve, or null if unknown. */
export function sniff(buf: Uint8Array): { mime: string; kinds: MediaKind[] } | null {
  if (buf.length < 12) return null;
  const ascii = (s: number, e: number) => asciiSlice(buf, s, e);
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'M4A ' || brand === 'M4B ') return { mime: 'audio/mp4', kinds: ['audio'] };
    if (brand === 'qt  ') return { mime: 'video/quicktime', kinds: ['video'] };
    if (brand.startsWith('3g')) return { mime: 'video/3gpp', kinds: ['video', 'audio'] };
    return { mime: 'video/mp4', kinds: ['video', 'audio'] };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return ascii(0, Math.min(buf.length, 64)).includes('webm')
      ? { mime: 'video/webm', kinds: ['video', 'audio'] }
      : { mime: 'video/x-matroska', kinds: ['video'] };
  }
  if (ascii(0, 4) === 'RIFF') {
    const sub = ascii(8, 12);
    if (sub === 'AVI ') return { mime: 'video/x-msvideo', kinds: ['video'] };
    if (sub === 'WAVE') return { mime: 'audio/wav', kinds: ['audio'] };
    if (sub === 'WEBP') return { mime: 'image/webp', kinds: ['image'] };
  }
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', kinds: ['audio'] };
  if (ascii(0, 3) === 'ID3') return { mime: 'audio/mpeg', kinds: ['audio'] };
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xf6) === 0xf0)
    return { mime: 'audio/aac', kinds: ['audio'] };
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0)
    return { mime: 'audio/mpeg', kinds: ['audio'] };
  if (buf[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', kinds: ['image'] };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', kinds: ['image'] };
  return null;
}

/** Finds `mvhd` in a buffer (moov may be at start or end) → duration in seconds. */
export function mp4DurationFromBuffer(buf: Uint8Array): number | null {
  let idx = -1;
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) {
      idx = i;
      break;
    }
  }
  if (idx < 4) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = buf[idx + 4];
  try {
    if (version === 1) {
      const timescale = view.getUint32(idx + 4 + 4 + 16, false);
      const duration = Number(view.getBigUint64(idx + 4 + 4 + 16 + 4, false));
      return timescale ? Math.round((duration / timescale) * 10) / 10 : null;
    }
    const timescale = view.getUint32(idx + 4 + 4 + 8, false);
    const duration = view.getUint32(idx + 4 + 4 + 8 + 4, false);
    return timescale ? Math.round((duration / timescale) * 10) / 10 : null;
  } catch {
    return null;
  }
}

function writeAscii(u8: Uint8Array, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    u8[offset + i] = str.charCodeAt(i);
  }
}

export function createPlaceholderMp4(isAudio = false, durationSec = 120): Uint8Array {
  const brand = isAudio ? 'M4A ' : 'mp42';
  const out = new Uint8Array(24 + 8 + 108);
  const view = new DataView(out.buffer);

  // ftyp (24 bytes)
  view.setUint32(0, 24, false);
  writeAscii(out, 4, 'ftyp');
  writeAscii(out, 8, brand);
  view.setUint32(12, 0, false);
  writeAscii(out, 16, brand);
  writeAscii(out, 20, 'isom');

  // moov header (8 bytes)
  view.setUint32(24, 8 + 108, false);
  writeAscii(out, 28, 'moov');

  // mvhd (108 bytes at offset 32)
  view.setUint32(32, 108, false);
  writeAscii(out, 36, 'mvhd');
  out[40] = 0;
  view.setUint32(32 + 20, 1000, false);
  view.setUint32(32 + 24, durationSec * 1000, false);
  view.setUint32(32 + 28, 0x00010000, false);
  view.setUint16(32 + 32, 0x0100, false);

  return out;
}
