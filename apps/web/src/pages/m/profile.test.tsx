import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';
import { toPersianDigits } from '@/lib/digits';
import { marketer } from '@/test/fixtures';
import type { Me } from '@/lib/types';

/** ProfilePage — shared account management for every role (name, password, logout). */

const MARKETER: Me = {
  ...marketer,
  id: 'u-1',
  name: 'سارا محمدی',
  phone: '09121234567',
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const signIn = (extra: Record<string, unknown> = {}) => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: MARKETER, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: MARKETER }),
    'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
    ...extra,
  };
};

/** The shape `GET /me/notification-prefs` really answers with (see NotificationPrefsCard). */
const prefsView = () => ({
  prefs: { mutedCategories: [], preferredHour: 18, optIns: {}, updatedAt: null },
  protectedCategories: ['deadlines', 'health'],
  categories: [
    { key: 'deadlines', label: 'تکالیف و مهلت‌ها', hint: 'x', mutable: false },
    { key: 'quizzes', label: 'آزمون‌ها', hint: 'x', mutable: true },
  ],
  optInOptions: [],
});

describe('ProfilePage — real account management', () => {
  it('saves the display name through PATCH /me and shows the real toast', async () => {
    const { calls } = mockApi(
      signIn({
        'PATCH /v1/me': () => ({ data: { ...MARKETER, name: 'سارا محمدی‌نژاد' } }),
        'GET /v1/me/notification-prefs': () => ({ data: prefsView() }),
      }),
    );
    renderApp('/profile');
    // identity block shows the real role label and the real contact
    await screen.findByText(/بازاریاب/, {}, { timeout: 15000 });
    expect(screen.getByText(toPersianDigits('09121234567'))).toBeInTheDocument();
    const name = screen.getByLabelText('نام و نام خانوادگی') as HTMLInputElement;
    expect(name.value).toBe('سارا محمدی');
    fireEvent.change(name, { target: { value: 'سارا محمدی‌نژاد' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره نام' }));
    await screen.findByText('ذخیره شد.', {}, { timeout: 15000 });
    const body = calls.find((c) => c.key === 'PATCH /v1/me')?.body as { name: string };
    expect(body.name).toBe('سارا محمدی‌نژاد');
  }, 20000);

  it('enforces the 8-character password rule and posts the real change', async () => {
    const { calls } = mockApi(
      signIn({
        'GET /v1/me/notification-prefs': () => ({ data: prefsView() }),
        'POST /v1/me/password': () => ({ data: { ok: true } }),
      }),
    );
    renderApp('/profile');
    await screen.findByLabelText('رمز فعلی', {}, { timeout: 15000 });
    fireEvent.change(screen.getByLabelText('رمز فعلی'), { target: { value: 'old-pass-1' } });
    fireEvent.change(screen.getByLabelText('رمز جدید'), { target: { value: 'کوتاه' } });
    fireEvent.click(screen.getByRole('button', { name: 'تغییر رمز' }));
    // client-side rule fires before any request
    expect(
      await screen.findByText('رمز جدید باید حداقل ۸ نویسه باشد.', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /v1/me/password')).toBe(false);
    fireEvent.change(screen.getByLabelText('رمز جدید'), { target: { value: 'new-pass-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'تغییر رمز' }));
    await screen.findByText('رمز عوض شد.', {}, { timeout: 15000 });
    const body = calls.find((c) => c.key === 'POST /v1/me/password')?.body as {
      currentPassword: string;
      newPassword: string;
    };
    expect(body.currentPassword).toBe('old-pass-1');
    expect(body.newPassword).toBe('new-pass-12');
  }, 20000);

  it('logs out of the real session and returns to the login screen', async () => {
    const { calls } = mockApi(
      signIn({
        'POST /v1/auth/logout': () => ({ data: { ok: true } }),
        'GET /v1/me/notification-prefs': () => ({ data: prefsView() }),
      }),
    );
    renderApp('/profile');
    fireEvent.click(
      await screen.findByRole('button', { name: 'خروج از حساب' }, { timeout: 15000 }),
    );
    // the real logout endpoint is called and the app lands on login
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /v1/auth/logout')).toBe(true));
    await screen.findByRole('button', { name: 'ورود' }, { timeout: 15000 });
  }, 20000);
});
