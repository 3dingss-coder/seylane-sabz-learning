import { describe, expect, it } from 'vitest';
import { toLatinDigits, toPersianDigits } from './digits';

describe('digits', () => {
  it('converts to Persian digits', () => expect(toPersianDigits(2026)).toBe('۲۰۲۶'));
  it('normalizes Persian and Arabic digits to Latin', () => {
    expect(toLatinDigits('۰۹۱۲٣٤٥')).toBe('0912345');
  });
});
