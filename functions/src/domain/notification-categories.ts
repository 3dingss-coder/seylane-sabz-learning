import type { NotificationType } from './types';

/**
 * Notification categories — the single vocabulary used by three places at once: the automation
 * catalogue (`PushAutomation.category`), what a marketer may mute (`notification_prefs`) and the
 * grouping of the admin list. Keeping it in one tiny pure module means `services/notify.ts` and the
 * automation engine can both read it without importing each other (which would be a cycle).
 *
 * `deadlines` and `health` are protected: deadline follow-up must stay on for every account (the
 * in-app inbox and the manager escalation chain depend on it), and muting must never silence the
 * admin's own failure alerts.
 */
export type NotificationCategory =
  | 'deadlines' // deadline_warning, deadline_passed, reminder, new_assignment, inactivity nudges
  | 'quizzes' // quiz_passed, quiz_failed, retake_*
  | 'progress' // section/package progress, near completion, streaks, badges
  | 'mentor' // mentor_nudge and coach-style suggestions
  | 'content' // a package was published or updated
  | 'messages' // manager_message, escalation
  | 'digests' // weekly_digest
  | 'health' // push/cron failure alerts (admins only)
  | 'general'; // welcome, manual and anything unmapped

export const CATEGORY_ORDER: NotificationCategory[] = [
  'deadlines',
  'quizzes',
  'progress',
  'content',
  'mentor',
  'messages',
  'digests',
  'health',
  'general',
];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  deadlines: 'مهلت‌ها و یادآوری',
  quizzes: 'آزمون و تلاش مجدد',
  progress: 'پیشرفت، زنجیره و نشان',
  mentor: 'منتور و پیشنهادها',
  content: 'محتوای تازه',
  messages: 'پیام مدیر و پیگیری',
  digests: 'گزارش هفتگی',
  health: 'سلامت سیستم',
  general: 'متفرقه',
};

/** Short Persian line shown next to a switch in the marketer's profile. */
export const CATEGORY_HINTS: Record<NotificationCategory, string> = {
  deadlines: 'یادآوری ادامه دادن و نزدیک شدن مهلت آموزش‌ها',
  quizzes: 'نتیجه آزمون و درخواست تلاش مجدد',
  progress: 'پیشرفت بسته، روزهای پیوسته و نشان‌ها',
  mentor: 'پیام‌های کوتاه منتور برای ادامه دادن',
  content: 'وقتی محتوای یک آموزش تازه یا به‌روز می‌شود',
  messages: 'پیام مستقیم مدیر و پیگیری‌ها',
  digests: 'خلاصه هفتگی تیم',
  health: 'هشدار فنی به مدیران (فقط پنل)',
  general: 'خوش‌آمدگویی و پیام‌های متفرقه',
};

/** Categories a user can never mute — push included. */
export const PROTECTED_CATEGORIES: NotificationCategory[] = ['deadlines', 'health'];

const TYPE_CATEGORY: Partial<Record<NotificationType, NotificationCategory>> = {
  new_assignment: 'deadlines',
  reminder: 'deadlines',
  deadline_warning: 'deadlines',
  deadline_passed: 'deadlines',
  quiz_passed: 'quizzes',
  quiz_failed: 'quizzes',
  retake_request: 'quizzes',
  retake_reviewed: 'quizzes',
  mentor_nudge: 'mentor',
  badge_earned: 'progress',
  automation: 'progress',
  manager_message: 'messages',
  escalation: 'messages',
  weekly_digest: 'digests',
  welcome: 'general',
  manual: 'general',
};

export function categoryOfType(type: NotificationType): NotificationCategory {
  return TYPE_CATEGORY[type] ?? 'general';
}

export function isCategory(value: string): value is NotificationCategory {
  return (CATEGORY_ORDER as string[]).includes(value);
}

export function isMutable(category: string): boolean {
  return isCategory(category) && !PROTECTED_CATEGORIES.includes(category as NotificationCategory);
}
