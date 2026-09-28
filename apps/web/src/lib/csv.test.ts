import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('adds BOM and escapes commas/quotes/newlines', () => {
    const out = toCsv(
      ['نام', 'یادداشت'],
      [
        ['سارا', 'الف، "ب"'],
        ['علی', 'x,y\nz'],
        ['رضا', null],
      ],
    );
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toContain('"الف، ""ب"""');
    expect(out).toContain('"x,y\nz"');
    expect(out.endsWith('رضا,')).toBe(true);
  });
});
