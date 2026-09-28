import { describe, expect, it } from 'vitest';
import { getCountdown } from './countdown';

const H = 3_600_000;
const now = Date.UTC(2026, 8, 28, 12, 0, 0);

describe('getCountdown', () => {
  it('normal when more than 72h left', () => {
    const s = getCountdown(now + 100 * H, now);
    expect(s.tone).toBe('normal');
    expect(s.short).toBe('4d 04h');
    expect(s.spoken).toContain('روز');
  });
  it('warning at ≤72h and danger at ≤24h (policy defaults)', () => {
    expect(getCountdown(now + 72 * H, now).tone).toBe('warning');
    expect(getCountdown(now + 24 * H, now).tone).toBe('danger');
    expect(getCountdown(now + 5 * H + 7 * 60_000, now).short).toBe('05:07');
  });
  it('overdue when deadline passed', () => {
    const s = getCountdown(now - 1, now);
    expect(s.tone).toBe('overdue');
    expect(s.spoken).toBe('مهلت تمام شده است');
  });
  it('respects custom warning hours', () => {
    expect(getCountdown(now + 90 * H, now, [96, 12]).tone).toBe('warning');
  });
});
