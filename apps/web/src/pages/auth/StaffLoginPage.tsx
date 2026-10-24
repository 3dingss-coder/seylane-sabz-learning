import { useState, type FormEvent } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand/BrandBackdrop';
import { Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TITLE = { admin: 'پنل ادمین', manager: 'پنل مدیریت' } as const;

/** Username + password sign-in shown at /admin and /manager when nobody is signed in. */
export function StaffLoginPage({ panel }: { panel: 'admin' | 'manager' }) {
  const { staffLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('نام کاربری و رمز عبور را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      await staffLogin({ panel, username: username.trim(), password });
      // RequireAuth re-renders with the signed-in user and shows the panel at this same URL.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'خطایی رخ داد. دوباره تلاش کنید.');
      setBusy(false);
    }
  };

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
        <p className="text-sm text-white/85">{TITLE[panel]}</p>
      </div>
      <Card className="animate-fade-up relative mt-6 w-full max-w-[400px] p-6 shadow-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-busy={busy}>
          <Input
            label="نام کاربری"
            ltr
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            icon={<UserRound className="size-5" />}
            disabled={busy}
          />
          <Input
            label="رمز عبور"
            type="password"
            ltr
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<KeyRound className="size-5" />}
            disabled={busy}
          />
          {error && (
            <p
              role="alert"
              className="rounded-input bg-danger-light px-3 py-2 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}
          <Button type="submit" size="lg" block loading={busy} className="mt-2">
            ورود
          </Button>
        </form>
      </Card>
    </div>
  );
}
