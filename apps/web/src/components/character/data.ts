/**
 * PHASE-2 data: objection creatures (§2.3), per-character face geometry (§2.5.1) and the
 * body-language map (§2.5.2). Kept out of the component files on purpose — a file that exports
 * both constants and components breaks React fast-refresh.
 */
import type { CharacterId, Expression, FaceGeometry } from './types';

export type ObjectionId = 'gholombe' | 'soukhte' | 'ajaleh' | 'vafadar' | 'shakkak' | 'dosar';

export interface Objection {
  id: ObjectionId;
  /** what the customer says */
  says: string;
  /** the real need behind it */
  need: string;
  /** the winning move */
  move: string;
}

export const OBJECTIONS: readonly Objection[] = [
  {
    id: 'gholombe',
    says: 'گرونه!',
    need: 'ارزش، نه قیمت',
    move: 'مقایسهٔ هزینه در هر روز مصرف، نه در هر بسته',
  },
  {
    id: 'soukhte',
    says: 'قبلاً امتحان کردم، جواب نداد',
    need: 'ترس از تکرار شکست',
    move: 'پرسیدن تجربهٔ قبلی، تفکیک علت، پیشنهاد کوچک شروع',
  },
  {
    id: 'ajaleh',
    says: 'الان وقت ندارم',
    need: 'اولویت، نه زمان',
    move: 'یک جملهٔ ۱۰ ثانیه‌ای + پیشنهاد زمان بعدی',
  },
  {
    id: 'vafadar',
    says: 'از برند دیگه‌ای می‌خرم',
    need: 'عادت و هویت',
    move: 'تأیید انتخاب قبلی + یک تفاوت مشخص و قابل‌آزمون',
  },
  {
    id: 'shakkak',
    says: 'به تبلیغات اعتماد ندارم',
    need: 'نیاز به مدرک',
    move: 'مدرک/مجوز/تجربهٔ واقعی، نه شعار',
  },
  {
    id: 'dosar',
    says: 'بذار مشورت کنم',
    need: 'حق تصمیم مشترک',
    move: 'دادن یک برگهٔ خلاصه + زمان پیگیری مشخص',
  },
];

export const FACE: Record<Exclude<CharacterId, 'seyla'>, Omit<FaceGeometry, 'ink'>> = {
  raha: { spread: 7, eyeY: 31, mouthY: 41, scale: 1 },
  kamran: { spread: 7.5, eyeY: 31, mouthY: 42, scale: 1.05 },
  simin: { spread: 7, eyeY: 31, mouthY: 41, scale: 1 },
  bahram: { spread: 7.5, eyeY: 31, mouthY: 41, scale: 1 },
  golnar: { spread: 6.5, eyeY: 32, mouthY: 42, scale: 0.95 },
};

/**
 * Body language per expression — transform/opacity only (PHASE-5 M-01), finite animations only
 * (PHASE-5 DoD: nothing infinite on the main screens).
 */
export const BODY_MOTION: Record<Expression, string> = {
  idle: '',
  happy: 'animate-pop',
  celebrate: 'animate-pop',
  thinking: 'animate-bob',
  worried: 'animate-settle',
  proud: 'animate-pop',
  nudge: 'animate-wiggle',
  empathy: 'animate-settle',
};
