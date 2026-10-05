import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  FileText,
  ImagePlus,
  Link2,
  Mic,
  PhoneCall,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { Button, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { qk } from '@/lib/queries';
import { readPageContext } from '@/lib/pageContext';
import {
  listenFa,
  recordUntilSilence,
  speechSupported,
  type ListenHandle,
  type RecordedSpeech,
} from '@/lib/speech';
import { micSupported } from '@/lib/voice';
import { VoiceCallSheet } from './VoiceCallSheet';
import { track } from '@/lib/telemetry';
import type { ChatMessage, ChatReply, VoiceTurnReply } from '@/lib/types';

interface PendingAttachment {
  kind: 'image' | 'text' | 'link';
  name?: string;
  mime?: string;
  text?: string;
  url?: string;
  base64?: string;
  preview?: string;
}

async function fileToJpeg(file: File): Promise<PendingAttachment> {
  const bmp = await createImageBitmap(file);
  const max = 1024;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.62));
  bmp.close?.();
  if (!blob) throw new Error('blob');
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const base64 = btoa(binary);
  if (base64.length > 180_000) throw new Error('big');
  return {
    kind: 'image',
    name: file.name,
    mime: 'image/jpeg',
    base64,
    preview: URL.createObjectURL(blob),
  };
}

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
  const [listening, setListening] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  const send = useMutation({
    mutationFn: (msg: { text: string; attachments?: PendingAttachment[] }) => {
      const page = readPageContext();
      return api.post<ChatReply>('/me/mentor/ask', {
        text: msg.text,
        packageId: packageId ?? page?.packageId ?? null,
        page: page ?? undefined,
        attachments: msg.attachments?.map((att) => {
          const next = { ...att };
          delete next.preview;
          return next;
        }),
      });
    },
    onMutate: (msg) => setPending(msg.text || msg.attachments?.[0]?.name || 'پیوست'),
    onSuccess: (r, msg) => {
      const now = new Date().toISOString();
      const shown =
        msg.text || msg.attachments?.map((a) => a.name || a.url || 'پیوست').join('، ') || 'پیوست';
      qc.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old,
        {
          id: `local-${now}`,
          role: 'user',
          text: shown,
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
      setAttachments([]);
      setPlusOpen(false);
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
    // The typeof guard keeps the chat alive in environments without it (jsdom, old WebViews).
    if (typeof end.current?.scrollIntoView === 'function')
      end.current.scrollIntoView({ block: 'end' });
  }, [history.data, pending]);
  useEffect(() => () => listenRef.current?.stop(), []);

  const stopListen = () => {
    listenRef.current?.stop();
    listenRef.current = null;
    setListening(false);
  };
  const submit = (e?: FormEvent, t = text, extra = attachments) => {
    e?.preventDefault();
    const v = t.trim();
    if ((!v && extra.length === 0) || send.isPending) return;
    stopListen();
    send.mutate({ text: v, attachments: extra.length ? extra : undefined });
  };
  const pushTurn = (userText: string, reply: ChatReply | VoiceTurnReply) => {
    const now = new Date().toISOString();
    qc.setQueryData<ChatMessage[]>(key, (old = []) => [
      ...old,
      {
        id: `local-${now}`,
        role: 'user',
        text: userText,
        sources: [],
        outcome: null,
        feedback: null,
        mode: 'voice',
        createdAt: now,
      },
      {
        id: ('messageId' in reply ? reply.messageId : null) ?? `local-reply-${now}`,
        role: 'assistant',
        text: reply.reply,
        sources: reply.sources,
        outcome: reply.outcome,
        feedback: null,
        mode: 'voice',
        provider: reply.provider ?? null,
        latencyMs: 'latency' in reply ? reply.latency.totalMs : (reply.latencyMs ?? null),
        createdAt: now,
      },
    ]);
  };
  const sendAudio = async (audio: RecordedSpeech) => {
    if (audio.base64.length > 700_000) {
      toast.show({ type: 'error', message: 'صدا طولانی شد. کوتاه‌تر حرف بزن و دوباره بفرست.' });
      return;
    }
    setPending('در حال شنیدن صدا…');
    const page = readPageContext();
    try {
      const reply = await api.post<VoiceTurnReply>('/me/mentor/voice/turn', {
        audio: audio.base64,
        mime: audio.mime,
        durationSec: audio.durationSec,
        packageId: packageId ?? page?.packageId ?? null,
        page: page ?? undefined,
      });
      pushTurn(reply.transcript || 'پیام صوتی', reply);
    } catch (e) {
      toast.show({ type: 'error', message: errMsg(e) });
    } finally {
      setPending(null);
    }
  };
  const startMic = () => {
    if (listening) {
      listenRef.current?.finish?.();
      listenRef.current = null;
      setListening(false);
      return;
    }
    if (micSupported()) {
      setListening(true);
      listenRef.current = recordUntilSilence({
        onSilence: (audio) => {
          setListening(false);
          listenRef.current = null;
          void sendAudio(audio);
        },
        onError: (message) => {
          setListening(false);
          listenRef.current = null;
          toast.show({ type: 'error', message });
        },
      });
      return;
    }
    if (!speechSupported()) {
      toast.show({
        type: 'error',
        message: 'این مرورگر میکروفن را پشتیبانی نمی‌کند. سؤال را بنویس.',
      });
      return;
    }
    setListening(true);
    listenRef.current = listenFa({
      onPartial: setText,
      onSilence: (said) => {
        setListening(false);
        listenRef.current = null;
        setText(said);
        submit(undefined, said);
      },
      onError: (message) => {
        setListening(false);
        listenRef.current = null;
        toast.show({ type: 'error', message });
      },
    });
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
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <span
              key={`${a.kind}-${i}`}
              className="flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-xs text-text"
            >
              {a.preview ? (
                <img src={a.preview} alt="" className="size-8 rounded-full object-cover" />
              ) : null}
              <span className="truncate">{a.name || a.url || 'پیوست'}</span>
              <button
                type="button"
                aria-label="حذف پیوست"
                className="flex size-8 items-center justify-center text-muted-fg"
                onClick={() => setAttachments((old) => old.filter((_, idx) => idx !== i))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        onSubmit={submit}
        className="mt-2 flex w-full min-w-0 items-center gap-1 border-t border-border pt-2"
      >
        <label htmlFor="mentor-input" className="sr-only">
          سؤال شما
        </label>
        <input
          id="mentor-input"
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? 'در حال شنیدن… بعد از سکوت ارسال می‌شود' : 'سؤالت را بنویس…'}
          className="min-h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-base shadow-xs transition-[border-color,box-shadow] focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15"
        />
        <div className="relative shrink-0">
          <Button
            type="button"
            variant="secondary"
            aria-label="پیوست تصویر، متن یا لینک"
            aria-expanded={plusOpen}
            onClick={() => setPlusOpen((v) => !v)}
            className="!size-12 !min-h-12 !px-0"
            icon={<Plus className="size-5" aria-hidden />}
          />
          {plusOpen && (
            <div className="absolute bottom-full z-20 mb-2 flex w-56 max-w-[70vw] flex-col gap-1 rounded-card border border-border bg-surface p-2 shadow-md end-0">
              <button
                type="button"
                className="flex min-h-12 items-center gap-2 rounded-input px-2 text-sm hover:bg-surface-2"
                onClick={() => imageRef.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden /> تصویر
              </button>
              <button
                type="button"
                className="flex min-h-12 items-center gap-2 rounded-input px-2 text-sm hover:bg-surface-2"
                onClick={() => textRef.current?.click()}
              >
                <FileText className="size-4" aria-hidden /> متن
              </button>
              <div className="flex gap-1">
                <input
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  placeholder="لینک سایت"
                  aria-label="لینک سایت"
                  className="min-h-12 flex-1 rounded-input border border-border px-2 text-sm"
                />
                <button
                  type="button"
                  aria-label="افزودن لینک"
                  className="flex size-12 items-center justify-center"
                  onClick={() => {
                    const url = linkDraft.trim();
                    if (!/^https?:\/\//i.test(url)) {
                      toast.show({
                        type: 'error',
                        message: 'لینک باید با http:// یا https:// شروع شود.',
                      });
                      return;
                    }
                    const att: PendingAttachment = { kind: 'link', url, name: url };
                    setAttachments((old) => [...old, att].slice(0, 3));
                    setLinkDraft('');
                    setPlusOpen(false);
                  }}
                >
                  <Link2 className="size-4" />
                </button>
              </div>
              <button
                type="button"
                className="flex min-h-12 items-center gap-2 rounded-input px-2 text-sm hover:bg-surface-2"
                onClick={() => {
                  setPlusOpen(false);
                  setCallOpen(true);
                  track('mentor_voice_opened', { context: packageId ? 'package' : 'general' });
                }}
              >
                <PhoneCall className="size-4" aria-hidden /> تماس صوتی
              </button>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant={listening ? 'primary' : 'secondary'}
          aria-label={listening ? 'توقف ضبط و ارسال' : 'گفتن سؤال با صدا'}
          aria-pressed={listening}
          onClick={startMic}
          className="!size-12 !min-h-12 !px-0"
          icon={<Mic className="size-5" aria-hidden />}
        />
        <Button
          type="submit"
          className="!size-12 !min-h-12 shrink-0 !rounded-full !px-0"
          aria-label="ارسال"
          loading={send.isPending}
          disabled={!text.trim() && attachments.length === 0}
          icon={<Send className="size-5" aria-hidden />}
        />
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void fileToJpeg(file)
              .then((att) => {
                setAttachments((old) => {
                  const images = old.filter((a) => a.kind === 'image').length;
                  if (images >= 1) {
                    toast.show({
                      type: 'error',
                      message: 'در هر پیام فقط یک تصویر بفرست تا از حد حجم رد نشود.',
                    });
                    return old;
                  }
                  return [...old, att].slice(0, 3);
                });
                setPlusOpen(false);
              })
              .catch(() =>
                toast.show({
                  type: 'error',
                  message: 'این تصویر قابل ارسال نیست. یک عکس کوچک‌تر انتخاب کن.',
                }),
              );
          }}
        />
        <input
          ref={textRef}
          type="file"
          accept=".txt,.md,.markdown,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void file.text().then((raw) => {
              const textBody = raw.trim().slice(0, 12_000);
              if (!textBody) {
                toast.show({ type: 'error', message: 'این فایل متنی خالی است.' });
                return;
              }
              const att: PendingAttachment = {
                kind: 'text',
                name: file.name,
                text: textBody,
                mime: 'text/plain',
              };
              setAttachments((old) => [...old, att].slice(0, 3));
              setPlusOpen(false);
            });
          }}
        />
      </form>
      {callOpen && <VoiceCallSheet packageId={packageId} onClose={() => setCallOpen(false)} />}
    </div>
  );
}
