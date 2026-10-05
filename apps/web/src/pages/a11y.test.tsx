import { screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import {
  badges,
  catalogManifest,
  coinWallet,
  gamification,
  home,
  marketer,
  messages,
  notifications,
  packageDetail,
  pkg,
  points,
  quiz,
  sectionDetail,
} from '@/test/fixtures';
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

/**
 * Every endpoint a marketer surface can call, in one map: a page that quietly 404s would render
 * its error state and axe would bless the wrong DOM.
 */
const signedIn = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: marketer, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: marketer }),
    'GET /v1/me/home': () => ({ data: home }),
    'GET /v1/me/notifications': () => ({ data: { unread: 1, items: notifications } }),
    'GET /v1/me/mentor/nudges': () => ({ data: [] }),
    'GET /v1/me/sections/seed-pkg-formi-s1': () => ({ data: sectionDetail }),
    'GET /v1/me/quizzes/seed-pkg-formi-s1-quiz': () => ({ data: quiz }),
    'GET /v1/me/packages': () => ({ data: [pkg] }),
    [`GET /v1/me/packages/${pkg.id}`]: () => ({ data: packageDetail }),
    'GET /v1/me/points': () => ({ data: points }),
    'GET /v1/me/badges': () => ({ data: badges }),
    'GET /v1/me/messages': () => ({ data: messages }),
    'GET /v1/me/gamification': () => ({ data: gamification }),
    'GET /v1/me/coins': () => ({ data: coinWallet }),
    // the gallery reads the real brand catalogue, not the API — and that endpoint answers with a
    // bare manifest, not the `{ data }` envelope, so it needs `raw`
    'GET /catalog/manifest.json': () => ({ raw: catalogManifest }),
  };
};

describe('a11y (axe, jsdom)', () => {
  it('login page', async () => {
    mockApi({});
    const { container } = renderApp('/login');
    await screen.findByRole('button', { name: 'ورود' });
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
    expect(await violations(container)).toEqual([]);
  });

  // PHASE-7 §7.2 — the DoD says *every* marketer page, not a sample of three.
  it('training list (/learn)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/learn');
    await screen.findByRole('heading', { name: 'آموزش‌ها' });
    expect(await violations(container)).toEqual([]);
  });

  it('package (/packages/:id)', async () => {
    mockApi(signedIn());
    const { container } = renderApp(`/packages/${pkg.id}`);
    await screen.findByRole('heading', { name: pkg.title });
    expect(await violations(container)).toEqual([]);
  });

  it('station (/sections/:id)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/sections/seed-pkg-formi-s1');
    await screen.findByRole('heading', { name: /معرفی کلی محصول فورمی/ });
    expect(await violations(container)).toEqual([]);
  });

  it('quiz (/quiz/:sectionId)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/quiz/seed-pkg-formi-s1');
    await screen.findByTestId('quiz-start');
    expect(await violations(container)).toEqual([]);
  });

  it('messages (/messages)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/messages');
    await screen.findByRole('heading', { name: 'اعلان‌ها و پیام‌ها' });
    expect(await violations(container)).toEqual([]);
  });

  it('points and badges (/cards)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/cards');
    await screen.findByRole('heading', { name: 'امتیاز و نشان‌ها' });
    expect(await violations(container)).toEqual([]);
  });

  it('mentor (/mentor)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/mentor');
    await screen.findByRole('heading', { name: 'منتور' });
    expect(await violations(container)).toEqual([]);
  });

  it('design gallery (/gallery)', async () => {
    mockApi(signedIn());
    const { container } = renderApp('/gallery');
    await screen.findByRole('heading', { name: 'بنیادهای توکن (فاز ۱)' });
    expect(await violations(container)).toEqual([]);
  });
});
