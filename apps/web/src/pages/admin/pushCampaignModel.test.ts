import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  acceptanceRate,
  isEditable,
  isSafeImageUrl,
  isSafeInternalPath,
  isoToTehran,
  payloadFromForm,
  tehranToIso,
  validateForm,
} from './pushCampaignModel';

describe('push campaign model: time zone', () => {
  it('converts Tehran wall-clock time (UTC+3:30, no DST) to UTC and back', () => {
    expect(tehranToIso('2026-10-10', '12:00')).toBe('2026-10-10T08:30:00.000Z');
    expect(isoToTehran('2026-10-10T08:30:00.000Z')).toEqual({ date: '2026-10-10', time: '12:00' });
    expect(tehranToIso('2026-10-10', '')).toBeNull();
    expect(tehranToIso('bad', '10:00')).toBeNull();
  });
});

describe('push campaign model: URL and destination rules', () => {
  it('accepts only HTTPS public image URLs', () => {
    expect(isSafeImageUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isSafeImageUrl('http://cdn.example.com/a.png')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('https://localhost/a.png')).toBe(false);
    expect(isSafeImageUrl('https://a:b@cdn.example.com/a.png')).toBe(false);
  });

  it('allows only internal app routes', () => {
    for (const ok of ['/', '/messages', '/learn', '/packages/p1', '/sections/s1?x=1', '/quiz/s1'])
      expect(isSafeInternalPath(ok), ok).toBe(true);
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/admin',
      '/manager',
      '/x/../y',
      'javascript:1',
      '/\\evil',
    ])
      expect(isSafeInternalPath(bad), bad).toBe(false);
  });
});

describe('push campaign model: validation & payload', () => {
  it('reports Persian field errors and passes a complete form', () => {
    const e = validateForm({ ...EMPTY_FORM });
    expect(e.name).toBeTruthy();
    expect(e.title).toBeTruthy();
    expect(e.body).toBeTruthy();
    const ok = validateForm({ ...EMPTY_FORM, name: 'کمپین', title: 'سلام', body: 'متن کوتاه' });
    expect(ok).toEqual({});
  });

  it('rejects schedules in the past and requires a complete date and time', () => {
    const base = { ...EMPTY_FORM, name: 'کمپین', title: 'سلام', body: 'متن کوتاه' };
    // 06:00 UTC = 09:30 Tehran
    const now = Date.parse('2026-10-10T06:00:00.000Z');
    expect(
      validateForm({ ...base, scheduleDate: '2026-10-10', scheduleTime: '10:00' }, now)
        .scheduleDate,
    ).toBeUndefined();
    expect(
      validateForm({ ...base, scheduleDate: '2026-10-10', scheduleTime: '09:00' }, now)
        .scheduleDate,
    ).toBeTruthy();
    expect(
      validateForm({ ...base, scheduleDate: '2026-10-09', scheduleTime: '23:00' }, now)
        .scheduleDate,
    ).toBeTruthy();
    expect(validateForm({ ...base, scheduleDate: '2026-10-10' }, now).scheduleDate).toBeTruthy();
  });

  it('a draft payload never carries a schedule; a scheduled payload carries the UTC instant', () => {
    const f = {
      ...EMPTY_FORM,
      name: 'n',
      title: 'tt',
      body: 'bb',
      scheduleDate: '2026-10-10',
      scheduleTime: '12:00',
    };
    expect(payloadFromForm(f, false).scheduledAt).toBeNull();
    expect(payloadFromForm(f, true).scheduledAt).toBe('2026-10-10T08:30:00.000Z');
    expect(
      payloadFromForm({ ...f, audienceType: 'all', targetId: 'x' }, false).audience.targetId,
    ).toBeNull();
  });

  it('only drafts and scheduled campaigns are editable; acceptance rate is accepted ÷ attempted', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('scheduled')).toBe(true);
    for (const s of [
      'queued',
      'sending',
      'sent',
      'sent_with_errors',
      'failed',
      'cancelled',
    ] as const)
      expect(isEditable(s)).toBe(false);
    expect(acceptanceRate({ accepted: 3, attempted: 4 })).toBe(75);
    expect(acceptanceRate({ accepted: 0, attempted: 0 })).toBeNull();
  });
});
