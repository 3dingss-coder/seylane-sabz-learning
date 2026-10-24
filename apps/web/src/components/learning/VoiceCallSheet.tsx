import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { Modal, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { qk } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { track } from '@/lib/telemetry';
import { readPageContext } from '@/lib/pageContext';
import { listenFa, recordUntilSilence, speechSupported, type ListenHandle } from '@/lib/speech';
import {
  createRecorder,
  micSupported,
  playAudioBase64,
  speakWithBrowser,
  stopAudio,
} from '@/lib/voice';
import type { ChatReply, VoiceSessionOffer, VoiceTurnReply } from '@/lib/types';

type CallState =
  'idle' | 'connecting' | 'listening' | 'recording' | 'thinking' | 'speaking' | 'ended';

const STATE_LABEL: Record<CallState, string> = {
  idle: 'برای شروع تماس، دکمه میکروفن را بزن',
  connecting: 'در حال وصل شدن به منتور…',
  listening: 'بگو، گوش می‌دهم…',
  recording: 'گوش می‌دهم… بعد از چند ثانیه سکوت ارسال می‌شود',
  thinking: 'منتور در حال فکر کردن است…',
  speaking: 'منتور جواب می‌دهد…',
  ended: 'تماس تمام شد',
};

/**
 * M9-V — تماس صوتی با منتور.
 *
 * The browser records one utterance at a time (MediaRecorder → base64) and posts it to
 * `/me/mentor/voice/turn`; the server transcribes with Whisper, answers from the knowledge index
 * and returns Persian speech. When the server cannot synthesize (TTS quota), we fall back to the
 * device voice so the call never dies. The transcript is sent once, on hang-up, and the caller
 * decides whether it may be stored.
 */
export function VoiceCallSheet({
  packageId,
  onClose,
}: {
  packageId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<CallState>('connecting');
  const [session, setSession] = useState<VoiceSessionOffer | null>(null);
  const [turns, setTurns] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [last, setLast] = useState<VoiceTurnReply | null>(null);
  const [storeTranscript, setStoreTranscript] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const recorder = useMemo(() => (micSupported() ? createRecorder() : null), []);
  const listenRef = useRef<ListenHandle | null>(null);
  const autoListenRef = useRef(true);
  const startListenRef = useRef<() => void>(() => undefined);
  const [voiceNote, setVoiceNote] = useState('');
  const canListen = speechSupported() || micSupported();
  const stopPlayback = useRef<(() => void) | null>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const startedAt = useRef(Date.now());
  const closingRef = useRef(false);

  // ── Session bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const offer = await api.post<VoiceSessionOffer>('/me/mentor/voice/session', {
          packageId,
          transport: 'turn',
          page: readPageContext() ?? undefined,
        });
        if (cancelled) return;
        setSession(offer);
        setState('idle');
        track('mentor_voice_opened', { transport: offer.transport });
      } catch (e) {
        if (cancelled) return;
        // Session can fail (voice policy or provider) and the call still works via text ask.
        setSession(null);
        setState('idle');
        toast.show({ type: 'error', message: errMsg(e) });
      }
    })();
    return () => {
      cancelled = true;
      stopPlayback.current?.();
      stopAudio();
      recorder?.cancel();
      listenRef.current?.stop();
    };
  }, [packageId, recorder, toast]);

  useEffect(() => {
    if (state === 'ended') return;
    const t = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [state]);

  const append = useCallback((role: 'user' | 'assistant', text: string) => {
    setTurns((old) => [...old, { role, text }]);
  }, []);

  const speak = useCallback((reply: VoiceTurnReply) => {
    const again = () => {
      window.setTimeout(() => startListenRef.current(), 250);
    };
    if (reply.audio) {
      setVoiceNote('');
      stopPlayback.current = playAudioBase64(reply.audio.base64, reply.audio.mime);
      setState('speaking');
      const ms = Math.min(30_000, 1200 + reply.reply.length * 90);
      setTimeout(() => {
        setState((s) => (s === 'speaking' ? 'idle' : s));
        again();
      }, ms);
      return;
    }
    if (speakWithBrowser(reply.reply)) {
      setVoiceNote('');
      setState('speaking');
      const ms = Math.min(30_000, 1200 + reply.reply.length * 90);
      setTimeout(() => {
        setState((s) => (s === 'speaking' ? 'idle' : s));
        again();
      }, ms);
      return;
    }
    setVoiceNote('صدای فارسی روی این دستگاه نیست. متن پاسخ همین‌جا خوانده می‌شود.');
    setState('idle');
    again();
  }, []);

  const sendSpoken = useCallback(
    async (input: {
      transcript?: string;
      audio?: { base64: string; mime: string; durationSec: number };
    }) => {
      if (input.audio && input.audio.base64.length > 700_000) {
        toast.show({
          type: 'error',
          message: 'صدا طولانی شد و از حد ارسال گذشت. کوتاه‌تر حرف بزن و دوباره بفرست.',
        });
        setState('idle');
        return;
      }
      setState('thinking');
      const page = readPageContext();
      try {
        let reply: VoiceTurnReply;
        try {
          reply = await api.post<VoiceTurnReply>('/me/mentor/voice/turn', {
            audio: input.audio?.base64,
            mime: input.audio?.mime,
            durationSec: input.audio?.durationSec,
            transcript: input.transcript,
            packageId: packageId ?? page?.packageId ?? null,
            page: page ?? undefined,
          });
        } catch (e) {
          if (!input.transcript?.trim()) throw e;
          const asked = await api.post<ChatReply>('/me/mentor/ask', {
            text: input.transcript,
            packageId: packageId ?? page?.packageId ?? null,
            spoken: true,
            page: page ?? undefined,
          });
          reply = {
            transcript: input.transcript,
            reply: asked.reply,
            audio: null,
            sources: asked.sources,
            outcome: asked.outcome,
            nextAction: asked.nextAction ?? null,
            provider: asked.provider ?? 'ask',
            latency: {
              sttMs: 0,
              answerMs: asked.latencyMs ?? 0,
              ttsMs: 0,
              totalMs: asked.latencyMs ?? 0,
            },
          };
        }
        append('user', reply.transcript);
        append('assistant', reply.reply);
        setLast(reply);
        speak(reply);
      } catch (e) {
        stopAudio();
        toast.show({ type: 'error', message: errMsg(e) });
        setState('idle');
      }
    },
    [append, packageId, speak, toast],
  );

  const onMic = useCallback(async () => {
    if (state === 'speaking' || state === 'thinking' || state === 'connecting') return;
    stopPlayback.current?.();
    stopAudio();
    if (micSupported()) {
      if (state === 'recording') {
        listenRef.current?.finish?.();
        setState('thinking');
        return;
      }
      setState('recording');
      listenRef.current = recordUntilSilence({
        onSilence: (audio) => {
          listenRef.current = null;
          void sendSpoken({ audio });
        },
        onError: (message) => {
          listenRef.current = null;
          toast.show({ type: 'error', message });
          setState('idle');
        },
      });
      return;
    }
    if (speechSupported()) {
      if (state === 'recording') {
        listenRef.current?.stop();
        return;
      }
      setState('recording');
      listenRef.current = listenFa({
        onPartial: () => undefined,
        onSilence: (said) => {
          listenRef.current = null;
          void sendSpoken({ transcript: said });
        },
        onError: (message) => {
          listenRef.current = null;
          toast.show({ type: 'error', message });
          setState('idle');
        },
      });
      return;
    }
    toast.show({ type: 'error', message: 'مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.' });
  }, [sendSpoken, state, toast]);
  startListenRef.current = () => {
    if (!autoListenRef.current || listenRef.current) return;
    if (!micSupported()) return;
    setState('recording');
    listenRef.current = recordUntilSilence({
      onSilence: (audio) => {
        listenRef.current = null;
        void sendSpoken({ audio });
      },
      onError: (message) => {
        listenRef.current = null;
        toast.show({ type: 'error', message });
        setState('idle');
      },
    });
  };

  const hangUp = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    autoListenRef.current = false;
    stopPlayback.current?.();
    stopAudio();
    try {
      recorder?.cancel();
      listenRef.current?.stop();
    } catch {
      /* ignore */
    }
    setState('ended');
    const spoken = turnsRef.current;
    if (session && spoken.length > 0) {
      try {
        await api.post('/me/mentor/voice/transcript', {
          sessionId: session.sessionId,
          turns: spoken,
          durationSec: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
          storeTranscript,
        });
        await qc.invalidateQueries({ queryKey: qk.chat(packageId) });
        await qc.invalidateQueries({ queryKey: qk.behavior });
      } catch {
        // The call itself succeeded — bookkeeping failure must not scare the marketer.
      }
    }
    onClose();
  }, [onClose, packageId, qc, recorder, session, storeTranscript]);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const active = state !== 'ended';

  return (
    <Modal open onClose={() => void hangUp()} title="تماس صوتی با منتور" size="md">
      <div className="flex flex-col items-center gap-4 py-2">
        <div
          className={cn(
            'flex size-24 items-center justify-center rounded-full transition-colors',
            state === 'recording' ? 'bg-primary text-white' : 'bg-primary-light text-primary',
          )}
          aria-hidden
        >
          {state === 'thinking' || state === 'connecting' ? (
            <Loader2 className="size-10 animate-spin" />
          ) : state === 'speaking' ? (
            <Volume2 className="size-10" />
          ) : canListen ? (
            <Mic className="size-10" />
          ) : (
            <MicOff className="size-10" />
          )}
        </div>

        <p className="text-center text-sm text-text" aria-live="polite">
          {STATE_LABEL[state]}
        </p>
        {voiceNote ? <p className="text-center text-xs text-text-secondary">{voiceNote}</p> : null}
        {active && <p className="text-xs text-text-secondary">{mmss}</p>}

        {(turns.length > 0 || last) && (
          <div className="max-h-56 w-full space-y-2 overflow-y-auto rounded-card border border-border bg-surface p-3 text-sm">
            {turns.map((t, i) => (
              <p
                key={`${i}-${t.text.slice(0, 8)}`}
                className={cn(
                  'whitespace-pre-line',
                  t.role === 'user' ? 'text-text-secondary' : 'text-text',
                )}
              >
                <span className="font-bold">{t.role === 'user' ? 'شما: ' : 'منتور: '}</span>
                {t.text}
              </p>
            ))}
            {last?.sources.length ? (
              <p className="text-xs text-text-secondary">
                منبع: {last.sources.map((s) => s.title).join('، ')}
              </p>
            ) : null}
            {last?.nextAction?.label ? (
              <p className="text-xs text-primary">پیشنهاد بعدی: {last.nextAction.label}</p>
            ) : null}
          </div>
        )}

        <div className="flex w-full items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void onMic()}
            disabled={!active || !micSupported()}
            aria-label={state === 'recording' ? 'پایان ضبط و ارسال' : 'شروع ضبط'}
            className={cn(
              'flex size-16 items-center justify-center rounded-full text-white shadow-sm disabled:opacity-40',
              state === 'recording' ? 'bg-danger' : 'bg-primary',
            )}
          >
            {state === 'recording' ? <MicOff className="size-7" /> : <Mic className="size-7" />}
          </button>
          <button
            type="button"
            onClick={() => void hangUp()}
            aria-label="پایان تماس"
            className="flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm text-danger"
          >
            <PhoneOff className="size-5" aria-hidden /> پایان تماس
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={storeTranscript}
            onChange={(e) => setStoreTranscript(e.target.checked)}
            className="size-4"
          />
          متن این تماس برای مرور بعدی ذخیره شود
        </label>
        <p className="text-center text-xs text-text-secondary">
          صدای شما فقط برای تبدیل به متن ارسال می‌شود؛ پاسخ‌ها از محتوای تأییدشده‌ی شرکت است.
        </p>
      </div>
    </Modal>
  );
}
