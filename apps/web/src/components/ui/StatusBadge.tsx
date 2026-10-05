// Adapted from helper kit: «پنل مدیر/کامپوننت‌ها/common/StatusBadge.tsx»
// — order/business statuses replaced by learning-domain statuses (F2/F12/F13),
//   colors mapped to semantic tokens, icon + text (not color alone, §16.8).
import {
  CheckCircle2,
  ClipboardCheck,
  CircleDot,
  FileEdit,
  Archive,
  Lock,
  PlayCircle,
  Send,
  UserCheck,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { COPY } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';

export type SectionStatus = 'locked' | 'open' | 'in_progress' | 'quiz' | 'completed';
export type PublishStatus = 'draft' | 'published' | 'archived';
export type UserStatus = 'active' | 'inactive';
export type BadgeStatus = SectionStatus | PublishStatus | UserStatus;

const MAP: Record<BadgeStatus, { label: string; icon: LucideIcon; cls: string }> = {
  locked: {
    label: COPY.status.locked,
    icon: Lock,
    cls: 'bg-background text-muted-fg border-border',
  },
  open: {
    label: COPY.status.open,
    icon: CircleDot,
    cls: 'bg-info-light text-info-fg border-info/30',
  },
  in_progress: {
    label: COPY.status.inProgress,
    icon: PlayCircle,
    cls: 'bg-warning-light text-warning-fg border-warning/30',
  },
  quiz: {
    label: COPY.status.quizReady,
    icon: ClipboardCheck,
    cls: 'bg-info-light text-info-fg border-info/30',
  },
  completed: {
    label: COPY.status.completed,
    icon: CheckCircle2,
    cls: 'bg-success-light text-success-fg border-success/30',
  },
  draft: {
    label: COPY.status.draft,
    icon: FileEdit,
    cls: 'bg-background text-text-secondary border-border',
  },
  published: {
    label: COPY.status.published,
    icon: Send,
    cls: 'bg-primary-light text-primary border-primary/30',
  },
  archived: {
    label: COPY.status.archived,
    icon: Archive,
    cls: 'bg-background text-muted-fg border-border',
  },
  active: {
    label: COPY.status.active,
    icon: UserCheck,
    cls: 'bg-success-light text-success-fg border-success/30',
  },
  inactive: {
    label: COPY.status.inactive,
    icon: UserX,
    cls: 'bg-background text-muted-fg border-border',
  },
};

/** Anything the API may send that the map does not know yet — never let a badge crash the page. */
const FALLBACK: { label: string; icon: LucideIcon; cls: string } = {
  label: '—',
  icon: CircleDot,
  cls: 'bg-background text-text-secondary border-border',
};

export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  const { label, icon: Icon, cls } = MAP[status] ?? FALLBACK;
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-bold',
        cls,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
