import { DAY, HOUR } from '../lib/time';
import type { PushAutomation } from '../domain/types';
import type { NotificationCategory } from '../domain/notification-categories';

/**
 * The automation catalogue (کاتالوگ اتوماسیون‌ها).
 *
 * 38 documents = the 27 scenarios of the brief (§8, in that exact order, keys 1–27) + 9 more gates in
 * front of the other system templates + 2 health alerts about the engine itself. This file is DATA
 * ONLY — no logic, no store, no engine imports — which is what makes «scenario 28 = one item here»
 * true. `docs/admin-push-automation-api.md` documents the same shape for the panel and import/export.
 *
 * Four of the 27 (`quiz_passed`, `quiz_failed`, `badge_earned`, `weekly_digest`) already fire today as
 * templates, so they are seeded as *gates* rather than duplicated messages (decision Q1-a).
 *
 * Rules encoded here (see docs/admin-push-automation-analysis.md):
 *  • every scenario seeds with `enabled: false`. A send never happens because something was deployed;
 *  • a `templateKey` entry is a *gate*: it owns enable/priority/caps/stats of an existing template and
 *    never carries its own text (the template editor keeps that, so nothing is duplicated);
 *  • `requiresFeature` entries are seeded so the admin can see and edit them, but the engine refuses to
 *    run them until the data they need exists (answer Q3).
 */

const HOUR_MS = HOUR;

export interface AutomationVar {
  name: string;
  label: string;
  /** Where the value comes from — also the reason a send is refused when it is missing. */
  source: string;
  kind: 'text' | 'number';
}

export const AUTOMATION_VARS: AutomationVar[] = [
  { name: 'name', label: 'نام کوچک کاربر', source: 'users/<id>.name', kind: 'text' },
  { name: 'title', label: 'نام آموزش (بسته)', source: 'PackageView.title', kind: 'text' },
  {
    name: 'section',
    label: 'عنوان قسمت بعدی',
    source: 'computeNextItem().sectionTitle',
    kind: 'text',
  },
  {
    name: 'sectionId',
    label: 'شناسه قسمت بعدی',
    source: 'computeNextItem().sectionId',
    kind: 'text',
  },
  { name: 'packageId', label: 'شناسه بسته', source: 'computeNextItem().packageId', kind: 'text' },
  { name: 'percent', label: 'درصد پیشرفت (عدد)', source: 'PackageView.percent', kind: 'number' },
  { name: 'left', label: 'درصد مانده به پایان', source: '100 − percent', kind: 'number' },
  {
    name: 'days',
    label: 'روز بی‌فعالیتی یا روزهای زنجیره',
    source: 'lastActiveAt / streak',
    kind: 'number',
  },
  { name: 'hours', label: 'ساعت مانده به مهلت', source: 'PackageView.deadlineAt', kind: 'number' },
  { name: 'deadline', label: 'مهلت (تاریخ فارسی)', source: 'deadlineLabel(pkg)', kind: 'text' },
  { name: 'score', label: 'نمره آزمون', source: 'attempt.score', kind: 'number' },
  { name: 'n', label: 'تعداد آموزش فعال', source: 'active packages', kind: 'number' },
  { name: 'count', label: 'تعداد نفرات (برای مدیر)', source: 'aggregation', kind: 'number' },
  // Only the hook that saw the person can supply this one, so it arrives as an event var (see
  // `users.ts`) and is simply absent everywhere else — a rule using it on another event is refused
  // with `missingVariable` rather than sending a literal `{memberName}`.
  {
    name: 'memberName',
    label: 'نام عضو تازه تیم',
    source: 'vars event: team.member_joined',
    kind: 'text',
  },
];

export const AUTOMATION_VAR_NAMES = AUTOMATION_VARS.map((v) => v.name);

/**
 * The only variables allowed inside `actionRef`. Free-text values (a name, a title) can contain
 * `/`, `?` or `..` — a person's name must never be able to change where a push sends someone, so a
 * path is built from identifiers only.
 */
export const AUTOMATION_PATH_VARS = ['sectionId', 'packageId'];

/** The variables an admin may insert as buttons in the message editor. */
export const VARIABLE_PALETTE = AUTOMATION_VARS.map((v) => ({
  token: `{${v.name}}`,
  label: v.label,
}));

export const AUTOMATION_DESTINATIONS = [
  { value: '/', label: 'صفحه خانه' },
  { value: '/learn', label: 'آموزش‌ها' },
  { value: '/packages/{packageId}', label: 'بسته آموزشی (مربوط به پیام)' },
  { value: '/sections/{sectionId}', label: 'قسمت بعدی کاربر' },
  { value: '/quiz/{sectionId}', label: 'آزمون همان قسمت' },
  { value: '/messages', label: 'صندوق پیام‌ها' },
  { value: '/cards', label: 'امتیاز و نشان‌ها' },
  { value: '/mentor', label: 'منتور هوشمند' },
  { value: '/profile', label: 'پروفایل و تنظیمات' },
  { value: '/manager', label: 'پنل مدیر (پیگیری تیم)' },
];

export type CatalogEntry = Omit<
  PushAutomation,
  'version' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

const base = (over: Partial<CatalogEntry>): CatalogEntry => ({
  key: '',
  name: '',
  description: '',
  category: 'deadlines' as NotificationCategory,
  audienceRole: 'marketer',
  enabled: false,
  isSystem: true,
  trigger: { kind: 'event' },
  audience: { type: 'role', targetId: 'marketer', channel: 'any' },
  message: { title: '', body: '', actionRef: '/', imageUrl: null },
  delivery: {
    priority: 'normal',
    push: true,
    inApp: true,
    respectQuietHours: true,
    cooldownMs: DAY,
  },
  supersedes: [],
  ...over,
});

/** Friendly Persian trigger sentence — the panel shows this instead of any cron syntax. */
export function triggerSentence(a: PushAutomation): string {
  const t = a.trigger;
  const at = t.time ?? '۱۰:۰۰';
  switch (t.kind) {
    case 'event':
      return `بلافاصله بعد از «${EVENT_LABELS[t.event ?? ''] ?? t.event}»`;
    case 'event_delay':
      return `${delayLabel(t.delayMinutes ?? 0)} بعد از «${EVENT_LABELS[t.event ?? ''] ?? t.event}»، اگر هنوز شرط برقرار باشد`;
    case 'inactivity':
      return `هر روز ساعت ${at}، به کسانی که ${t.inactivityDays ?? 1} روز (یا بیشتر) فعالیتی نداشته‌اند`;
    case 'schedule_daily':
      return `هر روز ساعت ${at}`;
    case 'schedule_weekly':
      return `هر هفته ${WEEKDAYS[t.weekday ?? 6]} ساعت ${at}`;
    case 'condition':
      return `هر روز ساعت ${at}، برای کسانی که ${conditionSentence(t.conditions ?? [])}`;
  }
}

export const WEEKDAYS = ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

export const EVENT_LABELS: Record<string, string> = {
  'quiz.passed': 'قبولی در آزمون',
  'quiz.failed': 'رد شدن در آزمون',
  'quiz.failed_twice': 'دومین رد شدن پشت سر هم در یک آزمون',
  'quiz.abandoned': 'آزمون نیمه‌کاره رها شده',
  'attempt.started': 'شروع آزمون',
  'section.completed': 'پایان محتوای یک قسمت',
  'package.completed': 'تکمیل اولین بسته',
  'package.updated': 'به‌روزرسانی محتوای بسته',
  'package.published': 'انتشار بسته جدید',
  'assignment.created': 'فعال شدن آموزش جدید',
  'badge.earned': 'گرفتن نشان جدید',
  'user.registered': 'ثبت‌نام کاربر',
  'team.member_joined': 'افزوده شدن عضو به تیم',
  'push.failure_rate': 'نرخ شکست پوش بالاتر از حد',
  'push.cron_stalled': 'اجرا نشدن زمان‌بندی',
};

/**
 * The fields a `condition` trigger may test. The engine computes one flat record per user per sweep
 * (see push-automation-engine.ts `factsFor`); the health fields are computed once per run.
 */
export const FACT_FIELDS: Array<{ field: string; label: string; kind: 'number' | 'boolean' }> = [
  { field: 'progress', label: 'پیشرفت بیشترین آموزش فعال (٪)', kind: 'number' },
  { field: 'activePackages', label: 'تعداد آموزش فعال', kind: 'number' },
  { field: 'overduePackages', label: 'آموزشِ از مهلت گذشته', kind: 'number' },
  { field: 'stalledSections', label: 'قسمت نیمه‌کاره (زیر ۲۵٪)', kind: 'number' },
  { field: 'streakDays', label: 'روزهای پیوسته فعالیت', kind: 'number' },
  { field: 'inactiveDays', label: 'روز بی‌فعالیتی', kind: 'number' },
  { field: 'completedLast7d', label: 'آموزش کامل‌شده در ۷ روز اخیر', kind: 'number' },
  { field: 'startedEver', label: 'حتی یک قسمت را باز کرده است', kind: 'boolean' },
  { field: 'accountAgeDays', label: 'سن حساب (روز)', kind: 'number' },
  { field: 'todayActive', label: 'امروز فعال بوده است', kind: 'boolean' },
  { field: 'hasDeadlineSoon', label: 'مهلت نزدیک (۷۲ ساعت)', kind: 'boolean' },
  { field: 'failureRatePct', label: 'نرخ شکست پوش (٪)', kind: 'number' },
  { field: 'cronStalenessMin', label: 'دقیقه از آخرین اجرای زمان‌بندی', kind: 'number' },
];

export const FACT_LABELS: Record<string, string> = Object.fromEntries(
  FACT_FIELDS.map((f) => [f.field, f.label]),
);

export const TRIGGER_KIND_LABELS: Record<string, string> = {
  event: 'اتفاق در اپلیکیشن',
  event_delay: 'اتفاق + تأخیر',
  inactivity: 'بی‌فعالیتی کاربر',
  schedule_daily: 'هر روز در ساعت مشخص',
  schedule_weekly: 'هر هفته در روز و ساعت مشخص',
  condition: 'شرط وضعیتی روی کاربران',
};

function delayLabel(minutes: number): string {
  if (minutes >= 24 * 60) {
    const days = Math.round(minutes / (24 * 60));
    return `${days.toLocaleString('fa-IR')} روز`;
  }
  if (minutes >= 60) return `${Math.round(minutes / 60).toLocaleString('fa-IR')} ساعت`;
  return `${minutes.toLocaleString('fa-IR')} دقیقه`;
}

function conditionSentence(cs: { field: string; op: string; value: unknown }[]): string {
  const F: Record<string, string> = {
    progress: 'پیشرفت',
    activePackages: 'آموزش فعال',
    overduePackages: 'آموزش از مهلت گذشته',
    stalledSections: 'قسمت نیمه‌کاره',
    streakDays: 'روز پیوسته',
    inactiveDays: 'روز بی‌فعالیتی',
    completedLast7d: 'آموزش کامل‌شده در ۷ روز',
    todayActive: 'فعالیت امروز',
    failureRatePct: 'نرخ شکست پوش (٪)',
    cronStalenessMin: 'دقایق از آخرین اجرای زمان‌بندی',
    avgScoreDropPct: 'افت میانگین نمره تیم (٪)',
  };
  const OP: Record<string, string> = { gte: 'حداقل', lte: 'حداکثر', eq: 'دقیقاً', neq: 'غیر از' };
  return cs
    .map((c) => `${F[c.field] ?? c.field} ${OP[c.op] ?? c.op} ${String(c.value)}`)
    .join(' و ');
}

// ─── The catalogue ───────────────────────────────────────────────────────────

export const PUSH_AUTOMATION_CATALOG: CatalogEntry[] = [
  // ۱–۴: the inactivity ladder. One episode = one send per step, only the highest matched step runs.
  base({
    key: 'inactive_1d',
    name: 'یک روز بی‌فعالیتی',
    description:
      'به کسی که دیروز فعال بوده و امروز هنوز سر نزده، یک یادآوری کوتاه با ادامه‌ی همان قسمت.',
    category: 'deadlines',
    supersedes: ['reminder'],
    trigger: {
      kind: 'inactivity',
      inactivityDays: 1,
      ladderGroup: 'inactive',
      time: '10:00',
    },
    message: {
      title: 'ادامه بده {name}',
      body: 'سلام {name}، امروز هنوز سر نزده‌ای. فقط ۵ دقیقه از «{section}» را ببین و ادامه بده.',
      actionRef: '/sections/{sectionId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'inactive_2d',
    name: 'دو روز بی‌فعالیتی',
    description: 'پله دوم: یادآوری با عدد پیشرفت، وقتی دو روز گذشته است.',
    category: 'deadlines',
    supersedes: ['reminder'],
    trigger: {
      kind: 'inactivity',
      inactivityDays: 2,
      ladderGroup: 'inactive',
      time: '10:00',
    },
    message: {
      title: 'پیشرفتت روی {percent}٪ مانده',
      body: 'دو روز گذشت و پیشرفتت روی {percent}٪ مانده. با یک قسمت کوتاه ادامه بده.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 2 * DAY,
    },
  }),
  base({
    key: 'inactive_3d',
    name: 'سه روز بی‌فعالیتی (قانون B5)',
    description:
      'همان قانون رفتاری B5 که امروز فقط کارت داخل اپ می‌سازد؛ با این اتوماسیون پوش هم می‌فرستد.',
    category: 'deadlines',
    supersedes: ['reminder'],
    trigger: {
      kind: 'inactivity',
      inactivityDays: 3,
      ladderGroup: 'inactive',
      time: '10:00',
    },
    message: {
      title: '{days} روز است نیستی',
      body: '{days} روز است آموزش‌ها را باز نکرده‌ای. فقط ۵ دقیقه وقت بگذار و «{section}» را ببین.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 3 * DAY,
    },
  }),
  base({
    key: 'inactive_7d',
    name: 'هفت روز بی‌فعالیتی',
    description: 'پله آخر: یک هفته بدون فعالیت؛ لحن جدی‌تر، مدیر هم در جریان می‌شود.',
    category: 'deadlines',
    supersedes: ['reminder'],
    trigger: {
      kind: 'inactivity',
      inactivityDays: 7,
      ladderGroup: 'inactive',
      time: '10:00',
    },
    message: {
      title: 'یک هفته است نیستی',
      body: 'یک هفته است نیستی. مدیرت هم منتظر توست؛ امروز یک قدم کوچک بردار.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 7 * DAY,
    },
  }),

  // ۵–۸: starts, evening and the weekly kick-off.
  base({
    key: 'never_started_24h',
    name: '۲۴ ساعت از ثبت‌نام گذشت و شروع نکرد',
    description:
      'برای حسابی که ساخته شده اما هیچ قسمتی را باز نکرده؛ یک بار در عمر کاربر. محاسبه وضعیتی است، نه رویداد — پس با قطعی سرویس هم گم نمی‌شود.',
    category: 'deadlines',
    trigger: {
      kind: 'condition',
      conditions: [
        { field: 'startedEver', op: 'eq', value: false },
        { field: 'accountAgeDays', op: 'gte', value: 1 },
      ],
      time: '11:00',
    },
    message: {
      title: 'حساب تو آماده است {name}',
      body: 'حساب تو آماده است. اولین درس فقط ۵ دقیقه طول می‌کشد؛ همین حالا شروع کن.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 30 * DAY,
      sendOnce: true,
    },
  }),
  base({
    key: 'evening_nudge',
    name: 'یادآوری عصرگاهی (فقط برای علاقه‌مندان)',
    description:
      'هر روز ۱۸:۰۰، فقط برای کسانی که در پروفایل فعالش کرده‌اند و امروز آموزشی ندیده‌اند.',
    category: 'deadlines',
    optInOnly: true,
    trigger: { kind: 'schedule_daily', time: '18:00' },
    message: {
      title: 'قبل از شب یک قسمت کوتاه',
      body: 'امروز هنوز آموزشی ندیده‌ای؛ قبل از شب یک قسمت کوتاه ببین.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
      maxPerUserPerDay: 1,
    },
  }),
  base({
    key: 'preferred_time',
    name: 'ساعت همیشگی کاربر (نسخه ۲)',
    // Decided to stay in version 2: a peak hour needs either a query per user in every sweep or a
    // histogram write on every heartbeat — §4.9 (cost) says neither is free enough for a nudge.
    description:
      'نیازمند محاسبه «ساعت پیک فعالیت کاربر» از داده‌های ۱۴ روز اخیر؛ در نسخه ۱ محاسبه نمی‌شود.',
    category: 'deadlines',
    requiresFeature: 'preferred_time',
    trigger: { kind: 'schedule_daily', time: '14:00' },
    message: {
      title: 'وقت یادگیری توست',
      body: 'وقت همیشگی یادگیری توست. آماده‌ای؟',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'week_start',
    name: 'شروع هفته',
    description: 'شنبه صبح: چند آموزش داری و از کدام شروع کنی.',
    category: 'deadlines',
    trigger: { kind: 'schedule_weekly', weekday: 6, time: '09:00' },
    message: {
      title: 'هفته جدید شروع شد',
      body: 'هفته جدید شروع شد. این هفته {n} آموزش داری؛ از «{title}» شروع کن.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 6 * DAY,
    },
  }),

  // ۹–۱۰: deadlines and content changes.
  base({
    key: 'overdue_daily',
    name: 'مهلت گذشته و تمام نشده (B2)',
    description: 'هر روز ۱۰:۰۰ تا وقتی آن آموزش ناتمام است؛ همان قانون B2 با پوش واقعی.',
    category: 'deadlines',
    trigger: {
      kind: 'condition',
      conditions: [{ field: 'overduePackages', op: 'gte', value: 1 }],
      time: '10:00',
    },
    message: {
      title: 'مهلت «{title}» گذشته است',
      body: 'مهلت «{title}» گذشته و {left}٪ مانده. همین امروز تمامش کن.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'package_updated',
    name: 'محتوای یک آموزش به‌روز شد',
    description:
      'وقتی بسته‌ای که کاربر در آن پیشرفت دارد ویرایش/منتشر مجدد می‌شود (نه هر بار ذخیره پیش‌فرض).',
    category: 'content',
    trigger: { kind: 'event', event: 'package.updated' },
    message: {
      title: '«{title}» به‌روز شد',
      body: 'محتوای «{title}» به‌روز شد؛ یک نگاه بینداز.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),

  // ۱۱–۱۳: quizzes. 11/12 are gates on templates that already fire today.
  base({
    key: 'quiz_passed',
    name: 'قبولی در آزمون (قالب سیستمی)',
    description:
      'همان اعلان موجود؛ متنش در «اعلان‌ها ← قالب‌ها» ویرایش می‌شود. در وضعیت فعلی فقط داخل اپ است.',
    category: 'quizzes',
    templateKey: 'quiz_passed',
    trigger: { kind: 'event', event: 'quiz.passed' },
    message: {
      title: 'قبول شدی 🎉',
      body: 'آفرین! در آزمون «{title}» با نمره {score} قبول شدی.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: false,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'quiz_failed',
    name: 'رد شدن در آزمون (قالب سیستمی)',
    description:
      'همان اعلان موجود؛ متنش در «اعلان‌ها ← قالب‌ها» ویرایش می‌شود. در وضعیت فعلی فقط داخل اپ است.',
    category: 'quizzes',
    templateKey: 'quiz_failed',
    trigger: { kind: 'event', event: 'quiz.failed' },
    message: {
      title: 'نتیجه آزمون',
      body: 'اشکالی ندارد. «{title}» را یک بار مرور کن و دوباره امتحان بده.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: false,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'quiz_failed_nudge',
    name: 'دو ساعت بعد از رد شدن (B3)',
    description:
      'قانون رفتاری B3 با تأخیر: اگر کاربر بعد از رد شدن برنگشت، یک پیشنهاد مرور می‌گیرد.',
    category: 'quizzes',
    trigger: { kind: 'event_delay', event: 'quiz.failed', delayMinutes: 120 },
    message: {
      title: 'نزدیک بودی',
      body: 'نزدیک بودی. یک بار متن قسمت را مرور کن و دوباره امتحان بده.',
      actionRef: '/quiz/{sectionId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 2 * DAY,
    },
  }),

  base({
    key: 'section_ready_quiz',
    name: '۳۰ دقیقه بعد از پایان محتوا، آزمون نمانده',
    description: 'محتوا تمام شده اما آزمون همان قسمت هنوز داده نشده است.',
    category: 'quizzes',
    trigger: { kind: 'event_delay', event: 'section.completed', delayMinutes: 30 },
    message: {
      title: 'آزمون «{section}» آماده است',
      body: 'محتوای «{section}» را تمام کردی. آزمونش آماده است.',
      actionRef: '/quiz/{sectionId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'stalled_section',
    name: 'قسمت نیمه‌کاره (B6)',
    description:
      'پیشرفت قسمت زیر ۲۵٪ مانده است. برای رعایت سقف هزینه، به‌جای رویدادِ هر heartbeat، در پنجره روزانه بررسی می‌شود.',
    category: 'progress',
    trigger: {
      kind: 'condition',
      conditions: [{ field: 'stalledSections', op: 'gte', value: 1 }],
      time: '17:00',
    },
    message: {
      title: '«{section}» نصفه مانده',
      body: 'قسمت «{section}» را نصفه رها کرده‌ای ({percent}٪). از همان‌جا ادامه بده.',
      actionRef: '/sections/{sectionId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 2 * DAY,
    },
  }),
  base({
    key: 'near_completion',
    name: 'نزدیک تکمیل (B7)',
    description: 'پیشرفت ≥ ۸۰٪؛ یک قدم تا پایان و گرفتن امتیاز.',
    category: 'progress',
    trigger: {
      kind: 'condition',
      conditions: [{ field: 'progress', op: 'gte', value: 80 }],
      time: '18:00',
    },
    message: {
      title: 'یک قدم تا پایان',
      body: '«{title}» {percent}٪ پیش رفته؛ یک قدم تا تکمیل مانده.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'two_fails_mentor',
    name: 'دومین شکست پشت سر هم → منتور',
    description: 'بعد از دومین رد شدن در یک آزمون، تمرین با منتور پیشنهاد می‌شود.',
    category: 'mentor',
    trigger: { kind: 'event', event: 'quiz.failed_twice' },
    message: {
      title: 'با منتور تمرین کن',
      body: 'اگر قسمتی گنگ است، با منتور هوشمند تمرینش کن.',
      actionRef: '/mentor',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),

  // ۱۴–۱۸: the stopping points the prompt numbers after the quizzes.

  // ۱۹–۲۳: motivation (badge, streaks, rank, first completion).
  base({
    key: 'quiz_abandoned',
    name: 'آزمون نیمه‌کاره رها شد',
    description:
      'تلاش آزمون شروع شده و ۳۰ دقیقه ثبت نهایی نشده. (ثبت «شروع تلاش» از قبل وجود دارد: attempts/<id>)',
    category: 'quizzes',
    trigger: { kind: 'event_delay', event: 'attempt.started', delayMinutes: 30 },
    message: {
      title: 'آزمون نیمه‌کاره ماند',
      body: 'آزمون «{title}» نیمه‌کاره ماند. هنوز می‌توانی ادامه بدهی.',
      actionRef: '/quiz/{sectionId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),

  base({
    key: 'badge_earned',
    name: 'نشان جدید (قالب سیستمی)',
    description: 'همان اعلان موجود؛ در وضعیت فعلی فقط داخل اپ است (متن در تب قالب‌ها).',
    category: 'progress',
    templateKey: 'badge_earned',
    trigger: { kind: 'event', event: 'badge.earned' },
    message: {
      title: 'نشان جدید!',
      body: 'نشان «{title}» را گرفتی.',
      actionRef: '/cards',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: false,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'streak_5',
    name: 'پنج روز پیوسته (B8)',
    description: 'قدردانی از زنجیره فعالیت؛ همان سیگنال B8.',
    category: 'progress',
    trigger: {
      kind: 'condition',
      conditions: [{ field: 'streakDays', op: 'gte', value: 5 }],
      time: '19:00',
    },
    message: {
      title: '{days} روز پیوسته 🌱',
      body: '{days} روز پیوسته یاد گرفته‌ای. امروز هم یک قسمت کوتاه ببین تا رشته قطع نشود.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'streak_at_risk',
    name: 'زنجیره در خطر قطع شدن',
    description: 'زنجیره ≥ ۳ روز و امروز هنوز فعالیتی نیست؛ شب آخرین فرصت است.',
    category: 'progress',
    trigger: {
      kind: 'condition',
      conditions: [
        { field: 'streakDays', op: 'gte', value: 3 },
        { field: 'todayActive', op: 'eq', value: false },
      ],
      time: '20:30',
    },
    message: {
      title: 'زنجیره‌ات امشب قطع می‌شود',
      body: 'زنجیره {days} روزه‌ات امشب قطع می‌شود. یک قسمت کوتاه کافی است.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'team_rank_change',
    name: 'تغییر رتبه در تیم (نسخه ۲)',
    // The *current* rank is free (the sweep already holds every candidate user with `pointsBalance`),
    // but «changed» needs a weekly rank snapshot plus a source for {n}; kept out of version 1 as a
    // whole feature rather than half of one that repeats itself every week.
    description:
      'در ریپو هیچ رتبه‌بندی/لیدربوردی وجود ندارد؛ نیازمند محاسبه هفتگی رتبه در sweep است. نسخه ۱ اجرا نمی‌کند.',
    category: 'progress',
    requiresFeature: 'team_rank',
    trigger: { kind: 'schedule_weekly', weekday: 6, time: '09:00' },
    message: {
      title: 'رتبه تیمی تو عوض شد',
      body: 'رتبه تو در تیم به {n} رسید.',
      actionRef: '/cards',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 7 * DAY,
    },
  }),
  base({
    key: 'first_course_done',
    name: 'اولین آموزش تمام شد',
    description: 'یک بار در عمر کاربر؛ نقطه شروع عادت بعدی.',
    category: 'progress',
    trigger: { kind: 'event', event: 'package.completed' },
    message: {
      title: 'اولین آموزشت تمام شد 🎉',
      body: 'اولین آموزشت را تمام کردی. شروع عالی‌ای بود!',
      actionRef: '/cards',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 365 * DAY,
      sendOnce: true,
    },
  }),

  // ۲۴–۲۷: the manager's side.
  base({
    key: 'weekly_digest',
    name: 'گزارش هفتگی تیم (سیستمی)',
    description:
      'همان job موجود (runWeeklyDigest) با ایمیلش؛ پنل فقط روشن/خاموش و اولویت آن را کنترل می‌کند.',
    category: 'digests',
    audienceRole: 'manager',
    templateKey: 'weekly_digest',
    trigger: { kind: 'schedule_weekly', weekday: 6, time: '09:00' },
    message: {
      title: 'گزارش هفتگی تیم',
      body: 'خلاصه هفتگی: {count} نفر از تیم شما عقب هستند.',
      actionRef: '/manager',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 6 * DAY,
    },
  }),
  base({
    key: 'manager_inactive_7d',
    name: 'هفت روز بی‌فعالیتی اعضای تیم (خلاصه به مدیر)',
    description:
      'به‌جای N پیام، یک پیام خلاصه برای هر مدیر: چند نفر از تیمش هفت روز فعالیتی نداشته‌اند.',
    category: 'messages',
    audienceRole: 'manager',
    trigger: {
      kind: 'inactivity',
      inactivityDays: 7,
      time: '10:00',
    },
    audience: { type: 'role', targetId: 'manager', channel: 'any' },
    message: {
      title: 'اعضای تیم بی‌فعال‌اند',
      body: '{count} نفر از تیم شما ۷ روز است فعالیتی نداشته‌اند. یک پیام کوتاه می‌تواند کمک کند.',
      actionRef: '/manager',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 7 * DAY,
      aggregateForManager: true,
    },
  }),
  base({
    key: 'manager_member_joined',
    name: 'عضو تازه به تیم اضافه شد',
    description: 'پیش‌فرض فقط داخل اپ؛ برای اینکه شروع عضو تازه از چشم مدیر دور نماند.',
    category: 'messages',
    audienceRole: 'manager',
    trigger: { kind: 'event', event: 'team.member_joined' },
    audience: { type: 'role', targetId: 'manager', channel: 'any' },
    message: {
      title: 'عضو تازه در تیم شما',
      // `{name}` here would be the *manager's* own name: in the event path the variables are resolved
      // from the recipient, so the joiner arrives as `{memberName}` from the hook in `users.ts`.
      body: '{memberName} به تیم شما پیوست.',
      actionRef: '/manager',
      imageUrl: null,
    },
    delivery: {
      priority: 'low',
      push: false,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'manager_score_drop',
    name: 'افت میانگین نمره تیم (نسخه ۲)',
    // Needs a weekly per-team average (`team_weekly_stats`) stored next to the previous week's to call
    // a drop a drop. Same shape as team_rank_change, so both land in version 2 together.
    description:
      'نیازمند آمار هفتگی میانگین نمره تیم (team_weekly_stats)؛ در نسخه ۱ محاسبه نمی‌شود.',
    category: 'digests',
    audienceRole: 'manager',
    requiresFeature: 'team_weekly_stats',
    trigger: { kind: 'schedule_weekly', weekday: 6, time: '09:00' },
    audience: { type: 'role', targetId: 'manager', channel: 'any' },
    message: {
      title: 'میانگین نمرات تیم پایین آمد',
      body: 'میانگین نمرات تیم این هفته {n}٪ کمتر شد.',
      actionRef: '/manager',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 7 * DAY,
    },
  }),

  // Gates in front of the templates that already fire today (prompt §5.2). Text stays in the
  // template editor; the panel only owns enable/priority/caps/stats.
  base({
    key: 'welcome',
    name: 'خوش‌آمدگویی (قالب سیستمی)',
    description: 'همان اعلان ثبت‌نام؛ متن در تب قالب‌ها. در وضعیت فعلی فقط داخل اپ است.',
    category: 'general',
    templateKey: 'welcome',
    trigger: { kind: 'event', event: 'user.registered' },
    message: {
      title: 'به آکادمی سیلانه خوش آمدی!',
      body: 'سلام {name}! آموزش‌هایت در صفحه خانه منتظرت هستند.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: false,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'new_assignment',
    name: 'آموزش جدید فعال شد (قالب سیستمی)',
    description: 'همان اعلان انتساب؛ متن در تب قالب‌ها.',
    category: 'deadlines',
    templateKey: 'new_assignment',
    trigger: { kind: 'event', event: 'assignment.created' },
    message: {
      title: 'آموزش جدید: {title}',
      body: 'یک آموزش جدید برایت فعال شد. مهلت: {deadline}',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'reminder',
    name: 'یادآوری روزانه فعلی (قالب سیستمی)',
    description:
      'job موجود runDailyReminders (هر روز ۱۰:۰۰ تهران). اگر «یک روز بی‌فعالیتی» را روشن کنید، این خودکار خاموش می‌شود تا تکراری نشود.',
    category: 'deadlines',
    templateKey: 'reminder',
    trigger: { kind: 'schedule_daily', time: '10:00' },
    message: {
      title: 'ادامه بده!',
      body: '{percent}٪ از «{title}» را رفتی — ادامه بده.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'deadline_warning',
    name: 'هشدار نزدیک شدن مهلت (قالب سیستمی)',
    description: 'همان job موجود (deadline-sweep، ساعتی). غیرفعال‌کردن آن نیازمند تأیید است.',
    category: 'deadlines',
    templateKey: 'deadline_warning',
    trigger: { kind: 'event', event: 'deadline.warning' },
    // The delivery block below is `urgent` on purpose. §4.4 gives the quiet-hours pass to priority
    // `urgent` and nothing else, and `jobs.ts:55` already marks this very notification urgent when the
    // deadline is under 24h away — so the gate mirrors the system template by *saying* urgent, the way
    // `deadline_passed` does. It used to read `high` + `respectQuietHours: false`, which reached the same
    // result by forging the emergency pair inside the sender; keeping that pair out of the sender (PR8.1)
    // would otherwise have made this gate wait until the end of quiet hours for a message about a
    // deadline that is expiring tonight.
    message: {
      title: '{hours} ساعت تا پایان مهلت',
      body: 'مهلت «{title}» نزدیک است. همین حالا ادامه بده.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'urgent',
      push: true,
      inApp: true,
      respectQuietHours: false,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'deadline_passed',
    name: 'گذشتن مهلت (قالب سیستمی)',
    description: 'همان job موجود؛ پوش فوری با عبور مجاز از ساعت سکوت.',
    category: 'deadlines',
    templateKey: 'deadline_passed',
    trigger: { kind: 'event', event: 'deadline.passed' },
    message: {
      title: 'مهلت تمام شد',
      body: 'مهلت «{title}» تمام شد و به مدیرت اطلاع داده شد. هنوز می‌توانی آن را کامل کنی.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'urgent',
      push: true,
      inApp: true,
      respectQuietHours: false,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'manager_message',
    name: 'پیام مدیر (قالب سیستمی)',
    description: 'پیام مستقیم مدیر به بازاریاب؛ متن و بدنه هرگز در پوش نمی‌آید (GENERIC_PUSH).',
    category: 'messages',
    templateKey: 'manager_message',
    trigger: { kind: 'event', event: 'manager.message' },
    message: {
      title: 'پیام از {name}',
      body: 'مدیرت برایت پیام فرستاد.',
      actionRef: '/messages',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'retake_request',
    name: 'درخواست تلاش مجدد (قالب سیستمی)',
    description: 'همان اعلان موجود برای مدیر/بازاریاب.',
    category: 'quizzes',
    templateKey: 'retake_request',
    trigger: { kind: 'event', event: 'retake.requested' },
    message: {
      title: 'درخواست تلاش مجدد',
      body: '{name} برای آزمون «{title}» درخواست تلاش مجدد دارد.',
      actionRef: '/messages',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'retake_reviewed',
    name: 'نتیجه درخواست تلاش مجدد (قالب سیستمی)',
    description: 'همان اعلان موجود.',
    category: 'quizzes',
    templateKey: 'retake_reviewed',
    trigger: { kind: 'event', event: 'retake.reviewed' },
    message: {
      title: 'نتیجه درخواست تلاش مجدد',
      body: 'درخواست تلاش مجدد شما برای «{title}» {score} شد.',
      actionRef: '/packages/{packageId}',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: false,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),
  base({
    key: 'escalation',
    name: 'پیگیری برای مدیر (قالب سیستمی)',
    description: 'پله آخر زنجیره پیگیری رفتار؛ همان اعلان موجود.',
    category: 'messages',
    audienceRole: 'manager',
    templateKey: 'escalation',
    trigger: { kind: 'event', event: 'behavior.escalation' },
    audience: { type: 'role', targetId: 'manager', channel: 'any' },
    message: {
      title: 'نیاز به پیگیری',
      body: 'یک نفر در خطر عقب‌ماندگی است؛ برای بررسی وارد پنل مدیر شوید.',
      actionRef: '/manager',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
  }),

  // ۶.۵ of the analysis: the engine must be able to tell the admin when it is broken.
  base({
    key: 'push_failure_rate',
    name: 'هشدار: نرخ شکست پوش بالاست',
    description:
      'وقتی نرخ شکست ۲۴ ساعت از آستانه (پیش‌فرض ۲۰٪) بیشتر شود؛ فقط برای مدیران. با فعال‌کردن، خودکارخاموش‌کردنی انجام نمی‌شود — فقط هشدار.',
    category: 'health',
    audienceRole: 'admin',
    trigger: {
      kind: 'condition',
      conditions: [{ field: 'failureRatePct', op: 'gte', value: 20 }],
      time: '09:00',
    },
    audience: { type: 'role', targetId: 'admin', channel: 'any' },
    message: {
      title: 'نرخ شکست Push بالاست',
      body: 'نرخ شکست ارسال پوش در ۲۴ ساعت اخیر {n}٪ شد. در پنل، تب «اتوماسیون» را ببینید.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'high',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: DAY,
    },
  }),
  base({
    key: 'push_cron_stalled',
    name: 'هشدار: زمان‌بندی اجرا نشده است',
    description:
      'اگر Cron Trigger بیش از ۳۰ دقیقه گزارش ندهد (به‌عنوان مثال trigger در داشبورد حذف یا غیرفعال شده باشد).',
    category: 'health',
    audienceRole: 'admin',
    trigger: {
      kind: 'condition',
      conditions: [{ field: 'cronStalenessMin', op: 'gte', value: 30 }],
      time: '08:00',
    },
    audience: { type: 'role', targetId: 'admin', channel: 'any' },
    message: {
      title: 'زمان‌بندی‌ها اجرا نمی‌شوند',
      body: 'بیش از {n} دقیقه است هیچ job زمان‌بندی‌شده‌ای گزارش نداده است. در پنل تب «اتوماسیون» و سپس Cron Trigger را بررسی کنید.',
      actionRef: '/',
      imageUrl: null,
    },
    delivery: {
      priority: 'urgent',
      push: true,
      inApp: true,
      respectQuietHours: false,
      cooldownMs: 6 * HOUR_MS,
    },
  }),
];

/** The keys an admin must confirm before switching off (deadline follow-up chain). */
export const CRITICAL_AUTOMATION_KEYS = ['deadline_warning', 'deadline_passed', 'reminder'];

export const CATALOG_KEYS = PUSH_AUTOMATION_CATALOG.map((c) => c.key);

/** Full documents for seeding: everything starts disabled except the system gates in force today. */
export function catalogSeed(key: string): CatalogEntry {
  const found = PUSH_AUTOMATION_CATALOG.find((c) => c.key === key);
  if (!found) throw new Error(`unknown automation key: ${key}`);
  return found;
}
