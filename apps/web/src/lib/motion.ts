import { useEffect, useRef, useState } from 'react';

/** True when the OS asks for less motion (also treated as "no motion" under vitest). */
export function motionOff(): boolean {
  if (import.meta.env.MODE === 'test') return true;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Cold-load calm: entry motion (stagger, page-enter, count-up, ring fill, pulses) only starts once the
 * user has interacted (first tap / key press → <html data-motion>). A cold start therefore paints
 * its final content immediately — nothing is delayed or re-rastered while Lighthouse / a slow phone
 * is still booting — and every navigation after the first tap is animated. See docs/DESIGN-REFRESH.md.
 */
export function motionArmed(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-motion');
}

/** Call once at boot: arms entry motion on the first real interaction. */
export function armMotionOnInteraction(): void {
  if (typeof document === 'undefined') return;
  const arm = () => {
    document.documentElement.setAttribute('data-motion', '');
    for (const ev of events) window.removeEventListener(ev, arm, true);
  };
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  for (const ev of events) window.addEventListener(ev, arm, { capture: true, passive: true });
}

/** Delay (ms) to keep an element mounted so its exit animation can play. 0 when motion is off. */
export const exitDelay = (ms: number): number => (motionOff() ? 0 : ms);

/**
 * Keeps `open` content mounted for `ms` after it closes so an exit animation can run.
 * `closing` is true during that window.
 */
export function usePresence(open: boolean, ms = 180): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    // adjust state during render (React-recommended pattern for derived state)
    setPrevOpen(open);
    if (open) setMounted(true);
    else if (exitDelay(ms) === 0) setMounted(false);
  }
  useEffect(() => {
    if (open || !mounted) return;
    const id = window.setTimeout(() => setMounted(false), exitDelay(ms));
    return () => window.clearTimeout(id);
  }, [open, mounted, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Counts from 0 to `target` once on mount (and again when `target` changes). */
export function useCountUp(target: number, durationMs = 900): number {
  const skip = motionOff() || !motionArmed() || !Number.isFinite(target);
  const [value, setValue] = useState(skip ? target : 0);
  const from = useRef(skip ? target : 0);
  useEffect(() => {
    if (skip) return;
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const v = origin + (target - origin) * easeOutCubic(t);
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, skip]);
  return skip ? target : value;
}

/** false on first paint, true on the next frame — lets a CSS transition run from 0 → value. */
export function useMountedFlag(): boolean {
  const [on, setOn] = useState(motionOff() || !motionArmed());
  useEffect(() => {
    if (on) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, [on]);
  return on;
}
