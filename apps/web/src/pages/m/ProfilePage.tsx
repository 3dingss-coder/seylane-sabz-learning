import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save } from 'lucide-react';
import { Button, Card, Input, useToast } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PushOptIn } from '@/components/common/PushOptIn';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faDate } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import type { Me } from '@/lib/types';

/** Profile: name, notifications and logout (shared by all roles). */
export function ProfilePage({ embedded = false }: { embedded?: boolean }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'name' | 'out'>('');
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
        </div>
      </Card>
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
