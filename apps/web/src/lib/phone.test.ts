import { describe, expect, it } from 'vitest';
import { normalizeIranianMobile } from './phone';

describe('normalizeIranianMobile', () => {
  it.each([
    ['09121234567', '09121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '09121234567'],
    ['٠٩١٢١٢٣٤٥٦٧', '09121234567'],
    ['+989121234567', '09121234567'],
    ['00989121234567', '09121234567'],
    ['989121234567', '09121234567'],
    ['9121234567', '09121234567'],
    ['+98 (912) 123-4567', '09121234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIranianMobile(input)).toBe(expected);
  });

  it.each(['', '0912123456', '091212345678', '0912abc4567', '+1 555 123 4567', '09.12.123.4567'])(
    'rejects malformed number %s',
    (input) => expect(normalizeIranianMobile(input)).toBeNull(),
  );
});
