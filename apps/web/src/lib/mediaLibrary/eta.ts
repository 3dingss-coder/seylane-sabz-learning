import { toPersianDigits } from '../digits';

/**
 * Smoothed time-remaining estimate for a long job whose speed varies (compression, then upload).
 * Returns null until there is enough signal, so the UI never flashes a wild number.
 */
export class EtaEstimator {
  private last: { p: number; t: number } | null = null;
  private startedAt: number | null = null;
  private rate = 0; // progress (0..1) per millisecond, exponentially smoothed

  constructor(private readonly alpha = 0.25) {}

  update(progress: number, now = Date.now()): void {
    const p = Math.max(0, Math.min(1, progress));
    if (this.startedAt === null) this.startedAt = now;
    if (this.last && now > this.last.t && p > this.last.p) {
      const inst = (p - this.last.p) / (now - this.last.t);
      this.rate = this.rate === 0 ? inst : this.alpha * inst + (1 - this.alpha) * this.rate;
    }
    if (!this.last || p >= this.last.p) this.last = { p, t: now };
  }

  remainingMs(now = Date.now()): number | null {
    if (!this.last || this.rate <= 0) return null;
    if (this.startedAt !== null && now - this.startedAt < 4000) return null;
    if (this.last.p < 0.02) return null;
    return Math.max(0, (1 - this.last.p) / this.rate);
  }
}

/** «حدود ۵ دقیقه» — coarse on purpose; precision here would be false precision. */
export function formatEta(ms: number | null): string {
  if (ms === null) return 'در حال محاسبه زمان…';
  const min = ms / 60_000;
  if (min < 0.75) return 'کمتر از یک دقیقه';
  if (min < 90) return `حدود ${toPersianDigits(Math.max(1, Math.round(min)))} دقیقه`;
  const h = Math.round((min / 60) * 2) / 2;
  return `حدود ${toPersianDigits(h)} ساعت`;
}
