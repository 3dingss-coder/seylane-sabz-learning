import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl, wantsWebSearch } from '../src/services/mentor-web';

describe('mentor web safety', () => {
  it('blocks private, mapped and trailing-dot hosts', () => {
    expect(isPublicHttpUrl('http://[::ffff:127.0.0.1]/')).toBeNull();
    expect(isPublicHttpUrl('http://[::ffff:7f00:1]/')).toBeNull();
    expect(isPublicHttpUrl('http://[::]/')).toBeNull();
    expect(isPublicHttpUrl('http://localhost./')).toBeNull();
    expect(isPublicHttpUrl('http://metadata.google.internal./')).toBeNull();
    expect(isPublicHttpUrl('http://2130706433/')).toBeNull();
    expect(isPublicHttpUrl('https://fa.wikipedia.org/wiki/Test')?.hostname).toBe(
      'fa.wikipedia.org',
    );
  });

  it('does not send an internal product question to the web', () => {
    expect(wantsWebSearch('جدیدترین محصول دارت چیست؟', false)).toBe(false);
    expect(wantsWebSearch('قیمت دارت', false)).toBe(false);
    expect(wantsWebSearch('در اینترنت جستجو کن قیمت دلار', false)).toBe(true);
  });
});
