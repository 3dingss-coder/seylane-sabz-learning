/**
 * Persian speech-to-text for the mentor composer.
 * Auto-sends after a few seconds of silence — the marketer does not have to tap stop.
 */

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechCtor = new () => SpeechRec;

function ctor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

export interface ListenHandle {
  /** Discard the recording. */
  stop: () => void;
  /** Stop and send whatever was captured. */
  finish?: () => void;
}

/**
 * Listens in fa-IR. `onSilence` fires once, after `silenceMs` with no new words,
 * or when the browser ends the utterance and we already have text.
 */
export function listenFa(opts: {
  onPartial: (text: string) => void;
  onSilence: (text: string) => void;
  onError: (message: string) => void;
  silenceMs?: number;
}): ListenHandle {
  const Ctor = ctor();
  if (!Ctor) {
    opts.onError('این مرورگر گفتار فارسی را تشخیص نمی‌دهد.');
    return { stop: () => undefined };
  }
  const rec = new Ctor();
  rec.lang = 'fa-IR';
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = '';
  let interim = '';
  let sent = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const silenceMs = opts.silenceMs ?? 2800;

  const current = () => `${finalText} ${interim}`.replace(/\s+/g, ' ').trim();
  const finish = () => {
    if (sent) return;
    const text = current();
    if (!text) return;
    sent = true;
    if (timer) clearTimeout(timer);
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    opts.onSilence(text);
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(finish, silenceMs);
  };

  rec.onresult = (ev) => {
    interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const piece = ev.results[i]?.[0]?.transcript ?? '';
      if (ev.results[i]?.isFinal) finalText = `${finalText} ${piece}`.trim();
      else interim += piece;
    }
    opts.onPartial(current());
    if (current()) arm();
  };
  rec.onerror = (ev) => {
    if (sent) return;
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;
    sent = true;
    if (timer) clearTimeout(timer);
    opts.onError(speechErrorMessage(ev.error));
  };
  rec.onend = () => {
    if (!sent && current()) finish();
  };
  try {
    rec.start();
  } catch {
    opts.onError('ضبط صدا شروع نشد. دوباره تلاش کن.');
  }
  return {
    stop: () => {
      sent = true;
      if (timer) clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
    finish,
  };
}

export function speechErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'دسترسی به میکروفن داده نشد. در تنظیمات مرورگر اجازه بده و دوباره تلاش کن.';
    case 'audio-capture':
      return 'میکروفنی پیدا نشد یا در حال استفاده است.';
    case 'network':
      return 'تشخیص گفتار گوگل در دسترس نیست. صدا به سرور فرستاده می‌شود؛ اگر باز هم نشد، سؤال را بنویس.';
    default:
      return 'گفتار شنیده نشد. دوباره بگو یا سؤال را بنویس.';
  }
}

export interface RecordedSpeech {
  base64: string;
  mime: string;
  durationSec: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError')
    return speechErrorMessage('not-allowed');
  if (name === 'NotFoundError' || name === 'NotReadableError') return speechErrorMessage('audio-capture');
  return 'ضبط صدا شروع نشد. دوباره تلاش کن.';
}

/**
 * Records until a few seconds of silence, then returns audio for server-side Persian STT.
 * Web Speech is only a fallback: Chrome sends that audio to Google, which often fails in Iran.
 */
export function recordUntilSilence(opts: {
  onSilence: (audio: RecordedSpeech) => void;
  onError: (message: string) => void;
  silenceMs?: number;
}): ListenHandle {
  const silenceMs = opts.silenceMs ?? 2800;
  let emit = true;
  let cancelled: 'none' | 'discard' | 'finish' = 'none';
  let stopRecorder = () => {
    /* getUserMedia has not resolved yet */
  };
  void (async () => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (cancelled !== 'none') {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled === 'finish') opts.onError('گفتار شنیده نشد. دوباره بگو یا سؤال را بنویس.');
        return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
      );
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 24_000,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let heard = false;
      let quietSince = 0;
      const started = Date.now();
      const timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let acc = 0;
        for (const n of data) acc += Math.abs(n - 128);
        const loud = acc / data.length > 6;
        if (loud) {
          heard = true;
          quietSince = 0;
        } else if (heard) {
          quietSince = quietSince || Date.now();
        }
        const elapsed = Date.now() - started;
        if ((heard && quietSince && Date.now() - quietSince >= silenceMs) || elapsed > 18_000) {
          window.clearInterval(timer);
          if (rec.state === 'recording') rec.stop();
        } else if (!heard && elapsed > 8_000) {
          window.clearInterval(timer);
          emit = false;
          rec.stop();
          opts.onError('گفتار شنیده نشد. دوباره بگو یا سؤال را بنویس.');
        }
      }, 200);
      stopRecorder = () => {
        window.clearInterval(timer);
        if (rec.state === 'recording') rec.stop();
      };
      const done = new Promise<RecordedSpeech>((resolve, reject) => {
        rec.onerror = () => reject(new Error('ضبط صدا ناموفق بود.'));
        rec.onstop = () => {
          window.clearInterval(timer);
          void audioCtx.close().catch(() => undefined);
          stream?.getTracks().forEach((t) => t.stop());
          const type = rec.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunks, { type });
          void blobToBase64(blob)
            .then((base64) =>
              resolve({
                base64,
                mime: type.split(';')[0] ?? 'audio/webm',
                durationSec: Math.max(1, Math.round((Date.now() - started) / 1000)),
              }),
            )
            .catch(reject);
        };
      });
      rec.start(250);
      const audio = await done;
      if (emit && audio.base64.length > 32) opts.onSilence(audio);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      if (emit) opts.onError(micErrorMessage(err));
    }
  })();
  return {
    stop: () => {
      emit = false;
      cancelled = 'discard';
      stopRecorder();
    },
    finish: () => {
      emit = true;
      if (cancelled === 'none') cancelled = 'finish';
      stopRecorder();
    },
  };
}
