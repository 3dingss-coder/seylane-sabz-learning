import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, BookOpenCheck, Route } from 'lucide-react';
import { Mascot, type MascotMood } from '@/components/brand/Mascot';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Me } from '@/lib/types';

const SLIDES: Array<{
  icon: typeof BookOpenCheck;
  title: string;
  body: string;
  mood: MascotMood;
  eyebrow: string;
  accent: 'green' | 'amber';
}> = [
  {
    icon: BookOpenCheck,
    title: 'چه چیزی یاد بگیرم؟',
    body: 'آموزش‌های کوتاه صوتی و ویدیویی درباره محصولات سیلانه‌سبز برایت فعال می‌شود.',
    mood: 'welcome',
    eyebrow: 'آموزش‌های مخصوص شما',
    accent: 'green',
  },
  {
    icon: Route,
    title: 'چطور پیش بروم؟',
    body: 'در صفحه خانه همیشه «کار بعدی» را می‌بینی. قسمت را کامل ببین یا گوش کن، بعد آزمون کوتاه بده.',
    mood: 'guide',
    eyebrow: 'مسیر یادگیری روشن',
    accent: 'green',
  },
  {
    icon: AlarmClock,
    title: 'اگر عقب بمانم چه؟',
    body: 'هر آموزش مهلت دارد. قبل از تمام شدن مهلت یادآوری می‌گیری و مدیرت هم در جریان است.',
    mood: 'thinking',
    eyebrow: 'همیشه در جریان بمان',
    accent: 'amber',
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
  const progress = ((i + 1) / SLIDES.length) * 100;

  return (
    <div className="min-h-dvh bg-[#f7f1e7] px-0 sm:px-4 sm:py-6">
      <div className="relative mx-auto min-h-dvh w-full max-w-[460px] overflow-hidden bg-[#fffdfa] shadow-[0_30px_80px_-40px_rgba(15,78,59,.45)] sm:min-h-[820px] sm:rounded-[38px]">
        <header className="relative z-20 flex items-center justify-between px-5 pt-7">
          <button
            type="button"
            onClick={() => {
              if (i > 0) setI(i - 1);
              else void finish();
            }}
            className="grid size-11 place-items-center rounded-full border border-[#e7dfd1] bg-white text-lg font-bold text-[#064e3b] shadow-sm"
            aria-label={i > 0 ? 'مرحله قبل' : 'رد شدن'}
          >
            ‹
          </button>

          <div className="min-w-0 flex-1 px-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-bold text-[#8a847a]">
              <span>
                مرحله {(i + 1).toLocaleString('fa-IR')} از {SLIDES.length.toLocaleString('fa-IR')}
              </span>
              <span>{Math.round(progress).toLocaleString('fa-IR')}٪</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e8e2d8]">
              <div
                className="h-full rounded-full bg-[#059669] transition-[width] duration-300 ease-soft"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void finish()}
            className={cn(
              'min-h-11 rounded-full px-3 text-xs font-bold text-[#6f746f]',
              last && 'invisible',
            )}
            tabIndex={last ? -1 : 0}
          >
            رد شدن
          </button>
        </header>

        <main className="relative flex min-h-[calc(100dvh-88px)] flex-col px-5 pb-7 pt-5 sm:min-h-[720px] sm:px-6">
          <section
            key={i}
            className="animate-fade-up relative flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-[30px] border border-[#eadfce] bg-[#fffaf2] p-5 shadow-[0_20px_55px_-36px_rgba(15,23,42,.34)]"
          >
            <div
              aria-hidden
              className="absolute -end-20 -top-16 size-60 rounded-full bg-[#e3f5e5]"
            />
            <div
              aria-hidden
              className="absolute -bottom-24 -start-16 size-64 rounded-full bg-[#ffedc9]"
            />
            <div
              aria-hidden
              className={cn(
                'absolute end-8 top-16 h-28 w-16 rotate-[28deg] rounded-[90%_0]',
                slide.accent === 'amber' ? 'bg-[#f59e0b]/10' : 'bg-[#10b981]/10',
              )}
            />

            <div className="relative z-10">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold',
                  slide.accent === 'amber'
                    ? 'bg-[#fff0cd] text-[#a16207]'
                    : 'bg-[#e8f8ee] text-[#047857]',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {slide.eyebrow}
              </span>
            </div>

            <div className="relative z-10 mt-5 flex flex-1 items-end justify-center">
              <div className="relative flex h-[260px] w-full items-end justify-center">
                <div
                  aria-hidden
                  className="absolute bottom-4 h-14 w-44 rounded-full bg-[#064e3b]/10 blur-xl"
                />
                <Mascot mood={slide.mood} className="relative h-[250px] w-auto object-contain" />
              </div>
            </div>

            <div className="relative z-10 rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_36px_-28px_rgba(15,23,42,.4)] backdrop-blur-sm">
              <h1
                className="text-[24px] font-extrabold leading-9 text-[#15352b]"
                aria-live="polite"
              >
                {slide.title}
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#68716c]">{slide.body}</p>
            </div>
          </section>

          <div className="mt-5 flex items-center justify-center gap-2" aria-hidden>
            {SLIDES.map((_, k) => (
              <span
                key={k}
                className={cn(
                  'h-2 rounded-full transition-[width,background-color] duration-300 ease-soft',
                  k === i ? 'w-7 bg-[#059669]' : 'w-2 bg-[#ddd6ca]',
                )}
              />
            ))}
          </div>

          <Button
            size="lg"
            block
            loading={busy}
            className="mt-5 min-h-14 rounded-full text-base shadow-[0_10px_28px_-16px_rgba(4,120,87,.75)]"
            onClick={() => (last ? void finish() : setI(i + 1))}
          >
            {last ? 'شروع' : 'بعدی'}
          </Button>
        </main>
      </div>
    </div>
  );
}
