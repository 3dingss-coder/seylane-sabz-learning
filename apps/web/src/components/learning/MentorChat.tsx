import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, PhoneCall, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { qk } from '@/lib/queries';
import { micSupported } from '@/lib/voice';
import { VoiceCallSheet } from './VoiceCallSheet';
import { track } from '@/lib/telemetry';
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
  const [callOpen, setCallOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // `/me/mentor/ask` is the hybrid-retrieval, multi-provider pipeline; the older `/me/mentor/chat`
  // endpoint stays for clients that are still on the previous build.
  const send = useMutation({
    mutationFn: (t: string) => api.post<ChatReply>('/me/mentor/ask', { text: t, packageId }),
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
          mode: 'text',
          createdAt: now,
        },
        {
          // Defensive: never let a reply without an id crash the list (m.id.startsWith).
          id: r.messageId ?? `local-reply-${now}`,
          role: 'assistant',
          text: r.reply,
          sources: r.sources,
          outcome: r.outcome,
          feedback: null,
          mode: 'text',
          provider: r.provider ?? null,
          latencyMs: r.latencyMs ?? null,
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

  useEffect(() => {
    // Braces on purpose: newer Chrome versions return a Promise from scrollIntoView, and React
    // treats a value returned from an effect as its cleanup function ("C is not a function").
    end.current?.scrollIntoView({ block: 'end' });
  }, [history.data, pending]);

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
            <span className="animate-float flex size-16 items-center justify-center rounded-full bg-hero shadow-md">
              <Bot className="size-8 text-white" aria-hidden />
            </span>
            <p className="text-sm text-text-secondary">
              سؤالت درباره محصولات و آموزش‌ها را بپرس. فقط از محتوای تأییدشده جواب می‌دهم.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(undefined, s)}
                  className="pressable min-h-12 rounded-full border border-border bg-surface px-4 text-sm text-text shadow-xs hover:border-primary/40 hover:bg-primary-light"
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
            className={cn(
              'animate-fade-up flex flex-col',
              m.role === 'user' ? 'items-start' : 'items-end',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-line rounded-[18px] px-3.5 py-2 text-sm leading-7 shadow-xs',
                m.role === 'user'
                  ? 'rounded-se-md bg-primary bg-brand-gradient text-on-primary'
                  : 'rounded-ee-md border border-border bg-surface text-text',
              )}
            >
              {m.text}
              {m.mode === 'voice' && (
                <span className="mt-1 block text-xs text-text-secondary">تماس صوتی</span>
              )}
              {(m.sources?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-text-secondary">
                  منبع: {(m.sources ?? []).map((s) => s.title).join('، ')}
                </p>
              )}
            </div>
            {m.role === 'assistant' && !(m.id ?? '').startsWith('local-') && (
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="مفید بود"
                  aria-pressed={m.feedback === 'up'}
                  onClick={() => fb.mutate({ messageId: m.id, feedback: 'up' })}
                  className={cn(
                    'flex size-12 items-center justify-center',
                    m.feedback === 'up' ? 'text-primary' : 'text-muted-fg',
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
                    m.feedback === 'down' ? 'text-danger' : 'text-muted-fg',
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
            <div className="animate-fade-up flex justify-start">
              <div className="max-w-[85%] rounded-[18px] rounded-se-md bg-primary px-3.5 py-2 text-sm text-on-primary">
                {pending}
              </div>
            </div>
            <div className="animate-fade-up flex justify-end">
              <div
                role="status"
                className="flex items-center gap-1 rounded-[18px] rounded-ee-md border border-border bg-surface px-4 py-3 text-text-secondary"
              >
                <span className="sr-only">در حال فکر کردن…</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="animate-blink size-2 rounded-full bg-primary"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
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
          className="min-h-12 flex-1 rounded-full border border-border bg-surface px-4 text-base shadow-xs transition-[border-color,box-shadow] focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15"
        />
        {micSupported() && (
          <Button
            type="button"
            variant="secondary"
            aria-label="تماس صوتی با منتور"
            onClick={() => {
              setCallOpen(true);
              track('mentor_voice_opened', { context: packageId ? 'package' : 'general' });
            }}
            icon={<PhoneCall className="size-5" aria-hidden />}
          />
        )}
        <Button
          type="submit"
          className="shrink-0 !rounded-full"
          aria-label="ارسال"
          loading={send.isPending}
          disabled={!text.trim()}
          icon={<Send className="size-5" aria-hidden />}
        />
      </form>
      {callOpen && <VoiceCallSheet packageId={packageId} onClose={() => setCallOpen(false)} />}
    </div>
  );
}
