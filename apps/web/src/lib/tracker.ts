import { useCallback, useEffect, useRef } from 'react';
import { ApiError, api } from './api';
import { enqueueBeat, newKey } from './offline-queue';
import type { ProgressResult } from './types';

type BeatEvent = 'heartbeat' | 'pause' | 'ended' | 'hidden' | 'start';
const FLUSH_EVERY_SEC = 10; // server limit is 20 beats/min
const MAX_DELTA = 60; // server rejects > 70

/**
 * Anti-cheat playback tracker (spec §21.5 / 28.2 #3). Only continuously *played* media
 * time counts: a sample is added when the position advanced by a small, plausible step
 * since the previous sample. Seeks (big jumps or backwards) contribute nothing. The server
 * sums playedDeltaSec and caps it at the section duration.
 */
export function usePlaybackTracker(sectionId: string, onResult: (r: ProgressResult) => void) {
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  const position = useRef(0);
  const sinceFlush = useRef(0);
  const cb = useRef(onResult);
  cb.current = onResult;

  const flush = useCallback(
    async (event: BeatEvent = 'heartbeat') => {
      const delta = Math.min(MAX_DELTA, Math.round(acc.current * 10) / 10);
      if (delta <= 0 && event === 'heartbeat') return;
      acc.current = Math.max(0, acc.current - delta);
      sinceFlush.current = 0;
      const body = {
        positionSec: Math.max(0, Math.floor(position.current)),
        playedDeltaSec: delta,
        ts: new Date().toISOString(),
        event,
      };
      const key = newKey();
      try {
        const r = await api.post<ProgressResult>(`/me/sections/${sectionId}/progress`, body, {
          'Idempotency-Key': key,
        });
        cb.current(r);
      } catch (e) {
        // 5xx (incl. the server's 503 "try again") is transient; the same Idempotency-Key makes the retry safe.
        if (
          e instanceof ApiError &&
          (e.code === 'NETWORK' || e.code === 'RATE_LIMIT' || e.status >= 500)
        )
          enqueueBeat({ sectionId, body, key });
      }
    },
    [sectionId],
  );

  /** Call on every time update (≈ 4Hz for <video>, 1Hz polling for YouTube). */
  const sample = useCallback(
    (currentTime: number, playing: boolean, rate = 1) => {
      position.current = currentTime;
      const prev = last.current;
      last.current = currentTime;
      if (!playing || prev === null) return;
      const step = currentTime - prev;
      if (step > 0 && step <= 2.5 * Math.max(1, rate)) {
        acc.current += step;
        sinceFlush.current += step;
        if (sinceFlush.current >= FLUSH_EVERY_SEC * Math.max(1, rate)) void flush();
      }
    },
    [flush],
  );

  /** A seek resets the baseline so the jump itself is never counted. */
  const seeked = useCallback((t: number) => {
    last.current = t;
    position.current = t;
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush('hidden');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush('pause');
    };
  }, [flush]);

  return { sample, seeked, flush };
}

// ─── YouTube IFrame API loader ──────────────────────────────────────────────
export interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  seekTo(s: number, allow: boolean): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: () => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ytPromise: Promise<YTNamespace> | null = null;
export function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      ytPromise = null;
      reject(new Error('youtube'));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}
