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
  stop: () => void;
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
    opts.onError(
      ev.error === 'not-allowed'
        ? 'دسترسی به میکروفن داده نشد. اجازه بده و دوباره تلاش کن.'
        : 'گفتار شنیده نشد. دوباره بگو یا سؤال را بنویس.',
    );
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
  };
}
