import { toLatinDigits } from './digits';

/** Mirrors functions/src/lib/ids.normalizePhone; returns canonical 09xxxxxxxxx or null. */
export function normalizeIranianMobile(input: string): string | null {
  let phone = toLatinDigits(input.trim()).replace(/[\s\-()]/g, '');
  if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
  else if (phone.startsWith('9') && phone.length === 10) phone = `0${phone}`;
  return /^09\d{9}$/.test(phone) ? phone : null;
}
