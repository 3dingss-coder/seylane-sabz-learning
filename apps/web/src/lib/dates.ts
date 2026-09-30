/**
 * Date/time field helpers.
 *
 * Everything the app displays in Persian (dates, relative times, the Jalali picker) is pinned to
 * Asia/Tehran — the marketer, the manager and the admin all live in Iran. So a datetime field must
 * read and write the **Tehran wall clock**, not the browser's own zone: a German-based admin who
 * picks «۱۴۰۵/۰۷/۰۵ ۰۹:۰۰» used to store 05:30Z and the marketer saw 08:00.
 * Iran has no DST any more (UTC+03:30 all year), but the offset is still resolved through Intl so
 * the app stays correct for any other `policy.timezone`.
 */
export const APP_TIME_ZONE = 'Asia/Tehran';

type Parts = Record<string, string>;

function zoneParts(d: Date, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const out: Parts = {};
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') out[p.type] = p.value ?? '';
  return out;
}

const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** ISO → `YYYY-MM-DDTHH:mm` wall-clock in `timeZone` (the value a datetime field shows). */
export function toZonedInput(iso: string | null | undefined, timeZone = APP_TIME_ZONE): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = zoneParts(d, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** `YYYY-MM-DDTHH:mm` (or a plain date) in `timeZone` → ISO; `''` → null. */
export function fromZonedInput(value: string, timeZone = APP_TIME_ZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const asUtc = Date.UTC(num(y), num(mo) - 1, num(d), num(h), num(mi));
  return new Date(asUtc - zoneOffset(new Date(asUtc), timeZone)).toISOString();
}

/** UTC offset of `timeZone` at `at` (whole minutes — good enough for every zone we ship). */
function zoneOffset(at: Date, timeZone: string): number {
  const p = zoneParts(at, timeZone);
  const asUtc = Date.UTC(num(p.year), num(p.month) - 1, num(p.day), num(p.hour), num(p.minute), 0);
  return asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
}
