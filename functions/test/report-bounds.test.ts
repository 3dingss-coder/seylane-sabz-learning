import { describe, expect, it } from 'vitest';
import { reportBound } from '../src/services/reports';

describe('reportBound (Tehran calendar day)', () => {
  it('start of 2026-10-06 is 2026-10-05T20:30Z', () => {
    expect(new Date(reportBound('2026-10-06', 'start')).toISOString()).toBe(
      '2026-10-05T20:30:00.000Z',
    );
  });
  it('end of 2026-10-06 is 2026-10-06T20:29:59.999Z', () => {
    expect(new Date(reportBound('2026-10-06', 'end')).toISOString()).toBe(
      '2026-10-06T20:29:59.999Z',
    );
  });
  it('full timestamps are untouched; garbage is NaN', () => {
    expect(reportBound('2026-10-06T10:00:00Z', 'start')).toBe(Date.parse('2026-10-06T10:00:00Z'));
    expect(Number.isNaN(reportBound('nope', 'end'))).toBe(true);
  });
});
