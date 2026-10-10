import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

/**
 * The two read-only pages of PR6: the run history and the per-user trace. What is pinned here is the
 * contract with `recentRuns()` / `traceUser()` — and the promise that a trace page explains a decision
 * without exposing the person: it names the rule and the reason, never the phone number.
 */

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

const T0 = '2026-10-03T06:30:00.000Z';

const RUN_ROWS = [
  {
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
    skippedLabels: [
      { reason: 'audience', count: 2, label: 'کاربر در مخاطب این اتوماسیون نبود' },
      { reason: 'noDevice', count: 1, label: 'هیچ دستگاه معتبری برای این کاربر ثبت نشده است' },
    ],
    failed: 0,
    error: null,
  },
  {
    id: 'r2',
    key: 'quiz_abandoned',
    label: 'آزمون نیمه‌کاره',
    kind: 'queue',
    windowKey: '2026-10-03',
    startedAt: T0,
    finishedAt: null,
    evaluated: 1,
    matched: 1,
    sent: 0,
    skipped: { gap: 1 },
    failed: 0,
    error: 'd1 timeout',
  },
];

const RULES = {
  rows: [
    { key: 'inactive_1d', name: 'یک روز بی‌فعالیتی', isGate: false },
    { key: 'quiz_abandoned', name: 'آزمون نیمه‌کاره', isGate: false },
    { key: 'welcome', name: 'خوش‌آمدگویی (قالب سیستمی)', isGate: true },
  ],
  paused: false,
  settings: {},
  counts: { total: 3, enabled: 2, gates: 1, v2: 0 },
  today: { sent: 0, skipped: {} },
};

const CATALOG = {
  entries: [
    { key: 'inactive_1d', name: 'یک روز بی‌فعالیتی', category: 'deadlines', isGate: false },
    { key: 'quiz_abandoned', name: 'آزمون نیمه‌کاره', category: 'quizzes', isGate: false },
  ],
  variables: [],
  destinations: [],
  categories: [
    { id: 'deadlines', label: 'مهلت و تکلیف', hint: '', protected: true },
    { id: 'quizzes', label: 'آزمون', hint: '', protected: false },
  ],
  triggerKinds: {},
  facts: [],
  events: {},
  weekdays: [],
  limits: { titleMax: 80, bodyMax: 300 },
};

const TRACE = {
  userId: 'u1',
  name: 'سارا احمدی',
  prefs: {
    mutedCategories: ['quizzes'],
    preferredHour: null,
    optIns: {},
    updatedAt: T0,
  },
  counter: {
    day: '2026-10-03',
    daySent: 2,
    week: '2026-W40',
    weekSent: 5,
    lastAt: T0,
    keys: { inactive_1d: T0 },
  },
  decisions: [
    {
      at: T0,
      key: 'quiz_abandoned',
      reason: 'gap',
      label: 'حداقل فاصله بین دو پوش کاربر رعایت نشده است',
      detail: '۲ ساعت و ۱۰ دقیقه',
    },
  ],
  notifications: [
    {
      at: T0,
      title: 'سارا، ادامه بده',
      body: 'یک مرحله دیگر از «آموزش کرم» مانده است',
      key: 'inactive_1d',
      pushStatus: 'sent',
    },
  ],
};

const SETTINGS = {
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

/** What `GET /v1/admin/system-health` answers, so the panel's health card can render. */
const HEALTH = {
  cron: {
    lastRunAt: T0,
    expression: '*/15 * * * *',
    ok: true,
    error: null,
    jobs: [],
    minutesSinceLastRun: 4,
    stalled: false,
    neverReported: false,
  },
  push: {
    provider: 'fcm-http',
    configured: true,
    lastAttemptAt: T0,
    lastError: null,
    today: { sent: 30, failed: 0, invalid: 0 },
    failureRate: 0,
  },
};

const seen: string[] = [];

const asAdmin = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/teams': () => ({ data: [{ id: 't1', name: 'تیم الف' }] }),
    'GET /v1/admin/users': () => ({
      data: [
        { id: 'u1', name: 'سارا احمدی', role: 'marketer', phone: '09120000004' },
        { id: 'u2', name: 'بهرام راد', role: 'manager', phone: '09120000009' },
      ],
    }),
  };
};

const RUN_ROUTES = () => ({
  ...asAdmin(),
  'GET /v1/admin/push-automations': () => ({ data: RULES }),
  'GET /v1/admin/push-automations/runs?limit=30': () => {
    seen.push('all');
    return { data: RUN_ROWS };
  },
  'GET /v1/admin/push-automations/runs?limit=30&key=inactive_1d': () => {
    seen.push('filtered');
    return { data: [RUN_ROWS[0]] };
  },
  'GET /v1/admin/push-automations/runs?limit=100': () => {
    seen.push('wide');
    return { data: RUN_ROWS };
  },
});

const TRACE_ROUTES = () => ({
  ...asAdmin(),
  'GET /v1/admin/push-automations/catalog': () => ({ data: CATALOG }),
  'GET /v1/admin/push-automations/settings': () => ({
    data: {
      paused: false,
      maxPerUserPerDay: 2,
      maxPerUserPerWeek: 10,
      minGapMs: 4 * 3600_000,
      defaultHourTehran: 10,
      decisionTtlDays: 3,
      failureAlertPct: 20,
      updatedAt: T0,
      updatedBy: null,
    },
  }),
  'GET /v1/admin/push-automations/trace/u1': () => ({ data: TRACE }),
});

beforeEach(() => {
  localStorage.clear();
  session.clear();
  seen.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe('admin: تاریخچه اجراها', () => {
  it('lists every run with its outcome, its reasons and how long it took', async () => {
    mockApi(RUN_ROUTES());
    renderApp('/admin/push-campaigns/automations/runs');
    expect(
      await screen.findByRole('heading', { name: 'تاریخچه اجرای اتوماسیون' }),
    ).toBeInTheDocument();
    // The first row: label, tally, the server-rendered reason text and the seconds-accurate duration.
    expect(await screen.findAllByText('۱۲ بررسی · ۳ ارسال · ۳ رد')).toHaveLength(2);
    expect(
      screen.getAllByText(
        '۲ مورد: کاربر در مخاطب این اتوماسیون نبود · هیچ دستگاه معتبری برای این کاربر ثبت نشده است',
      )[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText('بررسی دسته‌ای')[0]).toBeInTheDocument();
    expect(screen.getAllByText('۴ ثانیه')[0]).toBeInTheDocument();
    // A running row has no end: it must not read as «۰ دقیقه».
    expect(screen.getAllByText('در حال اجرا')[0]).toBeInTheDocument();
    // The stored error is shown verbatim, and the rule name links to its detail page.
    expect(screen.getAllByText('d1 timeout')[0]).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'آزمون نیمه‌کاره' })[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/push-campaigns/automations/quiz_abandoned');
  });

  it('filters by rule through the URL, so the view is shareable', async () => {
    mockApi(RUN_ROUTES());
    renderApp('/admin/push-campaigns/automations/runs');
    await screen.findAllByText('۱۲ بررسی · ۳ ارسال · ۳ رد');
    expect(seen).toEqual(['all']);
    // The gate row is not a runnable rule, so it must not appear in the filter at all.
    const select = screen.getByLabelText('فقط یک قانون') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'همه قوانین',
      'یک روز بی‌فعالیتی',
      'آزمون نیمه‌کاره',
    ]);
    fireEvent.change(select, { target: { value: 'inactive_1d' } });
    await waitFor(() => expect(seen).toContain('filtered'));
    expect(await screen.findByText(/فیلتر شده است/)).toBeInTheDocument();
    // …and the filtered view only has that rule's row.
    expect(screen.queryByText('d1 timeout')).not.toBeInTheDocument();
  });

  it('asks for more rows from the size selector', async () => {
    mockApi(RUN_ROUTES());
    renderApp('/admin/push-campaigns/automations/runs');
    await screen.findAllByText('۱۲ بررسی · ۳ ارسال · ۳ رد');
    fireEvent.change(screen.getByLabelText('تعداد سطرها'), { target: { value: '100' } });
    await waitFor(() => expect(seen).toContain('wide'));
  });

  it('explains an empty history instead of showing a bare table', async () => {
    mockApi({
      ...RUN_ROUTES(),
      'GET /v1/admin/push-automations/runs?limit=30': () => ({ data: [] }),
    });
    renderApp('/admin/push-campaigns/automations/runs');
    expect(await screen.findByText(/هنوز اجرایی در این بازه ثبت نشده/)).toBeInTheDocument();
  });

  it('links the two read-only pages to each other', async () => {
    mockApi(RUN_ROUTES());
    renderApp('/admin/push-campaigns/automations/runs');
    await screen.findByRole('heading', { name: 'تاریخچه اجرای اتوماسیون' });
    // The link exists twice (header action and the footnote), both to the same place.
    const links = screen.getAllByRole('link', { name: 'ردیابی کاربر' }) as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links)
      expect(a.getAttribute('href')).toBe('/admin/push-campaigns/automations/trace');
  });
});

describe('admin: ردیابی کاربر', () => {
  it('waits for a choice and fetches nothing before it', async () => {
    const api = mockApi(TRACE_ROUTES());
    renderApp('/admin/push-campaigns/automations/trace');
    // Two users in the picker means nobody is chosen yet — and nothing is fetched for a stranger.
    expect(
      await screen.findByText(/برای دیدن جزئیات، یک کاربر را انتخاب کنید/),
    ).toBeInTheDocument();
    expect(
      api.calls.filter((c) => c.key.startsWith('GET /v1/admin/push-automations/trace')),
    ).toEqual([]);
  });

  it('shows the three facts a decision was made from — without the phone number', async () => {
    mockApi(TRACE_ROUTES());
    renderApp('/admin/push-campaigns/automations/trace');
    // The picker is only complete once the user list has arrived; changing it before that is a no-op.
    await screen.findByRole('option', { name: 'سارا احمدی · marketer' });
    fireEvent.change(screen.getByLabelText('کاربر'), { target: { value: 'u1' } });

    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument();
    // caps (from the counter + the global settings), the user's own choice, and the refusal.
    expect(screen.getByText('امروز ۲ از ۲ · این هفته ۵ از ۱۰')).toBeInTheDocument();
    expect(screen.getByText('خاموش: آزمون')).toBeInTheDocument();
    expect(screen.getByText('حداقل فاصله بین دو پوش کاربر رعایت نشده است')).toBeInTheDocument();
    // the detail is wrapped in parentheses by the same node, so the match is on a substring
    expect(screen.getByText(/۲ ساعت و ۱۰ دقیقه/)).toBeInTheDocument();
    // the rule name comes from the catalogue, the chip from the push status
    expect(
      (
        screen.getAllByRole('link', { name: 'آزمون نیمه‌کاره' })[0] as HTMLAnchorElement
      ).getAttribute('href'),
    ).toBe('/admin/push-campaigns/automations/quiz_abandoned');
    expect(screen.getByText('پوش ارسال شد')).toBeInTheDocument();
    expect(screen.getAllByText('یک روز بی‌فعالیتی')[0]).toBeInTheDocument();
    // §4.6: the identifier is search input, never output.
    expect(document.body.textContent).not.toContain('09120000004');
    expect(document.body.textContent).not.toContain('u1');
  });

  it('searches by name or number, in Persian digits too', async () => {
    mockApi(TRACE_ROUTES());
    renderApp('/admin/push-campaigns/automations/trace');
    const select = (await screen.findByLabelText('کاربر')) as HTMLSelectElement;
    const optionsOf = () =>
      Array.from(select.options)
        .filter((o) => o.value)
        .map((o) => o.textContent);
    await waitFor(() =>
      expect(optionsOf()).toEqual(['سارا احمدی · marketer', 'بهرام راد · manager']),
    );
    fireEvent.change(screen.getByLabelText('جست‌وجو'), { target: { value: 'بهرام' } });
    expect(optionsOf()).toEqual(['بهرام راد · manager']);
    fireEvent.change(screen.getByLabelText('جست‌وجو'), { target: { value: '۰۹۱۲۰۰۰۰۰۰۴' } });
    expect(optionsOf()).toEqual(['سارا احمدی · marketer']);
  });

  it('says plainly when nothing was refused and nothing was sent', async () => {
    mockApi({
      ...TRACE_ROUTES(),
      'GET /v1/admin/push-automations/trace/u1': () => ({
        data: { ...TRACE, prefs: null, decisions: [], notifications: [] },
      }),
    });
    renderApp('/admin/push-campaigns/automations/trace');
    await screen.findByRole('option', { name: 'سارا احمدی · marketer' });
    fireEvent.change(screen.getByLabelText('کاربر'), { target: { value: 'u1' } });
    expect(
      await screen.findByText('هیچ انتخاب شخصی ثبت نکرده؛ همان سیاست عمومی جاری است.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/در ۲۴ ساعت اخیر ردّی ثبت نشده/)).toBeInTheDocument();
    expect(
      await screen.findByText(/هیچ اعلان خودکاری برای این کاربر ثبت نشده/),
    ).toBeInTheDocument();
  });
});

describe('admin: ورودی‌های پنل', () => {
  it('opens both read-only pages from the automation toolbar', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/push-automations': () => ({
        data: { ...RULES, rows: [], settings: SETTINGS },
      }),
      'GET /v1/admin/push-automations/catalog': () => ({ data: CATALOG }),
      'GET /v1/admin/system-health': () => ({ data: HEALTH }),
    });
    renderApp('/admin/push-campaigns/automations');
    expect(await screen.findByTestId('automations-panel')).toBeInTheDocument();
    expect(
      (screen.getByRole('link', { name: 'تاریخچه اجراها' }) as HTMLAnchorElement).getAttribute(
        'href',
      ),
    ).toBe('/admin/push-campaigns/automations/runs');
    expect(
      (screen.getByRole('link', { name: 'ردیابی کاربر' }) as HTMLAnchorElement).getAttribute(
        'href',
      ),
    ).toBe('/admin/push-campaigns/automations/trace');
  });
});
