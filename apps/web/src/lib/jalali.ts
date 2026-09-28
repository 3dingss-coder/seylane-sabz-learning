import { toPersianDigits } from './digits';

/**
 * Jalali (Solar Hijri) ⇄ Gregorian conversion — the standard jalaali algorithm
 * (Borkowski / jalaali-js), valid for Jalali years −61…3177. Pure, no dependencies.
 * Spec §16.9: deadlines are shown and picked in the Jalali calendar, stored as UTC ISO.
 */
export type JDate = [number, number, number];

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];
const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0] ?? -61;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i] ?? 0;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): JDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return [gy, gm, gd];
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JDate {
  const gy = d2g(jdn)[0];
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return [jy, 7 + div(k, 30), mod(k, 30) + 1];
}

export const toJalali = (gy: number, gm: number, gd: number): JDate => d2j(g2d(gy, gm, gd));
export const toGregorian = (jy: number, jm: number, jd: number): JDate => d2g(j2d(jy, jm, jd));
export const isLeapJalali = (jy: number) => jalCal(jy).leap === 0;
export const jalaliMonthLength = (jy: number, jm: number) =>
  jm <= 6 ? 31 : jm <= 11 ? 30 : isLeapJalali(jy) ? 30 : 29;

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;
/** Week starts on Saturday (index 0). */
export const JALALI_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

/** 0 = Saturday … 6 = Friday for a Gregorian date. */
export const weekdaySatFirst = (gy: number, gm: number, gd: number) =>
  (new Date(gy, gm - 1, gd).getDay() + 1) % 7;

export const jalaliToday = (now = new Date()): JDate =>
  toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());

/** «۶ مهر ۱۴۰۵» */
export const formatJalali = (date: JDate) =>
  `${toPersianDigits(date[2])} ${JALALI_MONTHS[date[1] - 1] ?? ''} ${toPersianDigits(date[0])}`;
