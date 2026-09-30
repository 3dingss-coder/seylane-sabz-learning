import { describe, expect, it } from 'vitest';
import { fromZonedInput, toZonedInput } from './dates';

describe('date fields are anchored to the app time zone (Asia/Tehran), not the browser', () => {
  it('shows the Tehran wall clock', () => {
    expect(toZonedInput('2026-09-26T05:30:00.000Z')).toBe('2026-09-26T09:00');
    expect(toZonedInput('2026-09-26T00:00:00.000Z')).toBe('2026-09-26T03:30');
  });

  it('stores the picked wall clock as UTC (+03:30, no DST)', () => {
    expect(fromZonedInput('2026-09-26T09:00')).toBe('2026-09-26T05:30:00.000Z');
    // A date-only pick is the start of the Tehran day — a German browser used to shift it by hours.
    expect(fromZonedInput('2026-10-01')).toBe('2026-09-30T20:30:00.000Z');
  });

  it('round-trips a stored deadline', () => {
    const iso = '2027-03-20T21:00:00.000Z';
    expect(fromZonedInput(toZonedInput(iso))).toBe(iso);
  });

  it('treats empty and broken input as "no date"', () => {
    expect(toZonedInput(null)).toBe('');
    expect(toZonedInput(undefined)).toBe('');
    expect(toZonedInput('not-a-date')).toBe('');
    expect(fromZonedInput('')).toBeNull();
    expect(fromZonedInput('26/09/2026')).toBeNull();
  });
});
