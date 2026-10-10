import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

const CATALOG = {
  entries: [],
  variables: [
    { token: '{name}', label: 'نام کوچک کاربر' },
    { token: '{title}', label: 'نام آموزش (بسته)' },
    { token: '{sectionId}', label: 'شناسه قسمت بعدی' },
  ],
  destinations: [
    { value: '/learn', label: 'آموزش‌ها' },
    { value: '/sections/{sectionId}', label: 'قسمت بعدی کاربر' },
    { value: '/mentor', label: 'منتور هوشمند' },
  ],
  categories: [
    { id: 'deadlines', label: 'مهلت و تکلیف', hint: '', protected: true },
    { id: 'general', label: 'عمومی', hint: '', protected: false },
  ],
  triggerKinds: {
    inactivity: 'بی‌فعالیتی کاربر',
    condition: 'شرط وضعیتی روی کاربران',
    event: 'اتفاق در اپلیکیشن',
  },
  facts: [
    { field: 'progress', label: 'پیشرفت بیشترین آموزش فعال (٪)', kind: 'number' },
    { field: 'todayActive', label: 'امروز فعال بوده است', kind: 'boolean' },
  ],
  events: { 'quiz.failed': 'رد شدن در آزمون' },
  weekdays: ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'],
  limits: { titleMax: 80, bodyMax: 300 },
};

const detail = (over: Record<string, unknown> = {}) => ({
  key: 'inactive_1d',
  name: 'یک روز بی‌فعالیتی',
  description: 'ادامه دادن را یادآوری می‌کند',
  category: 'deadlines',
  categoryLabel: 'مهلت و تکلیف',
  triggerKind: 'inactivity',
  triggerLabel: 'بی‌فعالیتی کاربر',
  enabled: true,
  isSystem: true,
  isGate: false,
  templateKey: null,
  requiresFeature: null,
  optInOnly: false,
  push: true,
  priority: 'normal',
  audienceLabel: 'بازاریاب‌ها',
  timeLabel: '10:00',
  dueNow: true,
  lastRunAt: null,
  sent7d: 3,
  skipped7d: 1,
  version: 4,
  trigger: { kind: 'inactivity', inactivityDays: 2, time: '10:00', ladderGroup: 'inactive' },
  audience: { type: 'role', targetId: 'marketer', channel: 'any' },
  message: {
    title: '{name}، ادامه بده',
    body: 'یک مرحله دیگر از «{title}» مانده است',
    actionRef: '/learn',
    imageUrl: null,
  },
  delivery: {
    priority: 'normal',
    push: true,
    inApp: true,
    respectQuietHours: true,
    cooldownMs: 86400000,
    maxPerUserPerDay: null,
    sendOnce: null,
    aggregateForManager: null,
  },
  supersedes: ['reminder'],
  effectiveMessage: null,
  variables: CATALOG.variables,
  destinations: CATALOG.destinations,
  updatedAt: '2026-10-03T06:30:00.000Z',
  updatedBy: 'a1',
  createdBy: 'a1',
  canDelete: false,
  needsCriticalConfirm: false,
  audienceRole: 'marketer',
  ...over,
});

const ROUTES = (over: Record<string, () => unknown> = {}) => ({
  ...asAdmin(),
  'GET /v1/admin/push-automations/catalog': () => ({ data: CATALOG }),
  'GET /v1/admin/push-automations/inactive_1d': () => ({ data: detail() }),
  'GET /v1/admin/push-automations': () => ({
    data: {
      rows: [],
      paused: false,
      settings: {
        paused: false,
        maxPerUserPerDay: 2,
        maxPerUserPerWeek: 10,
        minGapMs: 14400000,
        defaultHourTehran: 10,
        decisionTtlDays: 30,
        failureAlertPct: 20,
        updatedAt: '',
        updatedBy: null,
      },
      counts: { total: 38, enabled: 1, gates: 13, v2: 3 },
      today: { sent: 0, skipped: {} },
    },
  }),
  'GET /v1/admin/push-automations/runs': () => ({
    data: [
      {
        id: 'r1',
        key: 'inactive_1d',
        label: 'یک روز بی‌فعالیتی',
        kind: 'sweep',
        windowKey: '2026-10-03',
        startedAt: '2026-10-03T06:30:00.000Z',
        finishedAt: '2026-10-03T06:30:02.000Z',
        evaluated: 12,
        matched: 7,
        sent: 3,
        skipped: { capDay: 4 },
        failed: 0,
        error: null,
      },
    ],
  }),
  'GET /v1/admin/push-automations/inactive_1d/revisions': () => ({
    data: [
      {
        version: 3,
        at: '2026-10-01T06:30:00.000Z',
        by: 'a1',
        note: 'ویرایش: متن',
        message: {
          title: 'دیروز را ادامه بده',
          body: 'متن قبلی',
          actionRef: '/learn',
          imageUrl: null,
        },
        delivery: { priority: 'normal', push: true, cooldownMs: 0 },
      },
    ],
  }),
  'PATCH /v1/admin/push-automations/inactive_1d': () => ({ data: detail({ version: 5 }) }),
  'POST /v1/admin/push-automations/inactive_1d/enabled': () => ({ data: { key: 'inactive_1d' } }),
  'POST /v1/admin/push-automations/inactive_1d/dry-run': () => ({
    data: {
      key: 'inactive_1d',
      windowKey: '2026-10-03',
      evaluated: 12,
      wouldSend: 7,
      skipped: {},
      skippedLabels: [],
      sample: [
        { userId: 'u1', name: 'سارا', title: 'سارا، ادامه بده', body: 'یک مرحله', reason: 'sent' },
      ],
      note: null,
    },
  }),
  'POST /v1/admin/push-automations/inactive_1d/test-send': () => ({
    data: {
      sent: true,
      preview: { title: 'سارا، ادامه بده', body: 'یک مرحله دیگر از «آموزش کرم» مانده است' },
    },
  }),
  'DELETE /v1/admin/push-automations/inactive_1d': () => ({ data: { deleted: true } }),
  'POST /v1/admin/push-automations': () => ({ data: detail({ key: 'weekly_note' }) }),
  ...over,
});

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
        { id: 'u1', name: 'سارا', role: 'marketer' },
        { id: 'u2', name: 'بهرام', role: 'manager' },
      ],
    }),
  };
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

/** Walks the wizard from «چیست» to the last step; every step must validate on its own. */
const toLastStep = () => {
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
};

describe('admin: جزئیات و ویزارد اتوماسیون', () => {
  it('reads the four questions back from the API, with runs and archived text', async () => {
    mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    expect(await screen.findByRole('heading', { name: 'یک روز بی‌فعالیتی' })).toBeInTheDocument();
    expect(screen.getByText('۱) چیست')).toBeInTheDocument();
    expect(screen.getByText('۲) چه‌زمانی')).toBeInTheDocument();
    expect(screen.getByText('۳) برای چه‌کسی')).toBeInTheDocument();
    expect(screen.getByText('۴) متن و ارسال')).toBeInTheDocument();
    expect(screen.getByText('بی‌فعالیتی کاربر: ۲ روز بدون فعالیت، ساعت 10:00')).toBeInTheDocument();
    // the stored wording, and the destination as the catalogue labels it
    expect(screen.getByText('{name}، ادامه بده')).toBeInTheDocument();
    expect(screen.getByText(/مقصد: آموزش‌ها · بدون تصویر/)).toBeInTheDocument();
    expect(screen.getByText('سردکردن هر کاربر')).toBeInTheDocument();
    expect(screen.getByText('۲۴ ساعت')).toBeInTheDocument();
    // supersedes is explained, not just listed
    expect(screen.getByText(/پوشِ قالب‌های/)).toBeInTheDocument();
    // runs + revisions
    expect(await screen.findByText('بررسی دسته‌ای · ۳ ارسال از ۱۲ کاربر')).toBeInTheDocument();
    expect(screen.getByText('نسخه‌های متن')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نمایش ۱' }));
    expect(await screen.findByText('نسخه ۳ · ویرایش: متن')).toBeInTheDocument();
    expect(screen.getByText('متن قبلی')).toBeInTheDocument();
    // the switch in the sidebar reflects the stored state
    expect(screen.getByRole('button', { name: 'خاموش‌کردن این اتوماسیون' })).toBeInTheDocument();
  });

  it('the wizard edits in four steps and PATCHes the whole rule with expectedVersion', async () => {
    const m = mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش با ویزارد' }));
    expect(screen.getByRole('tab', { name: /چیست/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('نام (فقط برای پنل)'), {
      target: { value: 'یادآوری ادامه دادن' },
    });
    toLastStep();
    expect(screen.getByLabelText('عنوان اعلان')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('متن اعلان'), { target: { value: 'متن تازه' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'PATCH /v1/admin/push-automations/inactive_1d')).toBe(
        true,
      ),
    );
    const body = m.calls.find((c) => c.key === 'PATCH /v1/admin/push-automations/inactive_1d')
      ?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'یادآوری ادامه دادن',
      expectedVersion: 4,
      message: { title: '{name}، ادامه بده', body: 'متن تازه', actionRef: '/learn' },
      delivery: { cooldownMs: 86400000, maxPerUserPerDay: null },
    });
    // the fields the engine ignores for this trigger kind are written as null, not left stale
    expect(body.trigger).toEqual({
      kind: 'inactivity',
      event: null,
      delayMinutes: null,
      inactivityDays: 2,
      ladderGroup: 'inactive',
      time: '10:00',
      weekday: null,
      conditions: null,
    });
    expect(body).not.toHaveProperty('enabled');
    expect(
      await screen.findByText('ذخیره شد؛ از پنجره زمانی بعدی با همین متن اجرا می‌شود.'),
    ).toBeInTheDocument();
  });

  it('an invalid trigger value stops the step and says why in Persian', async () => {
    const m = mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش با ویزارد' }));
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    expect(screen.getByLabelText('چند روز بی‌فعالیتی؟')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('چند روز بی‌فعالیتی؟'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    expect(
      await screen.findByText('برای بی‌فعالیتی، تعداد روز بین ۱ تا ۶۰ لازم است.'),
    ).toBeInTheDocument();
    // still on step 2, and nothing was written
    expect(screen.getByLabelText('نوع تریگر')).toBeInTheDocument();
    expect(m.calls.some((c) => c.key === 'PATCH /v1/admin/push-automations/inactive_1d')).toBe(
      false,
    );
  });

  it('a concurrent edit is a banner with a way out, not a silent overwrite', async () => {
    mockApi(
      ROUTES({
        'PATCH /v1/admin/push-automations/inactive_1d': () => ({
          status: 409,
          error: {
            code: 'CONFLICT',
            message: 'این اتوماسیون هم‌زمان ویرایش شده است؛ صفحه را بازخوانی کنید.',
          },
        }),
      }),
    );
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش با ویزارد' }));
    toLastStep();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    expect(await screen.findByText(/ویرایش نفر دوم را از بین می‌برد/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازخوانی نسخه ذخیره‌شده' })).toBeInTheDocument();
  });

  it('a zod field error from the server lands on the input that caused it', async () => {
    mockApi(
      ROUTES({
        'PATCH /v1/admin/push-automations/inactive_1d': () => ({
          status: 400,
          error: {
            code: 'VALIDATION',
            message: 'ورودی نامعتبر است.',
            details: [{ field: 'body', message: 'متن نباید کلمه «رایگان» داشته باشد.' }],
          },
        }),
      }),
    );
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش با ویزارد' }));
    toLastStep();
    // the server's field key is the wizard's own field name, so the message lands on the input
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    expect(await screen.findByText('متن نباید کلمه «رایگان» داشته باشد.')).toBeInTheDocument();
    expect(screen.getByText('ورودی نامعتبر است.')).toBeInTheDocument();
  });

  it('a dry-run from the detail page previews real text and sends nothing itself', async () => {
    const m = mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    fireEvent.click(await screen.findByRole('button', { name: 'چند نفر مشمول؟' }));
    expect(
      await screen.findByRole('heading', { name: 'برآورد «یک روز بی‌فعالیتی»' }),
    ).toBeInTheDocument();
    expect(screen.getByText('سارا، ادامه بده')).toBeInTheDocument();
    expect(
      m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/dry-run'),
    ).toBe(true);
    expect(m.calls.some((c) => c.key === 'PATCH /v1/admin/push-automations/inactive_1d')).toBe(
      false,
    );
  });

  it('a test send is a real send, marked as such, for exactly one user', async () => {
    const m = mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    // wait for the picker to have real options: it is fed by /admin/users, which arrives later
    const pick = await screen.findByLabelText('کاربر');
    await screen.findByRole('option', { name: 'بهرام · manager' });
    fireEvent.change(pick, { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: 'ارسال آزمایشی' }));
    await waitFor(() =>
      expect(
        m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/test-send'),
      ).toBe(true),
    );
    expect(
      m.calls.find((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/test-send')?.body,
    ).toEqual({ userId: 'u2' });
    expect(await screen.findByText(/آموزش کرم/)).toBeInTheDocument();
  });

  it('a system gate is read here: no wizard, no test send, and the reason is on screen', async () => {
    mockApi({
      ...ROUTES(),
      'GET /v1/admin/push-automations/inactive_1d': () => ({
        data: detail({
          isGate: true,
          isSystem: true,
          templateKey: 'reminder',
          name: 'درگاه یادآوری تکلیف',
          message: { title: '', body: '', actionRef: '/learn', imageUrl: null },
          effectiveMessage: { title: 'متن قالب', body: 'از ویرایشگر قالب', source: 'template' },
        }),
      }),
    });
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    expect(await screen.findByRole('heading', { name: 'درگاه یادآوری تکلیف' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ویرایش با ویزارد' })).toBeNull();
    expect(screen.getByText(/درگاهِ قالب/)).toBeInTheDocument();
    expect(screen.getByText(/«قالب‌های اعلان» می‌نویسد/)).toBeInTheDocument();
    expect(
      screen.getByText('این ردیف متنِ خودش را ندارد؛ قالب آن را می‌نویسد.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('کاربر')).toBeDisabled();
  });

  it('a catalogue scenario is never offered for deletion', async () => {
    mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    expect(await screen.findByText('یک روز بی‌فعالیتی')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف این اتوماسیون' })).toBeNull();
  });

  it('a hand-made automation is deleted only after a confirmation', async () => {
    const m = mockApi({
      ...ROUTES(),
      'GET /v1/admin/push-automations/inactive_1d': () => ({ data: detail({ canDelete: true }) }),
    });
    renderApp('/admin/push-campaigns/automations/inactive_1d');
    const btn = await screen.findByRole('button', { name: 'حذف این اتوماسیون' });
    fireEvent.click(btn);
    expect(await screen.findByRole('heading', { name: 'حذف این اتوماسیون؟' })).toBeInTheDocument();
    expect(m.calls.some((c) => c.key === 'DELETE /v1/admin/push-automations/inactive_1d')).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'حذف کن' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'DELETE /v1/admin/push-automations/inactive_1d')).toBe(
        true,
      ),
    );
  });

  it('a hand-made automation is created switched off', async () => {
    const m = mockApi(ROUTES());
    renderApp('/admin/push-campaigns/automations/new');
    expect(await screen.findByRole('heading', { name: 'اتوماسیون دست‌ساز' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('کلید (لاتین، یکتا)'), {
      target: { value: 'weekly_note' },
    });
    fireEvent.change(screen.getByLabelText('نام (فقط برای پنل)'), {
      target: { value: 'یادداشت هفتگی' },
    });
    fireEvent.change(screen.getByLabelText('توضیح: این قانون چه کاری می‌کند'), {
      target: { value: 'خلاصه هفته را یادآوری می‌کند' },
    });
    toLastStep();
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), { target: { value: 'هفته نو شد' } });
    fireEvent.change(screen.getByLabelText('متن اعلان'), { target: { value: 'سه مرحله مانده' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت اتوماسیون (خاموش)' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'POST /v1/admin/push-automations')).toBe(true),
    );
    expect(m.calls.find((c) => c.key === 'POST /v1/admin/push-automations')?.body).toMatchObject({
      key: 'weekly_note',
      enabled: false,
    });
  });
});
