import { useMemo, useState } from 'react';
import { Bot, Check, CircleDashed, Globe, Pencil, Search, Sparkles, Tags } from 'lucide-react';
import { Button, Card, EmptyState, Input, Skeleton, StatusBadge } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductImage } from '@/components/common/ProductImage';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { toPersianDigits } from '@/lib/digits';
import type { MentorGuideKind, MentorGuideRow } from '@/lib/types';
import { useMentorGuides } from './adminQueries';
import { MentorGuideDialog } from './MentorGuideDialog';
import { toneLabel } from './mentorGuideModel';

type Tab = 'all' | 'brand' | 'product';

/**
 * A2-admin — «رفتار منتور»: one screen where the content owner defines, for the whole app, for
 * each brand and for each product, how the mentor must behave and what it must know.
 *
 * The global box is always first: it is the fallback for every question that is not about a
 * brand/product with its own box, so it is also the fastest way to change the mentor's tone.
 */
export function MentorGuidesPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<{
    kind: MentorGuideKind;
    id: string | null;
    name: string;
  } | null>(null);
  const [globalOpen, setGlobalOpen] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (tab !== 'all') p.set('kind', tab);
    if (q.trim()) p.set('q', q.trim());
    if (onlyMissing) p.set('onlyDefined', 'false');
    return p.toString();
  }, [tab, q, onlyMissing]);

  const rows = useMentorGuides(qs);
  const list = rows.data ?? [];
  const globalRow = list.find((r) => r.kind === 'global');
  const rest = list.filter((r) => r.kind !== 'global');
  const definedCount = rest.filter((r) => r.defined).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="رفتار منتور"
        subtitle="برای هر برند و هر محصول تعریف کن منتور چطور حرف بزند و چه اطلاعاتی بدهد"
      />

      <Card tone="brand" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-light">
              <Bot className="size-6 text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold">رفتار پیش‌فرض منتور</h2>
              <p className="text-sm leading-7 text-text-secondary">
                لحن، بایدها و نبایدهایی که وقتی جعبه‌ی اختصاصی برند/محصول تعریف نشده (یا خاموش است)
                به کار می‌رود. منتور به همه‌ی محصولات، آزمون‌ها و پاسخ‌ها دسترسی دارد؛ اینجا فقط
                «رفتار» را تنظیم می‌کنی.
              </p>
            </div>
          </div>
          <Button
            icon={<Pencil className="size-4" aria-hidden />}
            onClick={() => setGlobalOpen(true)}
          >
            {globalRow?.defined ? 'ویرایش' : 'تعریف کن'}
          </Button>
        </div>
        {globalRow?.defined && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <StatusBadge status={globalRow.enabled ? 'active' : 'inactive'} />
            <span>{toneLabel(globalRow.tone)}</span>
            <span>·</span>
            <span>{toPersianDigits(globalRow.filled)} مورد پر شده</span>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="جست‌وجو"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام برند یا محصول…"
            icon={<Search className="size-5" aria-hidden />}
          />
        </div>
        <label className="flex min-h-12 items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="size-4 accent-primary"
          />
          فقط موارد تعریف‌نشده
        </label>
      </div>

      <Tabs<Tab>
        label="نوع مورد"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: 'همه' },
          { value: 'brand', label: 'برندها' },
          { value: 'product', label: 'محصولات' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <Check className="size-4 text-success-fg" aria-hidden />
          {toPersianDigits(definedCount)} تعریف‌شده
        </span>
        <span className="flex items-center gap-1">
          <CircleDashed className="size-4" aria-hidden />
          {toPersianDigits(rest.length - definedCount)} پیش‌فرض
        </span>
      </div>

      {rows.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : rest.length === 0 ? (
        <EmptyState title="موردی پیدا نشد" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rest.map((r) => (
            <GuideRowCard
              key={r.key}
              row={r}
              onEdit={() => setEditing({ kind: r.kind, id: r.targetId, name: r.name })}
            />
          ))}
        </ul>
      )}

      {(editing || globalOpen) && (
        <MentorGuideDialog
          kind={editing?.kind ?? 'global'}
          targetId={editing?.id ?? null}
          name={editing?.name}
          onClose={() => {
            setEditing(null);
            setGlobalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GuideRowCard({ row, onEdit }: { row: MentorGuideRow; onEdit: () => void }) {
  return (
    <li>
      <Card data-testid="guide-row" data-guide-key={row.key} className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          {row.kind === 'brand' ? (
            <BrandLogo name={row.name} logoUrl={row.imageUrl ?? ''} className="size-12" />
          ) : (
            <ProductImage src={row.imageUrl} alt={row.name} className="size-12" />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-bold leading-6">{row.name}</p>
            <p className="flex items-center gap-1 text-xs text-text-secondary">
              {row.kind === 'brand' ? (
                <>
                  <Tags className="size-3" aria-hidden />
                  برند
                </>
              ) : (
                <>
                  <Globe className="size-3" aria-hidden />
                  {row.parentName ?? 'بدون برند'}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {row.defined ? (
            <>
              <StatusBadge status={row.enabled ? 'active' : 'inactive'} />
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5">
                {toneLabel(row.tone)}
              </span>
              <span className="text-text-secondary">{toPersianDigits(row.filled)} مورد</span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-muted-fg">
              <CircleDashed className="size-4" aria-hidden />
              پیش‌فرض منتور
            </span>
          )}
          {row.quizAnswers !== 'inherit' && (
            <span className="rounded-full border border-info/30 bg-info-light px-2 py-0.5 text-info-fg">
              {row.quizAnswers === 'allow' ? 'پاسخ آزمون: مجاز' : 'پاسخ آزمون: ممنوع'}
            </span>
          )}
        </div>

        <div className="mt-auto">
          <Button
            variant={row.defined ? 'secondary' : 'primary'}
            className="w-full"
            icon={
              row.defined ? (
                <Pencil className="size-4" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )
            }
            onClick={onEdit}
          >
            {row.defined ? 'ویرایش رفتار منتور' : 'تعریف رفتار منتور'}
          </Button>
        </div>
      </Card>
    </li>
  );
}
