import { describe, expect, it } from 'vitest';
import { isLeapJalali, jalaliMonthLength, toGregorian, toJalali, weekdaySatFirst } from './jalali';

describe('jalali', () => {
  it('converts known dates both ways', () => {
    expect(toJalali(2026, 3, 21)).toEqual([1405, 1, 1]); // Nowruz 1405
    expect(toJalali(2026, 9, 28)).toEqual([1405, 7, 6]);
    expect(toJalali(1979, 2, 11)).toEqual([1357, 11, 22]);
    expect(toGregorian(1405, 7, 6)).toEqual([2026, 9, 28]);
    expect(toGregorian(1403, 12, 30)).toEqual([2025, 3, 20]); // leap year last day
  });
  it('round-trips every day of several years', () => {
    const d = new Date(2023, 0, 1);
    for (let i = 0; i < 365 * 5; i++) {
      const g: [number, number, number] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
      expect(toGregorian(...toJalali(...g))).toEqual(g);
      d.setDate(d.getDate() + 1);
    }
  });
  it('leap years and month lengths', () => {
    expect(isLeapJalali(1403)).toBe(true);
    expect(isLeapJalali(1404)).toBe(false);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
    expect(jalaliMonthLength(1404, 1)).toBe(31);
  });
  it('weekday with Saturday first', () => {
    expect(weekdaySatFirst(2026, 9, 26)).toBe(0); // Saturday
    expect(weekdaySatFirst(2026, 10, 2)).toBe(6); // Friday
  });
});
