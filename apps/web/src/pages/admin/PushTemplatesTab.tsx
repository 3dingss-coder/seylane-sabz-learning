import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { faNumber } from '@/lib/format';
import { PushPreview } from './PushPreview';
import {
  ACCENT_CLASSES,
  PUSH_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type PushTemplate,
} from './pushTemplates';

const ALL = 'all';

/** «قالب‌ها» tab: the eight designed templates with a live web/android preview. */
export function PushTemplatesTab() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>(ALL);
  const shown =
    category === ALL ? PUSH_TEMPLATES : PUSH_TEMPLATES.filter((t) => t.category === category);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-7 text-text-secondary">
        یک قالب آماده را انتخاب کنید؛ متن، تصویر، مقصد، مخاطب و زمان ارسال را می‌توانید آزادانه
        تغییر دهید. انتخاب قالب هیچ اعلانی ارسال نمی‌کند.
      </p>

      <CategoryFilter value={category} onChange={setCategory} />

      {shown.length === 0 ? (
        <EmptyState
          title="قالبی در این دسته نیست"
          description="دسته دیگری را انتخاب کنید."
          actionText="نمایش همه قالب‌ها"
          onAction={() => setCategory(ALL)}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((t) => (
            <li key={t.id}>
              <TemplateCard
                template={t}
                onUse={() => navigate(`/admin/push-campaigns/new?template=${t.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Filter chips above the grid (design reference: «تمپلیت صفحه تمپلیت‌ها»). */
export function CategoryFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const chips = [
    { value: ALL, label: 'همه', count: PUSH_TEMPLATES.length },
    ...TEMPLATE_CATEGORIES.map((c) => ({
      value: c,
      label: c,
      count: PUSH_TEMPLATES.filter((t) => t.category === c).length,
    })),
  ];
  return (
    <div
      role="group"
      aria-label="فیلتر دسته قالب‌ها"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {chips.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
          className={cn(
            'pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold whitespace-nowrap',
            value === c.value
              ? 'border-primary bg-primary bg-brand-gradient text-on-primary shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-2',
          )}
        >
          {c.label}
          <span
            className={cn(
              'rounded-full px-1.5 text-xs',
              value === c.value ? 'bg-on-primary/20' : 'bg-surface-2',
            )}
          >
            {faNumber(c.count)}
          </span>
        </button>
      ))}
    </div>
  );
}

function TemplateCard({ template: t, onUse }: { template: PushTemplate; onUse: () => void }) {
  const Icon = t.icon;
  const accent = ACCENT_CLASSES[t.accent];
  return (
    <Card
      className="flex h-full flex-col gap-3"
      aria-label={`قالب ${t.category}`}
      data-testid={`template-card-${t.id}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-card border',
            accent.chip,
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className={cn('truncate text-xs font-bold', accent.text)}>{t.category}</p>
          <p className="truncate text-sm font-extrabold text-text">{t.name}</p>
        </div>
      </div>
      <PushPreview
        title={t.title}
        body={t.body}
        imageUrl={t.imageUrl}
        actionRef={t.actionRef}
        className="flex-1"
      />
      <Button
        block
        className="mt-auto"
        icon={<ArrowLeft className="size-4" aria-hidden />}
        onClick={onUse}
        data-testid={`use-template-${t.id}`}
      >
        استفاده از این قالب
      </Button>
    </Card>
  );
}
