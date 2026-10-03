import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePresence } from '@/lib/motion';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Footer actions (primary CTA first). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

// Every open modal registers here; only the topmost one closes on Escape. A confirm dialog nested
// inside a form dialog (e.g. «بازنشانی رمز» in UsersPage) used to close both at once, discarding
// data the outer dialog was still holding.
const openStack: symbol[] = [];
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal (§16.5 radius 16, max 2 levels). Esc closes, focus is trapped & restored.
 * Mobile: bottom sheet that slides up · desktop: centred card that scales in · blurred backdrop.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const { mounted, closing } = usePresence(open, 200);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    openStack.push(token);
    const isTop = () => openStack[openStack.length - 1] === token;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isTop()) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (!firstEl || !lastEl) return;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      const i = openStack.indexOf(token);
      if (i >= 0) openStack.splice(i, 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      aria-hidden={closing || undefined}
      inert={closing || undefined}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 bg-scrim backdrop-blur-sm',
          closing ? 'animate-fade-out' : 'animate-fade-in',
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90dvh] w-full flex-col rounded-t-modal border border-border/70 bg-surface shadow-lg sm:rounded-modal',
          closing
            ? 'animate-sheet-out sm:animate-scale-out'
            : 'animate-sheet-in sm:animate-scale-in',
          SIZES[size],
        )}
      >
        {/* grab handle — a visual cue that the sheet can be dismissed (mobile only) */}
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <h2 id={titleId} className="text-lg font-bold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="pressable flex size-12 items-center justify-center rounded-input text-muted-fg hover:bg-background hover:text-text"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border p-4 safe-bottom sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
