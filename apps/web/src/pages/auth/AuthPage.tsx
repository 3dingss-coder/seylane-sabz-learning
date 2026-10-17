import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint, Phone, UserRound } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand/BrandBackdrop';
import { Mascot } from '@/components/brand/Mascot';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { canAccess } from '@/lib/roles';
import { toLatinDigits } from '@/lib/digits';
import {
  isNationalCodeShape,
  normalizeNationalCode,
  provinceUsesNationalCode,
} from '@/lib/nationalCode';
import { track } from '@/lib/telemetry';

type Mode = 'login' | 'register';

/** Phone or national-code sign-in for marketers; unknown identifiers move to sign-up. */
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

  const requiresNationalCode = provinceUsesNationalCode(residence.province);
  const registrationIdentityVisible = Boolean(residence.province && residence.city);
  const loginIdentifierIsNationalCode = mode === 'login' && isNationalCodeShape(identifier);
  const fieldUsesNationalCode =
    mode === 'register' ? requiresNationalCode : loginIdentifierIsNationalCode;

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === 'register') track('signup_started');
    setErrors({});
    setFormError('');
    setInfo('');
  };

  const handleResidenceChange = (next: Residence) => {
    if (next.province && next.province !== residence.province && identifier) {
      const nextUsesNationalCode = provinceUsesNationalCode(next.province);
      const existingLooksLikeNationalCode = isNationalCodeShape(identifier);
      const existingLooksLikePhone = /^09\d{9}$/.test(toLatinDigits(identifier.trim()));
      if (
        (nextUsesNationalCode && existingLooksLikePhone) ||
        (!nextUsesNationalCode && existingLooksLikeNationalCode)
      ) {
        // When an unknown login is converted to registration, don't leave a phone number in the
        // national-code field (or vice versa) after the user changes their selected province.
        setIdentifier('');
        setErrors((current) => {
          const nextErrors = { ...current };
          delete nextErrors.identifier;
          return nextErrors;
        });
        setInfo(
          nextUsesNationalCode
            ? 'استان انتخاب‌شده کد ملی می‌خواهد؛ شماره موبایل قبلی پاک شد. پس از انتخاب شهر، کد ملی را وارد کنید.'
            : 'استان انتخاب‌شده شماره موبایل می‌خواهد؛ کد ملی قبلی پاک شد. پس از انتخاب شهر، شماره موبایل را وارد کنید.',
        );
      }
    }
    setResidence(next);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const value = toLatinDigits(identifier.trim());
    if (mode === 'register' && name.trim().length < 2) e.name = 'نام و نام خانوادگی را بنویسید.';

    if (mode === 'login') {
      if (isNationalCodeShape(value)) {
        if (!normalizeNationalCode(value)) e.identifier = 'کد ملی معتبر ۱۰ رقمی وارد کنید.';
      } else if (!/^09\d{9}$/.test(value)) {
        e.identifier = 'شماره موبایل ۱۱ رقمی یا کد ملی معتبر وارد کنید.';
      }
    }

    if (mode === 'register') {
      // Activity location is deliberately completed before asking for the sign-in identifier.
      if (!residence.province) e.province = 'استان محل فعالیت خود را انتخاب کنید.';
      else if (!residence.city) e.city = 'شهر محل فعالیت خود را انتخاب کنید.';
      else if (requiresNationalCode && !normalizeNationalCode(value))
        e.identifier = 'کد ملی معتبر ۱۰ رقمی وارد کنید.';
      else if (!requiresNationalCode && !/^09\d{9}$/.test(value))
        e.identifier = 'شماره موبایل معتبر وارد کنید.';
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
    const identityKind =
      mode === 'register'
        ? requiresNationalCode
          ? 'nationalCode'
          : 'phone'
        : isNationalCodeShape(id)
          ? 'nationalCode'
          : 'phone';
    try {
      const u =
        mode === 'login'
          ? await login({ kind: identityKind, value: id })
          : requiresNationalCode
            ? await register({
                name: name.trim(),
                nationalCode: id,
                province: residence.province,
                city: residence.city,
              })
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
        // Not registered yet: keep the entered identifier and let the user supply name + location.
        setMode('register');
        track('signup_started');
        setErrors({});
        setInfo(
          `این ${identityKind === 'nationalCode' ? 'کد ملی' : 'شماره موبایل'} هنوز ثبت‌نام نشده است. نام و محل فعالیت خود را وارد کنید تا حساب‌تان ساخته شود.`,
        );
      } else if (e instanceof ApiError) {
        const fieldErrors = e.fields;
        const identityField = identityKind === 'nationalCode' ? 'nationalCode' : 'phone';
        if (Object.keys(fieldErrors).length) {
          setErrors({
            ...fieldErrors,
            ...(fieldErrors[identityField] ? { identifier: fieldErrors[identityField] } : {}),
          });
        } else if (e.code === 'CONFLICT') setErrors({ identifier: e.message });
        else setFormError(e.message);
      } else setFormError('خطایی رخ داد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'ورود' : 'ثبت‌نام';
  const identifierLabel =
    mode === 'login' ? 'شماره موبایل یا کد ملی' : fieldUsesNationalCode ? 'کد ملی' : 'شماره موبایل';
  const identifierPlaceholder =
    mode === 'login'
      ? 'شماره موبایل یا کد ملی ۱۰ رقمی'
      : fieldUsesNationalCode
        ? 'کد ملی ۱۰ رقمی'
        : '09xxxxxxxxx';
  return (
    <div className="relative flex min-h-dvh flex-col items-center bg-background px-4 pb-8">
      {/* brand hero behind the top of the form */}
      <div className="absolute inset-x-0 top-0 h-72 overflow-hidden rounded-b-[36px] sm:h-80">
        <BrandBackdrop />
      </div>
      <div className="relative mt-10 flex flex-col items-center gap-3 text-center sm:mt-14">
        <div className="animate-pop flex items-end justify-center gap-1">
          {/* Friendly mascot presence (handoff auth spec) — supportive, beside the brand mark. */}
          <Mascot mood={mode === 'login' ? 'welcome' : 'guide'} className="h-auto w-14 sm:w-16" />
          <span className="rounded-hero bg-white p-3 shadow-lg">
            <img
              src="/icons/logo-full.png"
              alt="هلدینگ سیلانه‌سبز"
              width={160}
              height={64}
              className="h-14 w-auto"
            />
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">آکادمی سیلانه</h1>
        {/* controlled amber accent (handoff: emerald brand + controlled amber) */}
        <span aria-hidden className="h-1 w-12 rounded-full bg-accent" />
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
          {mode === 'register' && (
            <ResidencePicker
              value={residence}
              onChange={handleResidenceChange}
              label="انتخاب محل فعالیت شما"
              provinceError={errors.province}
              cityError={errors.city}
              disabled={busy}
            />
          )}
          {(mode === 'login' || registrationIdentityVisible) && (
            <Input
              label={identifierLabel}
              ltr
              inputMode={mode === 'register' && fieldUsesNationalCode ? 'numeric' : 'tel'}
              autoComplete={mode === 'login' ? 'username' : fieldUsesNationalCode ? 'off' : 'tel'}
              placeholder={identifierPlaceholder}
              // Login accepts a phone (11 digits) or a national code (10): while typing, the first ten
              // digits already look like a national code, so a limit here would cut the phone's last digit.
              maxLength={mode === 'register' && fieldUsesNationalCode ? 10 : undefined}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              error={errors.identifier}
              hint={
                mode === 'login'
                  ? 'برای کاربران استان‌های مشمول، کد ملی ثبت‌شده را وارد کنید.'
                  : fieldUsesNationalCode
                    ? 'برای ورودهای بعدی از همین کد ملی استفاده می‌شود.'
                    : undefined
              }
              icon={
                fieldUsesNationalCode ? (
                  <Fingerprint className="size-5" />
                ) : (
                  <Phone className="size-5" />
                )
              }
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
              className="min-h-12 font-bold text-primary-fg"
              onClick={() => switchMode('register')}
            >
              حساب ندارید؟ ثبت‌نام کنید
            </button>
          ) : (
            <button
              type="button"
              className="min-h-12 font-bold text-primary-fg"
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
