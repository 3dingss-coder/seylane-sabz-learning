// Adapted from helper kit: «اپ بازاریاب/کامپوننت‌ها/common/EmptyState.tsx» and
// «پنل مدیر/کامپوننت‌ها/common/EmptyState.tsx» — emerald → primary tokens, 48px CTA.
import type { ReactNode } from 'react';
import { MascotAvatar } from '@/components/brand/MascotAvatar';
import { COPY } from '@/lib/copy/fa';
import { Button } from './Button';
import { EmptyIllustration } from './illustrations';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  /** Custom icon; when omitted a small animated brand illustration is shown. */
  icon?: ReactNode;
  /** Design v3 (PHASE-4 §4.4): let سیلا carry the empty state instead of the abstract art. */
  character?: 'seyla';
}

export function EmptyState({
  title,
  description,
  actionText,
  onAction,
  icon,
  character,
}: EmptyStateProps) {
  return (
    <div className="animate-fade-up relative flex flex-col items-center justify-center overflow-hidden rounded-card border border-border bg-surface px-6 py-10 text-center shadow-sm">
      <div
        aria-hidden
        className="bg-dots pointer-events-none absolute inset-0 text-primary/[0.07] [mask-image:radial-gradient(60%_60%_at_50%_30%,#000,transparent)]"
      />
      <div className="relative mb-3">
        {character === 'seyla' ? (
          <MascotAvatar size={72} alt={COPY.mentor.name} className="animate-pop" />
        ) : icon ? (
          <div className="flex size-16 items-center justify-center rounded-card bg-primary-light text-primary">
            {icon}
          </div>
        ) : (
          <EmptyIllustration />
        )}
      </div>
      <h3 className="relative text-base font-bold text-text">{title}</h3>
      {description && (
        <p className="relative mt-1 max-w-xs text-sm text-text-secondary">{description}</p>
      )}
      {actionText && onAction && (
        <Button className="relative mt-5" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
