import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

const row = (over: Record<string, unknown> = {}) => ({
  key: 'inactive_1d',
  name: 'یک روز بی‌فعالیتی',
  description: 'دیروز فعال بودی و امروز نیامدی؛ ادامه دادن را یادآوری می‌کند.',
  category: 'deadlines',
  categoryLabel: 'مهلت و تکلیف',
  triggerKind: 'inactivity',
  triggerLabel: 'بی‌فعالیتی',
  enabled: false,
  isSystem: true,
  isGate: false,
  templateKey: null,
  requiresFeature: null,
  optInOnly: false,
  push: true,
  priority: 'normal',
  audienceLabel: 'همه کاربران فعال',
  timeLabel: '10:00',
  dueNow: false,
  lastRunAt: null,
  sent7d: 0,
  skipped7d: 0,
  version: 1,
  ...over,
});

const SETTINGS = {
  paused: false,
  maxPerUserPerDay: 2,
  maxPerUserPerWeek: 10,
  minGapMs: 14400000,
  defaultHourTehran: 10,
  decisionTtlDays: 30,
  failureAlertPct: 20,
  updatedAt: '2026-10-03T06:30:00.000Z',
  updatedBy: 'a1',
};

const list = (rows: Array<Record<string, unknown>> = []) => ({
  rows,
  paused: false,
  settings: SETTINGS,
  counts: { total: 38, enabled: rows.filter((r) => r.enabled).length, gates: 13, v2: 3 },
  today: { sent: 12, skipped: { capDay: 4 } },
});

const HEALTH = {
  cron: {
    lastRunAt: '2026-10-03T06:30:00.000Z',
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
    lastAttemptAt: '2026-10-03T06:31:00.000Z',
    lastError: null,
    today: { sent: 30, failed: 0, invalid: 0 },
    failureRate: 0,
  },
};

const DRY = {
  key: 'inactive_1d',
  windowKey: '2026-10-03',
  evaluated: 12,
  wouldSend: 7,
  skipped: { capDay: 3, noDevice: 2 },
  skippedLabels: [
    { reason: 'capDay', count: 3, label: 'سقف روزانه پوش کاربر پر شده است' },
    { reason: 'noDevice', count: 2, label: 'هیچ دستگاه معتبری برای این کاربر ثبت نشده است' },
  ],
  sample: [
    {
      userId: 'u1',
      name: 'سارا',
      title: 'دیروز را ادامه بده',
      body: 'یک مرحله دیگر باقی مانده است',
      reason: 'sent',
    },
  ],
  note: null,
};

const asAdmin = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({ data: [] }),
  };
};

/** Everything this tab talks to — the shapes are copied from `push-automation-admin.ts`. */
const routes = (over: Record<string, () => unknown> = {}) => ({
  ...asAdmin(),
  'GET /v1/admin/push-automations': () => ({
    // four rows that together cover every state the panel has to explain
    data: list([
      row({ key: 'inactive_1d' }),
      row({
        key: 'reminder',
        name: 'یادآوری تکلیف',
        isGate: true,
        templateKey: 'reminder',
        enabled: true,
      }),
      row({
        key: 'quiz_failed_nudge',
        name: 'یادآوری بعد از آزمون',
        enabled: true,
        category: 'quizzes',
        categoryLabel: 'آزمون',
        triggerKind: 'event',
        triggerLabel: 'اتفاق',
        timeLabel: 'اتفاق',
      }),
      row({
        key: 'team_rank',
        name: 'رتبه هفتگی تیم',
        requiresFeature: 'team_rank',
        category: 'digests',
        categoryLabel: 'خلاصه‌ها',
        triggerKind: 'schedule_weekly',
        triggerLabel: 'هفتگی',
      }),
    ]),
  }),
  'GET /v1/admin/system-health': () => ({ data: HEALTH }),
  'POST /v1/admin/push-automations/inactive_1d/enabled': () => ({ data: { key: 'inactive_1d' } }),
  'POST /v1/admin/push-automations/reminder/enabled': () => ({ data: { key: 'reminder' } }),
  'POST /v1/admin/push-automations/pause': () => ({ data: { paused: true } }),
  'PUT /v1/admin/push-automations/settings': () => ({ data: SETTINGS }),
  'POST /v1/admin/push-automations/inactive_1d/dry-run': () => ({ data: DRY }),
  'POST /v1/admin/push-automations/run': () => ({
    data: { runId: 'r1', queue: null, pruned: 0, sweeps: [], skippedTotals: {}, paused: false },
  }),
  ...over,
});

/**
 * `DataTable` renders both a table (≥md) and a stacked card list (mobile) — jsdom keeps both in the
 * DOM, so role queries take the first of the pair. What matters is that both views agree.
 */
const first = (role: Parameters<typeof screen.getAllByRole>[0], name: string | RegExp) =>
  screen.getAllByRole(role, { name })[0] as HTMLElement;
const firstAsync = async (
  role: Parameters<typeof screen.findAllByRole>[0],
  name: string | RegExp,
) => (await screen.findAllByRole(role, { name }))[0] as HTMLElement;
const sw = (name: string) => first('switch', `وضعیت «${name}»`);
const inputByLabel = async (label: string) =>
  (await screen.findAllByLabelText(label))[0] as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('admin: کمپین‌های Push ← اتوماسیون', () => {
  it('the campaigns page offers the automation tab and routes to it', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/push-campaigns/dashboard': () => ({
        data: {
          counts: {
            total: 0,
            draft: 0,
            scheduled: 0,
            inProgress: 0,
            sent: 0,
            failed: 0,
            cancelled: 0,
          },
          providerRequests: { attempted: 0, accepted: 0, failed: 0, invalid: 0 },
          recent: [],
        },
      }),
      'GET /v1/admin/push-campaigns': () => ({ data: { items: [], nextCursor: null, total: 0 } }),
      'GET /v1/admin/push-automations': () => ({ data: list([]) }),
      'GET /v1/admin/system-health': () => ({ data: HEALTH }),
    });
    renderApp('/admin/push-campaigns');
    const tab = await screen.findByRole('tab', { name: /اتوماسیون اعلان/ });
    fireEvent.click(tab);
    expect(await screen.findByTestId('automations-panel')).toBeInTheDocument();
  });

  it('renders the health card, the grouped switches and the per-row estimate action', async () => {
    mockApi(routes());
    renderApp('/admin/push-campaigns/automations');
    expect(
      await screen.findByRole('heading', { name: 'اتوماسیون اعلان (Push)' }),
    ).toBeInTheDocument();
    // the panel itself only mounts once the list request has resolved
    const panel = await screen.findByTestId('automations-panel');
    expect(within(panel).getByText('زمان‌بندی سامانه')).toBeInTheDocument();
    expect(within(panel).getByText('fcm-http')).toBeInTheDocument();
    expect(within(panel).getByText('۳۰ ارسال · ۰ ناموفق')).toBeInTheDocument();
    // grouped by category — deadline rules first — with a Persian «on of total» per group
    expect(within(panel).getByRole('region', { name: 'گروه مهلت و تکلیف' })).toBeInTheDocument();
    expect(within(panel).getByText('۱ از ۲ روشن')).toBeInTheDocument();
    expect(within(panel).getByText('۱ از ۱ روشن')).toBeInTheDocument();
    // an event rule is described by what it watches, never by a clock time it does not have
    expect(within(panel).getAllByText('اتفاق').length).toBeGreaterThan(0);
    expect(sw('یادآوری بعد از آزمون')).toHaveAttribute('aria-checked', 'true');
    expect(sw('یک روز بی‌فعالیتی')).toHaveAttribute('aria-checked', 'false');
    // a scenario whose data is not computed yet cannot be switched on at all
    expect(sw('رتبه هفتگی تیم')).toBeDisabled();
    expect(within(panel).getAllByText('نسخه ۲').length).toBeGreaterThan(0);
    // a system gate is labelled as a gate, so it never reads as a duplicated scenario
    expect(within(panel).getAllByText('سیستمی — روشن').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('چند نفر مشمول؟').length).toBeGreaterThan(0);
  });

  it('a plain on/off switch is one POST and no ceremony', async () => {
    const m = mockApi(routes());
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await firstAsync('switch', 'وضعیت «یک روز بی‌فعالیتی»'));
    await waitFor(() =>
      expect(
        m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/enabled'),
      ).toBe(true),
    );
    expect(
      m.calls.find((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/enabled')?.body,
    ).toEqual({ enabled: true });
    // the list is refetched, so the switch shows the server's answer rather than the click
    await waitFor(() =>
      expect(m.calls.filter((c) => c.key === 'GET /v1/admin/push-automations')).toHaveLength(2),
    );
    expect(screen.queryByText(/زنجیره پیگیری مهلت است/)).toBeNull();
  });

  it('a deadline-chain rule asks for confirmation first, and sends confirmCritical with it', async () => {
    const m = mockApi(routes());
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await firstAsync('switch', 'وضعیت «یادآوری تکلیف»'));
    expect(
      await screen.findByRole('heading', { name: 'خاموش‌کردن این قانون' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/زنجیره پیگیری مهلت است/)).toBeInTheDocument();
    expect(screen.getByText(/پیامی دریافت نمی‌کنند/)).toBeInTheDocument();
    expect(m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/reminder/enabled')).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تأیید می‌کنم' }));
    await waitFor(() =>
      expect(
        m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/reminder/enabled'),
      ).toBe(true),
    );
    expect(
      m.calls.find((c) => c.key === 'POST /v1/admin/push-automations/reminder/enabled')?.body,
    ).toEqual({ enabled: false, confirmCritical: true });
  });

  it('an engine refusal is shown as the Persian server message and the switch re-reads', async () => {
    const m = mockApi(
      routes({
        'POST /v1/admin/push-automations/inactive_1d/enabled': () => ({
          status: 409,
          error: { code: 'CONFLICT', message: 'نسخه دیگری هم‌زمان این قانون را ویرایش کرده است.' },
        }),
      }),
    );
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await firstAsync('switch', 'وضعیت «یک روز بی‌فعالیتی»'));
    expect(
      await screen.findByText('نسخه دیگری هم‌زمان این قانون را ویرایش کرده است.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        m.calls.filter((c) => c.key === 'GET /v1/admin/push-automations').length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(sw('یک روز بی‌فعالیتی')).toHaveAttribute('aria-checked', 'false');
  });

  it('the kill-switch needs a confirmation and says what it does', async () => {
    const m = mockApi(routes());
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await screen.findByRole('button', { name: 'توقف همه اتوماسیون‌ها' }));
    expect(
      await screen.findByRole('heading', { name: 'توقف همه اتوماسیون‌ها؟' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'توقف را روشن کن' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/pause')).toBe(true),
    );
    expect(m.calls.find((c) => c.key === 'POST /v1/admin/push-automations/pause')?.body).toEqual({
      paused: true,
    });
  });

  it('a paused engine is explained in the panel, not hidden from it', async () => {
    mockApi({
      ...routes(),
      'GET /v1/admin/push-automations': () => ({
        data: {
          ...list([row({ key: 'inactive_1d' })]),
          paused: true,
          settings: { ...SETTINGS, paused: true },
        },
      }),
    });
    renderApp('/admin/push-campaigns/automations');
    expect(
      await screen.findByText(/توقف کلی روشن است\. هیچ اتوماسیونی اعلان نمی‌سازد/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ادامه همه اتوماسیون‌ها' })).toBeInTheDocument();
    expect(screen.getByText('توقف کلی روشن است: هیچ اتوماسیونی اجرا نمی‌شود.')).toBeInTheDocument();
    // the caps stay visible while paused, because they are the reason to un-pause quickly
    expect(screen.getByText(/حداکثر ۲ پوش در روز برای هر نفر/)).toBeInTheDocument();
  });

  it('«چند نفر مشمول؟» runs a dry-run and reports it without pretending to have sent', async () => {
    const m = mockApi(routes());
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await firstAsync('button', 'چند نفر مشمول؟'));
    expect(
      await screen.findByRole('heading', { name: 'برآورد «یک روز بی‌فعالیتی»' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '۱۲ نفر در جمعیت بررسی‌شده مشمول این قانون بودند — ۷ نفر همین حالا پوش می‌گرفتند. ردشدن‌ها: سقف روزانه پوش کاربر پر شده است (۳)، هیچ دستگاه معتبری برای این کاربر ثبت نشده است (۲).',
      ),
    ).toBeInTheDocument();
    // the sample is rendered text with real data, so the admin can read the sentence before enabling
    expect(screen.getByText('دیروز را ادامه بده')).toBeInTheDocument();
    expect(screen.getByText('۷ نفر مشمول ارسال')).toBeInTheDocument();
    expect(
      m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/dry-run'),
    ).toBe(true);
    // an estimate is read-only: it must never be able to switch the rule on as a side effect
    expect(
      m.calls.some((c) => c.key === 'POST /v1/admin/push-automations/inactive_1d/enabled'),
    ).toBe(false);
  });

  it('the caps dialog validates before sending, and converts minutes to milliseconds', async () => {
    const m = mockApi(routes());
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await screen.findByRole('button', { name: 'سقف‌ها و تنظیمات کلی' }));
    const day = await inputByLabel('حداکثر پوش روزانه هر کاربر');
    fireEvent.change(day, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(
      await screen.findByText(
        'سقف روزانه باید عددی بین ۰ تا ۲۰ باشد (۰ یعنی هیچ پوش خودکاری نرود).',
      ),
    ).toBeInTheDocument();
    expect(m.calls.some((c) => c.key === 'PUT /v1/admin/push-automations/settings')).toBe(false);
    fireEvent.change(day, { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('حداقل فاصله بین دو پوش (دقیقه)'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'PUT /v1/admin/push-automations/settings')).toBe(true),
    );
    expect(m.calls.find((c) => c.key === 'PUT /v1/admin/push-automations/settings')?.body).toEqual({
      paused: false,
      maxPerUserPerDay: 1,
      maxPerUserPerWeek: 10,
      minGapMs: 5400000,
      defaultHourTehran: 10,
      decisionTtlDays: 30,
      failureAlertPct: 20,
    });
  });

  it('اجرای الان reports what the sweep did and never bypasses the caps', async () => {
    const m = mockApi(
      routes({
        'POST /v1/admin/push-automations/run': () => ({
          data: {
            runId: 'r1',
            queue: null,
            pruned: 0,
            sweeps: [
              {
                key: 'inactive_1d',
                name: 'یک روز بی‌فعالیتی',
                windowKey: '2026-10-03',
                evaluated: 12,
                sent: 2,
                skipped: 1,
                failed: 0,
                error: null,
              },
            ],
            skippedTotals: {},
            paused: false,
          },
        }),
      }),
    );
    renderApp('/admin/push-campaigns/automations');
    fireEvent.click(await screen.findByRole('button', { name: 'اجرای الان' }));
    expect(
      await screen.findByText('۱ قانون بررسی شد · ۱۲ کاربر ارزیابی شد · ۲ ارسال.'),
    ).toBeInTheDocument();
    expect(m.calls.find((c) => c.key === 'POST /v1/admin/push-automations/run')?.body).toEqual({
      force: true,
    });
    expect(screen.getByText(/فقط پنجره زمانی را دور می‌زند/)).toBeInTheDocument();
  });

  it('a missing scheduler report and an unconfigured provider are both shouted about', async () => {
    mockApi({
      ...routes(),
      'GET /v1/admin/system-health': () => ({
        data: {
          ...HEALTH,
          push: { ...HEALTH.push, configured: false, provider: 'unconfigured' },
          cron: { ...HEALTH.cron, lastRunAt: null, neverReported: true, minutesSinceLastRun: null },
        },
      }),
    });
    renderApp('/admin/push-campaigns/automations');
    expect(await screen.findByText('پیکربندی‌نشده')).toBeInTheDocument();
    expect(screen.getByText('گزارشی نرسانده است')).toBeInTheDocument();
    expect(screen.getByText(/Cron Trigger/)).toBeInTheDocument();
  });
});
