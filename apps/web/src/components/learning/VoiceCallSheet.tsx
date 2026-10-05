import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { Modal, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { COPY, LINES } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { qk } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { track } from '@/lib/telemetry';
import {
  createRecorder,
  micSupported,
  playAudioBase64,
  speakWithBrowser,
  stopAudio,
} from '@/lib/voice';
import type { VoiceSessionOffer, VoiceTurnReply } from '@/lib/types';

type CallState =
  'idle' | 'connecting' | 'listening' | 'recording' | 'thinking' | 'speaking' | 'ended';

const STATE_LABEL: Record<CallState, string> = {
  idle: COPY.voice.idle,
  connecting: COPY.voice.connecting,
  listening: COPY.voice.listening,
  recording: COPY.voice.recording,
  thinking: COPY.voice.thinking,
  speaking: COPY.voice.speaking,
  ended: COPY.voice.ended,
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
        });
        if (cancelled) return;
        setSession(offer);
        setState('idle');
        track('mentor_voice_opened', { transport: offer.transport });
      } catch (e) {
        if (cancelled) return;
        toast.show({ type: 'error', message: errMsg(e) });
        setState('ended');
      }
    })();
    return () => {
      cancelled = true;
      stopPlayback.current?.();
      stopAudio();
      recorder?.cancel();
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
    if (reply.audio) {
      stopPlayback.current = playAudioBase64(reply.audio.base64, reply.audio.mime);
      setState('speaking');
      // The audio element has no completion callback here; the next mic press or a short timer
      // returns control to the caller. 4 s/100 chars is a safe Persian speaking-rate estimate.
      const ms = Math.min(30_000, 1200 + reply.reply.length * 90);
      setTimeout(() => {
        setState((s) => (s === 'speaking' ? 'idle' : s));
      }, ms);
      return;
    }
    // No server audio (TTS quota / provider down) → use the phone's own Persian voice.
    if (speakWithBrowser(reply.reply)) setState('speaking');
    else setState('idle');
  }, []);

  const sendTurn = useCallback(
    async (audio: { base64: string; mime: string; durationSec: number }) => {
      setState('thinking');
      try {
        const r = await api.post<VoiceTurnReply>('/me/mentor/voice/turn', {
          audio: audio.base64,
          mime: audio.mime,
          durationSec: audio.durationSec,
          packageId,
        });
        append('user', r.transcript);
        append('assistant', r.reply);
        setLast(r);
        speak(r);
      } catch (e) {
        stopAudio();
        toast.show({ type: 'error', message: errMsg(e) });
        setState('idle');
      }
    },
    [append, packageId, speak, toast],
  );

  const onMic = useCallback(async () => {
    if (!recorder) {
      toast.show({ type: 'error', message: COPY.voice.noRecordingSupport });
      return;
    }
    if (state === 'recording') {
      setState('thinking');
      try {
        const rec = await recorder.stop();
        await sendTurn(rec);
      } catch (e) {
        toast.show({ type: 'error', message: errMsg(e) });
        setState('idle');
      }
      return;
    }
    if (state === 'speaking' || state === 'thinking' || state === 'connecting') return;
    stopPlayback.current?.();
    stopAudio();
    try {
      await recorder.start();
      setState('recording');
    } catch {
      toast.show({
        type: 'error',
        message: COPY.voice.micDenied,
      });
      setState('idle');
    }
  }, [recorder, sendTurn, state, toast]);

  const hangUp = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    stopPlayback.current?.();
    stopAudio();
    try {
      recorder?.cancel();
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
    <Modal open onClose={() => void hangUp()} title={COPY.voice.title} size="md">
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
          ) : micSupported() ? (
            <Mic className="size-10" />
          ) : (
            <MicOff className="size-10" />
          )}
        </div>

        <p className="text-center text-sm text-text" aria-live="polite">
          {STATE_LABEL[state]}
        </p>
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
                <span className="font-bold">
                  {t.role === 'user' ? COPY.voice.youPrefix : COPY.voice.mentorPrefix}
                </span>
                {t.text}
              </p>
            ))}
            {last?.sources.length ? (
              <p className="text-xs text-text-secondary">
                {LINES.sources(
                  last.sources.map((s) => s.title).join(COPY.punctuation.listSeparator),
                )}
              </p>
            ) : null}
            {last?.nextAction?.label ? (
              <p className="text-xs text-primary">{LINES.nextSuggestion(last.nextAction.label)}</p>
            ) : null}
          </div>
        )}

        <div className="flex w-full items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void onMic()}
            disabled={!active || !micSupported()}
            aria-label={state === 'recording' ? COPY.voice.stopAndSend : COPY.voice.startRecording}
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
            aria-label={COPY.voice.endCall}
            className="flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm text-danger"
          >
            <PhoneOff className="size-5" aria-hidden /> {COPY.voice.endCall}
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={storeTranscript}
            onChange={(e) => setStoreTranscript(e.target.checked)}
            className="size-4"
          />
          {COPY.voice.saveTranscript}
        </label>
        <p className="text-center text-xs text-text-secondary">{COPY.voice.privacyNote}</p>
      </div>
    </Modal>
  );
}
