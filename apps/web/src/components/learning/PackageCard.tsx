import { Link } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { CountdownChip, ProgressBar } from '@/components/ui';
import { ProductImage } from '@/components/common/ProductImage';
import { toPersianDigits } from '@/lib/digits';
import { faDuration, faPercent } from '@/lib/format';
import type { PackageSummary } from '@/lib/types';

/** Package card (M3/M4): real product image (or brand logo for brand-level packages). */
export function PackageCard({ p }: { p: PackageSummary }) {
  const image = p.product?.imageUrl ?? p.brand?.logoUrl;
  return (
    <Link
      to={`/packages/${p.id}`}
      className="pressable group relative grid min-h-40 grid-cols-[96px_1fr] gap-4 overflow-hidden rounded-hero border border-border bg-surface p-4 shadow-sm hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:border-primary sm:grid-cols-[112px_1fr]"
      data-testid="package-card"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary via-primary-400 to-accent"
      />
      <div className="relative self-start">
        <div className="absolute -inset-2 rounded-[22px] bg-primary-light opacity-70 blur-xl transition-opacity group-hover:opacity-100" />
        <ProductImage
          src={image}
          alt={p.product?.name ?? p.brand?.name ?? p.title}
          className="relative size-24 rounded-[18px] border border-border bg-background object-contain p-2 shadow-xs transition-transform duration-300 ease-soft group-hover:scale-[1.04] sm:size-28"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-primary-fg">
            {p.brand?.name}
            {p.product ? '' : p.brand ? ' — آموزش برند' : ''}
          </p>
          {p.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-light px-2.5 py-1 text-[11px] font-bold text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden /> تکمیل شد
            </span>
          ) : (
            p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
          )}
        </div>
        <h3 className="line-clamp-2 text-base font-extrabold leading-7 text-text">{p.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {faDuration(p.totalDurationSec)}
          </span>
          <span>
            {toPersianDigits(p.completedSections)} از {toPersianDigits(p.sectionCount)} قسمت
          </span>
        </div>
        <div className="mt-auto pt-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-text-secondary">پیشرفت آموزش</span>
            <span className="text-xs font-extrabold text-primary-fg">{faPercent(p.percent)}</span>
          </div>
          <ProgressBar value={p.percent} label={`پیشرفت ${p.title}`} />
        </div>
      </div>
    </Link>
  );
}
