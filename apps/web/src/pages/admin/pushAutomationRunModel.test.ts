import { describe, expect, it } from 'vitest';
import {
  RUN_KIND_LABELS,
  RUN_LIMITS,
  capSentence,
  filterUsers,
  prefsSentence,
  pushStatusMeta,
  runDurationLabel,
  runDurationSec,
  runsPath,
  runTally,
  sentKeys,
  skippedSentence,
  tracePath,
  type AutomationTrace,
  type RunRow,
} from './pushAutomationRunModel';

/**
 * The read-only history pages are pure presentation: these tests exist so that a wording change is
 * caught here instead of in a browser, and so the assumptions about the server payloads (`label`
 * strings, optional `skippedLabels`, day-adjusted counters) stay written down.
 */

const T0 = '2026-10-03T06:30:00.000Z';

const run = (over: Partial<RunRow> = {}): RunRow => ({
  id: 'r1',
  key: 'inactive_1d',
  label: 'یک روز بی‌فعالیتی',
  kind: 'sweep',
  windowKey: '2026-10-03',
  startedAt: T0,
  finishedAt: new Date(Date.parse(T0) + 4_000).toISOString(),
  evaluated: 12,
  matched: 5,
  sent: 3,
  skipped: { audience: 2, noDevice: 1 },
  failed: 0,
  error: null,
  ...over,
});

describe('runs query', () => {
  it('builds the exact query the API accepts', () => {
    expect(runsPath(null, 30)).toBe('/admin/push-automations/runs?limit=30');
    expect(runsPath('inactive_1d', 100)).toBe(
      '/admin/push-automations/runs?limit=100&key=inactive_1d',
    );
    expect(tracePath('u 1')).toBe('/admin/push-automations/trace/u%201');
  });

  it('offers only limits the server would accept', () => {
    expect(RUN_LIMITS).toEqual([12, 30, 100, 200]);
    expect(RUN_LIMITS.every((n) => n >= 1 && n <= 200)).toBe(true);
  });

  it('names every run kind', () => {
    expect(Object.keys(RUN_KIND_LABELS).sort()).toEqual(['event', 'manual', 'queue', 'sweep']);
  });
});

describe('durations', () => {
  it('keeps seconds honest instead of rounding a fast run up to a minute', () => {
    expect(runDurationSec(T0, run().finishedAt)).toBe(4);
    expect(runDurationLabel(T0, run().finishedAt)).toBe('۴ ثانیه');
    const slow = new Date(Date.parse(T0) + 95_000).toISOString();
    expect(runDurationLabel(T0, slow)).toBe('۲ دقیقه');
  });

  it('says the run is still going when there is no end', () => {
    expect(runDurationSec(T0, null)).toBeNull();
    expect(runDurationLabel(T0, null)).toBe('در حال اجرا');
    expect(runDurationLabel('not-a-date', null)).toBe('در حال اجرا');
  });

  it('never goes negative on a clock skew', () => {
    const before = new Date(Date.parse(T0) - 5_000).toISOString();
    expect(runDurationSec(T0, before)).toBe(0);
  });
});

describe('run summary', () => {
  it('counts the skips from the stored reason map', () => {
    expect(runTally(run())).toBe('۱۲ بررسی · ۳ ارسال · ۳ رد');
    expect(runTally(run({ failed: 1, skipped: { error: 1 } }))).toBe(
      '۱۲ بررسی · ۳ ارسال · ۱ رد · ۱ خطا',
    );
  });

  it('prefixes a count only when a reason repeats, and truncates politely', () => {
    const one = run({
      skippedLabels: [{ reason: 'audience', count: 1, label: 'کاربر در مخاطب این اتوماسیون نبود' }],
    });
    expect(skippedSentence(one)).toBe('کاربر در مخاطب این اتوماسیون نبود');
    const two = run({
      skippedLabels: [
        { reason: 'audience', count: 4, label: 'الف' },
        { reason: 'noDevice', count: 1, label: 'ب' },
      ],
    });
    expect(skippedSentence(two)).toBe('۴ مورد: الف · ب');
    const many = run({
      skippedLabels: [
        { reason: 'a', count: 9, label: 'ا' },
        { reason: 'b', count: 8, label: 'ب' },
        { reason: 'c', count: 7, label: 'ج' },
        { reason: 'd', count: 6, label: 'د' },
      ],
    });
    expect(skippedSentence(many)).toBe('۹ مورد: ا · ۸ مورد: ب · ۷ مورد: ج · +۱ دلیل دیگر');
    // A row written before the server sent labels falls back to the caller's own count.
    expect(skippedSentence(run())).toBe('');
  });
});

describe('trace sentences', () => {
  const caps = {
    paused: false,
    maxPerUserPerDay: 2,
    maxPerUserPerWeek: 10,
    minGapMs: 4 * 3600_000,
    defaultHourTehran: 10,
    decisionTtlDays: 3,
    failureAlertPct: 20,
    updatedAt: T0,
    updatedBy: null,
  };

  it('reads the user’s share of the caps', () => {
    expect(
      capSentence(
        { day: '2026-10-03', daySent: 2, week: '2026-W40', weekSent: 5, lastAt: null, keys: {} },
        caps,
      ),
    ).toBe('امروز ۲ از ۲ · این هفته ۵ از ۱۰');
  });

  it('translates the push status and never hides an unknown one', () => {
    expect(pushStatusMeta('sent')).toEqual({ tone: 'success', label: 'پوش ارسال شد' });
    expect(pushStatusMeta('deferred').tone).toBe('info');
    expect(pushStatusMeta('brand_new_status')).toEqual({
      tone: 'neutral',
      label: 'brand_new_status',
    });
    expect(pushStatusMeta('').label).toBe('—');
  });

  it('explains the user’s own choice, or its absence', () => {
    const cats = [
      { id: 'deadlines', label: 'مهلت و تکلیف' },
      { id: 'quizzes', label: 'آزمون' },
    ];
    expect(prefsSentence(null, cats)).toBe('هیچ انتخاب شخصی ثبت نکرده؛ همان سیاست عمومی جاری است.');
    expect(
      prefsSentence(
        {
          mutedCategories: ['deadlines', 'quizzes'],
          preferredHour: null,
          optIns: {},
          updatedAt: T0,
        },
        cats,
      ),
    ).toBe('خاموش: مهلت و تکلیف، آزمون');
    // an unknown category code is still shown, because the label table may simply be older
    expect(
      prefsSentence(
        { mutedCategories: ['future_cat'], preferredHour: null, optIns: {}, updatedAt: T0 },
        cats,
      ),
    ).toBe('خاموش: future_cat');
    expect(
      prefsSentence(
        { mutedCategories: [], preferredHour: null, optIns: { x: false }, updatedAt: T0 },
        cats,
      ),
    ).toBe('همه دسته‌ها روشن');
    // …and «همه دسته‌ها روشن» is not added on top of an opt-in, so the two never contradict.
    expect(
      prefsSentence(
        {
          mutedCategories: [],
          preferredHour: 19,
          optIns: { evening_nudge: true, other: false },
          updatedAt: T0,
        },
        cats,
      ),
    ).toBe('با رضایت: evening_nudge');
  });

  it('lists the rules that already sent, newest first', () => {
    const counter: AutomationTrace['counter'] = {
      day: '2026-10-03',
      daySent: 1,
      week: '2026-W40',
      weekSent: 2,
      lastAt: T0,
      keys: { inactive_1d: '2026-10-01T10:00:00.000Z', quiz_abandoned: '2026-10-03T06:00:00.000Z' },
    };
    expect(sentKeys(counter)).toEqual([
      { key: 'quiz_abandoned', at: '2026-10-03T06:00:00.000Z' },
      { key: 'inactive_1d', at: '2026-10-01T10:00:00.000Z' },
    ]);
    expect(sentKeys({ ...counter, keys: {} })).toEqual([]);
  });
});

describe('user picker', () => {
  const users = [
    { id: 'u1', name: 'سارا احمدی', phone: '09120000004' },
    { id: 'u2', name: 'بهرام راد', phone: null },
  ];

  it('matches on the name or the number, in Persian or Latin digits', () => {
    expect(filterUsers(users, 'بهرام').map((u) => u.id)).toEqual(['u2']);
    expect(filterUsers(users, '09120000004').map((u) => u.id)).toEqual(['u1']);
    expect(filterUsers(users, '۰۹۱۲۰۰۰۰۰۰۴').map((u) => u.id)).toEqual(['u1']);
    expect(filterUsers(users, '').map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(filterUsers(users, 'کسی نیست')).toEqual([]);
  });

  it('bounds the list it renders', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `u${i}`,
      name: `کاربر ${i}`,
      phone: null,
    }));
    expect(filterUsers(many, '', 40)).toHaveLength(40);
    expect(filterUsers(many, 'کاربر ۱', 5)).toHaveLength(5);
  });
});
