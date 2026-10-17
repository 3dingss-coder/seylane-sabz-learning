import {
  CalendarHeart,
  GraduationCap,
  Megaphone,
  Package,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { EMPTY_FORM, type AudienceType, type CampaignForm } from './pushCampaignModel';

/**
 * Ready-made push notification templates (design reference: «تمپلیت پوش نوتیف‌ها»).
 *
 * Templates are STATIC — they live in code, not in the database, and they never reach the server.
 * Picking one only pre-fills the campaign form; sending still goes through the existing
 * `POST /admin/push-campaigns` + `.../send` path with the existing validation, scheduling,
 * batching and idempotency logic untouched.
 */

/** Category colours. Re-mapped onto the design tokens in src/styles/index.css. */
export type TemplateAccent =
  'primary' | 'info' | 'accent' | 'violet' | 'danger' | 'success' | 'warning';

/**
 * Category colours as Tailwind classes built from the design tokens (same pattern as the status
 * tones in PushCampaignsPage). Full class strings so Tailwind's scanner keeps them.
 */
export const ACCENT_CLASSES: Record<TemplateAccent, { chip: string; text: string }> = {
  primary: { chip: 'border-primary/30 bg-primary-light text-primary-fg', text: 'text-primary-fg' },
  info: { chip: 'border-info/30 bg-info-light text-info-fg', text: 'text-info-fg' },
  accent: { chip: 'border-accent/30 bg-accent-light text-accent-fg', text: 'text-accent-fg' },
  violet: { chip: 'border-violet/30 bg-violet-light text-violet-fg', text: 'text-violet-fg' },
  danger: { chip: 'border-danger/30 bg-danger-light text-danger-fg', text: 'text-danger-fg' },
  success: { chip: 'border-success/30 bg-success-light text-success-fg', text: 'text-success-fg' },
  warning: { chip: 'border-warning/30 bg-warning-light text-warning-fg', text: 'text-warning-fg' },
};

export interface PushTemplate {
  /** Stable id — also the image file name (`/push-templates/<id>.webp`). */
  id: string;
  /** Persian category label shown on the card and in the filter chips. */
  category: string;
  icon: LucideIcon;
  accent: TemplateAccent;
  /** Internal campaign name pre-filled into the form (only admins see it). */
  name: string;
  title: string;
  body: string;
  /** Absolute HTTPS URL — `isSafeImageUrl` (client and server) refuses anything else. */
  imageUrl: string;
  /** Must stay inside `DESTINATIONS` / the server route allowlist. */
  actionRef: string;
  /**
   * Optional narrower audience. Left unset for every shipped template: they are all broadcast
   * messages, and a narrower audience needs a targetId that only the admin can choose (an
   * audience type without a target fails `validateForm`).
   */
  suggestedAudience?: AudienceType;
}

/**
 * Origin for the template banners. Deliberately NOT `window.location.origin`: in dev the app runs
 * on `http://localhost`, which `isSafeImageUrl` rejects (https only), so a template would fail
 * validation the moment an admin previewed it locally.
 */
export const APP_ORIGIN: string = (
  (import.meta.env.VITE_APP_URL as string | undefined) ?? 'https://academy-seylaneh.site'
).replace(/\/+$/, '');

/** Public path of a template banner (served from apps/web/public/push-templates/). */
export function templateImageUrl(id: string): string {
  return `${APP_ORIGIN}/push-templates/${id}.webp`;
}

export const PUSH_TEMPLATES: PushTemplate[] = [
  {
    id: 'new-course',
    category: 'آموزش جدید',
    icon: GraduationCap,
    accent: 'primary',
    name: 'قالب: آموزش جدید',
    title: 'یه آموزش تازه منتظرته!',
    body: 'همین حالا محتوای جدیدی به دوره‌های شما اضافه شده.',
    imageUrl: templateImageUrl('new-course'),
    actionRef: '/learn',
  },
  {
    id: 'reminder',
    category: 'یادآوری آموزش',
    icon: Timer,
    accent: 'info',
    name: 'قالب: یادآوری آموزش',
    title: 'فقط چند دقیقه تا تکمیل آموزش!',
    body: 'برای ادامه مسیر یادگیری، لطفاً به آموزش نیمه‌تمام خود سر بزنید.',
    imageUrl: templateImageUrl('reminder'),
    actionRef: '/learn',
  },
  {
    id: 'achievement',
    category: 'تشویق و دستاورد',
    icon: PartyPopper,
    accent: 'accent',
    name: 'قالب: تشویق و دستاورد',
    title: 'آفرین! یک قدم جلوتر رفتی.',
    body: 'تلاش‌های تو نتیجه داده و به سطح جدیدی رسیدی. ادامه بده!',
    imageUrl: templateImageUrl('achievement'),
    // The design listed «/product» here; it is not in DESTINATIONS nor in the server route
    // allowlist, so the closest allowed destination is used. See the PR notes.
    actionRef: '/learn',
  },
  {
    id: 'product',
    category: 'معرفی محصول',
    icon: Package,
    accent: 'violet',
    name: 'قالب: معرفی محصول',
    title: 'محصول جدید رو ببین!',
    body: 'محتوای تازه‌ای برای یادگیری بهتر و سریع‌تر منتظر شماست.',
    imageUrl: templateImageUrl('product'),
    actionRef: '/cards',
  },
  {
    id: 'comeback',
    category: 'بازگشت کاربر',
    icon: RotateCcw,
    accent: 'info',
    name: 'قالب: بازگشت کاربر',
    title: 'برگردیم از همون‌جا ادامه بدیم؟',
    body: 'آموزش‌های مورد علاقه‌ات منتظرند. با ما دوباره شروع کن!',
    imageUrl: templateImageUrl('comeback'),
    actionRef: '/learn',
  },
  {
    id: 'official',
    category: 'اطلاعیه رسمی',
    icon: Megaphone,
    accent: 'danger',
    name: 'قالب: اطلاعیه رسمی',
    title: 'یک اطلاعیه مهم برای شما',
    body: 'لطفاً برای مشاهده جزئیات بیشتر وارد پنل شوید.',
    imageUrl: templateImageUrl('official'),
    actionRef: '/messages',
  },
  {
    id: 'event',
    category: 'مناسبت و رویداد',
    icon: CalendarHeart,
    accent: 'success',
    name: 'قالب: مناسبت و رویداد',
    title: 'رویداد ویژه این هفته',
    body: 'وبینار آموزشی «مهارت‌های یادگیری مؤثر» به‌زودی برگزار می‌شود.',
    imageUrl: templateImageUrl('event'),
    actionRef: '/messages',
  },
  {
    id: 'offer',
    category: 'پیشنهاد ویژه',
    icon: Sparkles,
    accent: 'warning',
    name: 'قالب: پیشنهاد ویژه',
    title: 'پیشنهاد ویژه برای تو',
    body: 'مجموعه‌ای از آموزش‌های منتخب را همین حالا مشاهده کن.',
    imageUrl: templateImageUrl('offer'),
    actionRef: '/learn',
  },
];

/** Unique category labels, in template order — used for the filter chips. */
export const TEMPLATE_CATEGORIES: string[] = PUSH_TEMPLATES.reduce<string[]>((acc, t) => {
  if (!acc.includes(t.category)) acc.push(t.category);
  return acc;
}, []);

export function findTemplate(id: string | null | undefined): PushTemplate | undefined {
  if (!id) return undefined;
  return PUSH_TEMPLATES.find((t) => t.id === id);
}

/** Only the copy the template owns; audience/channel/schedule stay exactly as they were. */
export const TEMPLATE_COPY_FIELDS = ['name', 'title', 'body', 'imageUrl', 'actionRef'] as const;

export type TemplateCopy = Pick<CampaignForm, (typeof TEMPLATE_COPY_FIELDS)[number]>;

export function templateCopy(f: CampaignForm): TemplateCopy {
  return {
    name: f.name,
    title: f.title,
    body: f.body,
    imageUrl: f.imageUrl,
    actionRef: f.actionRef,
  };
}

export function sameTemplateCopy(a: TemplateCopy, b: TemplateCopy): boolean {
  return TEMPLATE_COPY_FIELDS.every((k) => a[k] === b[k]);
}

export function copyFromTemplate(t: PushTemplate): TemplateCopy {
  return {
    name: t.name,
    title: t.title,
    body: t.body,
    imageUrl: t.imageUrl,
    actionRef: t.actionRef,
  };
}

/**
 * Template → campaign form. Audience, channel and scheduling are left at their untouched
 * defaults (`all` / `any` / empty) unless the template suggests an audience.
 */
export function formFromTemplate(t: PushTemplate): CampaignForm {
  return {
    ...EMPTY_FORM,
    ...copyFromTemplate(t),
    audienceType: t.suggestedAudience ?? 'all',
    targetId: '',
    channel: 'any',
    scheduleDate: '',
    scheduleTime: '',
  };
}
