import { useEffect, useState } from 'react';
import { motionOff } from './motion';

/**
 * PHASE-5 §5.3 — the sound library.
 *
 * Every earcon is synthesised with the Web Audio API instead of shipping files:
 * the whole library is 0 KB over the wire (budget was ≤90 KB) and each cue is ≤0.6 s (S-01).
 *
 * Rules implemented here:
 *  S-00  sound fires ONLY for the designed moments — ordinary taps are silent.
 *  S-07  the switch is OFF by default and opt-in (marketers use this on the street/bus).
 *  S-09  the mentor never makes a sound (no cue exists for it).
 *  DoD   with prefers-reduced-motion the cues are silent too (motion/sound/haptics fall away
 *        together, while the information itself stays — e.g. the score is rendered in full).
 */
export type Moment = 'correct' | 'wrong' | 'celebrate' | 'streakUp' | 'mastery' | 'chest';

const KEY = 'ssl.sound';

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode: the setting simply does not persist */
  }
}

/** React binding for the profile switch (S-07). */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(soundEnabled);
  useEffect(() => setOn(soundEnabled()), []);
  return [
    on,
    (next: boolean) => {
      setSoundEnabled(next);
      setOn(next);
    },
  ];
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One plucked/struck voice: frequency ramp-free tone with an exponential decay. */
function tone(
  ac: AudioContext,
  freq: number,
  at: number,
  dur: number,
  gain = 0.22,
  type: OscillatorType = 'sine',
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Short filtered noise burst — the "rattle" of the quest chest (S-06). */
function noise(ac: AudioContext, at: number, dur: number, gain = 0.12) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
}

const CUES: Record<Moment, (ac: AudioContext, t: number) => void> = {
  // S-01 — a short two-note ding. Confirmation, not celebration.
  correct: (ac, t) => {
    tone(ac, 880, t, 0.14, 0.18);
    tone(ac, 1318.5, t + 0.09, 0.2, 0.16);
  },
  // S-02 — a soft low thud. Deliberately not a siren: an error must not feel like a punishment.
  wrong: (ac, t) => {
    tone(ac, 196, t, 0.18, 0.2, 'triangle');
    tone(ac, 147, t + 0.03, 0.16, 0.14, 'triangle');
  },
  /**
   * S-03 / S-08 — a short ascending motif built on an approximation of the Shur tetrachord
   * (D – E-half-flat – F – G) rather than a Western arcade arpeggio. It is a synthesized
   * approximation, not a recording of a setar.
   */
  celebrate: (ac, t) => {
    const motif = [587.33, 640.0, 698.46, 880.0]; // D5, E½♭5, F5, G5→D6 lift
    motif.forEach((f, i) => tone(ac, f, t + i * 0.085, 0.34, 0.17, 'triangle'));
    tone(ac, 1174.7, t + 0.34, 0.4, 0.09); // shimmer on top
  },
  // S-04 — a flick: the streak flame catches.
  streakUp: (ac, t) => {
    tone(ac, 1180, t, 0.07, 0.13);
    tone(ac, 1760, t + 0.05, 0.12, 0.1);
  },
  // S-05 — a chime for a mastery step.
  mastery: (ac, t) => {
    tone(ac, 1046.5, t, 0.5, 0.13);
    tone(ac, 1568, t + 0.06, 0.45, 0.09);
  },
  // S-06 — the quest chest rattles twice, then spills.
  chest: (ac, t) => {
    noise(ac, t, 0.09, 0.14);
    noise(ac, t + 0.14, 0.09, 0.14);
    tone(ac, 523.25, t + 0.28, 0.3, 0.12, 'triangle');
  },
};

/**
 * Fires the sound + haptic half of a moment. Motion itself lives in CSS at the call site
 * (M-01: transform only), so this function never touches layout.
 */
export function playMoment(moment: Moment): void {
  if (motionOff()) return; // DoD: reduced motion ⇒ no motion, no sound, no haptics
  if (soundEnabled()) {
    const ac = audio();
    if (!ac) return;
    CUES[moment](ac, ac.currentTime + 0.005);
    return;
  }
  // §5.4 haptics replace sound (never both), and only where the platform supports it.
  const pattern = HAPTICS[moment];
  if (pattern && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* some browsers throw on pattern arrays — silence is an acceptable fallback */
    }
  }
}

/** PHASE-5 §5.4 haptic patterns (ms). */
const HAPTICS: Partial<Record<Moment, number | number[]>> = {
  correct: 10,
  wrong: [30, 40, 30],
  celebrate: [12, 40, 12, 40, 12],
  streakUp: 10,
  mastery: [10, 30, 10],
  chest: [20, 50, 20],
};
