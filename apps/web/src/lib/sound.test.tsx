import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// The moments must run in tests even though the app treats vitest as "motion off".
vi.mock('./motion', () => ({ motionOff: () => false, motionArmed: () => true }));

import { playMoment, setSoundEnabled, soundEnabled } from './sound';
import { Reveal } from '@/components/common/Reveal';

describe('PHASE-5 sound/moments', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
  });

  it('is OFF by default (S-07) and opt-in', () => {
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
  });

  it('with sound off, a moment falls back to haptics instead of repeating (§5.4)', () => {
    playMoment('correct');
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
    playMoment('wrong');
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 40, 30]);
  });

  it('with sound on it does not also vibrate, and never throws without Web Audio', () => {
    setSoundEnabled(true);
    expect(() => playMoment('celebrate')).not.toThrow();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('every designed moment exists and is callable (S-00: nothing else makes a sound)', () => {
    for (const m of ['correct', 'wrong', 'celebrate', 'streakUp', 'mastery', 'chest'] as const) {
      expect(() => playMoment(m)).not.toThrow();
    }
  });
});

describe('Reveal', () => {
  it('shows content immediately when motion is unavailable (no hidden information)', () => {
    render(<Reveal>محتوا</Reveal>);
    const el = screen.getByText('محتوا');
    expect(el.className).toContain('reveal-in');
    expect(el.className).not.toBe('reveal');
  });
});
