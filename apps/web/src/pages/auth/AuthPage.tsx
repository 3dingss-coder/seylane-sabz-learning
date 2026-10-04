import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Phone, UserRound } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand/BrandBackdrop';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { canAccess } from '@/lib/roles';
import { toLatinDigits } from '@/lib/digits';
import { track } from '@/lib/telemetry';

type Mode = 'login' | 'register';

/** Phone-only sign-in for marketers; unknown numbers are sent to sign-up, which signs them in directly. */
export function AuthPage({ initial = 'login' }: { initial?: Mode }) {
  const { status, user, login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<Mode>(initial);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [residence, setResidence] = useState<Residence>({ province: '', city: '' });
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
    if (!/^09\d{9}$/.test(toLatinDigits(identifier.trim())))
      e.identifier = 'شماره موبایل معتبر وارد کنید.';
    if (mode === 'register') {
      // Residence is part of sign-up: the admin/manager panels get the region of every marketer.
      if (!residence.province) e.province = 'استان محل سکونت را انتخاب کنید.';
      else if (!residence.city) e.city = 'شهر محل سکونت را انتخاب کنید.';
    }
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
      const u =
        mode === 'login'
          ? await login(id)
          : await register({
              name: name.trim(),
              phone: id,
              province: residence.province,
              city: residence.city,
            });
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
      if (mode === 'login' && e instanceof ApiError && e.code === 'NOT_FOUND') {
        // Not registered yet: move to sign-up with the number kept; sign-up logs them in directly.
        setMode('register');
        track('signup_started');
        setErrors({});
        setInfo(
          'این شماره هنوز ثبت‌نام نکرده است. نام خود را وارد کنید و ثبت‌نام را بزنید تا مستقیم وارد شوید.',
        );
      } else if (e instanceof ApiError) {
        const f = e.fields;
        if (Object.keys(f).length) setErrors(f);
        else if (e.code === 'CONFLICT') setErrors({ identifier: e.message });
        else setFormError(e.message);
      } else setFormError('خطایی رخ داد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'ورود' : 'ثبت‌نام';
  return (
    <div className="relative flex min-h-dvh flex-col items-center bg-background px-4 pb-8">
      {/* brand hero behind the top of the form */}
      <div className="absolute inset-x-0 top-0 h-72 overflow-hidden rounded-b-[36px] sm:h-80">
        <BrandBackdrop />
      </div>
      <div className="relative mt-10 flex flex-col items-center gap-3 text-center sm:mt-14">
        <span className="animate-pop rounded-hero bg-white p-3 shadow-lg">
          <img
            src="/icons/logo-full.png"
            alt="هلدینگ سیلانه‌سبز"
            width={160}
            height={64}
            className="h-14 w-auto"
          />
        </span>
        <h1 className="text-2xl font-extrabold text-white">سیلانه‌سبز لرنینگ</h1>
        <p className="text-sm text-white/85">{title}</p>
      </div>
      <Card className="animate-fade-up relative mt-6 w-full max-w-[400px] p-6 shadow-lg">
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
            label="شماره موبایل"
            ltr
            inputMode="tel"
            autoComplete="username"
            placeholder="09xxxxxxxxx"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={errors.identifier}
            icon={<Phone className="size-5" />}
            disabled={busy}
          />
          {mode === 'register' && (
            <ResidencePicker
              value={residence}
              onChange={setResidence}
              provinceError={errors.province}
              cityError={errors.city}
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
            {mode === 'login' ? 'ورود' : 'ثبت‌نام و ورود'}
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
      <Link to="/gallery" className="sr-only">
        راهنمای طراحی
      </Link>
    </div>
  );
}
