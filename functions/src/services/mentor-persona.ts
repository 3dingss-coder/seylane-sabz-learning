import { normalizeFa, scrubPii } from './mentor';

/**
 * Conversational layer of the mentor.
 *
 * The grounded pipeline (retrieval → facts → model) answers *company knowledge* questions. Real
 * people do not talk like that all the time: they say hello, thank you, ask «چطوری؟», complain
 * about a long day. This module detects those turns deterministically (zero cost, zero latency,
 * no model needed to decide) and provides the natural-sounding fallbacks used when no AI provider
 * is reachable. Facts are never produced here — only social talk and honest «I don't have that».
 */

export type SocialKind =
  'greeting' | 'how_are_you' | 'thanks' | 'farewell' | 'identity' | 'ack' | 'feelings' | 'progress';

const wordCount = (s: string) => s.split(' ').filter(Boolean).length;
const strip = (s: string) =>
  normalizeFa(s)
    .toLowerCase()
    .replace(/[!؟?.،,:;…«»"'()\-~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Returns the kind of small-talk the message is, or null when it looks like a real question. */
export function classifySocial(raw: string): SocialKind | null {
  const t = strip(raw);
  if (!t) return null;
  const words = wordCount(t);
  if (words > 8) return null;

  if (
    /(خسته ام|خسته‌ام|خسته شدم|کلافه|ناامید|بی حوصله|حوصله ندارم|انگیزه ندارم|استرس دارم|حالم بد|دلم گرفته)/.test(
      t,
    )
  )
    return 'feelings';
  if (
    /(پیشرفت(م| من)|وضعیت(م| من)|عملکرد(م| من)|چیکار کنم|چی کار کنم|چی ببینم|بعدش چی|امروز چی|الان چی|عقب موندم|مهلت(م| من)?)/.test(
      t,
    )
  )
    return 'progress';
  if (
    /(تو کی هستی|کی هستی|تو کی|اسمت چیه|اسم تو چیه|اسمت چی|تو چی هستی|چیکار میتونی|چه کاری از تو|کارت چیه|چه کمکی میتونی|معرفی کن)/.test(
      t,
    )
  )
    return 'identity';
  if (/(خداحافظ|بای|فعلا|شب خوش|به امید دیدار|میرم دیگه)/.test(t)) return 'farewell';
  if (/(ممنون|مرسی|دستت درد نکنه|دست شما درد نکنه|سپاس|تشکر|دمت گرم|قربونت)/.test(t))
    return 'thanks';
  if (
    /^(باشه|اوکی|ok|آره|اره|بله|نه|خب|خوبه|عالیه|عالی|فهمیدم|متوجه شدم|چشم|حله|مرسی باشه|آها|اها|ای بابا)$/.test(
      t,
    )
  )
    return 'ack';
  if (
    /^(سلام|درود|های|هلو|hi|hello|hey|صبح بخیر|ظهر بخیر|عصر بخیر|شب بخیر|روز بخیر|وقت بخیر)/.test(t)
  ) {
    if (/(چطوری|چطورید|خوبی|خوبین|حالت|حال شما|احوال)/.test(t)) return 'how_are_you';
    return words <= 5 ? 'greeting' : null;
  }
  if (/^(چطوری|چطوری؟|خوبی|خوبین|حالت چطوره|چه خبر|چخبر|احوالت|حال شما چطوره)/.test(t))
    return 'how_are_you';
  return null;
}

/** First token of the display name (Persian names: «سارا احمدی» → «سارا»). */
export function firstName(full: string | undefined | null): string {
  const n = (full ?? '').trim().split(/\s+/)[0] ?? '';
  return n.slice(0, 24);
}

export type PartOfDay = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

/** Part of the day in Tehran (UTC+3:30, no DST since 2022). */
export function partOfDay(now: Date): PartOfDay {
  let hour = 12;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'Asia/Tehran',
      }).format(now),
    );
  } catch {
    hour = (now.getUTCHours() + 3) % 24;
  }
  if (hour === 24) hour = 0;
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export const PART_FA: Record<PartOfDay, string> = {
  morning: 'صبح',
  noon: 'ظهر',
  afternoon: 'بعدازظهر',
  evening: 'عصر/غروب',
  night: 'شب',
};

const GREET: Record<PartOfDay, string> = {
  morning: 'صبح بخیر',
  noon: 'ظهر بخیر',
  afternoon: 'سلام',
  evening: 'عصر بخیر',
  night: 'شب بخیر',
};

const pick = <T>(list: readonly T[], seed: number): T =>
  list[Math.abs(Math.floor(seed)) % list.length] as T;

/**
 * Warm, varied replies used only when no AI provider is reachable (or the model returned
 * nothing usable). They never contain product facts, numbers or promises.
 */
export function socialFallback(
  kind: SocialKind,
  opts: { name: string; part: PartOfDay; seed: number; nextActionLabel?: string | null },
): string {
  const { name, part, seed } = opts;
  const n = name ? ` ${name}` : '';
  switch (kind) {
    case 'greeting':
      return pick(
        [
          `${GREET[part]}${n}! خوشحالم می‌بینمت. امروز چی تو ذهنته؟`,
          `سلام${n}! چه خبر؟ هر چی خواستی از آموزش‌ها بپرس.`,
          `${GREET[part]}${n} 🙂 بگو ببینم، امروز با چی می‌تونم کمکت کنم؟`,
          `سلام${n}، وقتت بخیر! آماده‌ام، بپرس.`,
        ],
        seed,
      );
    case 'how_are_you':
      return pick(
        [
          `سلام${n}! ممنون، خوبم. تو چطوری؟ امروز چه خبر؟`,
          `خوبم، مرسی که پرسیدی! تو چطوری${n ? `، ${name}` : ''}؟`,
          `سلام! من که عالی‌ام. تو بگو، امروز روز خوبی بوده؟`,
        ],
        seed,
      );
    case 'thanks':
      return pick(
        [
          'خواهش می‌کنم! هر وقت چیزی خواستی، همین‌جام.',
          'قابلی نداشت! اگه سؤال دیگه‌ای شد بپرس.',
          'خوشحالم که کمک کرد. ادامه بدیم؟',
        ],
        seed,
      );
    case 'farewell':
      return pick(
        [
          `به امید دیدار${n}! موفق باشی.`,
          'خدانگهدار! هر وقت خواستی برگرد، منتظرتم.',
          `فعلاً${n}! ویزیت‌های خوبی داشته باشی.`,
        ],
        seed,
      );
    case 'identity':
      return 'من منتور سیلانه‌سبزم؛ کنارت هستم تا آموزش‌ها و محصولات رو راحت‌تر یاد بگیری، برای ویزیت‌ها آماده بشی و هر جا گیر کردی کمکت کنم.';
    case 'ack':
      return pick(
        ['باشه! اگه سؤال دیگه‌ای داشتی بگو.', 'عالیه. بریم سراغ قدم بعدی؟', 'حله، من همین‌جام.'],
        seed,
      );
    case 'feelings':
      return `می‌فهمم${n}، بعضی روزها واقعاً سنگینه. یه نفس عمیق بکش؛ اگه دوست داری بگو چی اذیتت کرده، یا یه قدم کوچیک از آموزش‌ها رو با هم جلو ببریم.`;
    case 'progress':
      return opts.nextActionLabel
        ? `پیشنهاد من برای الان: ${opts.nextActionLabel}`
        : 'برای دیدن وضعیت دقیق مسیرت می‌تونی تب «تحلیل عملکرد» رو باز کنی؛ بگو از کجا شروع کنیم؟';
  }
}

/** Honest «I don't have that» that does not sound like an error page. */
export function naturalUnknown(opts: { name: string; hintTitle?: string; seed: number }): string {
  const hint = opts.hintTitle ? ` نزدیک‌ترین مطلب: «${opts.hintTitle}».` : '';
  const n = opts.name;
  return pick(
    [
      `راستش این رو توی آموزش‌ها پیدا نکردم.${hint} بهتره از مدیرت بپرسی تا جواب دقیق بگیری.`,
      `همین مورد توی محتوای آموزشی نیست و نمی‌خوام حدس بزنم.${hint} می‌تونی از مدیرت هم بپرسی.`,
      `دقیقاً همین رو توی آموزش‌ها ندارم.${hint} اگه سؤالت رو یه کم دقیق‌تر بگی شاید پیدا کنم، یا از مدیرت بپرس.`,
      `${n ? `${n}، ` : ''}این یکی رو مطمئن نیستم و ترجیح می‌دم چیزی از خودم نگم.${hint} از مدیرت بپرس.`,
    ],
    opts.seed,
  );
}

/** Model text that means «the context did not contain the answer». */
export function looksUnknown(text: string): boolean {
  return /(نمی[\s‌]?دانم|نمی[\s‌]?دونم|اطلاعی ندارم|پیدا نکردم|ندیدم|در (محتوا|آموزش)(‌های)? نیست|توی (محتوا|آموزش)(‌ها)? نیست|مطمئن نیستم)/.test(
    text,
  );
}

/** Output guard for free conversation: Persian, no PII, no markdown, a few sentences, no cut-off. */
export function checkChatOutput(
  raw: string,
  opts: { spoken: boolean; keepCitations?: boolean },
): { ok: boolean; text: string } {
  const text = scrubPii(
    raw
      .replace(/[*#`_>]/g, '')
      .replace(opts.keepCitations ? /$^/ : /\[[\d۰-۹]+\]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
  if (!text) return { ok: false, text: '' };
  const letters = text.replace(/[^A-Za-z\u0600-\u06FF]/g, '');
  const fa = (letters.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (letters.length > 0 && fa / letters.length < 0.6) return { ok: false, text: '' };
  const max = opts.spoken ? 2 : 4;
  const sentences = text.split(/(?<=[.!؟?])\s+/).filter(Boolean);
  const out = sentences
    .slice(0, max)
    .join(' ')
    .slice(0, opts.spoken ? 260 : 520);
  return { ok: out.length > 0, text: out };
}

/** Drops every sentence that carries a number which is not in `allowed` (prevents invented figures). */
export function dropUnsupportedSentences(
  text: string,
  unsupported: (sentence: string) => string[],
): string {
  const kept = text
    .split(/(?<=[.!؟?])\s+/)
    .filter(Boolean)
    .filter((s) => unsupported(s).length === 0);
  return kept.join(' ').trim();
}
