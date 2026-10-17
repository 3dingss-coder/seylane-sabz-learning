import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { AuthPage } from './AuthPage';
import { OnboardingPage } from './OnboardingPage';
import { StaffLoginPage } from './StaffLoginPage';

const { login, register, staffLogin, setUser, refreshMe, post } = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  staffLogin: vi.fn(),
  setUser: vi.fn(),
  refreshMe: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    status: 'anonymous',
    user: null,
    login,
    register,
    staffLogin,
    setUser,
    refreshMe,
  }),
  homePathFor: () => '/',
}));

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
    get fields(): Record<string, string> {
      return {};
    }
  }
  return {
    api: { post: (...args: unknown[]) => post(...args) },
    ApiError,
  };
});

function renderAuth(initial: 'login' | 'register' = 'login') {
  return render(
    <MemoryRouter>
      <AuthPage initial={initial} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  login.mockReset();
  register.mockReset();
  staffLogin.mockReset();
  setUser.mockReset();
  refreshMe.mockReset();
  post.mockReset();
  post.mockResolvedValue({ onboardedAt: '2026-10-16T00:00:00.000Z' });
});

describe('AuthPage (must-preserve marketer flow)', () => {
  it('login is phone-or-national-code only — no password field', () => {
    renderAuth();
    expect(screen.getByLabelText('شماره موبایل یا کد ملی')).toBeInTheDocument();
    expect(screen.queryByLabelText('رمز عبور')).toBeNull();
    expect(screen.getByRole('button', { name: 'ورود' })).toBeInTheDocument();
  });

  it('unknown identifier converts to registration, keeping the entered identifier', async () => {
    login.mockRejectedValue(new ApiError('NOT_FOUND', 'not found', 404));
    renderAuth();
    const idField = screen.getByLabelText('شماره موبایل یا کد ملی');
    fireEvent.change(idField, { target: { value: '09123456789' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByText(/هنوز ثبت‌نام نشده است/)).toBeInTheDocument();
    expect(screen.getByLabelText('نام و نام خانوادگی')).toBeInTheDocument();
    expect(screen.getByLabelText('انتخاب محل فعالیت شما')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت‌نام و ورود' })).toBeInTheDocument();

    // Complete the activity location: the province-dependent identity field reappears
    // carrying the identifier the user already typed (phone province → شماره موبایل).
    fireEvent.click(screen.getByLabelText('انتخاب محل فعالیت شما'));
    const provinces = await screen.findByRole('listbox', { name: 'استان‌های ایران' });
    fireEvent.click(await within(provinces).findByRole('option', { name: 'خراسان رضوی' }));
    fireEvent.click(screen.getByLabelText('شهر'));
    const cities = await screen.findByRole('listbox', { name: /شهرهای استان/ });
    fireEvent.click(await within(cities).findByRole('option', { name: 'تربت حیدریه' }));
    expect(screen.getByLabelText('شماره موبایل')).toHaveDisplayValue('09123456789');
  });

  it('register mode keeps name + residence + province-dependent identity + mode switch', () => {
    renderAuth('register');
    expect(screen.getByLabelText('نام و نام خانوادگی')).toBeInTheDocument();
    expect(screen.getByLabelText('انتخاب محل فعالیت شما')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت‌نام و ورود' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'حساب دارید؟ وارد شوید' }));
    expect(screen.getByRole('button', { name: 'ورود' })).toBeInTheDocument();
  });

  it('shows the provided mascot asset as a decorative welcome presence', () => {
    const { container } = renderAuth();
    const mascot = container.querySelector('img[src="/brand/mascot.webp"]');
    expect(mascot).not.toBeNull();
    expect(mascot).toHaveAttribute('alt', '');
  });
});

describe('OnboardingPage (must-preserve three-slide flow)', () => {
  function renderOnboarding() {
    return render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    );
  }

  it('walks real slides with next/skip/start and finishes via the onboarding API', async () => {
    renderOnboarding();
    expect(screen.getByText('چه چیزی یاد بگیرم؟')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بعدی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رد شدن' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getByText('چطور پیش بروم؟')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getByText('اگر عقب بمانم چه؟')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'شروع' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'رد شدن' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'شروع' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/me/onboarding'));
  });

  it('skip finishes without walking the slides', async () => {
    renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'رد شدن' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/me/onboarding'));
    expect(screen.queryByText('چطور پیش بروم؟')).toBeNull();
  });
});

describe('StaffLoginPage (staff model preserved, formal tone)', () => {
  it('keeps username + password sign-in for panels', () => {
    render(
      <MemoryRouter>
        <StaffLoginPage panel="admin" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('نام کاربری')).toBeInTheDocument();
    expect(screen.getByLabelText('رمز عبور')).toBeInTheDocument();
    expect(screen.getByText('پنل ادمین')).toBeInTheDocument();
  });
});
