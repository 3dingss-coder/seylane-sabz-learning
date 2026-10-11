export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}

/** Local wall-clock parts in an IANA timezone (default Asia/Tehran). */
export function zonedParts(
  d: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdays.indexOf(String(parts.weekday)),
  };
}

/** UTC offset of `timeZone` at instant `d` (minutes, rounded — enough for zones without seconds). */
export function zonedOffsetMs(d: Date, timeZone: string): number {
  const p = zonedParts(d, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(d.getTime() / 60_000) * 60_000;
}

/** End (23:59:59) of the calendar day `d` falls on in `timeZone`, as a UTC instant. */
export function endOfZonedDay(d: Date, timeZone: string): Date {
  const p = zonedParts(d, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59) - zonedOffsetMs(d, timeZone));
}

/** YYYY-MM-DD in the given timezone (used for daily throttles / counters). */
export function dayKey(d: Date, timeZone: string): string {
  const p = zonedParts(d, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * `YYYY-Www` ISO week key in the given timezone. Weekly automation windows and the weekly push cap
 * are keyed by this, so a window can never overlap two calendar weeks.
 */
export function weekKey(d: Date, timeZone: string): string {
  const p = zonedParts(d, timeZone);
  const DAY_MS = 86_400_000;
  const day = Date.UTC(p.year, p.month - 1, p.day);
  const dow = (p.weekday + 6) % 7; // 0 = Monday
  // ISO-8601: a week belongs to the year that holds its Thursday.
  const thursday = day + (3 - dow) * DAY_MS;
  const t = new Date(thursday);
  const year = t.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const jan1Dow = (new Date(jan1).getUTCDay() + 6) % 7;
  // The first Thursday of the ISO year, i.e. the Thursday of the week that contains Jan 4.
  const week1Thursday = jan1 + ((3 - jan1Dow + 7) % 7) * DAY_MS;
  const week = Math.floor((thursday - week1Thursday) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Minutes since midnight in `timeZone` (0..1439). */
export function minutesOfDay(d: Date, timeZone: string): number {
  const p = zonedParts(d, timeZone);
  return p.hour * 60 + p.minute;
}

/** 'HH:mm' → minutes since midnight, or null when malformed. */
export function parseHhmm(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether `d` falls within quiet hours [start, end) in `timeZone` (window may cross midnight). */
export function inQuietHours(
  d: Date,
  quiet: { start: string; end: string },
  timeZone: string,
): boolean {
  const p = zonedParts(d, timeZone);
  const now = p.hour * 60 + p.minute;
  const s = toMinutes(quiet.start);
  const e = toMinutes(quiet.end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Next instant (≥ d) at which quiet hours end. */
export function quietHoursEnd(
  d: Date,
  quiet: { start: string; end: string },
  timeZone: string,
): Date {
  // Step minute-by-minute is simple and bounded (≤ 24h * 60 = 1440 iterations).
  let t = new Date(Math.ceil(d.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 1500 && inQuietHours(t, quiet, timeZone); i++) t = addMs(t, 60_000);
  return t;
}
