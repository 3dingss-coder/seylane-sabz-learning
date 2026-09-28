import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { qk } from '@/lib/queries';
import type { ChatMessage, ChatReply } from '@/lib/types';

const SUGGESTIONS = [
  'مزیت اصلی این محصول چیست؟',
  'به مشتری مردد چه بگویم؟',
  'نکات مهم این آموزش را خلاصه کن',
];

/** M9 — منتور AI chat (RAG over approved content only; server enforces guardrails). */
export function MentorChat({
  packageId,
  className,
}: {
  packageId: string | null;
  className?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = qk.chat(packageId);
  const history = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api.get<ChatMessage[]>(
        `/me/mentor/history${packageId ? `?packageId=${encodeURIComponent(packageId)}` : ''}`,
        signal,
      ),
  });
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (t: string) => api.post<ChatReply>('/me/mentor/chat', { text: t, packageId }),
    onMutate: (t) => setPending(t),
    onSuccess: (r, t) => {
      const now = new Date().toISOString();
      qc.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old,
        {
          id: `local-${now}`,
          role: 'user',
          text: t,
          sources: [],
          outcome: null,
          feedback: null,
          createdAt: now,
        },
        {
          id: r.messageId,
          role: 'assistant',
          text: r.reply,
          sources: r.sources,
          outcome: r.outcome,
          feedback: null,
          createdAt: now,
        },
      ]);
      setText('');
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
    onSettled: () => setPending(null),
  });
  const fb = useMutation({
    mutationFn: (v: { messageId: string; feedback: 'up' | 'down' }) =>
      api.post('/me/mentor/feedback', v),
    onSuccess: (_r, v) =>
      qc.setQueryData<ChatMessage[]>(key, (old = []) =>
        old.map((m) => (m.id === v.messageId ? { ...m, feedback: v.feedback } : m)),
      ),
  });

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [history.data, pending]);

  const submit = (e?: FormEvent, t = text) => {
    e?.preventDefault();
    const v = t.trim();
    if (v && !send.isPending) send.mutate(v);
  };
  const msgs = history.data ?? [];
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex-1 space-y-3 overflow-y-auto p-1" aria-live="polite">
        {history.isPending && <Skeleton className="h-16 w-3/4" />}
        {!history.isPending && msgs.length === 0 && !pending && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Bot className="size-10 text-primary" aria-hidden />
            <p className="text-sm text-text-secondary">
              سؤالت درباره محصولات و آموزش‌ها را بپرس. فقط از محتوای تأییدشده جواب می‌دهم.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(undefined, s)}
                  className="min-h-12 rounded-card border border-border bg-surface px-3 text-sm text-text hover:border-primary/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div
            key={m.id}
            className={cn('flex flex-col', m.role === 'user' ? 'items-start' : 'items-end')}
          >
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-line rounded-card px-3 py-2 text-sm leading-7',
                m.role === 'user'
                  ? 'bg-primary text-white'
                  : 'border border-border bg-surface text-text',
              )}
            >
              {m.text}
              {m.sources.length > 0 && (
                <p className="mt-1 text-xs text-text-secondary">
                  منبع: {m.sources.map((s) => s.title).join('، ')}
                </p>
              )}
            </div>
            {m.role === 'assistant' && !m.id.startsWith('local-') && (
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="مفید بود"
                  aria-pressed={m.feedback === 'up'}
                  onClick={() => fb.mutate({ messageId: m.id, feedback: 'up' })}
                  className={cn(
                    'flex size-12 items-center justify-center',
                    m.feedback === 'up' ? 'text-primary' : 'text-muted',
                  )}
                >
                  <ThumbsUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="مفید نبود"
                  aria-pressed={m.feedback === 'down'}
                  onClick={() => fb.mutate({ messageId: m.id, feedback: 'down' })}
                  className={cn(
                    'flex size-12 items-center justify-center',
                    m.feedback === 'down' ? 'text-danger' : 'text-muted',
                  )}
                >
                  <ThumbsDown className="size-4" />
                </button>
              </div>
            )}
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-card bg-primary px-3 py-2 text-sm text-white">
                {pending}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="rounded-card border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
                در حال فکر کردن…
              </div>
            </div>
          </>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2 border-t border-border pt-2">
        <label htmlFor="mentor-input" className="sr-only">
          سؤال شما
        </label>
        <input
          id="mentor-input"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="سؤالت را بنویس…"
          className="min-h-12 flex-1 rounded-input border border-border bg-surface px-3 text-base focus:border-info focus:outline-none focus:ring-2 focus:ring-info/30"
        />
        <Button
          type="submit"
          aria-label="ارسال"
          loading={send.isPending}
          disabled={!text.trim()}
          icon={<Send className="size-5" aria-hidden />}
        />
      </form>
    </div>
  );
}
