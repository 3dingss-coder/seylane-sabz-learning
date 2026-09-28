import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { home, marketer, quiz, sectionDetail } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const loggedIn = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: marketer, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: marketer }),
    'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
    'GET /v1/me/mentor/nudges': () => ({ data: [] }),
  };
};

describe('M1 login → M3 home', () => {
  it('logs in with phone, stores refresh token and shows «کار بعدی»', async () => {
    const { calls } = mockApi({
      'POST /v1/auth/login': () => ({
        data: { user: marketer, idToken: 't1', refreshToken: 'r1', expiresIn: 3600 },
      }),
      'GET /v1/me/home': () => ({ data: home }),
      'GET /v1/me/notifications': () => ({ data: { unread: 2, items: [] } }),
      'GET /v1/me/mentor/nudges': () => ({ data: [] }),
    });
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('شماره موبایل یا ایمیل'), {
      target: { value: '۰۹۱۲۰۰۰۰۰۰۴' },
    });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'demo1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByTestId('next-item')).toHaveTextContent('معرفی کلی محصول فورمی');
    expect(screen.getByRole('button', { name: /ادامه/ })).toBeInTheDocument();
    // Persian digits are normalised before sending
    expect(calls.find((c) => c.key === 'POST /v1/auth/login')?.body).toEqual({
      identifier: '09120000004',
      password: 'demo1234',
    });
    expect(localStorage.getItem('ssl.refresh')).toBe('r1');
    // real product image, not a placeholder
    expect(screen.getAllByRole('img', { name: 'آموزش کیت درمانی فورمی' })[0]).toHaveAttribute(
      'src',
      '/catalog/products/sb-310350101/main.jpg',
    );
  });

  it('shows the server error message on wrong password', async () => {
    mockApi({
      'POST /v1/auth/login': () => ({
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'شماره یا رمز اشتباه است.' },
      }),
    });
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('شماره موبایل یا ایمیل'), {
      target: { value: '09120000004' },
    });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('شماره یا رمز اشتباه است.');
  });

  it('home shows empty state when nothing is assigned', async () => {
    mockApi({
      ...loggedIn(),
      'GET /v1/me/home': () => ({ data: { ...home, nextItem: null, packages: [] } }),
    });
    renderApp('/');
    expect(await screen.findByText('هنوز آموزشی ندارید')).toBeInTheDocument();
  });

  it('marketer cannot open the admin panel', async () => {
    mockApi({ ...loggedIn(), 'GET /v1/me/home': () => ({ data: home }) });
    renderApp('/admin');
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
  });
});

describe('M7/M8 quiz', () => {
  it('starts, answers one question per page, submits answers (no key on client) and shows the result', async () => {
    let submitted = false;
    const { calls } = mockApi({
      ...loggedIn(),
      'GET /v1/me/sections/seed-pkg-formi-s1': () => ({ data: sectionDetail }),
      // After submit the server reports one more used attempt; the result must stay on screen.
      'GET /v1/me/quizzes/seed-pkg-formi-s1-quiz': () => ({
        data: submitted
          ? { ...quiz, attemptInfo: { ...quiz.attemptInfo, used: quiz.attemptInfo.used + 1 } }
          : quiz,
      }),
      'POST /v1/me/quizzes/seed-pkg-formi-s1-quiz/attempts': () => ({
        status: 201,
        data: { attemptId: 'at1', attemptNumber: 1, resumed: false },
      }),
      'POST /v1/me/attempts/at1/submit': () => {
        submitted = true;
        return {
          data: {
            attemptId: 'at1',
            attemptNumber: 1,
            score: 100,
            passed: true,
            passScore: 70,
            correctCount: 2,
            total: 2,
            remainingAttempts: 2,
            nextAction: 'next_section',
            packageCompleted: false,
            pointsEarned: 20,
            review: [
              { questionId: 'q1', correct: true, explanation: '' },
              { questionId: 'q2', correct: true, explanation: 'فورمی برند این کیت است.' },
            ],
          },
        };
      },
    });
    renderApp('/quiz/seed-pkg-formi-s1');
    fireEvent.click(await screen.findByTestId('quiz-start'));
    expect(await screen.findByText('این قسمت درباره کدام محصول است؟')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /بعدی/ })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/کیت درمانی فورمی/));
    fireEvent.click(screen.getByRole('button', { name: /بعدی/ }));
    fireEvent.click(await screen.findByLabelText(/فورمی/));
    fireEvent.click(screen.getByTestId('quiz-submit'));
    fireEvent.click(await screen.findByTestId('quiz-confirm'));
    expect(await screen.findByTestId('quiz-result')).toHaveTextContent('قبول شدی');
    expect(screen.getByText('+۲۰ امتیاز')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قسمت بعد' })).toBeInTheDocument();
    // Wait for the invalidation refetch, then make sure the result is still shown.
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'GET /v1/me/quizzes/seed-pkg-formi-s1-quiz').length,
      ).toBeGreaterThan(1),
    );
    expect(screen.getByTestId('quiz-result')).toBeInTheDocument();
    const submit = calls.find((c) => c.key === 'POST /v1/me/attempts/at1/submit');
    expect(submit?.body).toEqual({ answers: { q1: 'a', q2: 'a' } });
  });

  it('blocks the quiz until the media is completed', async () => {
    mockApi({
      ...loggedIn(),
      'GET /v1/me/sections/seed-pkg-formi-s1': () => ({ data: sectionDetail }),
      'GET /v1/me/quizzes/seed-pkg-formi-s1-quiz': () => ({
        data: { ...quiz, attemptInfo: { ...quiz.attemptInfo, mediaCompleted: false } },
      }),
    });
    renderApp('/quiz/seed-pkg-formi-s1');
    expect(await screen.findByText('آزمون هنوز باز نشده')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('quiz-start')).not.toBeInTheDocument());
  });
});

describe('F9 home error state — last-known state from local cache', () => {
  it('cold start without network keeps the session and shows the cached «کار بعدی»', async () => {
    mockApi({ ...loggedIn(), 'GET /v1/me/home': () => ({ data: home }) });
    const first = renderApp('/');
    expect(await screen.findByTestId('next-item')).toHaveTextContent('معرفی کلی محصول فورمی');
    first.unmount();

    // App restarted offline: every request fails at the network layer.
    session.clear();
    localStorage.setItem('ssl.refresh', 'r2');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderApp('/');
    expect(await screen.findByTestId('next-item')).toHaveTextContent('معرفی کلی محصول فورمی');
    expect(await screen.findByText(/آخرین اطلاعات ذخیره‌شده/)).toBeInTheDocument();
  });

  it('never shows another user’s cached home and clears it on logout', async () => {
    const { lastKnown } = await import('@/lib/lastKnown');
    lastKnown.save('home', 'someone-else', home);
    expect(lastKnown.get('home', marketer.id)).toBeNull();
    lastKnown.save('home', marketer.id, home);
    expect(lastKnown.get('home', marketer.id)?.data).toEqual(home);
    lastKnown.clear();
    expect(lastKnown.get('home', marketer.id)).toBeNull();
  });
});

describe('F14 mentor nudge on Home', () => {
  it('shows the nudge message returned by the API (field `message`)', async () => {
    mockApi({
      ...loggedIn(),
      'GET /v1/me/home': () => ({ data: home }),
      'GET /v1/me/mentor/nudges': () => ({
        data: [
          {
            id: 'n1',
            ruleId: 'R1',
            message: 'دو روز است سر نزده‌ای — فقط ۵ دقیقه تا پایان قسمت بعد مانده.',
            actionRef: '/packages/seed-pkg-formi',
            createdAt: '2026-09-28T08:00:00.000Z',
          },
        ],
      }),
    });
    renderApp('/');
    const link = await screen.findByRole('link', { name: /دو روز است سر نزده‌ای/ });
    expect(link).toHaveAttribute('href', '/packages/seed-pkg-formi');
  });
});
