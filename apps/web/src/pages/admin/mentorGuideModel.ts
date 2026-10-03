import type { MentorGuideQuizPolicy, MentorGuideTone } from '@/lib/types';

/** Shared by the behaviour-box editor and the admin list (labels must never drift apart). */
export const TONE_OPTIONS: Array<{ value: MentorGuideTone; label: string; hint: string }> = [
  { value: 'friendly', label: 'صمیمی', hint: 'مثل یک همکار باتجربه و خودمانی' },
  { value: 'professional', label: 'رسمی و کارشناسی', hint: 'دقیق و متین؛ مناسب داروخانه و پخش' },
  { value: 'coach', label: 'مربی فروش', hint: 'پیگیر و انگیزشی، با قدم بعدی مشخص' },
  { value: 'brief', label: 'کوتاه و تیتروار', hint: 'حداقل کلمات، فقط نکته‌های کلیدی' },
];

export const QUIZ_OPTIONS: Array<{ value: MentorGuideQuizPolicy; label: string }> = [
  { value: 'inherit', label: 'پیروی از تنظیم کلی سایت' },
  { value: 'allow', label: 'مجاز — پاسخ آزمون را بگوید' },
  { value: 'hide', label: 'ممنوع — فقط راهنمایی کند' },
];

export const toneLabel = (t: MentorGuideTone) =>
  TONE_OPTIONS.find((o) => o.value === t)?.label ?? '';
