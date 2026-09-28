import { toPersianDigits } from './digits';

const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Tehran',
});
const dateTimeFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tehran',
});
const fullDateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Tehran',
});

export const faDate = (iso: string | null | undefined) =>
  iso ? dateFmt.format(new Date(iso)) : '—';
export const faDateTime = (iso: string | null | undefined) =>
  iso ? dateTimeFmt.format(new Date(iso)) : '—';
export const faFullDate = (iso: string | null | undefined) =>
  iso ? fullDateFmt.format(new Date(iso)) : '—';

/** "۷ دقیقه" / "۱ ساعت و ۵ دقیقه" */
export function faDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${toPersianDigits(m)} دقیقه`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r
    ? `${toPersianDigits(h)} ساعت و ${toPersianDigits(r)} دقیقه`
    : `${toPersianDigits(h)} ساعت`;
}

/** mm:ss for player UI (Latin digits are easier to scan in a time display). */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function faRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'هرگز';
  const diff = Math.round((now - Date.parse(iso)) / 1000);
  if (diff < 60) return 'همین الان';
  if (diff < 3600) return `${toPersianDigits(Math.floor(diff / 60))} دقیقه پیش`;
  if (diff < 86400) return `${toPersianDigits(Math.floor(diff / 3600))} ساعت پیش`;
  if (diff < 86400 * 30) return `${toPersianDigits(Math.floor(diff / 86400))} روز پیش`;
  return faDate(iso);
}

export const faPercent = (n: number) => `${toPersianDigits(Math.round(n))}٪`;
export const faNumber = (n: number) => toPersianDigits(n.toLocaleString('en-US'));

export const ROLE_LABEL: Record<string, string> = {
  marketer: 'بازاریاب',
  manager: 'مدیر فروش',
  admin: 'ادمین',
  superadmin: 'مدیر ارشد سیستم',
};
