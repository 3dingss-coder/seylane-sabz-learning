/**
 * PHASE-6 §6.4 rule 1 — every marketer-facing UI string lives here, not scattered in JSX.
 *
 * The brand voice in one line (§6.0): **ما مربیِ کنارِ دستِ بازاریاب هستیم، نه ناظرِ بالای سرِ او.**
 * So every string answers «چطور می‌تونم کمک کنم؟» and never «چرا انجام ندادی؟».
 *
 * Three properties (§6.0): short (max two sentences per bubble), respectful colloquial
 * («می‌تونیم» not «می‌توانیم», never childish), and action-oriented (every status message carries a
 * next step).
 */

/** §6.4 rule 3 — these words are banned from UI copy. Enforced by `copy.test.ts`. */
export const BANNED_PHRASES = [
  'مردود', // a duel is a conversation with a customer, not a courtroom
  'خطا:', // no error codes to a human (§15.0 rule 3)
  'ناراحت', // guilt is forbidden (N-03 / C-01)
  'داره می‌سوزه', // streak shame
  'فقط ۲۴ ساعت', // countdown fear
  'داده‌ای یافت نشد', // machine voice
  'کاربر گرامی', // bureaucratic voice
] as const;

/** §6.4 rule 4 — at most one emoji per bubble. */
export const MAX_EMOJI_PER_BUBBLE = 1;
/** §6.0 — at most two sentences per bubble; more than that is a wall of text. */
export const MAX_SENTENCES = 2;

export const COPY = {
  /** §6.2.1 — Empty states: say what will appear here, and who is waiting. */
  empty: {
    home: 'هنوز آموزشی نداری. به محض اینکه اولین بسته فعال شد، همین‌جا پیداش می‌کنی.',
    completed: 'هنوز چیزی تکمیل نشده. اولین ایستگاهت رو شروع کن!',
    cards: 'هنوز امتیازی نداری — اولین ایستگاه رو تموم کن تا سیلا برات جشن بگیره.',
    messages: 'پیامی نداری. وقتی مدیرت پیام بفرسته، همین‌جا می‌بینی.',
    reviews: 'مرور امروز انجام شد. سؤال‌ها وقتی برمی‌گردن که نزدیک فراموشی باشن.',
  },

  /** §6.2.2 — Loading: skeletons carry no text; only a thinking agent speaks. */
  loading: {
    mentorThinking: 'سیلا داره فکر می‌کنه…',
  },

  /** §6.2.3 — Errors: plain sentence + an action, never a code. */
  error: {
    network: 'اتصال برقرار نیست.',
    networkReassure: 'اتصال نیست. خیالت راحت، پیشرفتت ذخیره شده.',
    video: 'ویدیو بارگذاری نشد. احتمالاً اینترنت یا VPN.',
    offlineSaved: 'آفلاین هستی. پیشرفتت ذخیره شد؛ با اتصال، همگام می‌شه.',
    mentorUnavailable: 'الان در دسترس نیستم. سؤال فوری داری از مدیرت بپرس.',
    generic: 'اطلاعات بارگذاری نشد. یه بار دیگه تلاش کن.',
  },

  /** §6.2.4 — Success and celebration: one concrete fact, no empty adjectives. */
  success: {
    duelPassedCustomer: 'قانع شدم. بخرم!',
    duelPassedReward: 'ایستگاه تموم شد.',
    packageCompleted: 'مسیر تموم شد. نشانِ مسیر مال توئه.',
    mastery: 'تو حالا روی این محصول متخصصی. پَرِ کاکل سیلا برات بالا رفت.',
    reviewOnTime: 'دمت گرم — هنوز یادت بود. این یعنی مشتری هم یادت می‌مونه.',
  },

  /** §6.2.5 — Streak and reminders: identity, never guilt (N-04). */
  streak: {
    dailyReminder: 'بازاریاب‌های حرفه‌ای هر روز یه مرور می‌کنن. نوبت توئه.',
    shieldUsed: 'یه روز استراحت، حقته. پیوستگیت سر جاشه.',
    milestone30: '۳۰ روز پشت‌سرهم! نمونهٔ رایگان این ماه مال توئه.',
    broken: 'اشکال نداره — از امروز دوباره شروع می‌کنیم.',
    leaveApproved: 'مرخصی ثبت شد. با خیال راحت برو، جات محفوظه.',
  },

  /** §6.1 — deadline language: information, not a threat. */
  deadline: {
    tomorrow: 'فردا آخرین روزه — پنج دقیقه وقت می‌خواد.',
    soon: 'مهلت این بسته نزدیکه. یه ایستگاه کوتاه مونده.',
  },

  /**
   * §6.2.6 — the quiz/duel surface. A duel is a conversation with a customer, so the language
   * stays a conversation: what happened, what it is worth, what to do next. Never a courtroom
   * («مردود» is banned) and never a code (§15.0 rule 3).
   */
  quiz: {
    title: 'آزمون',
    questionLegend: 'سؤال آزمون',
    progressLabel: 'پیشرفت آزمون',
    scoreLabel: 'نمره آزمون',
    start: 'شروع آزمون',
    prev: 'قبلی',
    next: 'بعدی',
    submit: 'ارسال پاسخ‌ها',
    submitConfirmTitle: 'ارسال پاسخ‌ها؟',
    review: 'بازبینی',
    send: 'ارسال',
    lockedNote: 'بعد از ارسال نمی‌توانی پاسخ‌ها را تغییر بدهی.',
    reviewAnswers: 'مرور پاسخ‌ها',
    correctAria: 'درست',
    incorrectAria: 'نادرست',
    passedTitle: 'قبول شدی! 🎉',
    failedTitle: 'این بار قبول نشدی',
    passedBadge: 'این آزمون را قبول شده‌ای ✅',
    packageDoneTitle: 'بسته تمام شد! 🎉',
    backHome: 'بازگشت به خانه',
    nextSection: 'قسمت بعد',
    backToPackage: 'بازگشت به بسته',
    packageDoneHome: 'بسته تمام شد — بازگشت به خانه',
    rewatch: 'دوباره دیدن قسمت',
    requestRetake: 'درخواست آزمون مجدد از مدیر',
    retakeRequested: 'درخواست آزمون مجدد برای مدیر ارسال شد.',
    requestPending: 'درخواست آزمون مجددت در انتظار تأیید مدیر است.',
    pendingTitle: 'در انتظار تأیید مدیر',
    pendingDesc: 'درخواست آزمون مجددت ثبت شده است. بعد از تأیید، اینجا فعال می‌شود.',
    attemptsOutTitle: 'فرصت‌های آزمون تمام شد',
    attemptsOutDesc: 'می‌توانی از مدیرت درخواست آزمون مجدد کنی.',
    noQuizTitle: 'آزمونی برای این قسمت تعریف نشده است',
    noQuizDesc: 'به مدیر اطلاع داده شد.',
    submitFailed: 'ارسال نشد؛ پاسخ‌هایت ذخیره شده. دوباره تلاش کن.',
    genericError: 'خطایی رخ داد.',
    mentorRetry: 'بذار یه بار دیگه با هم مرور کنیم.',
  },

  /** Shared action labels — one verb, no decoration. */
  actions: {
    retry: 'تلاش دوباره',
    report: 'گزارش مشکل',
    messageManager: 'پیام به مدیر',
    start: 'شروع',
    next: 'سؤال بعدی',
    close: 'بستن',
    spend: 'خرج کردن',
  },
} as const;

/**
 * §6.4 quality gate, callable from tests and from any new copy review.
 * Returns the list of violations instead of throwing, so a review can show them all at once.
 */
export function copyViolations(
  entries: Array<[path: string, text: string]>,
): Array<{ path: string; rule: string; text: string }> {
  const emoji = /\p{Extended_Pictographic}/gu;
  const violations: Array<{ path: string; rule: string; text: string }> = [];
  for (const [path, text] of entries) {
    for (const bad of BANNED_PHRASES)
      if (text.includes(bad)) violations.push({ path, rule: `banned:${bad}`, text });
    const emojis = text.match(emoji);
    if (emojis && emojis.length > MAX_EMOJI_PER_BUBBLE)
      violations.push({ path, rule: 'too-many-emoji', text });
    const sentences = text.split(/[.!?؟…]+/).filter((s) => s.trim().length > 0);
    if (sentences.length > MAX_SENTENCES) violations.push({ path, rule: 'too-long', text });
    // an error code must never reach a human (§15.0 rule 3) — Persian digits included
    if (
      /(?:\b|\s)[45]\d{2}(?:\b|\s)/.test(text) ||
      /[۴۵][۰-۹]{2}/.test(text) ||
      /error:/i.test(text)
    )
      violations.push({ path, rule: 'error-code', text });
  }
  return violations;
}

/** Flattens the whole COPY tree into [path, text] pairs for the quality gate. */
export function allCopyStrings(
  node: unknown = COPY,
  prefix = 'COPY',
): Array<[path: string, text: string]> {
  const out: Array<[path: string, text: string]> = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = `${prefix}.${key}`;
    if (typeof value === 'string') out.push([path, value]);
    else if (value && typeof value === 'object') out.push(...allCopyStrings(value, path));
  }
  return out;
}

/**
 * §6.4 — lines that carry a number. The Persian still lives here so a copywriter never has to
 * open a component; `QuizPage` only passes formatted digits in.
 */
export const QUIZ_LINES = {
  scoreSummary: (correct: string, total: string, score: string) =>
    `${correct} پاسخ درست از ${total} • نمره ${score}`,
  correctOfTotal: (correct: string, total: string) => `${correct} پاسخ درست از ${total}`,
  passScoreNote: (passScore: string) => `نمره قبولی ${passScore}`,
  points: (points: string) => `+${points} امتیاز`,
  attemptsLeft: (remaining: string) => `${remaining} فرصت دیگر داری.`,
  scoreNote: (score: string) => `نمره: ${score}`,
  questionCount: (count: string) => `• ${count} سؤال چهارگزینه‌ای`,
  passScoreLine: (passScore: string) => `• نمره قبولی: ${passScore}`,
  remainingLine: (remaining: string, max: string) => `• فرصت باقی‌مانده: ${remaining} از ${max}`,
  lastScoreLine: (score: string) => `• آخرین نمره: ${score}`,
  questionProgress: (index: string, total: string) => `سؤال ${index} از ${total}`,
  answeredHint: (answered: string, total: string) =>
    `به همه سؤال‌ها پاسخ بده (${answered} از ${total}).`,
} as const;

/** Persian option letters — data, not a sentence. */
export const QUIZ_OPTION_LABEL: Record<string, string> = {
  a: 'الف',
  b: 'ب',
  c: 'ج',
  d: 'د',
};

/**
 * Feeds the numbered lines through the same quality gate as the static ones. Each function is
 * called with as many Persian-digit fillers as it declares, so arity changes cannot hide a string
 * from the gate.
 */
export function allFormatSamples(): Array<[path: string, text: string]> {
  return Object.entries(QUIZ_LINES).map(([key, fn]) => [
    `QUIZ_LINES.${key}`,
    (fn as (...args: string[]) => string)(...Array.from({ length: fn.length }, (_, i) => `۱${i}`)),
  ]);
}
