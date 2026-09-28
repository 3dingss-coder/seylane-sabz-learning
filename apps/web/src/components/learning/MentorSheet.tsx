import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Modal } from '@/components/ui';
import { MentorChat } from './MentorChat';

/** Floating «از منتور بپرس» button (M5/M6) opening a package-scoped chat sheet. */
export function MentorLauncher({ packageId }: { packageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 start-4 z-30 flex min-h-12 items-center gap-2 rounded-full border border-primary/30 bg-surface px-4 text-sm font-bold text-primary shadow-md md:bottom-6"
      >
        <Bot className="size-5" aria-hidden /> از منتور بپرس
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="منتور" size="lg">
        <MentorChat packageId={packageId} className="h-[60dvh]" />
      </Modal>
    </>
  );
}
