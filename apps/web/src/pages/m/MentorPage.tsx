import { Bot, PhoneCall } from 'lucide-react';
import { MentorChat } from '@/components/learning/MentorChat';

/**
 * M9 — منتور.
 *
 * The mentor page is *only* the chat: the marketer opens it to ask and the mentor answers, like a
 * colleague on the other end of a chat. The performance-analysis card and the rule-based nudge
 * list that used to share this screen moved to Home (where the next action lives) — a second
 * place to read the same state was one screen too many.
 */
export function MentorPage() {
  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-light">
          <Bot className="size-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-6">منتور</h1>
          <p className="flex items-center gap-1 text-xs text-text-secondary">
            <PhoneCall className="size-3" aria-hidden />
            درباره‌ی هر محصول، برند یا آزمونی بپرس
          </p>
        </div>
      </div>
      <MentorChat packageId={null} className="min-h-0 flex-1" />
    </div>
  );
}
