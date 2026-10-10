import { toPersianDigits } from '@/lib/digits';

/**
 * Client-side model for the admin push campaign studio. Pure functions only (no React, no fetch) so
 * the rules shown to the admin are unit-tested. The server re-validates everything (functions/src/
 * services/push-campaigns.ts) — these checks only give fast, friendly feedback.
 */

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'sent_with_errors'
  | 'failed'
  | 'cancelled';

export type AudienceType = 'all' | 'team' | 'role' | 'user';
export type AudienceChannel = 'any' | 'web' | 'android';

export interface CampaignAudience {
  type: AudienceType;
  targetId: string | null;
  channel: AudienceChannel;
}

export interface CampaignSummary {
  batchesTotal: number;
  batchesDone: number;
  users: number;
  attempted: number;
  accepted: number;
  failed: number;
  invalid: number;
  noDevice: number;
  interrupted: number;
}

export interface PushCampaign {
  id: string;
  name: string;
  title: string;
  body: string;
  imageUrl: string | null;
  actionRef: string;
  audience: CampaignAudience;
  status: CampaignStatus;
  scheduledAt: string | null;
  targetCount: number | null;
  pushReachable: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary: CampaignSummary;
  lastError: string | null;
  archivedAt: string | null;
}

export interface CampaignBatch {
  index: number;
  status: 'pending' | 'sending' | 'sent' | 'sent_with_errors' | 'failed' | 'interrupted';
  users: number;
  attempts: number;
  attempted: number;
  accepted: number;
  failed: number;
  invalid: number;
  noDevice: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CampaignDetail {
  campaign: PushCampaign;
  batches: CampaignBatch[];
  batchesTruncated: boolean;
}

export interface AudiencePreview {
  users: number;
  withPushDevice: number;
  webDevices: number;
  androidDevices: number;
  note: string;
}

export const TEHRAN_OFFSET = '+03:30';
export const TEHRAN_TZ = 'Asia/Tehran';

export const STATUS_META: Record<
  CampaignStatus,
  { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }
> = {
  draft: { label: 'پیش‌نویس', tone: 'neutral' },
  scheduled: { label: 'زمان‌بندی‌شده', tone: 'info' },
  queued: { label: 'در صف', tone: 'info' },
  sending: { label: 'در حال ارسال', tone: 'warning' },
  sent: { label: 'ارسال‌شده', tone: 'success' },
  sent_with_errors: { label: 'ارسال‌شده با خطا', tone: 'warning' },
  failed: { label: 'ناموفق', tone: 'danger' },
  cancelled: { label: 'لغوشده', tone: 'neutral' },
};

export const AUDIENCE_TYPE_LABEL: Record<AudienceType, string> = {
  all: 'همه کاربران فعال',
  role: 'یک نقش',
  team: 'یک تیم',
  user: 'یک فرد',
};

export const CHANNEL_LABEL: Record<AudienceChannel, string> = {
  any: 'همه دستگاه‌ها',
  web: 'فقط وب (Web Push)',
  android: 'فقط اپلیکیشن اندروید',
};

/** Internal destinations an admin may pick (must match the server allowlist). */
export const DESTINATIONS: Array<{ value: string; label: string }> = [
  { value: '/messages', label: 'صندوق پیام‌ها' },
  { value: '/', label: 'صفحه خانه' },
  { value: '/learn', label: 'آموزش‌ها' },
  { value: '/cards', label: 'کارت‌های آموزشی' },
  { value: '/mentor', label: 'منتور هوشمند' },
  { value: '/profile', label: 'پروفایل' },
];

const ALLOWED_PREFIXES = [
  '/learn',
  '/packages',
  '/sections',
  '/quiz',
  '/messages',
  '/cards',
  '/mentor',
  '/profile',
];

export function isSafeInternalPath(value: string): boolean {
  if (value.length > 300) return false;
  if (!/^\/[A-Za-z0-9\-_/.]*(\?[A-Za-z0-9=&_\-.%]*)?$/.test(value)) return false;
  if (value.includes('//') || value.includes('..')) return false;
  const path = value.split('?')[0] ?? '/';
  if (path === '/') return true;
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isSafeImageUrl(value: string): boolean {
  if (value.length > 2048 || /\s/.test(value)) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return !(
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':')
  );
}

/** Gregorian date `YYYY-MM-DD` + time `HH:mm`, both in Tehran time, → UTC ISO string for the API. */
export function tehranToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00${TEHRAN_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** UTC ISO → `{ date: YYYY-MM-DD, time: HH:mm }` in Tehran time (for the form inputs). */
export function isoToTehran(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** Human Persian date-time in Tehran time, Persian digits. */
export function faTehranDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return toPersianDigits(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
}

export interface CampaignForm {
  name: string;
  title: string;
  body: string;
  imageUrl: string;
  actionRef: string;
  audienceType: AudienceType;
  targetId: string;
  channel: AudienceChannel;
  scheduleDate: string;
  scheduleTime: string;
}

export const EMPTY_FORM: CampaignForm = {
  name: '',
  title: '',
  body: '',
  imageUrl: '',
  actionRef: '/messages',
  audienceType: 'all',
  targetId: '',
  channel: 'any',
  scheduleDate: '',
  scheduleTime: '',
};

export function formFromCampaign(c: PushCampaign): CampaignForm {
  const t = isoToTehran(c.scheduledAt);
  return {
    name: c.name,
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl ?? '',
    actionRef: c.actionRef,
    audienceType: c.audience.type,
    targetId: c.audience.targetId ?? '',
    channel: c.audience.channel,
    scheduleDate: t.date,
    scheduleTime: t.time,
  };
}

/** Field → Persian message. Empty object = the form can be saved. */
export function validateForm(f: CampaignForm, now = Date.now()): Record<string, string> {
  const e: Record<string, string> = {};
  const name = f.name.trim();
  const title = f.title.trim();
  const body = f.body.trim();
  if (name.length < 2) e.name = 'نام داخلی کمپین را وارد کنید (حداقل ۲ نویسه).';
  else if (name.length > 80) e.name = 'نام داخلی حداکثر ۸۰ نویسه است.';
  if (title.length < 2) e.title = 'عنوان اعلان را وارد کنید (حداقل ۲ نویسه).';
  else if (title.length > 80) e.title = 'عنوان اعلان حداکثر ۸۰ نویسه است.';
  if (body.length < 2) e.body = 'متن اعلان را وارد کنید (حداقل ۲ نویسه).';
  else if (body.length > 300) e.body = 'متن اعلان حداکثر ۳۰۰ نویسه است.';
  const img = f.imageUrl.trim();
  if (img && !isSafeImageUrl(img)) e.imageUrl = 'آدرس تصویر باید یک لینک عمومی با HTTPS باشد.';
  if (!isSafeInternalPath(f.actionRef.trim() || '/messages'))
    e.actionRef = 'مقصد باید یک صفحه داخلی اپلیکیشن باشد.';
  if (f.audienceType !== 'all' && !f.targetId) e.targetId = 'مخاطب را انتخاب کنید.';
  if (f.scheduleDate || f.scheduleTime) {
    const iso = tehranToIso(f.scheduleDate, f.scheduleTime);
    if (!f.scheduleDate || !f.scheduleTime || !iso)
      e.scheduleDate = 'تاریخ و ساعت ارسال را کامل کنید.';
    else if (Date.parse(iso) < now + 60_000)
      e.scheduleDate = 'زمان ارسال باید حداقل ۱ دقیقه در آینده باشد.';
  }
  return e;
}

/** Body for POST/PATCH. `schedule` = true uses the form's date/time; false saves a draft. */
export function payloadFromForm(f: CampaignForm, schedule: boolean) {
  return {
    name: f.name.trim(),
    title: f.title.trim(),
    body: f.body.trim(),
    imageUrl: f.imageUrl.trim() || null,
    actionRef: f.actionRef.trim() || '/messages',
    audience: {
      type: f.audienceType,
      targetId: f.audienceType === 'all' ? null : f.targetId || null,
      channel: f.channel,
    },
    scheduledAt: schedule ? tehranToIso(f.scheduleDate, f.scheduleTime) : null,
  };
}

export function isEditable(status: CampaignStatus): boolean {
  return status === 'draft' || status === 'scheduled';
}

export function audienceLabel(a: CampaignAudience, targetName?: string | null): string {
  const base = AUDIENCE_TYPE_LABEL[a.type];
  const target = a.type === 'all' ? '' : targetName ? `: ${targetName}` : '';
  const channel = a.channel === 'any' ? '' : `، ${CHANNEL_LABEL[a.channel]}`;
  return `${base}${target}${channel}`;
}

/** Share of accepted provider requests. Defined only as accepted ÷ attempted; NOT delivery. */
export function acceptanceRate(s: Pick<CampaignSummary, 'accepted' | 'attempted'>): number | null {
  return s.attempted > 0 ? Math.round((s.accepted / s.attempted) * 100) : null;
}
