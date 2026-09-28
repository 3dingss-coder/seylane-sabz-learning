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
      className="flex gap-3 rounded-card border border-border bg-surface p-3 shadow-sm transition-colors hover:border-primary/40 focus-visible:border-primary"
      data-testid="package-card"
    >
      <ProductImage
        src={image}
        alt={p.product?.name ?? p.brand?.name ?? p.title}
        className="size-20"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-xs font-bold text-primary">
          {p.brand?.name}
          {p.product ? '' : p.brand ? ' — آموزش برند' : ''}
        </p>
        <h3 className="line-clamp-2 text-sm font-bold leading-6 text-text">{p.title}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          {p.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 font-bold text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden /> تکمیل شد
            </span>
          ) : (
            p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {faDuration(p.totalDurationSec)}
          </span>
          <span>
            {toPersianDigits(p.completedSections)} از {toPersianDigits(p.sectionCount)} قسمت
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ProgressBar value={p.percent} label={`پیشرفت ${p.title}`} className="flex-1" />
          <span className="text-xs font-bold text-text-secondary">{faPercent(p.percent)}</span>
        </div>
      </div>
    </Link>
  );
}
