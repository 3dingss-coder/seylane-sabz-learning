/**
 * Countdown state for package deadlines (F6, §15.0 rule 4: countdown always visible).
 * Thresholds follow policies.warningHours defaults [72, 24].
 */
export type CountdownTone = 'normal' | 'warning' | 'danger' | 'overdue';

export interface CountdownState {
  tone: CountdownTone;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  /** Short Latin-digit label, e.g. "3d 04h", "05:12" (§16.3: Latin digits for countdowns). */
  short: string;
  /** Persian sentence for screen readers / aria-label. */
  spoken: string;
}

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function getCountdown(
  deadline: Date | string | number,
  now: Date | number = Date.now(),
  warningHours: readonly [number, number] = [72, 24],
): CountdownState {
  const target = new Date(deadline).getTime();
  const totalMs = target - new Date(now).getTime();
  const abs = Math.max(0, totalMs);
  const days = Math.floor(abs / (24 * HOUR));
  const hours = Math.floor((abs % (24 * HOUR)) / HOUR);
  const minutes = Math.floor((abs % HOUR) / 60_000);

  let tone: CountdownTone = 'normal';
  if (totalMs <= 0) tone = 'overdue';
  else if (totalMs <= warningHours[1] * HOUR) tone = 'danger';
  else if (totalMs <= warningHours[0] * HOUR) tone = 'warning';

  const short =
    tone === 'overdue' ? '00:00' : days > 0 ? `${days}d ${pad(hours)}h` : `${pad(hours)}:${pad(minutes)}`;

  let spoken: string;
  if (tone === 'overdue') spoken = 'مهلت تمام شده است';
  else if (days > 0) spoken = `${days} روز و ${hours} ساعت تا پایان مهلت`;
  else if (hours > 0) spoken = `${hours} ساعت و ${minutes} دقیقه تا پایان مهلت`;
  else spoken = `${minutes} دقیقه تا پایان مهلت`;

  return { tone, totalMs, days, hours, minutes, short, spoken };
}
