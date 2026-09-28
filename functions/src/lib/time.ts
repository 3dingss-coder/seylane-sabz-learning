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

/** YYYY-MM-DD in the given timezone (used for daily throttles / counters). */
export function dayKey(d: Date, timeZone: string): string {
  const p = zonedParts(d, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
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
