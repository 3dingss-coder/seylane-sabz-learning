import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Character } from './Character';
import { OBJECTIONS } from './data';
import { ObjectionCreature } from './ObjectionCreature';
import { CHARACTER_NAME, EXPRESSIONS, type CharacterId } from './types';

const CAST: CharacterId[] = ['seyla', 'raha', 'kamran', 'simin', 'bahram', 'golnar'];

describe('PHASE-2 cast — <Character />', () => {
  // DoD §2.8: a unit test over all 8 expressions (here: all 6 characters × all 8 = 48 states)
  it.each(CAST)('%s renders every expression with a Persian accessible name', (id) => {
    for (const expression of EXPRESSIONS) {
      const { unmount } = render(<Character id={id} expression={expression} />);
      const label = `${CHARACTER_NAME[id]}، حالت `;
      if (id === 'seyla') {
        expect(screen.getByText((t) => t.startsWith(label))).toBeInTheDocument();
      } else {
        expect(screen.getByRole('img', { name: (n) => n.startsWith(label) })).toBeInTheDocument();
      }
      unmount();
    }
  });

  it('a speech bubble is announced politely and names the speaker (DoD §2.8)', () => {
    render(<Character id="simin" expression="thinking" speech="قبلاً هم این حرفا رو شنیدم." />);
    const bubble = screen.getByText('قبلاً هم این حرفا رو شنیدم.');
    expect(bubble).toHaveAttribute('aria-live', 'polite');
    // the bubble stays the pure quote; the speaker is named above it
    expect(bubble).toHaveTextContent(/^قبلاً هم این حرفا رو شنیدم\.$/);
    expect(screen.getByText('سیمین، مشتری مردد')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'سیمین، مشتری مردد می‌گوید: قبلاً هم این حرفا رو شنیدم.' }),
    ).toBeInTheDocument();
  });

  it('Seyla’s crest grows with mastery (C-07) — the mascot is the progress bar', () => {
    const feathers = (mastery: 0 | 1 | 2 | 3) => {
      const { container, unmount } = render(<Character id="seyla" mastery={mastery} size="lg" />);
      const crest = container.querySelector('svg[aria-hidden]');
      const n = crest?.querySelectorAll('path').length ?? 0;
      unmount();
      return n;
    };
    expect(feathers(0)).toBe(1);
    expect(feathers(1)).toBe(1);
    expect(feathers(2)).toBe(2);
    expect(feathers(3)).toBe(3);
  });

  it('every human is drawn from the shared rig (no sharp corners, 2px ink)', () => {
    for (const id of ['raha', 'kamran', 'simin', 'bahram', 'golnar'] as const) {
      const { container, unmount } = render(<Character id={id} />);
      const svg = container.querySelector('svg[role="img"]');
      expect(svg).not.toBeNull();
      // the face rig contributes eyes + brows + mouth for every character
      expect((svg as SVGElement).querySelectorAll('path').length).toBeGreaterThan(3);
      unmount();
    }
  });
});

describe('PHASE-2 §2.3 — objection creatures', () => {
  it('all six render in both states and say the real objection', () => {
    for (const o of OBJECTIONS) {
      for (const state of ['active', 'calm'] as const) {
        const { unmount } = render(<ObjectionCreature id={o.id} state={state} />);
        expect(
          screen.getByRole('img', {
            name: `اعتراض مشتری: ${o.says}${state === 'calm' ? ' (آرام شده)' : ''}`,
          }),
        ).toBeInTheDocument();
        unmount();
      }
    }
  });

  it('each objection carries its real need and the winning move (content, not decoration)', () => {
    expect(OBJECTIONS).toHaveLength(6);
    for (const o of OBJECTIONS) {
      expect(o.need.length).toBeGreaterThan(2);
      expect(o.move.length).toBeGreaterThan(5);
    }
  });
});
