import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, MessageSquareText } from 'lucide-react';
import { Button, EmptyState, TableSkeleton } from '@/components/ui';
import { COPY } from '@/lib/copy/fa';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faRelative } from '@/lib/format';
import { qk, useMessages, useNotifications } from '@/lib/queries';
import { track } from '@/lib/telemetry';

/** M11 — اعلان‌ها و پیام‌های مدیر. */
export function MessagesPage() {
  const [tab, setTab] = useState<'notifications' | 'messages'>('notifications');
  const n = useNotifications();
  const m = useMessages();
  const qc = useQueryClient();
  const nav = useNavigate();
  const readAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api.post(`/me/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const readMsg = useMutation({
    mutationFn: (id: string) => api.post(`/me/messages/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.messages }),
  });
  const unreadMsgs = (m.data ?? []).filter((x) => !x.readAt).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={COPY.messages.title}
        actions={
          tab === 'notifications' && (n.data?.unread ?? 0) > 0 ? (
            <Button
              variant="ghost"
              loading={readAll.isPending}
              onClick={() => readAll.mutate()}
              icon={<CheckCheck className="size-4" aria-hidden />}
            >
              {COPY.messages.markAllRead}
            </Button>
          ) : undefined
        }
      />
      <Tabs
        label={COPY.messages.typeLabel}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'notifications', label: COPY.messages.notifications, count: n.data?.unread },
          { value: 'messages', label: COPY.messages.managerMessages, count: unreadMsgs },
        ]}
      />
      {tab === 'notifications' ? (
        <QueryState
          query={n}
          loading={<TableSkeleton rows={5} />}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              character="seyla"
              title={COPY.messages.emptyNotifications}
              description={COPY.empty.messages}
              actionText={COPY.messages.goToPath}
              onAction={() => nav('/learn')}
            />
          }
        >
          {(d) => (
            <ul className="stagger flex flex-col gap-2">
              {d.items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!it.readAt) readOne.mutate(it.id);
                      if (it.actionRef) {
                        track('notification_cta_clicked', { source: 'in_app', type: it.type });
                        nav(it.actionRef);
                      }
                    }}
                    className={cn(
                      'pressable flex w-full items-start gap-3 rounded-card border p-3 text-start shadow-xs hover:shadow-sm',
                      it.readAt ? 'border-border bg-surface' : 'border-primary/30 bg-primary-light',
                    )}
                  >
                    <Bell
                      className={cn(
                        'mt-0.5 size-5 shrink-0',
                        it.readAt ? 'text-muted-fg' : 'text-primary',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-text">{it.title}</p>
                      <p className="text-sm leading-6 text-text-secondary">{it.body}</p>
                      <p className="mt-1 text-xs text-muted-fg">{faRelative(it.createdAt)}</p>
                    </div>
                    {!it.readAt && (
                      <span
                        className="relative mt-2 flex size-2 shrink-0"
                        aria-label={COPY.messages.unread}
                      >
                        <span
                          aria-hidden
                          className="animate-pulse-dot absolute inset-0 rounded-full bg-primary"
                        />
                        <span className="relative size-2 rounded-full bg-primary" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      ) : (
        <QueryState
          query={m}
          loading={<TableSkeleton rows={4} />}
          isEmpty={(d) => d.length === 0}
          empty={
            <EmptyState
              character="seyla"
              title={COPY.messages.emptyMessages}
              description={COPY.messages.messagesNote}
              actionText={COPY.messages.goHome}
              onAction={() => nav('/')}
            />
          }
        >
          {(list) => (
            <ul className="stagger flex flex-col gap-2">
              {list.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!it.readAt) readMsg.mutate(it.id);
                      if (it.packageId) nav(`/packages/${it.packageId}`);
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-card border p-3 text-start',
                      it.readAt ? 'border-border bg-surface' : 'border-warning/30 bg-warning-light',
                    )}
                  >
                    <MessageSquareText
                      className="mt-0.5 size-5 shrink-0 text-warning"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-text">
                        {it.fromName}
                        {it.type === 'note' && (
                          <span className="ms-2 text-xs font-normal text-text-secondary">
                            {COPY.messages.noteOnTraining}
                          </span>
                        )}
                      </p>
                      <p className="whitespace-pre-line text-sm leading-6 text-text">{it.body}</p>
                      <p className="mt-1 text-xs text-muted-fg">{faRelative(it.createdAt)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      )}
    </div>
  );
}
