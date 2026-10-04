import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, Film } from 'lucide-react';
import { Select } from '@/components/common/Field';
import { QueryState } from '@/components/common/QueryState';
import { Button, EmptyState, Input, Modal, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDuration } from '@/lib/format';
import type { LibraryItem } from '@/lib/mediaLibrary/types';
import { useBrands } from '@/pages/admin/adminQueries';

const fmtSize = (bytes: number | null) =>
  bytes
    ? `${toPersianDigits((bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0))} مگابایت`
    : '';

/**
 * Pick a file that is already in the media library. Opens filtered to the package's brand (the
 * usual case) with one click to widen to every brand — files not assigned to a brand are always
 * listed, so a freshly uploaded file is never hidden behind the filter.
 */
export function MediaPicker({
  kind,
  brandId,
  currentId,
  onPick,
  onClose,
}: {
  /** Omit to list both videos and audio. */
  kind?: 'video' | 'audio';
  brandId?: string | null;
  currentId?: string | null;
  onPick: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const brands = useBrands();
  const [brand, setBrand] = useState(brandId ?? '');
  const [search, setSearch] = useState('');

  const list = useQuery({
    queryKey: ['admin', 'media-library', 'picker', kind ?? 'all'],
    queryFn: ({ signal }) =>
      api.get<LibraryItem[]>(`/admin/media/library${kind ? `?kind=${kind}` : ''}`, signal),
  });

  const visible = (items: LibraryItem[]) => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (it) =>
        (!brand || !it.brandId || it.brandId === brand) &&
        (!q || it.title.toLowerCase().includes(q) || it.originalName.toLowerCase().includes(q)),
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        kind === 'video'
          ? 'انتخاب ویدیو از کتابخانه'
          : kind === 'audio'
            ? 'انتخاب صوت از کتابخانه'
            : 'انتخاب از کتابخانه رسانه'
      }
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          بستن
        </Button>
      }
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Select label="برند" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">همه برندها</option>
          {(brands.data ?? [])
            .filter((b) => !b.archived)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </Select>
        <Input
          label="جستجو"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="نام فایل…"
        />
      </div>
      <QueryState
        query={list}
        loading={<Skeleton className="h-32 w-full" />}
        isEmpty={(d) => visible(d).length === 0}
        empty={
          <EmptyState
            title="فایلی پیدا نشد"
            description="ابتدا فایل را در «کتابخانه رسانه» بارگذاری کنید، یا فیلتر برند را بردارید."
          />
        }
      >
        {(items) => (
          <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {visible(items).map((it) => {
              const Icon = it.kind === 'video' ? Film : AudioLines;
              const selected = it.id === currentId;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onPick(it)}
                    className={`flex w-full items-center gap-3 rounded-card border p-3 text-start transition-colors hover:border-primary focus-visible:outline-2 ${
                      selected ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                    }`}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-primary-light text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-text" dir="auto">
                        {it.title}
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {[
                          fmtSize(it.sizeBytes),
                          it.durationSec ? faDuration(it.durationSec) : '',
                          it.brandName
                            ? `${it.brandName}${it.productName ? ` › ${it.productName}` : ''}`
                            : 'بدون برند',
                          it.usedBy.length ? `در ${toPersianDigits(it.usedBy.length)} آموزش` : '',
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    </span>
                    {selected && <span className="text-xs font-bold text-primary">انتخاب‌شده</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Modal>
  );
}
