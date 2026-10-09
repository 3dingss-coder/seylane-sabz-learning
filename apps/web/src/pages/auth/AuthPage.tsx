import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Phone, UserRound } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand/BrandBackdrop';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { canAccess } from '@/lib/roles';
import { normalizeIranianMobile } from '@/lib/phone';
import { track } from '@/lib/telemetry';

type Mode = 'login' | 'register';

/** Phone-only account creation is supported; a phone number never authenticates an existing user. */
export function AuthPage({ initial = 'login' }: { initial?: Mode }) {
  const { status, user, login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<Mode>(initial);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [residence, setResidence] = useState<Residence>({ province: '', city: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
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

  const switchMode = (next: Mode) => {
    setMode(next);
    if (next === 'register') track('signup_started');
    setErrors({});
    setFormError('');
    setNotice('');
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (mode === 'register' && name.trim().length < 2) next.name = 'نام و نام خانوادگی را بنویسید.';
    if (!normalizeIranianMobile(phone)) next.phone = 'شماره موبایل معتبر وارد کنید.';
    if (mode === 'register') {
      if (!residence.province) next.province = 'استان محل فعالیت خود را انتخاب کنید.';
      else if (!residence.city) next.city = 'شهر محل فعالیت خود را انتخاب کنید.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    if (!validate()) return;
    const normalizedPhone = normalizeIranianMobile(phone);
    if (!normalizedPhone) return;
    setBusy(true);
    try {
      if (mode === 'register') {
        await register({
          name: name.trim(),
          phone: normalizedPhone,
          province: residence.province,
          city: residence.city,
        });
        setNotice(
          'درخواست دریافت شد. این پاسخ وجود یا نبود حساب فعلی را نشان نمی‌دهد؛ شماره تأیید نشده و نشست یا دسترسی صادر نمی‌شود.',
        );
        return;
      }

      const current = await login(normalizedPhone);
      const from = (loc.state as { from?: string } | null)?.from;
      const target =
        current.role === 'marketer' && !current.onboardedAt
          ? '/onboarding'
          : from && from !== '/login' && canAccess(current.role, from)
            ? from
            : homePathFor(current.role);
      nav(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields;
        if (Object.keys(fields).length) setErrors(fields);
        else if (err.code === 'CONFLICT') setErrors({ phone: err.message });
        else setFormError(err.message);
      } else {
        setFormError(
          'خطایی رخ داد. نتیجهٔ درخواست ممکن است نامشخص باشد؛ پیش از تکرار با پشتیبانی سامانه هماهنگ کنید.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'ورود' : 'ثبت‌نام';
  return (
    <div className="relative flex min-h-dvh flex-col items-center bg-background px-4 pb-8">
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
        <h1 className="text-2xl font-extrabold text-white">آکادمی سیلانه</h1>
        <p className="text-sm text-white/85">{title}</p>
      </div>
      <Card className="animate-fade-up relative mt-6 w-full max-w-[400px] p-6 shadow-lg">
        <p
          role="note"
          className="mb-4 rounded-input bg-info-light px-3 py-2 text-sm leading-6 text-text"
        >
          {mode === 'login'
            ? 'شمارهٔ تلفن به‌تنهایی هویت را ثابت نمی‌کند. ورود به حساب‌های موجود با شماره ممکن نیست؛ نشست معتبر قبلی را نگه دارید یا اگر حساب تازه می‌خواهید ثبت‌نام کنید. در حال حاضر کد پیامکی یا روش تأیید دیگری فعال نیست.'
            : 'در صورت آزاد بودن شماره، فقط یک حساب غیرفعال بازاریاب ثبت می‌شود. شماره تأیید نمی‌شود، نشست یا دسترسی صادر نمی‌شود و پاسخ، وجود یا نبود حساب قبلی را نشان نمی‌دهد.'}
        </p>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-busy={busy}>
          {mode === 'register' && (
            <Input
              label="نام و نام خانوادگی"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
              icon={<UserRound className="size-5" />}
              disabled={busy}
            />
          )}
          <Input
            label="شماره موبایل"
            ltr
            inputMode="tel"
            autoComplete="tel"
            placeholder="09xxxxxxxxx"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setErrors((current) => ({ ...current, phone: '' }));
              setFormError('');
              setNotice('');
            }}
            error={errors.phone}
            icon={<Phone className="size-5" />}
            disabled={busy}
          />
          {mode === 'register' && (
            <ResidencePicker
              value={residence}
              onChange={setResidence}
              label="انتخاب محل فعالیت شما"
              provinceError={errors.province}
              cityError={errors.city}
              disabled={busy}
            />
          )}
          {notice && (
            <p role="status" className="rounded-input bg-info-light px-3 py-2 text-sm text-text">
              {notice}
            </p>
          )}
          {formError && (
            <p
              role="alert"
              className="rounded-input bg-danger-light px-3 py-2 text-sm text-danger-fg"
            >
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" block loading={busy} className="mt-2">
            {mode === 'login' ? 'ورود' : 'ارسال درخواست ثبت‌نام'}
          </Button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-1 text-sm">
          {mode === 'login' ? (
            <button
              type="button"
              className="min-h-12 font-bold text-primary"
              onClick={() => switchMode('register')}
            >
              حساب تازه می‌خواهید؟ ثبت‌نام کنید
            </button>
          ) : (
            <button
              type="button"
              className="min-h-12 font-bold text-primary"
              onClick={() => switchMode('login')}
            >
              بازگشت به ورود
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
