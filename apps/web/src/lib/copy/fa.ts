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
    rewatchMedia: 'دیدن ویدیو یا گوش دادن به پادکست',
    belowPassTitle: 'نمره‌ات زیر حد قبولی بود',
    belowPassDesc: 'یک بار ویدیو را ببین یا پادکست را گوش بده؛ بعد دوباره آزمون باز می‌شود.',
    goToMedia: 'رفتن به ویدیو و پادکست',
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

  /** §6.2.7 — home (M1): one hero, a greeting by first name, and what is due. */
  home: {
    nextWork: 'کار بعدی تو',
    nextWorkLabel: 'کار بعدی',
    start: 'شروع',
    resume: 'ادامه',
    startQuiz: 'شروع آزمون',
    allDone: 'همه آموزش‌ها را تمام کردی! 🎉',
    allDoneNext: 'آموزش جدید که فعال شود، اینجا می‌بینی.',
    noTraining: 'هنوز آموزشی ندارید',
    goToCards: 'رفتن به کارت‌های من',
    askSeyla: 'دربارهٔ هر محصول، برند یا اعتراض مشتری سؤال داری؟ از سیلا بپرس.',
    totalProgress: 'پیشرفت کلی',
    inProgress: 'در حال انجام',
    fresh: 'جدید',
    completed: 'تکمیل',
    yourPoints: 'امتیاز شما',
    myTraining: 'آموزش‌های من',
    allFilter: 'همه',
  },

  /** §6.2.8 — profile (M11): settings speak plainly, and never blame. */
  profile: {
    title: 'پروفایل',
    saved: 'ذخیره شد.',
    passwordChanged: 'رمز عوض شد.',
    fullName: 'نام و نام خانوادگی',
    saveName: 'ذخیره نام',
    masteryHeading: 'استادی برندها',
    masteryNote: 'تاج سیلا با استادی بلندتر می‌شود — از ۰ تا ۳ پَر.',
    soundHeading: 'صدای لحظه‌ها',
    soundNote: 'پیش‌فرض خاموش است. فقط برای قبولی، خطا، جشن و پیوستگی — هیچ کلیک معمولی صدا ندارد.',
    soundLabel: 'صدای لحظه‌ها',
    passwordHeading: 'تغییر رمز',
    currentPassword: 'رمز فعلی',
    newPassword: 'رمز جدید',
    passwordHint: 'حداقل ۸ نویسه',
    passwordTooShort: 'رمز جدید باید حداقل ۸ نویسه باشد.',
    changePassword: 'تغییر رمز',
    signOut: 'خروج از حساب',
  },

  /** §6.2.9 — training list and path view (M2/M3). */
  learn: {
    title: 'آموزش‌ها',
    viewGroup: 'نوع نمایش',
    viewPath: 'مسیر',
    viewList: 'فهرست',
    emptyTitle: 'هنوز آموزشی نداری',
    goToCards: 'رفتن به کارت‌های من',
    statusLabel: 'وضعیت آموزش‌ها',
    inProgress: 'در حال انجام',
    fresh: 'جدید',
    done: 'تکمیل‌شده',
    brandFilter: 'فیلتر برند',
    emptyInPath: 'می‌توانی نمای مسیر را ببینی؛ شاید ایستگاه بعدی همان‌جا باشد.',
    showPath: 'نمایش مسیر',
    noneInProgress: 'چیزی برای ادامه نداری.',
    noneNew: 'آموزش جدیدی نداری.',
    noneCompleted: 'هنوز آموزشی را تمام نکرده‌ای.',
  },

  /** §6.2.10 — a station (M4/M5): what this part is, and what finishes it. */
  section: {
    playbackFailed: 'پخش ممکن نشد. اتصال را بررسی کنید.',
    fileNotReady: 'فایل این قسمت هنوز آماده نیست.',
    mediaFailed:
      'فایل صوتی یا ویدیویی بارگذاری نشد. صفحه را دوباره باز کنید یا به مدیر اطلاع دهید.',
    youtubeBlocked: 'ویدیو بارگذاری نشد. اگر یوتیوب در دسترس نیست، اتصال خود را بررسی کنید.',
    completedNote: 'این قسمت را کامل کردی.',
    finished: 'دیدن/شنیدن کامل شد',
    progress: 'پیشرفت این قسمت',
    progressLabel: 'پیشرفت قسمت',
    about: 'درباره این قسمت',
    playbackSpeed: 'سرعت پخش',
    reported: 'گزارش شد؛ ممنون',
    reportToAdmin: 'گزارش مشکل به ادمین',
  },

  /** §6.2.11 — a package (M3): what it holds, and the one next station. */
  pkg: {
    progressLabel: 'پیشرفت بسته',
    startQuiz: 'شروع آزمون',
    continueSection: 'ادامه قسمت فعلی',
    startSection: 'شروع قسمت',
    packageQuiz: 'آزمون این محصول',
    packageQuizPassed: 'آزمون این محصول را قبول شده‌ای ✅',
    emptyTitle: 'این بسته هنوز قسمتی ندارد',
    emptyDesc: 'به مدیر اطلاع داده شد.',
    lockedHint: 'ابتدا قسمت قبل را کامل کنید.',
    audio: 'صوتی',
    video: 'ویدیو',
  },

  /** §6.2.12 — notifications and manager messages (M9). */
  messages: {
    title: 'اعلان‌ها و پیام‌ها',
    markAllRead: 'همه خوانده شد',
    typeLabel: 'نوع',
    notifications: 'اعلان‌ها',
    managerMessages: 'پیام مدیر',
    emptyNotifications: 'اعلانی نداری',
    goToPath: 'رفتن به مسیر یادگیری',
    unread: 'خوانده نشده',
    emptyMessages: 'پیامی از مدیر نداری',
    messagesNote: 'پیام‌های مدیرت درباره تیم و آموزش‌ها این‌جا می‌رسد.',
    goHome: 'رفتن به خانه',
    noteOnTraining: 'یادداشت روی آموزش',
  },

  /** §6.2.13 — points and badges (M8/M11). A ledger line says what happened, in plain words. */
  cards: {
    title: 'امتیاز و نشان‌ها',
    totalPoints: 'امتیاز کل',
    badges: 'نشان‌ها',
    history: 'تاریخچه امتیاز',
    emptyTitle: 'هنوز امتیازی نگرفته‌ای',
    reasonOnTime: 'تکمیل به‌موقع',
    reasonFirstPass: 'قبولی در تلاش اول',
    reasonPackage: 'تکمیل بسته',
    reasonBadge: 'نشان جدید',
    reasonPenalty: 'کسر امتیاز',
    reasonManual: 'تنظیم مدیر',
  },

  /**
   * §6.2.14 — the mentor voice call (M10). Every state says what the machine is doing *right now*,
   * so the marketer is never left wondering whether the mic is live.
   */
  voice: {
    title: 'تماس صوتی با منتور',
    idle: 'برای شروع تماس، دکمه میکروفن را بزن',
    connecting: 'در حال وصل شدن به منتور…',
    listening: 'بگو، گوش می‌دهم…',
    recording: 'ضبط می‌کنم… برای ارسال، دوباره بزن',
    thinking: 'منتور در حال فکر کردن است…',
    speaking: 'منتور جواب می‌دهد…',
    ended: 'تماس تمام شد',
    noRecordingSupport: 'مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.',
    micDenied: 'دسترسی به میکروفن داده نشد. اجازه بده و دوباره تلاش کن.',
    youPrefix: 'شما: ',
    mentorPrefix: 'منتور: ',
    startRecording: 'شروع ضبط',
    stopAndSend: 'پایان ضبط و ارسال',
    endCall: 'پایان تماس',
    saveTranscript: 'متن این تماس برای مرور بعدی ذخیره شود',
    privacyNote:
      'صدای شما فقط برای تبدیل به متن ارسال می‌شود؛ پاسخ‌ها از محتوای تأییدشده‌ی شرکت است.',
  },

  /** §6.2.15 — Seyla the mentor (M10): she answers from approved content and says so. */
  mentor: {
    name: 'سیلا',
    intro: 'سؤالت درباره محصولات و آموزش‌ها را بپرس. فقط از محتوای تأییدشده جواب می‌دهم.',
    thinking: 'در حال فکر کردن…',
    voiceCall: 'تماس صوتی',
    helpful: 'مفید بود',
    notHelpful: 'مفید نبود',
    yourQuestion: 'سؤال شما',
    placeholder: 'سؤالت را بنویس…',
    suggestion1: 'مزیت اصلی این محصول چیست؟',
    suggestion2: 'به مشتری مردد چه بگویم؟',
    suggestion3: 'نکات مهم این آموزش را خلاصه کن',
  },

  /**
   * §6.2.16 — the capability coin (PHASE-3 §3.5). The copy states the rule out loud: a coin buys
   * something real, and every request is recorded. No virtual trinkets, no shame.
   */
  coins: {
    title: 'سکهٔ توانمندی',
    unit: 'سکه',
    note: 'سکه فقط چیز واقعی می‌خرد — نه آیکن، نه نمره. هر درخواست اینجا ثبت می‌شود و قابل پیگیری است.',
    notEnough: 'سکه‌ات برای این کالا کافی نیست.',
    requests: 'درخواست‌های ثبت‌شده',
    pending: 'در انتظار انجام',
    fulfilled: 'انجام شد',
    cancelled: 'لغو شد',
    lifetimePrefix: 'مجموع سکه‌هایی که تا امروز گرفته‌ای:',
  },

  /** §6.2.17 — status badges. One word, no adjectives. */
  status: {
    locked: 'قفل',
    open: 'باز',
    inProgress: 'در حال انجام',
    quizReady: 'آماده آزمون',
    completed: 'تکمیل',
    draft: 'پیش‌نویس',
    published: 'منتشرشده',
    archived: 'بایگانی',
    active: 'فعال',
    inactive: 'غیرفعال',
  },

  /** §6.2.18 — spaced-repetition reviews (PHASE-3 §3.3): say what happened to the memory. */
  reviews: {
    doneTitle: 'مرور امروز انجام شد',
    today: 'مرور امروز',
    progressLabel: 'پیشرفت مرور امروز',
    remembered: 'یادت ماند — نیمه‌عمر بلندتر شد',
    forgotten: 'دوباره مرور می‌شود، زودتر',
    tooFast: '(خیلی سریع بود — امتیازی ثبت نشد)',
    allDone: 'مرورهای امروز تمام شد. آفرین.',
  },

  /** §6.2.19 — the three daily quests (PHASE-3 §3.4). */
  quests: {
    today: 'مأموریت امروز',
    bronze: 'صندوق برنزی',
    silver: 'صندوق نقره‌ای',
    gold: 'صندوق طلایی',
  },

  /** §6.2.20 — the cast. Expression names are read aloud by screen readers, so they describe a
   *  feeling, not an animation state (§2.2). */
  cast: {
    idle: 'آرام',
    happy: 'خوشحال',
    celebrate: 'در حال جشن',
    thinking: 'در حال فکر',
    worried: 'نگرانِ مهلت',
    proud: 'سرافراز',
    nudge: 'دعوت ملایم',
    empathy: 'همدل',
  },

  /** §6.2.21 — station path (M2) and the package card. */
  path: {
    totalProgress: 'پیشرفت کلی',
    pathLabel: 'مسیر یادگیری',
    continuePath: 'ادامه مسیر',
    done: 'تمام شد',
    yourTurn: 'نوبت تو',
    nextStation: 'ایستگاه بعدی',
    brandTrainingSuffix: ' — آموزش برند',
    completedNote: 'تکمیل شد',
  },

  /** §6.2.22 — countdown chip: information, never a countdown threat (§6.1). */
  countdown: {
    normal: 'مهلت',
    warning: 'مهلت نزدیک',
    danger: 'فوری',
    overdue: 'مهلت گذشته',
  },

  /** §6.2.23 — the crash screen (§15.0): it is our fault, and it says what to do. */
  crash: {
    title: 'یک مشکل پیش آمد',
    body: 'اشکالی از طرف ما بود، نه شما. دوباره تلاش کن؛ اگر درست نشد به صفحه اصلی برگرد.',
    retry: 'تلاش مجدد',
    goHome: 'بازگشت به صفحه اصلی',
  },

  /** §6.2.24 — celebration (M8) and the mentor entry points. */
  celebrate: {
    happyAlt: 'سیلا خوشحال',
    pointsUnit: 'امتیاز',
    askMentor: 'از منتور بپرس',
    mentor: 'منتور',
    mentorPageAlt: 'سیلا — منتور سیلانه‌سبز لرنینگ',
    mentorPageTitle: 'منتور',
    mentorPageHint: 'درباره‌ی هر محصول، برند یا آزمونی بپرس',
  },

  /** §6.2.25 — shared screen-reader labels. */
  a11y: {
    close: 'بستن',
    closeMessage: 'بستن پیام',
    loading: 'در حال بارگذاری…',
  },

  /**
   * Punctuation is copy too: the Persian comma (U+060C) is not the Latin one, and a translation
   * pass has to be able to change it without touching a component.
   */
  punctuation: {
    /** separator for inline lists — «الف، ب و ج» */
    listSeparator: '، ',
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
    send: 'ارسال',
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
 * §6.4 — lines that carry a number. The Persian still lives here so a copywriter never has to open
 * a component; the page only passes formatted digits in.
 */
export const LINES = {
  scoreSummary: (correct: string, total: string, score: string) =>
    `${correct} پاسخ درست از ${total} • نمره ${score}`,
  correctOfTotal: (correct: string, total: string) => `${correct} پاسخ درست از ${total}`,
  passScoreNote: (passScore: string) => `نمره قبولی ${passScore}`,
  points: (points: string) => `+${points} امتیاز`,
  retryGuidance: (remaining: string) =>
    `برای تلاش بعدی، یک بار ویدیو را ببین یا پادکست را گوش بده.${remaining ? ` (${remaining} فرصت دیگر داری)` : ''}`,
  scoreNote: (score: string) => `نمره: ${score}`,
  questionCount: (count: string) => `• ${count} سؤال چهارگزینه‌ای`,
  passScoreLine: (passScore: string) => `• نمره قبولی: ${passScore}`,
  remainingLine: (remaining: string, max: string) => `• فرصت باقی‌مانده: ${remaining} از ${max}`,
  lastScoreLine: (score: string) => `• آخرین نمره: ${score}`,
  questionProgress: (index: string, total: string) => `سؤال ${index} از ${total}`,
  memberSince: (date: string) => `عضو از ${date}`,
  masteryLabel: (brand: string) => `استادی ${brand}`,
  greeting: (firstName: string) => `سلام ${firstName} 👋`,
  says: (name: string, speech: string) => `${name} می‌گوید: ${speech}`,
  expressionState: (name: string, state: string) => `${name}، حالت ${state}`,
  objectionLabel: (says: string, calm: boolean) =>
    `اعتراض مشتری: ${says}${calm ? ' (آرام شده)' : ''}`,
  streakDays: (days: string) => `پیوستگی ${days} روز`,
  coinWalletLabel: (coins: string) => `${coins} سکهٔ توانمندی`,
  pointsEarned: (points: string) => `${points} امتیاز گرفتی`,
  packageProgress: (title: string) => `پیشرفت ${title}`,
  sectionsOfTotal: (done: string, total: string) => `${done} از ${total} قسمت`,
  stationIndex: (index: string) => ` — ایستگاه ${index}`,
  redeemRecorded: (title: string, price: string) => `${title} ثبت شد (${price} سکه)`,
  coinPrice: (price: string) => `${price} سکه`,
  dueAndCap: (due: string, cap: string) => `${due} مورد · سقف ${cap}`,
  masteredOfEvaluated: (mastered: string, evaluated: string) =>
    `${mastered} از ${evaluated} ارزیابی‌شده`,
  reviewStatus: (onTime: string, done: string, overdue: string, next7: string) =>
    `${onTime} از ${done} مرور · ${overdue} مورد عقب‌افتاده · ${next7} مورد در ۷ روز آینده`,
  coinsEarned: (coins: string) => `+${coins} سکه`,
  doneOfTotal: (done: string, total: string) => `${done} از ${total}`,
  sources: (titles: string) => `منبع: ${titles}`,
  nextSuggestion: (label: string) => `پیشنهاد بعدی: ${label}`,
  brandTraining: (brand: string) => `آموزش برند ${brand}`,
  stationCount: (count: string) => `این بسته ${count} ایستگاه داره.`,
  deadlineOn: (date: string) => `مهلت: ${date}`,
  mediaListHeading: (count: string) => `ویدیو و پادکست (${count})`,
  percentWatched: (percent: string) => ` • ${percent} دیده شده`,
  sectionOf: (index: string, total: string) => `قسمت ${index} از ${total}`,
  /* §6.0 — two sentences, not three: the live percent rides along with a dash. */
  completionRule: (threshold: string, percent: string) =>
    `برای کامل شدن قسمت، حداقل ${threshold} را ببین یا بشنو — الان ${percent}`,
  /* Same rule, with main's «quiz is open from the start» note in front of it. */
  completionRuleQuizOpen: (threshold: string, percent: string) =>
    `آزمون بسته از همان اول باز است؛ دیدن یا شنیدن اجباری نیست. برای کامل شدن قسمت، حداقل ${threshold} را ببین یا بشنو — الان ${percent}`,
  overdueWarning: (count: string) => `مهلت ${count} آموزش گذشته است. هر چه زودتر تمامش کن.`,
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
  return Object.entries(LINES).map(([key, fn]) => [
    `LINES.${key}`,
    (fn as (...args: string[]) => string)(...Array.from({ length: fn.length }, (_, i) => `۱${i}`)),
  ]);
}
