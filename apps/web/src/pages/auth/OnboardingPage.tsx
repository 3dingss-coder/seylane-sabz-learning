import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, BookOpenCheck, Route } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Me } from '@/lib/types';

const SLIDES = [
  {
    icon: BookOpenCheck,
    title: 'چه چیزی یاد بگیرم؟',
    body: 'آموزش‌های کوتاه صوتی و ویدیویی درباره محصولات سیلانه‌سبز برایت فعال می‌شود.',
  },
  {
    icon: Route,
    title: 'چطور پیش بروم؟',
    body: 'در صفحه خانه همیشه «کار بعدی» را می‌بینی. قسمت را کامل ببین یا گوش کن، بعد آزمون کوتاه بده.',
  },
  {
    icon: AlarmClock,
    title: 'اگر عقب بمانم چه؟',
    body: 'هر آموزش مهلت دارد. قبل از تمام شدن مهلت یادآوری می‌گیری و مدیرت هم در جریان است.',
  },
];

/** M2 — Onboarding (first login only). */
export function OnboardingPage() {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const { user, setUser, refreshMe } = useAuth();
  const nav = useNavigate();
  const finish = async () => {
    setBusy(true);
    try {
      // The endpoint returns only { onboardedAt }, so merge it into the existing profile;
      // replacing the whole user would drop `role` and blank the screen until a reload.
      const r = await api.post<Partial<Me>>('/me/onboarding');
      if (user) setUser({ ...user, onboardedAt: r.onboardedAt ?? new Date().toISOString() });
      else await refreshMe();
    } catch {
      /* non-blocking */
    }
    nav('/', { replace: true, state: { highlightNext: true } });
  };
  const slide = SLIDES[i] ?? SLIDES[0];
  if (!slide) return null;
  const Icon = slide.icon;
  const last = i === SLIDES.length - 1;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[400px] p-6 text-center">
        <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-card bg-primary-light text-primary">
          <Icon className="size-10" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-text" aria-live="polite">
          {slide.title}
        </h1>
        <p className="mt-2 text-base leading-8 text-text-secondary">{slide.body}</p>
        <div className="my-6 flex justify-center gap-2" aria-hidden>
          {SLIDES.map((_, k) => (
            <span
              key={k}
              className={cn(
                'h-2 rounded-full transition-all',
                k === i ? 'w-6 bg-primary' : 'w-2 bg-border',
              )}
            />
          ))}
        </div>
        <Button size="lg" block loading={busy} onClick={() => (last ? void finish() : setI(i + 1))}>
          {last ? 'شروع' : 'بعدی'}
        </Button>
        {!last && (
          <button
            type="button"
            className="mt-2 min-h-12 w-full text-sm text-text-secondary"
            onClick={() => void finish()}
          >
            رد شدن
          </button>
        )}
      </Card>
    </div>
  );
}
