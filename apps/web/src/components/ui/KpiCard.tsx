// Adapted from helper kit: «پنل مدیر/کامپوننت‌ها/common/KPICard.tsx»
// — #006c4a → primary token, trend text generic, card radius 12 (§16.4).
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

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

export function KpiCard({ title, value, subtitle, icon: Icon, tone = 'primary' }: KpiCardProps) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="mt-1 text-2xl font-bold text-text">{value}</p>
        </div>
        <span className={cn('flex size-12 items-center justify-center rounded-card', TONES[tone])}>
          <Icon className="size-6" aria-hidden />
        </span>
      </div>
      {subtitle && (
        <p className="mt-3 border-t border-border pt-2 text-xs text-text-secondary">{subtitle}</p>
      )}
    </div>
  );
}
