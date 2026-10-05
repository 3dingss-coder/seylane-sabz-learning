import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save } from 'lucide-react';
import { Button, Card, CoinChip, Input, ProgressBar, StreakChip, useToast } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PushOptIn } from '@/components/common/PushOptIn';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBehavior } from '@/lib/queries';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faDate, faPercent } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import type { Me } from '@/lib/types';

/** Profile: name, password change, logout (shared by all roles). */
export function ProfilePage({ embedded = false }: { embedded?: boolean }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'name' | 'pw' | 'out'>('');
  // Real signals only (PHASE-3): streak + per-brand mastery come from /me/mentor/behavior.
  const behavior = useBehavior();
  const streak = behavior.data?.state.streakDays ?? 0;
  const mastery = (behavior.data?.signals.mastery ?? []).filter((m) => m.percent > 0);
  if (!user) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('name');
    try {
      setUser(await api.patch<Me>('/me', { name: name.trim() }));
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      setErrors({});
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      toast.show({ type: 'error', message: errMsg(err) });
    } finally {
      setBusy('');
    }
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setErrors({ newPassword: 'رمز جدید باید حداقل ۸ نویسه باشد.' });
    setBusy('pw');
    try {
      await api.post('/me/password', { currentPassword: cur, newPassword: next });
      toast.show({ type: 'success', message: 'رمز عوض شد.' });
      setCur('');
      setNext('');
      setErrors({});
    } catch (err) {
      const f = err instanceof ApiError ? err.fields : {};
      setErrors(Object.keys(f).length ? f : { currentPassword: errMsg(err) });
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="stagger mx-auto flex w-full max-w-xl flex-col gap-4">
      {!embedded && <PageHeader title="پروفایل" />}
      <Card tone="hero" className="relative flex items-center gap-4 overflow-hidden p-5 text-sm">
        <div
          aria-hidden
          className="bg-dots pointer-events-none absolute inset-0 text-white/10 [mask-image:radial-gradient(70%_80%_at_100%_0%,#000,transparent)]"
        />
        <span
          aria-hidden
          className="relative flex size-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl font-extrabold text-white [box-shadow:0_0_0_4px_rgb(255_255_255/0.15)]"
        >
          {user.name.trim().charAt(0)}
        </span>
        <div className="relative min-w-0">
          <p className="text-lg font-bold text-white">{user.name}</p>
          <p className="text-white/85">
            {ROLE_LABEL[user.role]} •{' '}
            <span dir="ltr">{toPersianDigits(user.phone ?? user.email ?? '')}</span>
          </p>
          <p className="text-xs text-white/75">عضو از {faDate(user.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <CoinChip value={user.pointsBalance} />
            {streak > 0 && <StreakChip count={streak} />}
          </div>
        </div>
      </Card>
      {mastery.length > 0 && (
        <Card chunky className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-text">استادی برندها</h2>
          <div className="flex flex-col gap-3">
            {mastery.map((m) => (
              <div key={m.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-text">{m.label}</span>
                  <span className="text-text-secondary">{faPercent(m.percent)}</span>
                </div>
                <ProgressBar value={m.percent} label={`استادی ${m.label}`} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <form onSubmit={saveName} className="flex flex-col gap-3">
          <Input
            label="نام و نام خانوادگی"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={busy === 'name'}
            disabled={name.trim() === user.name}
            icon={<Save className="size-4" aria-hidden />}
          >
            ذخیره نام
          </Button>
        </form>
      </Card>
      <PushOptIn />
      <Card>
        <form onSubmit={changePw} className="flex flex-col gap-3">
          <h2 className="text-base font-bold">تغییر رمز</h2>
          <Input
            label="رمز فعلی"
            type="password"
            ltr
            autoComplete="current-password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            error={errors.currentPassword}
          />
          <Input
            label="رمز جدید"
            type="password"
            ltr
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={errors.newPassword}
            hint="حداقل ۸ نویسه"
          />
          <Button
            type="submit"
            variant="secondary"
            loading={busy === 'pw'}
            disabled={!cur || !next}
          >
            تغییر رمز
          </Button>
        </form>
      </Card>
      <Button
        variant="danger"
        loading={busy === 'out'}
        icon={<LogOut className="size-4" aria-hidden />}
        onClick={async () => {
          setBusy('out');
          await logout();
          nav('/login', { replace: true });
        }}
      >
        خروج از حساب
      </Button>
    </div>
  );
}
