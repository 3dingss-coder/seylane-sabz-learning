// Adapted from helper kit: «پنل مدیر/کامپوننت‌ها/common/KPICard.tsx»
// — #006c4a → primary token, trend text generic, card radius 12 (§16.4).
// Design refresh: the number counts up once (Persian digits kept), icon tile has a soft gradient.
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toLatinDigits, toPersianDigits } from '@/lib/digits';
import { useCountUp } from '@/lib/motion';

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'warning' | 'danger' | 'info';
}

const TONES = {
  primary: 'bg-primary-light text-primary',
  warning: 'bg-warning-light text-warning-fg',
  danger: 'bg-danger-light text-danger-fg',
  info: 'bg-info-light text-info-fg',
} as const;

const EDGE = {
  primary: 'before:bg-primary',
  warning: 'before:bg-warning',
  danger: 'before:bg-danger',
  info: 'before:bg-info',
} as const;

/** Splits "۱۲۰٪" → prefix / integer / suffix so only the integer animates. */
function splitValue(v: string) {
  const m = /^([^\d۰-۹٠-٩]*)([\d۰-۹٠-٩]+)(.*)$/su.exec(v);
  if (!m) return null;
  const [, pre = '', digits = '', rest = ''] = m;
  // decimals / thousand separators / fractions ("۱ / ۳") stay static — never mis-render them
  if (/^[.,٫٬/]/u.test(rest) || /[\d۰-۹]/u.test(pre)) return null;
  const latin = /[0-9]/.test(digits);
  return { pre, n: Number(toLatinDigits(digits)), rest, latin };
}

function AnimatedValue({ value }: { value: string }) {
  const parts = splitValue(value);
  const shown = useCountUp(parts?.n ?? 0, 900);
  if (!parts) return <>{value}</>;
  const n = String(Math.round(shown));
  return (
    <>
      {parts.pre}
      {parts.latin ? n : toPersianDigits(n)}
      {parts.rest}
    </>
  );
}

export function KpiCard({ title, value, subtitle, icon: Icon, tone = 'primary' }: KpiCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-border bg-surface p-4 shadow-sm transition-[transform,box-shadow] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-md',
        'before:absolute before:inset-y-3 before:start-0 before:w-1 before:rounded-e-full before:opacity-80',
        EDGE[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="mt-1 text-2xl font-extrabold text-text">
            <AnimatedValue value={value} />
          </p>
        </div>
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-card',
            TONES[tone],
          )}
        >
          <Icon className="size-6" aria-hidden />
        </span>
      </div>
      {subtitle && (
        <p className="mt-3 border-t border-border pt-2 text-xs text-text-secondary">{subtitle}</p>
      )}
    </div>
  );
}
