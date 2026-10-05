import { afterEach, describe, expect, it } from 'vitest';
import { clearSubject, readPageContext, rememberSubject } from './pageContext';

describe('page context', () => {
  afterEach(() => sessionStorage.clear());

  it('drops a subject that is older than ten minutes', () => {
    rememberSubject({
      kind: 'brand',
      brandId: 'dart',
      brandName: 'دارت',
      productId: 'p1',
      productName: 'محصول دارت',
    });
    const raw = sessionStorage.getItem('mentor.page.v1');
    const parsed = JSON.parse(raw ?? '{}') as { updatedAt: string };
    parsed.updatedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    sessionStorage.setItem('mentor.page.v1', JSON.stringify(parsed));
    expect(readPageContext()).toBeNull();
  });

  it('clears the brand when the marketer leaves the learning pages', () => {
    rememberSubject({ kind: 'brand', brandId: 'dart', brandName: 'دارت', productId: 'p1' });
    clearSubject();
    const page = readPageContext();
    expect(page?.brandId).toBeNull();
    expect(page?.productId).toBeNull();
  });
});
