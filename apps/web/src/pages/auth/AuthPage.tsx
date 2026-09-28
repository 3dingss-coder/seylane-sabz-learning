import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Phone, UserRound } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { toLatinDigits } from '@/lib/digits';
import { track } from '@/lib/telemetry';

type Mode = 'login' | 'register' | 'forgot';

/** M1 — ثبت‌نام / ورود / بازیابی رمز (one page, three modes, ≤3 fields). */
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
    return <Navigate to={from && from !== '/login' ? from : homePathFor(user.role)} replace />;
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
    if (!identifier.trim()) e.identifier = 'شماره موبایل یا ایمیل را وارد کنید.';
    if (mode !== 'forgot' && password.length < (mode === 'register' ? 8 : 1))
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
      nav(u.role === 'marketer' && !u.onboardedAt ? '/onboarding' : homePathFor(u.role), {
        replace: true,
      });
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
            label="شماره موبایل یا ایمیل"
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
          {mode !== 'forgot' && (
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
            <p role="alert" className="rounded-input bg-danger-light px-3 py-2 text-sm text-danger">
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
          {mode === 'login' && (
            <>
              <button
                type="button"
                className="min-h-12 font-bold text-primary"
                onClick={() => switchMode('register')}
              >
                حساب ندارید؟ ثبت‌نام کنید
              </button>
              <button
                type="button"
                className="min-h-12 text-text-secondary"
                onClick={() => switchMode('forgot')}
              >
                رمز را فراموش کرده‌ام
              </button>
            </>
          )}
          {mode !== 'login' && (
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
      <Link to="/gallery" className="sr-only">
        راهنمای طراحی
      </Link>
    </div>
  );
}
