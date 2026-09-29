import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Phone, UserRound } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { canAccess } from '@/lib/roles';
import { toLatinDigits } from '@/lib/digits';
import { track } from '@/lib/telemetry';

type Mode = 'login' | 'register' | 'forgot';

/** MVP phone-only login; registration/reset remain separate flows. */
export function AuthPage({ initial = 'login' }: { initial?: Mode }) {
  const { status, user, login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<Mode>(initial);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated' && user) {
    const from = (loc.state as { from?: string } | null)?.from;
    return (
      <Navigate
        to={from && from !== '/login' && canAccess(user.role, from) ? from : homePathFor(user.role)}
        replace
      />
    );
  }

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === 'register') track('signup_started');
    setErrors({});
    setFormError('');
    setInfo('');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'register' && name.trim().length < 2) e.name = 'نام و نام خانوادگی را بنویسید.';
    if (mode === 'login' && !/^09\d{9}$/.test(toLatinDigits(identifier.trim())))
      e.identifier = 'شماره موبایل معتبر وارد کنید.';
    else if (!identifier.trim()) e.identifier = 'شماره موبایل یا ایمیل را وارد کنید.';
    if (
      (mode === 'register' && password.length < 8) ||
      (mode === 'login' && import.meta.env.VITE_REQUIRE_PASSWORD === 'true' && !password)
    )
      e.password = mode === 'register' ? 'رمز باید حداقل ۸ نویسه باشد.' : 'رمز را وارد کنید.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    const id = toLatinDigits(identifier.trim());
    try {
      if (mode === 'forgot') {
        await api.post('/auth/password-reset', { identifier: id });
        setInfo(
          'اگر حسابی با این مشخصات باشد، راهنمای بازیابی ارسال شد. اگر با شماره موبایل ثبت‌نام کرده‌اید، از مدیر خود بخواهید رمز را بازتنظیم کند.',
        );
        return;
      }
      const u =
        mode === 'login'
          ? await login(id, password)
          : await register({ name: name.trim(), identifier: id, password });
      // Return to the page that sent the user here (e.g. /admin/users) when their role allows it.
      const from = (loc.state as { from?: string } | null)?.from;
      const target =
        u.role === 'marketer' && !u.onboardedAt
          ? '/onboarding'
          : from && from !== '/login' && canAccess(u.role, from)
            ? from
            : homePathFor(u.role);
      nav(target, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        const f = e.fields;
        if (Object.keys(f).length) setErrors(f);
        else if (e.code === 'CONFLICT') setErrors({ identifier: e.message });
        else setFormError(e.message);
      } else setFormError('خطایی رخ داد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'ورود' : mode === 'register' ? 'ثبت‌نام' : 'بازیابی رمز';
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-[400px] p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/icons/logo-full.png" alt="هلدینگ سیلانه‌سبز" className="h-16 w-auto" />
          <h1 className="text-xl font-bold text-text">سیلانه‌سبز لرنینگ</h1>
          <p className="text-sm text-text-secondary">{title}</p>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-busy={busy}>
          {mode === 'register' && (
            <Input
              label="نام و نام خانوادگی"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              icon={<UserRound className="size-5" />}
              disabled={busy}
            />
          )}
          <Input
            label={mode === 'login' ? 'شماره موبایل' : 'شماره موبایل یا ایمیل'}
            ltr
            inputMode={/^[\d۰-۹+]*$/.test(identifier) ? 'tel' : 'email'}
            autoComplete="username"
            placeholder="09xxxxxxxxx"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={errors.identifier}
            icon={<Phone className="size-5" />}
            disabled={busy}
          />
          {(mode === 'register' ||
            (mode === 'login' && import.meta.env.VITE_REQUIRE_PASSWORD === 'true')) && (
            <Input
              label="رمز عبور"
              type="password"
              ltr
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint={mode === 'register' ? 'حداقل ۸ نویسه' : undefined}
              icon={<KeyRound className="size-5" />}
              disabled={busy}
            />
          )}
          {formError && (
            <p
              role="alert"
              className="rounded-input bg-danger-light px-3 py-2 text-sm text-danger-fg"
            >
              {formError}
            </p>
          )}
          {info && (
            <p role="status" className="rounded-input bg-info-light px-3 py-2 text-sm text-text">
              {info}
            </p>
          )}
          <Button type="submit" size="lg" block loading={busy} className="mt-2">
            {mode === 'login' ? 'ورود' : mode === 'register' ? 'ثبت‌نام' : 'ارسال راهنما'}
          </Button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-1 text-sm">
          {mode === 'login' ? (
            <button
              type="button"
              className="min-h-12 font-bold text-primary"
              onClick={() => switchMode('register')}
            >
              حساب ندارید؟ ثبت‌نام کنید
            </button>
          ) : (
            <button
              type="button"
              className="min-h-12 font-bold text-primary"
              onClick={() => switchMode('login')}
            >
              حساب دارید؟ وارد شوید
            </button>
          )}
        </div>
      </Card>
      {mode === 'login' && (
        <Card className="mt-4 w-full max-w-[400px]">
          <p className="mb-2 text-sm font-bold text-text">ورود سریع آزمایشی</p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.phone}
                type="button"
                className="min-h-12 rounded-input border border-border px-2 text-sm text-text hover:border-primary/40"
                onClick={() => {
                  setIdentifier(a.phone);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Card>
      )}
      <Link to="/gallery" className="sr-only">
        راهنمای طراحی
      </Link>
    </div>
  );
}

/** Seeded accounts (functions/src/seed/demo.ts). */
const DEMO_ACCOUNTS = [
  { phone: '09120000002', label: 'ادمین' },
  { phone: '09120000003', label: 'مدیر تیم' },
  { phone: '09120000004', label: 'بازاریاب' },
];
