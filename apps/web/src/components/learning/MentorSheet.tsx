import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Modal } from '@/components/ui';
import { track } from '@/lib/telemetry';
import { MentorChat } from './MentorChat';

/** Floating «از منتور بپرس» button (M5/M6) opening a package-scoped chat sheet. */
export function MentorLauncher({ packageId }: { packageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          track('mentor_chat_opened', { context: 'package' });
        }}
        className="pressable glass fixed bottom-28 start-4 z-30 flex min-h-12 items-center gap-2 rounded-full border border-primary/30 px-4 text-sm font-bold text-primary shadow-lg hover:-translate-y-0.5 md:bottom-6"
      >
        <span className="relative flex">
          <span
            aria-hidden
            className="animate-pulse-dot absolute inset-0 rounded-full bg-primary"
          />
          <Bot className="relative size-5" aria-hidden />
        </span>
        از منتور بپرس
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="منتور" size="lg">
        <MentorChat packageId={packageId} className="h-[60dvh]" />
      </Modal>
    </>
  );
}
