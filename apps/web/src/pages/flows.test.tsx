import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
      'POST /v1/auth/phone-login': () => ({
        data: { user: marketer, idToken: 't1', refreshToken: 'r1', expiresIn: 3600 },
      }),
      'GET /v1/me/home': () => ({ data: home }),
      'GET /v1/me/notifications': () => ({ data: { unread: 2, items: [] } }),
      'GET /v1/me/mentor/nudges': () => ({ data: [] }),
    });
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('شماره موبایل'), {
      target: { value: '۰۹۱۲۰۰۰۰۰۰۴' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByTestId('next-item')).toHaveTextContent('معرفی کلی محصول فورمی');
    expect(screen.getByRole('button', { name: /ادامه/ })).toBeInTheDocument();
    // Persian digits are normalised before sending
    expect(calls.find((c) => c.key === 'POST /v1/auth/phone-login')?.body).toEqual({
      phone: '09120000004',
    });
    expect(localStorage.getItem('ssl.refresh')).toBe('r1');
    // real product image, not a placeholder
    expect(screen.getAllByRole('img', { name: 'آموزش کیت درمانی فورمی' })[0]).toHaveAttribute(
      'src',
      '/catalog/products/sb-310350101/main.jpg',
    );
  });

  it('unknown phone moves to sign-up with the number kept', async () => {
    mockApi({
      'POST /v1/auth/phone-login': () => ({
        status: 404,
        error: {
          code: 'NOT_FOUND',
          message: 'این شماره هنوز ثبت‌نام نکرده است. ابتدا ثبت‌نام کنید.',
        },
      }),
    });
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('شماره موبایل'), {
      target: { value: '09120000004' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByRole('button', { name: 'ثبت‌نام و ورود' })).toBeInTheDocument();
    expect(screen.getByLabelText('شماره موبایل')).toHaveValue('09120000004');
    expect(screen.getByLabelText('نام و نام خانوادگی')).toBeInTheDocument();
    expect(screen.getByLabelText('انتخاب محل فعالیت شما')).toBeInTheDocument();
  });

  it('signs up with name, phone and محل فعالیت (province → city) in one step', async () => {
    const { calls } = mockApi({
      'POST /v1/auth/phone-register': () => ({
        data: { user: marketer, idToken: 't1', refreshToken: 'r1', expiresIn: 3600 },
      }),
      'GET /v1/me/home': () => ({ data: home }),
      'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
      'GET /v1/me/mentor/nudges': () => ({ data: [] }),
    });
    renderApp('/register');
    fireEvent.change(await screen.findByLabelText('نام و نام خانوادگی'), {
      target: { value: 'نگار محمدی' },
    });
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '۰۹۱۲۰۰۰۰۱۱۱' },
    });

    // Province: search inside the long list, then pick — this reveals the city field.
    expect(screen.queryByLabelText('شهر')).toBeNull();
    fireEvent.click(screen.getByLabelText('انتخاب محل فعالیت شما'));
    const provinces = await screen.findByRole('listbox', { name: 'استان‌های ایران' });
    await waitFor(() => expect(within(provinces).getAllByRole('option')).toHaveLength(31));
    fireEvent.change(screen.getByRole('combobox', { name: 'جستجوی استان' }), {
      target: { value: 'خراسان رضوی' },
    });
    fireEvent.click(within(provinces).getByRole('option', { name: 'خراسان رضوی' }));
    expect(screen.getByLabelText('شهر')).toBeInTheDocument();

    // City: only خراسان رضوی cities are offered.
    fireEvent.click(screen.getByLabelText('شهر'));
    const cities = await screen.findByRole('listbox', { name: 'شهرهای استان خراسان رضوی' });
    fireEvent.change(screen.getByRole('combobox', { name: 'جستجوی شهر' }), {
      target: { value: 'سبزوار' },
    });
    fireEvent.click(within(cities).getByRole('option', { name: 'سبزوار' }));

    fireEvent.click(screen.getByRole('button', { name: 'ثبت‌نام و ورود' }));
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /v1/auth/phone-register')?.body).toEqual({
      name: 'نگار محمدی',
      phone: '09120000111',
      province: 'خراسان رضوی',
      city: 'سبزوار',
    });
  });

  it('will not sign up without a residence', async () => {
    const { calls } = mockApi({});
    renderApp('/register');
    fireEvent.change(await screen.findByLabelText('نام و نام خانوادگی'), {
      target: { value: 'نگار محمدی' },
    });
    fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: '09120000111' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت‌نام و ورود' }));
    expect(await screen.findByText('استان محل فعالیت خود را انتخاب کنید.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /v1/auth/phone-register')).toBe(false);
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
    // No admin UI — an explanation instead, with a way back to the marketer home.
    expect(await screen.findByRole('heading', { name: 'پنل ادمین' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /ادمین/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /بازگشت به اپ بازاریاب/ }));
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
  });

  it('shows an error instead of faking playback when native media decoding fails', async () => {
    const { calls } = mockApi({
      ...loggedIn(),
      'GET /v1/me/sections/seed-pkg-formi-s1': () => ({ data: sectionDetail }),
      'GET /v1/me/sections/seed-pkg-formi-s1/media': () => ({
        data: {
          source: 'file',
          youtubeId: null,
          url: '/v1/files/signed/tok1',
          mime: 'audio/mp4',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
      'POST /v1/me/sections/seed-pkg-formi-s1/progress': () => ({
        data: { playedSeconds: 10, maxPositionSec: 10, percent: 25, completed: false },
      }),
    });
    renderApp('/sections/seed-pkg-formi-s1');
    const audioEl = await screen.findByTestId('media');
    expect(audioEl.tagName).toBe('AUDIO');
    fireEvent.error(audioEl);
    expect(await screen.findByTestId('media-error')).toHaveTextContent('بارگذاری نشد');
    expect(screen.queryByLabelText('موقعیت پخش')).not.toBeInTheDocument();
    expect(
      calls.filter((c) => c.key === 'GET /v1/me/sections/seed-pkg-formi-s1/media').length,
    ).toBe(1);
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

  it('opens the quiz even before the media is completed', async () => {
    mockApi({
      ...loggedIn(),
      'GET /v1/me/sections/seed-pkg-formi-s1': () => ({ data: sectionDetail }),
      'GET /v1/me/quizzes/seed-pkg-formi-s1-quiz': () => ({
        data: {
          ...quiz,
          attemptInfo: { ...quiz.attemptInfo, mediaCompleted: false, canAttempt: true },
        },
      }),
    });
    renderApp('/quiz/seed-pkg-formi-s1');
    expect(await screen.findByTestId('quiz-start')).toBeInTheDocument();
    expect(screen.queryByText('آزمون هنوز باز نشده')).not.toBeInTheDocument();
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

describe('panels live in the same app under /admin', () => {
  it('a marketer opening /admin gets an explanation and can switch to an admin account', async () => {
    mockApi({ ...loggedIn(), 'POST /v1/auth/logout': () => ({ data: null }) });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'پنل ادمین' })).toBeInTheDocument();
    expect(screen.getByText(/با حساب «بازاریاب» وارد شده‌اید/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ورود با حساب ادمین' }));
    expect(await screen.findByRole('button', { name: 'ورود' })).toBeInTheDocument();
    expect(localStorage.getItem('ssl.refresh')).toBeNull();
  });
});
