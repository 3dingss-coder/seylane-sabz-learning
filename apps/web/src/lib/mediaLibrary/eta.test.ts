import { describe, expect, it } from 'vitest';
import { EtaEstimator, formatEta } from './eta';

describe('EtaEstimator', () => {
  it('stays silent at first, then estimates from a steady rate', () => {
    const e = new EtaEstimator();
    e.update(0, 0);
    expect(e.remainingMs(1000)).toBeNull();
    e.update(0.1, 10_000); // 1% per second
    e.update(0.2, 20_000);
    const r = e.remainingMs(20_000);
    expect(r).not.toBeNull();
    expect(r ?? 0).toBeGreaterThan(70_000);
    expect(r ?? 0).toBeLessThan(90_000);
  });

  it('never goes backwards or negative', () => {
    const e = new EtaEstimator();
    e.update(0.5, 0);
    e.update(0.9, 10_000);
    e.update(0.4, 11_000); // a stray lower reading is ignored
    expect(e.remainingMs(12_000) ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('formatEta', () => {
  it('formats in Persian with coarse buckets', () => {
    expect(formatEta(null)).toContain('محاسبه');
    expect(formatEta(20_000)).toBe('کمتر از یک دقیقه');
    expect(formatEta(5 * 60_000)).toBe('حدود ۵ دقیقه');
    expect(formatEta(150 * 60_000)).toBe('حدود ۲٫۵ ساعت'.replace('٫', '.'));
  });
});
