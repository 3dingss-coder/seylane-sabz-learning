// Adapted from helper kit: «اپ بازاریاب/کامپوننت‌ها/common/Toast.tsx»
// — decoupled from AppContext into a standalone provider, tokens instead of emerald/rose,
//   auto-dismiss timings from §16.5 (success 3s / error 6s + action), top placement on mobile.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { exitDelay } from '@/lib/motion';
import {
  DEFAULT_DURATION,
  ToastContext,
  type ToastApi,
  type ToastItem,
  type ToastType,
} from './toast-context';

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />,
  error: <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />,
  warning: <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />,
  info: <Info className="size-5 shrink-0 text-info" aria-hidden />,
};

const BORDERS: Record<ToastType, string> = {
  success: 'border-success/40',
  error: 'border-danger/40',
  warning: 'border-warning/40',
  info: 'border-info/40',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const [leaving, setLeaving] = useState<number[]>([]);

  // exit animation first (180ms), then remove
  const dismiss = useCallback((id: number) => {
    const remove = () => {
      setToasts((list) => list.filter((t) => t.id !== id));
      setLeaving((l) => l.filter((x) => x !== id));
    };
    const wait = exitDelay(180);
    if (wait === 0) return remove();
    setLeaving((l) => (l.includes(id) ? l : [...l, id]));
    window.setTimeout(remove, wait);
  }, []);

  const show = useCallback<ToastApi['show']>(
    (input) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.durationMs ?? DEFAULT_DURATION[input.type]);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-md flex-col gap-2 safe-top"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={cn(
              'glass pointer-events-auto flex items-center gap-3 rounded-card border bg-surface p-3 shadow-lg',
              leaving.includes(t.id) ? 'animate-toast-out' : 'animate-toast-in',
              BORDERS[t.type],
            )}
          >
            {ICONS[t.type]}
            <p className="flex-1 text-sm font-medium text-text">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="min-h-12 rounded-input px-3 text-sm font-bold text-primary hover:bg-primary-light pressable"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="بستن پیام"
              className="flex size-12 items-center justify-center rounded-input text-muted-fg hover:bg-background hover:text-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
