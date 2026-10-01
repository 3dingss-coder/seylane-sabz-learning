import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { NotFoundIllustration } from '@/components/ui';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <AppLogo withTitle={false} />
      <NotFoundIllustration className="animate-fade-up h-40" />
      <p
        aria-hidden
        className="bg-hero bg-clip-text text-6xl font-extrabold text-transparent [-webkit-text-fill-color:transparent]"
      >
        ۴۰۴
      </p>
      <h1 className="text-2xl font-bold text-text">این صفحه پیدا نشد</h1>
      <p className="text-sm text-text-secondary">
        ممکن است آدرس اشتباه باشد یا صفحه جابه‌جا شده باشد.
      </p>
      <Link
        to="/"
        className="pressable mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-card bg-primary bg-brand-gradient px-6 font-bold text-on-primary hover:bg-primary-hover"
      >
        <Home className="size-5" aria-hidden />
        بازگشت به صفحه اصلی
      </Link>
    </main>
  );
}
