import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs } from '@/components/common/Field';
import { MentorBriefCard } from '@/components/learning/MentorBriefCard';
import { MentorChat } from '@/components/learning/MentorChat';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Nudge } from '@/lib/types';

type MentorTab = 'analysis' | 'tips' | 'chat';

const isTab = (v: string | null): v is MentorTab =>
  v === 'analysis' || v === 'tips' || v === 'chat';

/**
 * M9 — منتور, split into three focused tabs so the chat is never buried under cards:
 *  - تحلیل عملکرد: where the marketer stands in their learning path (brief + voice call entry)
 *  - پیشنهادها: rule-based nudges (R1–R6)
 *  - چت با منتور: the AI chat (default tab)
 */
export function MentorPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: MentorTab = isTab(raw) ? raw : 'chat';
  const setTab = (t: MentorTab) => setParams(t === 'chat' ? {} : { tab: t }, { replace: true });

  const nudges = useQuery({
    queryKey: qk.nudges,
    queryFn: ({ signal }) => api.get<Nudge[]>('/me/mentor/nudges', signal),
  });
  const list = nudges.data ?? [];

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <PageHeader title="منتور" subtitle="تحلیل مسیر یادگیری، پیشنهادها و گفت‌وگو با منتور" />
      <div className="mb-3">
        <Tabs<MentorTab>
          label="بخش‌های منتور"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'analysis', label: 'تحلیل عملکرد' },
            { value: 'tips', label: 'پیشنهادها', count: list.length || undefined },
            { value: 'chat', label: 'چت با منتور' },
          ]}
        />
      </div>

      {tab === 'analysis' && (
        <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel" aria-label="تحلیل عملکرد">
          <MentorBriefCard />
        </div>
      )}

      {tab === 'tips' && (
        <div
          className="min-h-0 flex-1 space-y-2 overflow-y-auto"
          role="tabpanel"
          aria-label="پیشنهادها"
        >
          {list.length === 0 && (
            <p className="rounded-card border border-border bg-surface p-4 text-center text-sm text-text-secondary">
              فعلاً پیشنهادی نداری. به یادگیری ادامه بده تا منتور نکته‌های جدید بدهد.
            </p>
          )}
          {list.map((n) => (
            <Link
              key={n.id}
              to={n.actionRef ?? '/'}
              className="pressable flex items-start gap-2 rounded-card border border-info/30 bg-info-light p-3 text-sm text-text"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              {n.message}
            </Link>
          ))}
        </div>
      )}

      {tab === 'chat' && <MentorChat packageId={null} className="min-h-0 flex-1" />}
    </div>
  );
}
