import { fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { home, marketer, quiz, sectionDetail } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

/**
 * Structural accessibility checks (WCAG 2.1 A/AA rules axe can evaluate in jsdom).
 * Colour contrast needs real layout, so it is covered by the Playwright axe spec (e2e/a11y.spec.ts).
 */
async function violations(container: Element) {
  const res = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const signedIn = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: marketer, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: marketer }),
    'GET /v1/me/home': () => ({ data: home }),
    'GET /v1/me/notifications': () => ({ data: { unread: 1, items: [] } }),
    'GET /v1/me/mentor/nudges': () => ({ data: [] }),
    // «تنظیمات اعلان» on the profile screen: two protected rows, two switches, one optional push.
    'GET /v1/me/notification-prefs': () => ({
      data: {
        prefs: { mutedCategories: [], preferredHour: null, optIns: {}, updatedAt: null },
        protectedCategories: ['deadlines', 'health'],
        categories: [
          {
            key: 'deadlines',
            label: 'تکالیف و مهلت‌ها',
            hint: 'انتصاب تکلیف، یادآوری و عبور از مهلت.',
            mutable: false,
          },
          { key: 'quizzes', label: 'آزمون‌ها', hint: 'نتیجه آزمون و نمره.', mutable: true },
          { key: 'health', label: 'وضعیت دوره', hint: 'پرونده‌ی یادگیری شما.', mutable: false },
        ],
        optInOptions: [
          {
            key: 'evening_nudge',
            name: 'یادآوری عصرگاهی',
            description: 'هر روز ۱۸:۰۰، فقط اگر خودتان بخواهید.',
          },
        ],
      },
    }),
    'PUT /v1/me/notification-prefs': (body: unknown) => ({
      data: { ...(body as object), updatedAt: 'now' },
    }),
    'GET /v1/me/sections/seed-pkg-formi-s1': () => ({ data: sectionDetail }),
    'GET /v1/me/quizzes/seed-pkg-formi-s1-quiz': () => ({ data: quiz }),
  };
};

describe('a11y (axe, jsdom)', () => {
  it('login page', async () => {
    mockApi({});
    const { container } = renderApp('/login');
    await screen.findByRole('button', { name: 'ورود' });
    expect(await violations(container)).toEqual([]);
  });

  it('sign-up page, including the open province list', async () => {
    mockApi({});
    const { container } = renderApp('/register');
    fireEvent.click(await screen.findByLabelText('انتخاب محل فعالیت شما'));
    await screen.findByRole('listbox', { name: 'استان‌های ایران' });
    expect(await violations(container)).toEqual([]);
  });

  it('sign-up page with the city list open', async () => {
    mockApi({});
    const { container } = renderApp('/register');
    fireEvent.click(await screen.findByLabelText('انتخاب محل فعالیت شما'));
    const provinces = await screen.findByRole('listbox', { name: 'استان‌های ایران' });
    fireEvent.change(screen.getByRole('combobox', { name: 'جستجوی استان' }), {
      target: { value: 'یزد' },
    });
    fireEvent.click(within(provinces).getByRole('option', { name: 'یزد' }));
    fireEvent.click(screen.getByLabelText('شهر'));
    await screen.findByRole('listbox', { name: 'شهرهای استان یزد' });
    expect(await violations(container)).toEqual([]);
  });

  it('marketer home («کار بعدی»)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/');
    await screen.findByTestId('next-item');
    expect(await violations(container)).toEqual([]);
  });

  it('profile', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/profile');
    await screen.findByRole('button', { name: /خروج/ });
    // The preference card is the newest part of this screen: a locked switch must still announce its
    // state and its reason, so wait for it before axe looks at the tree.
    await screen.findByRole('switch', { name: 'اعلان‌های تکالیف و مهلت‌ها' });
    expect(await violations(container)).toEqual([]);
  });

  it('profile, with a category switch clicked', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/profile');
    const quizzes = await screen.findByRole('switch', { name: 'اعلان‌های آزمون‌ها' });
    fireEvent.click(quizzes);
    await screen.findByRole('switch', { name: 'اعلان‌های آزمون‌ها', checked: false });
    expect(await violations(container)).toEqual([]);
  });
});
