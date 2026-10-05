import { Brain, GraduationCap, Info } from 'lucide-react';
import { toPersianDigits } from '@/lib/digits';
import { faPercent } from '@/lib/format';
import { useAdminGamification } from '@/lib/queries';
import { Card, ProgressBar } from '@/components/ui';

/**
 * PHASE-3 DoD — «درصد مرورِ به‌موقع» و «نرخ استادی».
 *
 * These are the two numbers that say whether the enablement actually sticks. Deliberately absent:
 * any streak data. G-03 keeps پیوستگی out of every manager and admin surface — completion is work,
 * a streak is personal life.
 */
export function LearningQualityCard() {
  const q = useAdminGamification();
  const d = q.data;
  if (q.isLoading || !d) return null;

  const onTime = d.reviews.onTimeRate;
  const mastery = d.mastery.masteryRate;

  return (
    <Card chunky className="flex flex-col gap-3" data-testid="learning-quality">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text">کیفیت یادگیری</h2>
        <span className="text-xs text-text-secondary">فاز ۳ — مرور هوشمند و استادی</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-input border-2 border-chunk-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-text-secondary">
            <Brain className="size-3.5" aria-hidden />
            مرورِ به‌موقع
          </p>
          <p className="text-2xl font-extrabold text-text">{onTime === null ? '—' : faPercent(onTime)}</p>
          <ProgressBar
            value={onTime === null ? 0 : Math.round(onTime * 100)}
            label="درصد مرورهای به‌موقع"
            className="h-2"
          />
          <p className="text-[11px] leading-5 text-text-secondary">
            {toPersianDigits(d.reviews.reviewsOnTime)} از {toPersianDigits(d.reviews.reviewsDone)}{' '}
            مرور · {toPersianDigits(d.reviews.overdueNow)} مورد عقب‌افتاده ·{' '}
            {toPersianDigits(d.reviews.dueNext7Days)} مورد در ۷ روز آینده
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-input border-2 border-chunk-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-text-secondary">
            <GraduationCap className="size-3.5" aria-hidden />
            نرخ استادی
          </p>
          <p className="text-2xl font-extrabold text-text">
            {mastery === null ? '—' : faPercent(mastery)}
          </p>
          <ProgressBar
            value={mastery === null ? 0 : Math.round(mastery * 100)}
            label="نرخ استادی محصولات"
            className="h-2"
          />
          <p className="text-[11px] leading-5 text-text-secondary">
            {toPersianDigits(d.mastery.mastered)} از {toPersianDigits(d.mastery.evaluated)} ارزیابی‌شده
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['ایستگاه‌ها', d.mastery.conditionCoverage.stations],
            ['دوئل ≥۸۰٪', d.mastery.conditionCoverage.duels],
            ['مرور ۳۰/۹۰', d.mastery.conditionCoverage.reviews],
            ['نقش‌آفرینی تأییدشده', d.mastery.conditionCoverage.roleplay],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-input bg-soft-brand px-2.5 py-2 text-center">
            <p className="text-lg font-extrabold text-leaf">{toPersianDigits(n)}</p>
            <p className="text-[11px] leading-5 text-text-secondary">{label}</p>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-text-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        پیوستگی (streak) عمداً اینجا نیست — قاعدهٔ G-03: مدیر «تکمیل آموزش» را می‌بیند، نه «چند روز
        پشت‌سرهم آمدی». پاداش‌های سکه‌ای:{' '}
        <span className="num-latin font-bold" dir="ltr">
          {d.coins.redemptions}
        </span>{' '}
        درخواست به ارزش{' '}
        <span className="num-latin font-bold" dir="ltr">
          {d.coins.spent}
        </span>{' '}
        سکه.
      </p>
    </Card>
  );
}
