import { useState } from 'react';
import { CheckCircle2, Circle, Lock, Send, XCircle } from 'lucide-react';
import { Button, Card, CountdownChip, EmptyState, ProgressBar, StatusBadge } from '@/components/ui';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faDateTime, faPercent, faRelative } from '@/lib/format';
import type { Timeline } from '@/lib/types';
import { SendMessageDialog } from '@/pages/manager/SendMessageDialog';

/** W3 — جزئیات یک عضو: package → section timeline with quiz attempts + message history. */
export function MemberTimeline({ data, canMessage }: { data: Timeline; canMessage: boolean }) {
  const [open, setOpen] = useState(false);
  const { user, packages, messages } = data;
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-3 lg:flex-1">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{user.name}</p>
            <p className="text-sm text-text-secondary">
              <span dir="ltr">{toPersianDigits(user.phone ?? user.email ?? '')}</span> • آخرین
              فعالیت: {user.lastActiveAt ? faRelative(user.lastActiveAt) : 'هرگز'}
            </p>
          </div>
          {canMessage && (
            <Button icon={<Send className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
              ارسال پیام
            </Button>
          )}
        </Card>
        {packages.length === 0 && <EmptyState title="آموزشی به این عضو داده نشده" />}
        {packages.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{p.title}</h3>
              {p.status === 'completed' ? (
                <span className="text-sm font-bold text-success">
                  {p.onTime ? 'تکمیل به‌موقع' : 'تکمیل با تأخیر'} •{' '}
                  {p.completedAt && faDate(p.completedAt)}
                </span>
              ) : (
                p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ProgressBar value={p.percent} label="پیشرفت" className="flex-1" />
              <span className="text-xs font-bold">{faPercent(p.percent)}</span>
            </div>
            <ol className="relative flex flex-col gap-2 border-s-2 border-border ps-4">
              {p.sections
                .filter((s) => !s.archived)
                .map((s) => (
                  <li key={s.id} className="relative">
                    <span className="absolute -start-[1.4rem] top-1 bg-surface">
                      {s.state === 'completed' ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : s.state === 'locked' ? (
                        <Lock className="size-4 text-muted" />
                      ) : (
                        <Circle className="size-4 text-info" />
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold">{s.title}</span>
                      <StatusBadge status={s.state} />
                      <span className="text-xs text-text-secondary">
                        دیده شده {faPercent(s.percent)}
                      </span>
                    </div>
                    {s.attempts.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {s.attempts.map((a) => (
                          <li
                            key={a.attemptNumber}
                            className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs"
                          >
                            {a.passed ? (
                              <CheckCircle2 className="size-3 text-success" />
                            ) : (
                              <XCircle className="size-3 text-danger" />
                            )}
                            تلاش {toPersianDigits(a.attemptNumber)}:{' '}
                            {a.score === null ? '—' : faPercent(a.score)}
                            {a.submittedAt && (
                              <span className="text-muted">({faDate(a.submittedAt)})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
            </ol>
          </Card>
        ))}
      </div>
      <aside className="flex flex-col gap-2 lg:w-80">
        <h3 className="font-bold">پیام‌ها و یادداشت‌ها</h3>
        {messages.length === 0 ? (
          <p className="text-sm text-text-secondary">هنوز پیامی ارسال نشده.</p>
        ) : (
          messages.map((m) => (
            <Card key={m.id} className="text-sm">
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="mt-1 text-xs text-muted">
                {m.type === 'note' ? 'یادداشت' : 'پیام'} • {faDateTime(m.createdAt)} •{' '}
                {m.readAt ? 'خوانده شد' : 'خوانده نشده'}
              </p>
            </Card>
          ))
        )}
      </aside>
      {canMessage && (
        <SendMessageDialog
          open={open}
          onClose={() => setOpen(false)}
          userId={user.id}
          userName={user.name}
          packages={packages.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}
    </div>
  );
}
