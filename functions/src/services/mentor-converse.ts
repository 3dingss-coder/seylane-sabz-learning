import type { AiMessage } from '../ai/types';
import type { ChatMessage, User } from '../domain/types';
import type { Doc } from '../store/types';
import { HOUR } from '../lib/time';
import { zonedParts } from '../lib/time';
import { normalizeFa } from './mentor';
import type { Deps } from './context';
import type { BehaviorBrief } from './behavior';

/**
 * Natural-conversation helpers for the mentor.
 *
 * The knowledge pipeline answers *facts* strictly from approved content. People, however, also say
 * "سلام", "مرسی", "خسته شدم" and "چطوری؟" — messages that have no answer in any training text and must
 * NOT be met with «نمی‌دانم». This module detects that kind of message (cheaply, with no model call),
 * rebuilds the recent conversation so the model can stay coherent, and writes the context block with
 * the user's first name, time of day and learning state.
 */
export type SmallTalk =
  'greeting' | 'wellbeing' | 'thanks' | 'farewell' | 'ack' | 'feeling' | 'chat';

// `\b` is ASCII-only in JS, so Persian words need an explicit "not followed by a letter" check.
const GREETING =
  /^(سلام|درود|های|هلو|hi|hello|hey|صبح بخیر|ظهر بخیر|عصر بخیر|شب بخیر|روز بخیر|سلام علیکم)(?![\u0600-\u06FFa-z])/i;
const WELLBEING = /(چطوری|چطورین|خوبی|خوبین|حالت چطوره|احوالت|چه خبر|چخبر|حال و احوال)/;
const THANKS = /(ممنون|مرسی|متشکر|دستت درد نکنه|دمت گرم|سپاس|thanks|thank you)/i;
const FAREWELL = /(خداحافظ|فعلا|فعلاً|شب بخیر|بای|bye|تا بعد|بعدا می‌بینمت|برم دیگه)/i;
const ACK =
  /^(باشه|اوکی|اوکیه|ok|okay|آره|بله|نه|خب|خیلی خوب|عالی|حله|متوجه شدم|فهمیدم|آها|اها)[.!؟?\s]*$/i;
const FEELING =
  /(خسته|کلافه|ناامید|حوصله ندارم|استرس|دلسرد|بی‌انگیزه|بی انگیزه|ذوق|خوشحال|عالی بود|بدحالم|حالم بده|حالم خوبه|انگیزه)/;
const ABOUT_BOT =
  /(تو کی هستی|اسمت چیه|اسمت چیست|چیکار می‌کنی|چه کار می‌کنی|چی بلدی|می‌تونی چیکار)/;
// Looks like a business/knowledge question — never treat these as small talk.
const KNOWLEDGE =
  /(محصول|برند|قیمت|عمده|ترکیب|مزیت|مشتری|آزمون|آموزش|فروش|ویزیت|کرم|ژل|شامپو|پک|بسته|مهلت|پیشرفت|کد|بارکد|ماده|موثره|مؤثره)/;

/** Returns the kind of small talk, or null when the message should go through the knowledge path. */
export function detectSmallTalk(raw: string): SmallTalk | null {
  const t = normalizeFa(raw)
    .replace(/[!؟?.،,…]+$/g, '')
    .trim();
  if (!t) return null;
  if (ACK.test(t)) return 'ack';
  const words = t.split(' ').filter(Boolean).length;
  if (KNOWLEDGE.test(t) && words > 2) return null;
  if (GREETING.test(t)) return 'greeting';
  if (words <= 8 && WELLBEING.test(t)) return 'wellbeing';
  if (words <= 8 && THANKS.test(t)) return 'thanks';
  if (words <= 6 && FAREWELL.test(t)) return 'farewell';
  if (words <= 12 && FEELING.test(t)) return 'feeling';
  if (words <= 8 && ABOUT_BOT.test(t)) return 'chat';
  return null;
}

export function firstName(user: Pick<Doc<User>, 'name'>): string {
  const n = (user.name ?? '').trim().split(/\s+/)[0] ?? '';
  return n.length >= 2 && n.length <= 20 ? n : '';
}

export function dayPart(now: Date, tz = 'Asia/Tehran'): string {
  const h = zonedParts(now, tz).hour;
  if (h < 5) return 'نیمه‌شب';
  if (h < 12) return 'صبح';
  if (h < 16) return 'ظهر/بعدازظهر';
  if (h < 20) return 'عصر';
  return 'شب';
}

export interface ConversationState {
  /** Alternating real turns, oldest first (the current message is NOT included). */
  turns: AiMessage[];
  /** True when there has been no activity for a few hours → a "hello" is natural. */
  fresh: boolean;
}

/** Rebuilds the recent conversation from chat_messages (same user, last ~8 turns, newest 6h). */
export async function recentConversation(d: Deps, user: Doc<User>): Promise<ConversationState> {
  const rows = await d.store.query<ChatMessage>({
    collection: 'chat_messages',
    where: [['userId', '==', user.id]],
    orderBy: [['createdAt', 'desc']],
    limit: 8,
  });
  const now = d.clock().getTime();
  const last = rows[0] ? Date.parse(rows[0].createdAt) : 0;
  const fresh = !rows.length || now - last > 3 * HOUR;
  const turns: AiMessage[] = fresh
    ? []
    : rows
        .filter((m) => now - Date.parse(m.createdAt) < 6 * HOUR)
        .reverse()
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text.slice(0, 400),
        }));
  return { turns, fresh };
}

/** The "state of the user" block: name, time of day and learning progress. */
export function userContextBlock(input: {
  user: Doc<User>;
  now: Date;
  brief: BehaviorBrief;
  fresh: boolean;
}): string {
  const name = firstName(input.user);
  const b = input.brief;
  const lines = [
    `- نام کوچک کاربر: ${name || 'نامشخص'}`,
    `- الان: ${dayPart(input.now)}`,
    `- ${input.fresh ? 'این اولین پیام این گفت‌وگوست (سلام طبیعی است).' : 'گفت‌وگو در جریان است (دوباره سلام نکن).'}`,
    `- روند یادگیری: ${b.state.reason}؛ سلامت مسیر ${b.state.health}٪، فشار مهلت ${b.state.pressure}٪، ${b.state.streakDays} روز پیوسته.`,
  ];
  if (b.nextAction) lines.push(`- قدم بعدی پیشنهادی: ${b.nextAction.label}`);
  const open = b.interventions.slice(0, 2).map((i) => i.message);
  if (open.length) lines.push(`- موارد باز: ${open.join(' | ')}`);
  return lines.join('\n');
}

/** Deterministic, varied replies for when no model is reachable (so «سلام» is never «نمی‌دانم»). */
export function offlineSmallTalk(
  kind: SmallTalk,
  name: string,
  part: string,
  seed: number,
): string {
  const n = name ? ` ${name}` : '';
  const pick = <T>(arr: T[]): T => arr[seed % arr.length] as T;
  switch (kind) {
    case 'greeting':
      return pick([
        `سلام${n}! ${part} بخیر. چه خبر؟`,
        `سلام${n}، خوش اومدی! امروز چی تو ذهنته؟`,
        `درود${n}! بگو ببینم، چه کمکی از من برمیاد؟`,
      ]);
    case 'wellbeing':
      return pick([
        'ممنون، خوبم! تو چطوری؟ امروز کار و آموزش چطور پیش می‌ره؟',
        'من خوبم، مرسی که پرسیدی. تو چه خبر؟',
      ]);
    case 'thanks':
      return pick(['قابلی نداشت! هر وقت خواستی بگو.', 'خواهش می‌کنم، خوشحالم که به کارت اومد.']);
    case 'farewell':
      return pick([`خداحافظ${n}، موفق باشی!`, `فعلاً${n}! هر وقت خواستی من اینجام.`]);
    case 'ack':
      return pick(['باشه، پس ادامه بدیم.', 'اوکی. اگه سؤالی بود بگو.']);
    case 'feeling':
      return pick([
        'می‌فهمم. اگه دوست داری یه قدم کوچیک بردار، بقیه‌اش رو بذار برای بعد.',
        'گاهی همین‌طوره. بگو چی اذیتت می‌کنه، شاید بتونم کمک کنم.',
      ]);
    default:
      return 'من منتور سیلانه‌سبز هستم؛ درباره‌ی آموزش‌ها، محصولات و مسیر یادگیریت کمکت می‌کنم. چی می‌خوای بدونی؟';
  }
}

/** Light clean-up of a conversational reply: no markdown, no PII, bounded length, mostly Persian. */
export function cleanConversational(raw: string, scrub: (s: string) => string): string {
  const text = scrub(
    raw
      .replace(/\[[\d۰-۹]+\]/g, '')
      .replace(/[*#`_>]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
  if (!text) return '';
  const letters = text.replace(/[^A-Za-z\u0600-\u06FF]/g, '');
  const fa = (letters.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (letters.length > 0 && fa / letters.length < 0.5) return '';
  if (text.length <= 4_000) return text;
  const cut = text.slice(0, 4_000);
  const stop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('؟'), cut.lastIndexOf('!'), cut.lastIndexOf('\n'));
  return (stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')).trim();
}
