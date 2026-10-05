import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, Card, CoinChip, StreakChip } from './index';

// Design v3 (PHASE-1): new additive tokens/variants. These tests only assert the NEW
// surface; existing variants are covered by ui.test.tsx.
describe('design v3 additions', () => {
  it('Button exposes a green cta variant with a 3D lip', () => {
    render(<Button variant="cta">ادامه</Button>);
    const btn = screen.getByRole('button', { name: 'ادامه' });
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('[box-shadow:var(--lip-md)]');
  });

  it('primary is a flat filled key with a 3D lip (v4 replaced the soft gradient)', () => {
    render(<Button variant="primary">اصلی</Button>);
    const btn = screen.getByRole('button', { name: 'اصلی' });
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('text-on-primary');
    expect(btn.className).toContain('[box-shadow:var(--lip-md)]');
    expect(btn.className).toContain('active:translate-y-1');
    expect(btn.className).not.toContain('bg-brand-gradient');
  });

  it('Card chunky adds a 2px physical border without removing base classes', () => {
    const { container } = render(<Card chunky>متن</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('border-2');
    expect(div.className).toContain('border-chunk-border');
    expect(div.className).toContain('bg-surface');
  });

  it('Card default is unchanged (no 2px border)', () => {
    const { container } = render(<Card>متن</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).not.toContain('border-2');
  });

  it('StreakChip renders crest-on-tint with a Persian aria-label', () => {
    render(<StreakChip count={14} />);
    const chip = screen.getByLabelText('پیوستگی ۱۴ روز');
    expect(chip.className).toContain('bg-streak-100');
    expect(chip.className).toContain('text-streak-deep');
  });

  it('CoinChip renders reward yellow with dark fg', () => {
    render(<CoinChip value={240} />);
    const chip = screen.getByLabelText('۲۴۰ سکهٔ توانمندی');
    expect(chip.className).toContain('bg-reward');
    expect(chip.className).toContain('text-reward-fg');
  });
});
