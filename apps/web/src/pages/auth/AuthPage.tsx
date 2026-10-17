import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint, Phone, UserRound } from 'lucide-react';
import { Mascot } from '@/components/brand/Mascot';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { Button, Input } from '@/components/ui';
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

  const identifierLabel =
    mode === 'login' ? 'شماره موبایل یا کد ملی' : fieldUsesNationalCode ? 'کد ملی' : 'شماره موبایل';
  const identifierPlaceholder =
    mode === 'login'
      ? 'شماره موبایل یا کد ملی ۱۰ رقمی'
      : fieldUsesNationalCode
        ? 'کد ملی ۱۰ رقمی'
        : '09xxxxxxxxx';
  if (mode === 'login') {
    return (
      <div className="min-h-dvh bg-[#f7f1e7] px-0 sm:px-4 sm:py-6">
        <div className="relative mx-auto min-h-dvh w-full max-w-[460px] overflow-hidden bg-[#f7f1e7] shadow-[0_30px_80px_-40px_rgba(15,78,59,.55)] sm:min-h-[820px] sm:rounded-[38px]">
          <section className="relative min-h-[58vh] overflow-hidden bg-[#064e3b] px-6 pb-36 pt-10 text-white sm:min-h-[500px] sm:rounded-b-[42px]">
            <div
              aria-hidden
              className="absolute -end-24 -top-20 size-72 rounded-full bg-[#0f766e]/35 blur-2xl"
            />
            <div
              aria-hidden
              className="absolute -start-24 top-20 size-72 rounded-full bg-[#022c22]/65 blur-2xl"
            />
            <div
              aria-hidden
              className="absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 16% 28%, rgba(255,255,255,.08) 0 2px, transparent 3px), radial-gradient(circle at 82% 18%, rgba(245,158,11,.18) 0 2px, transparent 3px)',
                backgroundSize: '54px 54px, 68px 68px',
              }}
            />
            <div
              aria-hidden
              className="absolute -end-12 bottom-16 h-44 w-28 rotate-[28deg] rounded-[80%_0] bg-[#10b981]/16"
            />
            <div
              aria-hidden
              className="absolute -start-12 bottom-6 h-52 w-32 -rotate-[30deg] rounded-[0_80%] bg-[#58cc02]/12"
            />

            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
                  آکادمی سیلانه
                </div>
                <span className="size-2 rounded-full bg-[#f59e0b] shadow-[0_0_0_6px_rgba(245,158,11,.12)]" />
              </div>
              <div className="mt-8 max-w-[260px]">
                <h1 className="text-[28px] font-extrabold leading-[1.55] text-white">
                  به سیلانه سبز
                  <br />
                  خوش اومدی!
                </h1>
                <p className="mt-2 text-sm font-medium leading-7 text-white/75">
                  یادگیری امروز، موفقیت فردا
                </p>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
              <div className="relative h-[300px] w-[300px] sm:h-[320px] sm:w-[320px]">
                <div
                  aria-hidden
                  className="absolute inset-x-12 bottom-5 h-16 rounded-full bg-black/20 blur-xl"
                />
                <Mascot
                  mood="welcome"
                  className="relative mx-auto h-full w-auto max-w-full object-contain drop-shadow-2xl"
                />
              </div>
            </div>
          </section>

          <section className="relative z-20 -mt-16 rounded-t-[34px] bg-[#fffdfa] px-5 pb-8 pt-7 shadow-[0_-18px_45px_-32px_rgba(15,23,42,.35)] sm:mx-4 sm:rounded-[30px] sm:px-6">
            <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-busy={busy}>
              <Input
                label="شماره موبایل یا کد ملی"
                ltr
                inputMode="tel"
                autoComplete="username"
                placeholder="شماره موبایل یا کد ملی خود را وارد کنید"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                error={errors.identifier}
                hint="برای کاربران استان‌های مشمول، کد ملی ثبت‌شده را وارد کنید."
                icon={
                  loginIdentifierIsNationalCode ? (
                    <Fingerprint className="size-5" />
                  ) : (
                    <Phone className="size-5" />
                  )
                }
                disabled={busy}
                className="min-h-14 rounded-[16px] border-[#dfd7c9] bg-white px-4 shadow-none focus:border-[#059669] focus:ring-[#059669]/15"
              />

              {formError && (
                <p
                  role="alert"
                  className="rounded-[14px] bg-danger-light px-3 py-2 text-sm text-danger-fg"
                >
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                block
                loading={busy}
                className="mt-1 min-h-14 rounded-full text-base shadow-[0_10px_28px_-16px_rgba(4,120,87,.75)]"
              >
                ورود
              </Button>
            </form>

            <button
              type="button"
              className="mt-3 min-h-12 w-full text-sm font-bold text-primary-fg"
              onClick={() => switchMode('register')}
            >
              حساب ندارید؟ ثبت‌نام کنید
            </button>

            <p className="mt-3 text-center text-[11px] leading-5 text-text-secondary">
              با ورود به حساب، قوانین استفاده و حریم خصوصی آکادمی را می‌پذیرید.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f7f1e7] px-0 sm:px-4 sm:py-6">
      <div className="relative mx-auto min-h-dvh w-full max-w-[460px] overflow-hidden bg-[#fffdfa] shadow-[0_30px_80px_-40px_rgba(15,78,59,.45)] sm:min-h-[820px] sm:rounded-[38px]">
        <header className="relative overflow-hidden bg-[#fffaf2] px-5 pb-5 pt-7">
          <div
            aria-hidden
            className="absolute -end-20 -top-16 size-56 rounded-full bg-[#dff4df] blur-2xl"
          />
          <div
            aria-hidden
            className="absolute -start-24 top-16 size-52 rounded-full bg-[#ffedc7] blur-2xl"
          />

          <div className="relative z-10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="grid size-11 place-items-center rounded-full border border-[#e7dfd1] bg-white text-lg font-bold text-[#064e3b] shadow-sm"
              aria-label="بازگشت به ورود"
            >
              ‹
            </button>
            <div className="text-center">
              <p className="text-xs font-bold text-[#8a847a]">ایجاد حساب</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#15352b]">اطلاعات اصلی شما</p>
            </div>
            <span className="grid size-11 place-items-center rounded-full bg-[#ecfdf5] text-xs font-extrabold text-[#047857]">
              ۱/۴
            </span>
          </div>

          <div className="relative z-10 mt-4 h-1.5 overflow-hidden rounded-full bg-[#e8e2d8]">
            <div className="h-full w-1/4 rounded-full bg-[#059669]" />
          </div>

          <div className="relative z-10 mt-5 grid grid-cols-[1fr_128px] items-end gap-2">
            <div>
              <h1 className="text-[24px] font-extrabold leading-9 text-[#15352b]">
                بیا بیشتر
                <br />
                باهات آشنا بشیم
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#6f746f]">
                فقط چند اطلاعات کوتاه تا حساب آموزشی‌ات آماده شود.
              </p>
            </div>
            <div className="relative flex h-36 items-end justify-center">
              <div
                aria-hidden
                className="absolute bottom-1 h-10 w-24 rounded-full bg-[#064e3b]/10 blur-lg"
              />
              <Mascot mood="success" className="relative h-36 w-auto object-contain" />
            </div>
          </div>
        </header>

        <main className="relative z-10 rounded-t-[30px] bg-[#fffdfa] px-5 pb-8 pt-6 sm:px-6">
          {info && (
            <p
              role="status"
              className="mb-4 rounded-[16px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm leading-6 text-[#1e40af]"
            >
              {info}
            </p>
          )}

          <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-busy={busy}>
            <section className="rounded-[22px] border border-[#ebe3d6] bg-white p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,.32)]">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-[#ecfdf5] text-sm font-extrabold text-[#047857]">
                  ۱
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-[#15352b]">نام و نام خانوادگی</h2>
                  <p className="mt-0.5 text-[11px] text-[#8a847a]">همان نامی که در پروفایل نمایش داده می‌شود</p>
                </div>
              </div>
              <Input
                label="نام و نام خانوادگی"
                autoComplete="name"
                placeholder="نام و نام خانوادگی خود را وارد کنید"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                icon={<UserRound className="size-5" />}
                disabled={busy}
                className="min-h-14 rounded-[16px] border-[#dfd7c9] bg-[#fffdfa] shadow-none focus:border-[#059669] focus:ring-[#059669]/15"
              />
            </section>

            <section className="rounded-[22px] border border-[#ebe3d6] bg-white p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,.32)]">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-[#fff3d6] text-sm font-extrabold text-[#b45309]">
                  ۲
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-[#15352b]">محل فعالیت شما</h2>
                  <p className="mt-0.5 text-[11px] text-[#8a847a]">استان و شهر محل فعالیت را انتخاب کنید</p>
                </div>
              </div>
              <ResidencePicker
                value={residence}
                onChange={handleResidenceChange}
                label="انتخاب محل فعالیت شما"
                provinceError={errors.province}
                cityError={errors.city}
                disabled={busy}
              />
            </section>

            {registrationIdentityVisible && (
              <section className="rounded-[22px] border border-[#d8eadf] bg-[#fbfefc] p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,.28)]">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-[#ecfdf5] text-sm font-extrabold text-[#047857]">
                    ۳
                  </span>
                  <div>
                    <h2 className="text-sm font-extrabold text-[#15352b]">
                      {fieldUsesNationalCode ? 'کد ملی' : 'شماره موبایل'}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-[#8a847a]">
                      بر اساس محل فعالیت انتخاب‌شده
                    </p>
                  </div>
                </div>
                <Input
                  label={identifierLabel}
                  ltr
                  inputMode={fieldUsesNationalCode ? 'numeric' : 'tel'}
                  autoComplete={fieldUsesNationalCode ? 'off' : 'tel'}
                  placeholder={identifierPlaceholder}
                  maxLength={fieldUsesNationalCode ? 10 : undefined}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  error={errors.identifier}
                  hint={
                    fieldUsesNationalCode
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
                  className="min-h-14 rounded-[16px] border-[#cfe4d6] bg-white shadow-none focus:border-[#059669] focus:ring-[#059669]/15"
                />
              </section>
            )}

            {formError && (
              <p
                role="alert"
                className="rounded-[16px] bg-danger-light px-4 py-3 text-sm text-danger-fg"
              >
                {formError}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              block
              loading={busy}
              className="mt-1 min-h-14 rounded-full text-base shadow-[0_10px_28px_-16px_rgba(4,120,87,.75)]"
            >
              ثبت‌نام و ورود
            </Button>
          </form>

          <button
            type="button"
            className="mt-3 min-h-12 w-full text-sm font-bold text-primary-fg"
            onClick={() => switchMode('login')}
          >
            حساب دارید؟ وارد شوید
          </button>

          <p className="mt-2 text-center text-[11px] leading-5 text-[#8a847a]">
            اطلاعات شما فقط برای ساخت حساب و شخصی‌سازی مسیر آموزشی استفاده می‌شود.
          </p>
        </main>

        <Link to="/gallery" className="sr-only">
          راهنمای طراحی
        </Link>
      </div>
    </div>
  );
}
