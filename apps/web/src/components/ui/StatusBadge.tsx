// Adapted from helper kit: «پنل مدیر/کامپوننت‌ها/common/StatusBadge.tsx»
// — order/business statuses replaced by learning-domain statuses (F2/F12/F13),
//   colors mapped to semantic tokens, icon + text (not color alone, §16.8).
import {
  CheckCircle2,
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
import { cn } from '@/lib/cn';

export type SectionStatus = 'locked' | 'open' | 'in_progress' | 'completed';
export type PublishStatus = 'draft' | 'published' | 'archived';
export type UserStatus = 'active' | 'inactive';
export type BadgeStatus = SectionStatus | PublishStatus | UserStatus;

const MAP: Record<BadgeStatus, { label: string; icon: LucideIcon; cls: string }> = {
  locked: { label: 'قفل', icon: Lock, cls: 'bg-background text-muted border-border' },
  open: { label: 'باز', icon: CircleDot, cls: 'bg-info-light text-info border-info/30' },
  in_progress: {
    label: 'در حال انجام',
    icon: PlayCircle,
    cls: 'bg-warning-light text-warning border-warning/30',
  },
  completed: {
    label: 'تکمیل',
    icon: CheckCircle2,
    cls: 'bg-success-light text-success border-success/30',
  },
  draft: {
    label: 'پیش‌نویس',
    icon: FileEdit,
    cls: 'bg-background text-text-secondary border-border',
  },
  published: {
    label: 'منتشرشده',
    icon: Send,
    cls: 'bg-primary-light text-primary border-primary/30',
  },
  archived: { label: 'بایگانی', icon: Archive, cls: 'bg-background text-muted border-border' },
  active: {
    label: 'فعال',
    icon: UserCheck,
    cls: 'bg-success-light text-success border-success/30',
  },
  inactive: { label: 'غیرفعال', icon: UserX, cls: 'bg-background text-muted border-border' },
};

export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  const { label, icon: Icon, cls } = MAP[status];
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
