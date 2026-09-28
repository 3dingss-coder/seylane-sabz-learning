import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <AppLogo withTitle={false} />
      <div className="flex size-16 items-center justify-center rounded-card bg-primary-light text-primary">
        <Compass className="size-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold text-text">این صفحه پیدا نشد</h1>
      <p className="text-sm text-text-secondary">
        ممکن است آدرس اشتباه باشد یا صفحه جابه‌جا شده باشد.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-card bg-primary px-6 font-bold text-white hover:bg-primary-hover"
      >
        بازگشت به صفحه اصلی
      </Link>
    </main>
  );
}
