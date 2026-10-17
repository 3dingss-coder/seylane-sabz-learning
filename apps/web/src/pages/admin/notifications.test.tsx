import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me, NotificationTemplate } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const signIn = (extra: Record<string, unknown> = {}) => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
    'GET /v1/admin/notification-templates': () => ({ data: TEMPLATES }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({ data: [] }),
    ...extra,
  };
};

const TEMPLATES: NotificationTemplate[] = [
  {
    key: 'welcome',
    title: 'خوش آمدی!',
    body: 'ثبت‌نام‌ات انجام شد.',
    variables: ['name'],
    push: false,
    customized: true,
  },
  {
    key: 'quiz_passed',
    title: 'آفرین',
    body: 'قبول شدی.',
    variables: [],
    push: false,
    customized: false,
  },
];

describe('NotificationsPage — three real tabs (inbox / templates / manual send)', () => {
  it('renders the tabs and the Persian template names with the customized marker', async () => {
    mockApi(signIn());
    renderApp('/admin/notifications');
    expect(
      await screen.findByRole('tab', { name: /قالب‌ها/ }, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /صندوق من/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ارسال دستی/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /قالب‌ها/ }));
    expect(await screen.findByText('خوش‌آمد ثبت‌نام')).toBeInTheDocument();
    expect(screen.getByText('قبولی در آزمون')).toBeInTheDocument();
    expect(screen.getByText('(سفارشی)')).toBeInTheDocument();
  });

  it('keeps notification templates editable (PUT with the typed text)', async () => {
    const { calls } = mockApi(
      signIn({
        'PUT /v1/admin/notification-templates/welcome': () => ({ data: { ok: true } }),
      }),
    );
    renderApp('/admin/notifications');
    fireEvent.click(await screen.findByRole('tab', { name: /قالب‌ها/ }, { timeout: 15000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش خوش‌آمد ثبت‌نام' }));
    const dialog = await screen.findByRole('dialog', { name: 'قالب «خوش‌آمد ثبت‌نام»' });
    fireEvent.change(within(dialog).getByLabelText('عنوان'), { target: { value: 'عنوان تازه' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }));
    await screen.findByText('قالب ذخیره شد.');
    const put = calls.find((c) => c.key === 'PUT /v1/admin/notification-templates/welcome');
    expect(put).toBeTruthy();
    expect(put?.body).toMatchObject({ title: 'عنوان تازه', body: 'ثبت‌نام‌ات انجام شد.' });
  });
});

describe('ManualSend — real broadcast contract with confirm + live preview', () => {
  it('offers the four audience modes and links onward to the push campaign studio', async () => {
    mockApi(signIn());
    renderApp('/admin/notifications');
    fireEvent.click(await screen.findByRole('tab', { name: /ارسال دستی/ }, { timeout: 15000 }));
    // entry points to the campaign studio (the navigation itself is pinned by pushCampaigns.test.tsx)
    expect(screen.getByRole('button', { name: 'ساخت کمپین Push' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /شروع از قالب آماده/ })).toBeInTheDocument();
    const audience = screen.getByLabelText('مخاطب');
    const labels = within(audience)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['همه کاربران فعال', 'یک نقش', 'یک تیم', 'یک فرد']);
  });

  it('confirms before sending, posts the real payload and reports the real count', async () => {
    const { calls } = mockApi(
      signIn({
        'POST /v1/admin/notifications/send': () => ({ data: { count: 3 } }),
      }),
    );
    renderApp('/admin/notifications');
    fireEvent.click(await screen.findByRole('tab', { name: /ارسال دستی/ }, { timeout: 15000 }));
    fireEvent.change(screen.getByLabelText('عنوان'), { target: { value: 'یادآوری جلسه' } });
    fireEvent.change(screen.getByLabelText('متن'), {
      target: { value: 'جلسه ساعت ۱۰ برگزار می‌شود.' },
    });
    // the live preview updates as the admin types
    expect(screen.getByText('یادآوری جلسه')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ارسال' }));
    const dialog = await screen.findByRole('dialog', { name: 'ارسال اعلان؟' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ارسال' }));

    await screen.findByText('برای ۳ نفر ارسال شد.');
    const post = calls.find((c) => c.key === 'POST /v1/admin/notifications/send');
    expect(post).toBeTruthy();
    expect(post?.body).toMatchObject({
      audience: 'all',
      title: 'یادآوری جلسه',
      body: 'جلسه ساعت ۱۰ برگزار می‌شود.',
    });
  });
});
