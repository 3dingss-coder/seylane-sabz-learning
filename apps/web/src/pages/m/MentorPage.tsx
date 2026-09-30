import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { MentorChat } from '@/components/learning/MentorChat';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Nudge } from '@/lib/types';

/** M9 — منتور: rule-based nudges (R1–R6) + general chat. */
export function MentorPage() {
  const nudges = useQuery({
    queryKey: qk.nudges,
    queryFn: ({ signal }) => api.get<Nudge[]>('/me/mentor/nudges', signal),
  });
  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <PageHeader title="منتور" subtitle="پیشنهادهای شخصی و پاسخ به سؤال‌ها" />
      {(nudges.data ?? []).slice(0, 3).map((n) => (
        <Link
          key={n.id}
          to={n.actionRef ?? '/'}
          className="pressable mb-2 flex items-start gap-2 rounded-card border border-info/30 bg-info-light p-3 text-sm text-text"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          {n.message}
        </Link>
      ))}
      <MentorChat packageId={null} className="min-h-0 flex-1" />
    </div>
  );
}
