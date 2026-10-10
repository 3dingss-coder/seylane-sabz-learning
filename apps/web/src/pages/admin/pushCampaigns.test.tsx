import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

const campaign = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'کمپین بهاره',
  title: 'تخفیف ویژه',
  body: 'این هفته را از دست ندهید',
  imageUrl: null,
  actionRef: '/messages',
  audience: { type: 'all', targetId: null, channel: 'any' },
  status: 'draft',
  scheduledAt: null,
  targetCount: null,
  pushReachable: null,
  version: 1,
  createdAt: '2026-10-08T06:00:00.000Z',
  updatedAt: '2026-10-08T06:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  summary: {
    batchesTotal: 0,
    batchesDone: 0,
    users: 0,
    attempted: 0,
    accepted: 0,
    failed: 0,
    invalid: 0,
    noDevice: 0,
    interrupted: 0,
  },
  lastError: null,
  archivedAt: null,
  ...over,
});

const asAdmin = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({ data: [] }),
    'POST /v1/admin/push-campaigns/audience-preview': () => ({
      data: { users: 42, withPushDevice: 30, webDevices: 10, androidDevices: 25, note: 'تقریبی' },
    }),
  };
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('admin: کمپین‌های Push — داشبورد و تاریخچه', () => {
  it('shows counts and history from the real API responses', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/push-campaigns/dashboard': () => ({
        data: {
          counts: {
            total: 3,
            draft: 1,
            scheduled: 1,
            inProgress: 0,
            sent: 1,
            failed: 0,
            cancelled: 0,
          },
          providerRequests: { attempted: 10, accepted: 9, failed: 1, invalid: 1 },
          recent: [],
        },
      }),
      'GET /v1/admin/push-campaigns': () => ({
        data: {
          items: [
            campaign(),
            campaign({
              id: 'c2',
              name: 'کمپین ارسال‌شده',
              status: 'sent_with_errors',
              summary: { ...campaign().summary, attempted: 10, accepted: 9, failed: 1 },
              lastError: 'بخشی از درخواست‌ها پذیرفته نشد.',
            }),
          ],
          nextCursor: null,
          total: 2,
        },
      }),
    });
    renderApp('/admin/push-campaigns');
    expect(
      await screen.findByRole('heading', { name: 'کمپین‌های اعلان (Push)' }),
    ).toBeInTheDocument();
    const rows = await screen.findAllByTestId('campaign-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByTestId('campaign-status')).toHaveTextContent(
      'ارسال‌شده با خطا',
    );
    expect(within(rows[1] as HTMLElement).getByText(/پذیرفته: ۹/)).toBeInTheDocument();
    expect(
      screen.getByText(/پذیرفته‌شده» یعنی سرویس ارسال اعلان درخواست را قبول کرده است/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /کمپین بهاره/ })).toHaveAttribute(
      'href',
      '/admin/push-campaigns/c1',
    );
  });

  it('shows a helpful empty state with a create action when there are no campaigns', async () => {
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
    });
    renderApp('/admin/push-campaigns');
    expect(await screen.findByText('هنوز کمپینی ساخته نشده است')).toBeInTheDocument();
  });
});

describe('admin: ساخت و ویرایش کمپین', () => {
  it('updates the live preview as the admin types, and saves a draft without sending', async () => {
    const m = mockApi({
      ...asAdmin(),
      'POST /v1/admin/push-campaigns': (body) => ({
        status: 201,
        data: {
          campaign: campaign({ id: 'c9', ...(body as object) }),
          batches: [],
          batchesTruncated: false,
        },
      }),
      'GET /v1/admin/push-campaigns/c9': () => ({
        data: { campaign: campaign({ id: 'c9' }), batches: [], batchesTruncated: false },
      }),
    });
    renderApp('/admin/push-campaigns/new');
    const title = await screen.findByLabelText('عنوان اعلان');
    fireEvent.change(title, { target: { value: 'پیشنهاد امروز' } });
    await waitFor(() =>
      expect(screen.getAllByTestId('preview-title')[0]).toHaveTextContent('پیشنهاد امروز'),
    );
    fireEvent.change(screen.getByLabelText('نام داخلی کمپین'), { target: { value: 'کمپین تست' } });
    fireEvent.change(screen.getByLabelText('متن اعلان'), { target: { value: 'متن آزمایشی' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'POST /v1/admin/push-campaigns')).toBe(true),
    );
    const post = m.calls.find((c) => c.key === 'POST /v1/admin/push-campaigns');
    expect(post?.body).toMatchObject({
      title: 'پیشنهاد امروز',
      body: 'متن آزمایشی',
      scheduledAt: null,
    });
    expect(m.calls.some((c) => c.key.includes('/send'))).toBe(false);
  });

  it('shows Persian field errors from the server and keeps the typed content', async () => {
    mockApi({
      ...asAdmin(),
      'POST /v1/admin/push-campaigns': () => ({
        status: 400,
        error: {
          code: 'VALIDATION',
          message: 'مقصد باید یک مسیر داخلی معتبر اپلیکیشن باشد؛ مثل /messages یا /learn.',
          details: [
            { field: 'actionRef', message: 'مقصد باید یک مسیر داخلی معتبر اپلیکیشن باشد.' },
          ],
        },
      }),
    });
    renderApp('/admin/push-campaigns/new');
    fireEvent.change(await screen.findByLabelText('نام داخلی کمپین'), {
      target: { value: 'کمپین تست' },
    });
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), { target: { value: 'عنوان می‌ماند' } });
    fireEvent.change(screen.getByLabelText('متن اعلان'), { target: { value: 'متن می‌ماند' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));
    expect((await screen.findAllByText(/مقصد باید یک مسیر داخلی معتبر/)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('عنوان اعلان')).toHaveValue('عنوان می‌ماند');
  });

  it('confirms before an immediate send, sends with an Idempotency-Key, and disables the button while pending', async () => {
    mockApi({
      ...asAdmin(),
      'POST /v1/admin/push-campaigns': () => ({
        status: 201,
        data: { campaign: campaign({ id: 'c5' }), batches: [], batchesTruncated: false },
      }),
    });
    // The send is held open so the in-flight state is observable; the headers are recorded here.
    const sendHeaders: Array<Record<string, string>> = [];
    let release: () => void = () => undefined;
    const current = vi.mocked(fetch).getMockImplementation();
    if (!current) throw new Error('fetch mock is not installed');
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/admin/push-campaigns/c5/send')) {
        sendHeaders.push({ ...(init?.headers as Record<string, string>) });
        await new Promise<void>((r) => {
          release = r;
        });
        return new Response(
          JSON.stringify({
            data: {
              campaign: campaign({
                id: 'c5',
                status: 'sent',
                summary: { ...campaign().summary, attempted: 1, accepted: 1 },
              }),
              batches: [],
              batchesTruncated: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return current(input, init);
    });

    renderApp('/admin/push-campaigns/new');
    fireEvent.change(await screen.findByLabelText('نام داخلی کمپین'), {
      target: { value: 'کمپین تست' },
    });
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), { target: { value: 'عنوان ارسال' } });
    fireEvent.change(screen.getByLabelText('متن اعلان'), { target: { value: 'متن ارسال' } });
    fireEvent.click(screen.getByRole('button', { name: 'ارسال فوری' }));

    const dialog = await screen.findByRole('dialog', { name: 'تأیید ارسال فوری' });
    expect(within(dialog).getByText(/بازگرداندن/)).toBeInTheDocument();
    expect(await within(dialog).findByText(/حدود ۴۲ کاربر/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'ارسال اعلان' });
    fireEvent.click(confirm);
    await waitFor(() => expect(sendHeaders).toHaveLength(1));
    // While the request is in flight, the confirm button must be disabled (no double click).
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(sendHeaders).toHaveLength(1);
    expect(sendHeaders[0]?.['Idempotency-Key'] ?? '').toMatch(/^[0-9a-f-]{36}$/);
    release();
  });

  it('shows a server error for a send (no silent failure)', async () => {
    mockApi({
      ...asAdmin(),
      'POST /v1/admin/push-campaigns': () => ({
        status: 201,
        data: { campaign: campaign({ id: 'c6' }), batches: [], batchesTruncated: false },
      }),
      'POST /v1/admin/push-campaigns/c6/send': () => ({
        status: 409,
        error: {
          code: 'CONFLICT',
          message: 'این کمپین قبلاً در صف ارسال قرار گرفته یا ارسال شده است.',
        },
      }),
    });
    renderApp('/admin/push-campaigns/new');
    fireEvent.change(await screen.findByLabelText('نام داخلی کمپین'), {
      target: { value: 'کمپین تست' },
    });
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), { target: { value: 'عنوان' } });
    fireEvent.change(screen.getByLabelText('متن اعلان'), { target: { value: 'متن' } });
    fireEvent.click(screen.getByRole('button', { name: 'ارسال فوری' }));
    const dialog = await screen.findByRole('dialog', { name: 'تأیید ارسال فوری' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ارسال اعلان' }));
    expect(
      await screen.findByText('این کمپین قبلاً در صف ارسال قرار گرفته یا ارسال شده است.'),
    ).toBeInTheDocument();
  });

  it('a sent campaign opens read-only and shows real results and batch errors', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/admin/push-campaigns/c7': () => ({
        data: {
          campaign: campaign({
            id: 'c7',
            status: 'sent_with_errors',
            targetCount: 50,
            summary: {
              batchesTotal: 2,
              batchesDone: 2,
              users: 50,
              attempted: 60,
              accepted: 55,
              failed: 5,
              invalid: 2,
              noDevice: 3,
              interrupted: 0,
            },
          }),
          batches: [
            {
              index: 0,
              status: 'sent',
              users: 25,
              attempts: 1,
              attempted: 30,
              accepted: 30,
              failed: 0,
              invalid: 0,
              noDevice: 0,
              lastError: null,
              startedAt: null,
              finishedAt: null,
            },
            {
              index: 1,
              status: 'sent_with_errors',
              users: 25,
              attempts: 1,
              attempted: 30,
              accepted: 25,
              failed: 5,
              invalid: 2,
              noDevice: 3,
              lastError: 'بخشی از درخواست‌ها توسط سرویس ارسال پذیرفته نشد.',
              startedAt: null,
              finishedAt: null,
            },
          ],
          batchesTruncated: false,
        },
      }),
    });
    renderApp('/admin/push-campaigns/c7');
    expect(await screen.findByRole('heading', { name: 'گزارش ارسال' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ارسال فوری' })).not.toBeInTheDocument();
    expect(
      screen.getByText('بخشی از درخواست‌ها توسط سرویس ارسال پذیرفته نشد.', { selector: 'td' }),
    ).toBeInTheDocument();
    expect(screen.getByText('۵', { selector: 'p' })).toBeInTheDocument();
  });
});

describe('admin: ناوبری کمپین‌ها', () => {
  it('exposes the studio in the admin navigation and links from the notifications page', async () => {
    mockApi({
      ...asAdmin(),
      'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
      'GET /v1/admin/notification-templates': () => ({ data: [] }),
    });
    renderApp('/admin/notifications');
    expect(await screen.findByRole('tab', { name: 'ارسال دستی' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'ارسال دستی' }));
    expect(await screen.findByRole('button', { name: 'ساخت کمپین Push' })).toBeInTheDocument();
  });
});
