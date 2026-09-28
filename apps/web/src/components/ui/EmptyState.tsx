// Adapted from helper kit: «اپ بازاریاب/کامپوننت‌ها/common/EmptyState.tsx» and
// «پنل مدیر/کامپوننت‌ها/common/EmptyState.tsx» — emerald → primary tokens, 48px CTA.
import type { ReactNode } from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  /** Illustration/icon (spec: image + text + CTA). */
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionText, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border bg-surface px-6 py-10 text-center shadow-sm">
      <div className="mb-4 flex size-16 items-center justify-center rounded-card bg-primary-light text-primary">
        {icon ?? <PackageOpen className="size-8" aria-hidden />}
      </div>
      <h3 className="text-base font-bold text-text">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-text-secondary">{description}</p>}
      {actionText && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
