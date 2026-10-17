import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';
import { toPersianDigits } from '@/lib/digits';
import type { AuditEntry, Me, PolicyData } from '@/lib/types';
import { marketer } from '@/test/fixtures';

/** Governance surface: Policies (A8), Audit log (A10), Archive (deleted users/reports). */

const ADMIN: Me = { ...marketer, id: 'u-admin', name: 'آرش احمدی', role: 'admin', teamId: null };

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const signIn = (extra: Record<string, unknown> = {}) => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: ADMIN, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: ADMIN }),
    'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({
      data: [
        { id: 'u-admin', name: 'آرش احمدی', role: 'admin' },
        { id: 'u-ops', name: 'نگار نگاری', role: 'admin' },
      ],
    }),
    ...extra,
  };
};

const POLICY: PolicyData = {
  passScore: 70,
  maxAttempts: 3,
  completionThreshold: 80,
  pointsTable: { first_pass_quiz: 10, package_completion: 25, on_time_completion: 15 },
  penaltyEnabled: true,
  latePenalty: 2,
  warningHours: [48, 24],
  quietHours: { start: '22:00', end: '07:00' },
  weeklyDigestDay: 5,
  weeklyDigestHour: 9,
  reminderInactiveDays: 3,
  mentorChatEnabled: true,
  mentorDailyLimitPerUser: 20,
  mentorDailyLimitGlobal: 500,
  mentorVoiceEnabled: true,
  mentorVoiceMinutesPerUser: 10,
  mentorVoiceMinutesGlobal: 300,
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'u-admin',
};

const AUDIT: AuditEntry[] = [
  {
    id: 'a1',
    actorId: 'system',
    actorRole: 'system',
    action: 'deadline.parked',
    entity: 'push_run',
    entityId: 'run-9',
    before: null,
    after: { status: 'parked' },
    createdAt: '2026-01-02T10:00:00Z',
  },
  {
    id: 'a2',
    actorId: 'u-ops',
    actorRole: 'admin',
    action: 'package.published',
    entity: 'package',
    entityId: 'pkg-1',
    before: { title: 'قدیمی' },
    after: { title: 'جدید' },
    createdAt: '2026-01-01T08:30:00Z',
  },
];

const ARCHIVED_USER = {
  id: 'u-9',
  name: 'سارا محمدی',
  phone: '09121234567',
  role: 'marketer',
  onboardingComplete: true,
  createdAt: '2026-01-01T00:00:00Z',
  blacklistedAt: '2026-01-05T00:00:00Z',
};

describe('PoliciesPage — A8 real policy contract', () => {
  it('renders the five sections and the new-attempts-only warning', async () => {
    mockApi(signIn({ 'GET /v1/admin/policies': () => ({ data: POLICY }) }));
    renderApp('/admin/policies');
    // the governance warning is part of the contract, not decoration
    await screen.findByText(
      'تغییرات فقط روی تلاش‌ها و رویدادهای جدید اعمال می‌شود',
      {},
      { timeout: 15000 },
    );
    await screen.findByText('آزمون و تکمیل', {}, { timeout: 15000 });
    for (const heading of ['امتیاز', 'یادآوری و اعلان', 'منتور هوشمند', 'تماس صوتی با منتور'])
      expect(screen.getByText(heading)).toBeInTheDocument();
    for (const label of [
      'نمره قبولی (٪)',
      'حداکثر تلاش',
      'آستانه تکمیل رسانه (٪)',
      'قبولی در تلاش اول',
      'تکمیل بسته',
      'تکمیل به‌موقع',
      'کسر امتیاز برای تأخیر',
      'هشدار مهلت (ساعت قبل، با کاما)',
      'شروع ساعت سکوت',
      'پایان ساعت سکوت',
      'روز خلاصه هفتگی',
      'سقف پیام روزانه هر کاربر',
      'سقف دقیقه صوتی روزانه هر کاربر',
    ])
      expect(screen.getByText(label)).toBeInTheDocument();
  }, 20000);

  it('saves through PUT with warning hours parsed from Persian digits', async () => {
    let current: PolicyData = { ...POLICY };
    const { calls } = mockApi(
      signIn({
        'GET /v1/admin/policies': () => ({ data: current }),
        'PUT /v1/admin/policies': (body: unknown) => {
          // the server persists the change and normalises (de-dupes + sorts) the hours
          current = {
            ...current,
            ...(body as Partial<PolicyData>),
            warningHours: [24, 48],
            updatedAt: '2026-01-02T00:00:00Z',
            updatedBy: 'u-admin',
          };
          return { data: current };
        },
      }),
    );
    renderApp('/admin/policies');
    const pass = (await screen.findByLabelText(
      'نمره قبولی (٪)',
      {},
      { timeout: 15000 },
    )) as HTMLInputElement;
    fireEvent.change(pass, { target: { value: '75' } });
    // the unsaved-changes hint is part of the real form
    expect(await screen.findByText(/تغییری هنوز ذخیره نشده/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('هشدار مهلت (ساعت قبل، با کاما)'), {
      target: { value: '۴۸، ۲۴' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره سیاست‌ها' }));
    await screen.findByText('سیاست‌ها ذخیره شد.', {}, { timeout: 15000 });
    const body = calls.find((c) => c.key === 'PUT /v1/admin/policies')?.body as Record<
      string,
      unknown
    >;
    expect(body.passScore).toBe(75);
    // Persian digits + Persian comma parsed into the real numeric array
    expect(body.warningHours).toEqual([48, 24]);
    // the server's normalised hours replace what was typed
    await waitFor(() =>
      expect(
        (screen.getByLabelText('هشدار مهلت (ساعت قبل، با کاما)') as HTMLInputElement).value,
      ).toBe('24, 48'),
    );
    // audit fields are never sent back
    expect(body.updatedAt).toBeUndefined();
    expect(body.updatedBy).toBeUndefined();
  }, 20000);

  it('shows server field errors under the matching input', async () => {
    mockApi(
      signIn({
        'GET /v1/admin/policies': () => ({ data: POLICY }),
        'PUT /v1/admin/policies': () => ({
          status: 422,
          error: {
            code: 'VALIDATION',
            message: 'خطای اعتبارسنجی',
            details: [{ field: 'passScore', message: 'نمره قبولی باید بین ۱ تا ۱۰۰ باشد.' }],
          },
        }),
      }),
    );
    renderApp('/admin/policies');
    await screen.findByText('آزمون و تکمیل', {}, { timeout: 15000 });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره سیاست‌ها' }));
    await screen.findByText('نمره قبولی باید بین ۱ تا ۱۰۰ باشد.', {}, { timeout: 15000 });
    expect(screen.getByText('خطای اعتبارسنجی')).toBeInTheDocument();
  }, 20000);
});

describe('AuditPage — A10 append-only log with real actors and details', () => {
  it('renders system actor, actor names, action codes and before/after details', async () => {
    mockApi(signIn({ 'GET /v1/admin/audit-logs': () => ({ data: AUDIT }) }));
    renderApp('/admin/audit');
    // wait for real rows (the subtitle alone appears while the query is still loading)
    await screen.findAllByText('package.published', {}, { timeout: 15000 });
    // system actor is named, never a raw id (desktop table + mobile cards both render it)
    expect(screen.getAllByText('سیستم').length).toBeGreaterThan(0);
    expect(screen.getAllByText('نگار نگاری').length).toBeGreaterThan(0);
    // action/entity stay machine-readable (LTR code cells)
    expect(screen.getAllByText('push_run/run-9').length).toBeGreaterThan(0);
    // every row carries an expandable before/after diff
    const details = screen.getAllByText('جزئیات');
    const pres = details
      .map((d) => d.closest('details')?.querySelector('pre')?.textContent ?? '')
      .filter(Boolean);
    expect(pres.some((t) => t.includes('قدیمی') && t.includes('جدید'))).toBe(true);
    expect(pres.some((t) => t.includes('parked'))).toBe(true);
  }, 20000);

  it('filters by action or entity and shows the real empty state', async () => {
    mockApi(signIn({ 'GET /v1/admin/audit-logs': () => ({ data: AUDIT }) }));
    renderApp('/admin/audit');
    const filter = await screen.findByLabelText('فیلتر عملیات یا موجودیت', {}, { timeout: 15000 });
    await screen.findAllByText('deadline.parked', {}, { timeout: 15000 });
    fireEvent.change(filter, { target: { value: 'package.published' } });
    await waitFor(() => expect(screen.queryByText('deadline.parked')).not.toBeInTheDocument());
    expect(screen.getAllByText('package.published').length).toBeGreaterThan(0);
    fireEvent.change(filter, { target: { value: 'zzz' } });
    await screen.findByText('موردی نیست', {}, { timeout: 15000 });
  }, 20000);
});

describe('ArchivePage — blacklist and report archive', () => {
  it('shows the irreversible-deletion warning and the two real tabs', async () => {
    mockApi(
      signIn({
        'GET /v1/admin/archive/users': () => ({ data: [ARCHIVED_USER] }),
        'GET /v1/admin/archive/reports': () => ({ data: [] }),
      }),
    );
    renderApp('/admin/archive');
    await screen.findByText(
      'کاربران و گزارش‌های حذف‌شده. حذف از آرشیو، اطلاعات را برای همیشه از دیتابیس پاک می‌کند.',
      {},
      { timeout: 15000 },
    );
    fireEvent.click(screen.getByRole('tab', { name: /لیست سیاه/ }));
    expect(
      await screen.findByText(
        /این شماره‌ها نمی‌توانند وارد اپ شوند یا ثبت‌نام کنند/,
        {},
        { timeout: 15000 },
      ),
    ).toBeInTheDocument();
    // the real person row with the real phone
    expect(
      (await screen.findAllByText('سارا محمدی', {}, { timeout: 15000 })).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(toPersianDigits('09121234567')).length).toBeGreaterThan(0);
  }, 20000);

  it('restores a blacklisted person only after the confirm dialog', async () => {
    const { calls } = mockApi(
      signIn({
        'GET /v1/admin/archive/users': () => ({ data: [ARCHIVED_USER] }),
        'GET /v1/admin/archive/reports': () => ({ data: [] }),
        'POST /v1/admin/archive/users/u-9/restore': () => ({ data: { ok: true } }),
      }),
    );
    renderApp('/admin/archive');
    const restore = await screen.findAllByRole('button', { name: 'بازگردانی' }, { timeout: 15000 });
    fireEvent.click(restore[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'کاربر از لیست سیاه خارج می‌شود و با همین شماره دوباره می‌تواند وارد اپ شود.',
      ),
    ).toBeInTheDocument();
    // nothing sent before confirming
    expect(calls.some((c) => c.key.includes('/restore'))).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'بازگردانی و اجازه‌ی ورود' }));
    await screen.findByText(
      'از آرشیو خارج شد و دوباره می‌تواند از اپ استفاده کند.',
      {},
      { timeout: 15000 },
    );
    expect(calls.some((c) => c.key === 'POST /v1/admin/archive/users/u-9/restore')).toBe(true);
  }, 20000);

  it('purges only after the permanent-deletion dialog with the full warning', async () => {
    const { calls } = mockApi(
      signIn({
        'GET /v1/admin/archive/users': () => ({ data: [ARCHIVED_USER] }),
        'GET /v1/admin/archive/reports': () => ({ data: [] }),
        'DELETE /v1/admin/archive/users/u-9': () => ({ data: { ok: true } }),
      }),
    );
    renderApp('/admin/archive');
    const purge = await screen.findAllByRole(
      'button',
      { name: 'حذف سارا محمدی از آرشیو' },
      { timeout: 15000 },
    );
    fireEvent.click(purge[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    // the warning lists exactly what is destroyed and that it cannot come back
    expect(
      within(dialog).getByText(
        'حساب، پیشرفت آموزشی، نتایج آزمون، امتیازها و همه‌ی داده‌های این کاربر برای همیشه پاک می‌شود و قابل بازگشت نیست.',
      ),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف برای همیشه' }));
    await screen.findByText('برای همیشه از دیتابیس حذف شد.', {}, { timeout: 15000 });
    expect(calls.some((c) => c.key === 'DELETE /v1/admin/archive/users/u-9')).toBe(true);
  }, 20000);

  it('restores and purges report rows with the same archive semantics', async () => {
    const { calls } = mockApi(
      signIn({
        'GET /v1/admin/archive/users': () => ({ data: [] }),
        'GET /v1/admin/archive/reports': () => ({
          data: [
            {
              userId: 'u-9',
              packageId: 'pkg-1',
              userName: 'سارا محمدی',
              phone: '09121234567',
              packageTitle: 'بسته آزمایشی',
              brandName: 'آتل',
              productName: 'محصول',
              percent: 40,
              status: 'failed',
              archivedAt: '2026-01-06T00:00:00Z',
            },
          ],
        }),
        'POST /v1/admin/archive/reports/restore': () => ({ data: { ok: true } }),
        'POST /v1/admin/archive/reports/purge': () => ({ data: { ok: true } }),
      }),
    );
    renderApp('/admin/archive');
    fireEvent.click(await screen.findByRole('tab', { name: /گزارش‌ها/ }, { timeout: 15000 }));
    expect(
      (await screen.findAllByText('گزارش‌های حذف‌شده', {}, { timeout: 15000 })).length,
    ).toBeGreaterThan(0);
    // restore is direct, per-row, and posts the real row identity
    const restore = await screen.findAllByRole('button', { name: 'بازگردانی' }, { timeout: 15000 });
    fireEvent.click(restore[0] as HTMLElement);
    await screen.findByText('به گزارش‌ها برگشت.', {}, { timeout: 15000 });
    expect(
      calls.some(
        (c) =>
          c.key === 'POST /v1/admin/archive/reports/restore' &&
          (c.body as { userId: string }).userId === 'u-9',
      ),
    ).toBe(true);
    // purge asks first
    const purge = await screen.findAllByRole(
      'button',
      { name: 'حذف گزارش‌های سارا محمدی از آرشیو' },
      { timeout: 15000 },
    );
    fireEvent.click(purge[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('حذف گزارش‌ها از آرشیو؟')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف برای همیشه' }));
    await screen.findByText('برای همیشه از دیتابیس حذف شد.', {}, { timeout: 15000 });
    expect(calls.some((c) => c.key === 'POST /v1/admin/archive/reports/purge')).toBe(true);
  }, 20000);

  it('shows the real empty states for both tabs', async () => {
    mockApi(
      signIn({
        'GET /v1/admin/archive/users': () => ({ data: [] }),
        'GET /v1/admin/archive/reports': () => ({ data: [] }),
      }),
    );
    renderApp('/admin/archive');
    await screen.findByText('لیست سیاه خالی است', {}, { timeout: 15000 });
    fireEvent.click(screen.getByRole('tab', { name: /گزارش‌ها/ }));
    expect(
      await screen.findByText('گزارشی در آرشیو نیست', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
  }, 20000);
});
