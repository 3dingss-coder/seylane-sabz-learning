// Holding logo from helper kit «اپ مشتری/لوگو و آیکون/logo-full.png» (mirrored to /icons by sync-assets).
import { cn } from '@/lib/cn';

export function AppLogo({
  className,
  withTitle = true,
}: {
  className?: string;
  withTitle?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <img src="/icons/logo-full.png" alt="هلدینگ سیلانه‌سبز" className="h-9 w-auto" />
      {withTitle && <span className="text-base font-bold text-primary">لرنینگ</span>}
    </span>
  );
}
