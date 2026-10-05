import type { ChatMessage } from '../domain/types';
import type { Deps } from './context';

/**
 * Long-term mentor memory, separate from the short "are we still in this chat" window.
 *
 * The live greeting window may reset after a few quiet hours. This memory must not: a marketer
 * who comes back tomorrow should still have their last questions, and chats older than the
 * verbatim window are compressed into a retained summary instead of being forgotten.
 */
export const MEMORY_COLLECTION = 'mentor_memory';
export const MEMORY_USER_TURNS = 50;
export const MEMORY_USER_BUDGET = 24_000;
export const MEMORY_SUMMARY_BUDGET = 2_500;
const QUERY_LIMIT = 400;
const DIALOGUE_TURNS = 8;

export interface MentorMemoryDoc {
  userId: string;
  /** Compressed older chats. Never wiped by the fresh-chat timer. */
  summary: string;
  /** createdAt of the newest user message already folded into `summary`. */
  coveredUntil: string | null;
  updatedAt: string;
}

export interface MentorMemoryView {
  summary: string;
  /** Previous user messages, oldest first, verbatim within the budget. */
  userTexts: string[];
  recentTurns: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** No messages, or the last one is more than a few hours old. */
  fresh: boolean;
}

const FRESH_MS = 3 * 60 * 60 * 1000;

export function clipAtBoundary(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('؟'), cut.lastIndexOf('!'), cut.lastIndexOf('\n'));
  if (stop > Math.min(80, max * 0.4)) return cut.slice(0, stop + 1).trim();
  return cut.replace(/\s+\S*$/, '').trim();
}

/** Folds older user questions into a rolling summary. Keeps the newest tail when it grows. */
export function compressOlderChats(previous: string, olderUserTexts: string[]): string {
  const lines = olderUserTexts
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 1)
    .map((t) => `- ${t.slice(0, 180)}`);
  const block = lines.length ? `سؤالات قبلی:\n${lines.join('\n')}` : '';
  const next = [previous.trim(), block].filter(Boolean).join('\n');
  if (next.length <= MEMORY_SUMMARY_BUDGET) return next;
  return next.slice(next.length - MEMORY_SUMMARY_BUDGET).replace(/^[^\n]*\n?/, '').trim();
}

export function windowUserTexts(
  texts: string[],
  limit = MEMORY_USER_TURNS,
  budget = MEMORY_USER_BUDGET,
): { kept: string[]; overflow: string[] } {
  const recent = texts.slice(-limit);
  const overflow = texts.slice(0, Math.max(0, texts.length - recent.length));
  const kept = [...recent];
  while (kept.length > 1 && kept.join('\n').length > budget) overflow.push(kept.shift() ?? '');
  return { kept, overflow: overflow.filter((t) => t.trim().length > 0) };
}

export function renderMemoryBlock(view: Pick<MentorMemoryView, 'summary' | 'userTexts'>): string {
  if (!view.summary.trim() && view.userTexts.length === 0) return '';
  const lines = [
    'حافظهٔ گفت‌وگو با همین کاربر (فقط برای پیوستگی حرف است؛ منبع واقعیت محصول، قیمت یا ادعا نیست):',
  ];
  if (view.summary.trim()) lines.push(`خلاصهٔ گفت‌وگوهای قدیمی‌تر:\n${view.summary.trim()}`);
  if (view.userTexts.length) {
    lines.push(`پیام‌های قبلی خود کاربر (${view.userTexts.length} مورد؛ جدیدترین در آخر):`);
    for (const t of view.userTexts) lines.push(`- ${t}`);
  }
  return lines.join('\n');
}

/**
 * Rebuilds memory from stored chat plus the retained summary.
 * Does not apply the 3-hour fresh-chat wipe.
 */
export async function syncMentorMemory(d: Deps, userId: string): Promise<MentorMemoryView> {
  const stored = await d.store.get<MentorMemoryDoc>(`${MEMORY_COLLECTION}/${userId}`);
  const rows = await d.store.query<ChatMessage>({
    collection: 'chat_messages',
    where: [['userId', '==', userId]],
    orderBy: [['createdAt', 'desc']],
    limit: QUERY_LIMIT,
  });
  const chronological = rows.slice().reverse();
  const userRows = chronological.filter((m) => m.role === 'user' && m.text.trim());
  const coveredUntil = stored?.coveredUntil ?? null;
  // Already-folded messages stay in the summary only. Putting them back in the window made a
  // long chat append the same lines to the summary on every later question.
  const pending = userRows.filter((m) => !coveredUntil || m.createdAt > coveredUntil);
  const windowRows = pending.slice(-MEMORY_USER_TURNS);
  const olderRows = pending.slice(0, Math.max(0, pending.length - windowRows.length));
  const toFold = olderRows;
  let summary = compressOlderChats(
    stored?.summary ?? '',
    toFold.map((m) => m.text),
  );
  let newestFolded = toFold.length ? (toFold[toFold.length - 1]?.createdAt ?? coveredUntil) : coveredUntil;

  const keptRows = [...windowRows];
  while (keptRows.length > 1 && keptRows.map((m) => m.text.trim()).join('\n').length > MEMORY_USER_BUDGET) {
    const dropped = keptRows.shift();
    if (!dropped) break;
    summary = compressOlderChats(summary, [dropped.text]);
    newestFolded = dropped.createdAt;
  }
  const userTexts = keptRows.map((m) => m.text.trim());

  if (summary !== (stored?.summary ?? '') || newestFolded !== coveredUntil) {
    const doc: MentorMemoryDoc = {
      userId,
      summary,
      coveredUntil: newestFolded,
      updatedAt: d.clock().toISOString(),
    };
    await d.store.set(`${MEMORY_COLLECTION}/${userId}`, doc as unknown as Record<string, unknown>);
  }

  const recentTurns = chronological.slice(-DIALOGUE_TURNS).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    text: clipAtBoundary(m.text, 800),
  }));
  const lastAt = chronological.length
    ? Date.parse(chronological[chronological.length - 1]?.createdAt ?? '')
    : 0;
  const fresh = !chronological.length || Number.isNaN(lastAt) || d.clock().getTime() - lastAt > FRESH_MS;

  return { summary, userTexts, recentTurns, fresh };
}
