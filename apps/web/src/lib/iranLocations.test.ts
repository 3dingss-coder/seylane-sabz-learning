import { describe, expect, it } from 'vitest';
import {
  IRAN_PROVINCES,
  PROVINCE_NAMES,
  canonicalCity,
  canonicalProvince,
  isValidResidence,
  normalizeLocation,
  searchCities,
  searchProvinces,
} from './iranLocations';

/**
 * The directory is a generated file (tools/build-iran-locations.mjs). These tests pin the facts the
 * sign-up form relies on: 31 provinces, a city list per province, forgiving search, and — most
 * importantly — that no two cities of one province fold into the same key, which would make a
 * picked city ambiguous.
 */
describe('iranLocations', () => {
  it('covers all 31 provinces of Iran', () => {
    expect(IRAN_PROVINCES).toHaveLength(31);
    expect(new Set(PROVINCE_NAMES).size).toBe(31);
    for (const name of ['تهران', 'خراسان رضوی', 'اصفهان', 'فارس', 'البرز', 'قم']) {
      expect(PROVINCE_NAMES).toContain(name);
    }
    // The post-office spelling gaps are fixed for display.
    expect(PROVINCE_NAMES).toContain('سیستان و بلوچستان');
    expect(PROVINCE_NAMES).toContain('چهارمحال و بختیاری');
    expect(PROVINCE_NAMES).toContain('کهگیلویه و بویراحمد');
    expect(PROVINCE_NAMES).not.toContain('سیستان وبلوچستان');
  });

  it('has cities for every province and a unique key per province', () => {
    for (const province of IRAN_PROVINCES) {
      expect(province.cities.length).toBeGreaterThan(0);
      const keys = province.cities.map(normalizeLocation);
      expect(new Set(keys).size).toBe(keys.length);
    }
    // Sorted with Persian collation, «مشهد» is one of خراسان رضوی's cities.
    expect(searchCities('خراسان رضوی', '')).toContain('مشهد');
    expect(IRAN_PROVINCES.reduce((n, p) => n + p.cities.length, 0)).toBeGreaterThan(1400);
  });

  it('folds spelling variants so search and stored values match', () => {
    expect(normalizeLocation('كرمانشاه')).toBe(normalizeLocation('کرمانشاه'));
    expect(normalizeLocation('آباده')).toBe(normalizeLocation('اباده'));
    expect(normalizeLocation('  تهران   ')).toBe('تهران');
    // ZWNJ and the «و» spacing the post office uses.
    expect(normalizeLocation('سیستان وبلوچستان')).toBe(normalizeLocation('سیستان و بلوچستان'));
    // …but two genuinely different names stay different.
    expect(normalizeLocation('نور آباد')).not.toBe(normalizeLocation('نورآباد'));
  });

  it('ranks prefix matches first and keeps the query inside the province', () => {
    expect(searchProvinces('خراسان')).toEqual(['خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی']);
    expect(searchProvinces('')).toHaveLength(31);
    expect(searchCities('خراسان رضوی', 'مشهد')[0]).toBe('مشهد');
    expect(searchCities('تهران', 'مشهد')).toEqual([]);
    expect(searchCities('استان ناموجود', 'تهران')).toEqual([]);
  });

  it('canonicalises whatever the client sends and validates the pair', () => {
    expect(canonicalProvince('سیستان وبلوچستان')).toBe('سیستان و بلوچستان');
    expect(canonicalProvince('شیراز')).toBeNull();
    expect(canonicalCity('خراسان رضوی', 'مشهد')).toBe('مشهد');
    expect(canonicalCity('یزد', 'مشهد')).toBeNull();
    expect(isValidResidence('خراسان رضوی', 'مشهد')).toBe(true);
    expect(isValidResidence('خراسان رضوی', 'تهران')).toBe(false);
  });
});
