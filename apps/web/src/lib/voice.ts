/**
 * Voice helpers for the mentor call sheet.
 *
 * Recording uses MediaRecorder (Opus/WebM in Chromium, AAC/MP4 in Safari); the server accepts both
 * and hands the bytes to Whisper. Playback wraps the reply in an HTMLAudioElement — Gemini returns
 * PCM which the server has already wrapped into WAV, so no client-side transcoding is needed.
 */

export interface Recording {
  base64: string;
  mime: string;
  durationSec: number;
}

export interface Recorder {
  /** Asks for the microphone (first call may show a permission prompt). */
  start(): Promise<void>;
  /** Stops and resolves with the encoded utterance. */
  stop(): Promise<Recording>;
  cancel(): void;
  readonly active: boolean;
}

const CANDIDATE_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function micSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickMime(): string {
  for (const m of CANDIDATE_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function createRecorder(): Recorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let stopped: Promise<Recording> | null = null;

  const cleanup = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  };

  return {
    get active() {
      return Boolean(recorder && recorder.state === 'recording');
    },
    async start() {
      if (!micSupported()) throw new Error('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = pickMime();
      // 24 kbps is plenty for speech and keeps a 2-minute utterance well under the API's 1 MB JSON
      // body limit (base64 inflates audio by a third).
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 24_000,
      });
      recorder = rec;
      chunks = [];
      startedAt = Date.now();
      stopped = new Promise<Recording>((resolve, reject) => {
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        rec.onerror = () => reject(new Error('ضبط صدا ناموفق بود.'));
        rec.onstop = () => {
          void (async () => {
            try {
              const type = rec.mimeType || mime || 'audio/webm';
              const blob = new Blob(chunks, { type });
              const base64 = await blobToBase64(blob);
              resolve({
                base64,
                mime: type.split(';')[0] ?? 'audio/webm',
                durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
              });
            } catch (e) {
              reject(e as Error);
            } finally {
              cleanup();
            }
          })();
        };
      });
      recorder.start(1000);
    },
    async stop() {
      if (!recorder || recorder.state === 'inactive') throw new Error('چیزی برای ارسال ضبط نشد.');
      recorder.stop();
      return stopped ?? Promise.reject(new Error('ضبط صدا ناموفق بود.'));
    },
    cancel() {
      try {
        if (recorder?.state === 'recording') recorder.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
  };
}

let currentAudio: HTMLAudioElement | null = null;

/** Plays a base64 utterance; returns a stop function. Silently no-ops without Audio support. */
export function playAudioBase64(base64: string, mime: string): () => void {
  if (typeof Audio === 'undefined') return () => {};
  stopAudio();
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/wav' }));
  const el = new Audio(url);
  currentAudio = el;
  const release = () => {
    URL.revokeObjectURL(url);
    if (currentAudio === el) currentAudio = null;
  };
  el.onended = release;
  el.onerror = release;
  void el.play().catch(() => release());
  return () => {
    el.pause();
    release();
  };
}

export function stopAudio(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
}

/** Free fallback that keeps the call usable when the TTS quota is exhausted. */
export function speakWithBrowser(text: string): boolean {
  if (typeof speechSynthesis === 'undefined') return false;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fa-IR';
    const fa = speechSynthesis.getVoices().find((v) => v.lang.startsWith('fa'));
    if (fa) u.voice = fa;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
