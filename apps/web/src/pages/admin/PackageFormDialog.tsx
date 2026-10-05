import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { Select, Textarea } from '@/components/common/Field';
import { ApiError, api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import type { AdminPackage } from '@/lib/types';
import { useBrands, useProducts } from './adminQueries';

/** Create or edit package metadata. Brand may stay empty → unassigned draft (D33). */
export function PackageFormDialog({
  open,
  onClose,
  initial,
  presetBrandId,
  presetProductId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: AdminPackage;
  presetBrandId?: string | null;
  presetProductId?: string | null;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [brandId, setBrandId] = useState(initial?.brandId ?? presetBrandId ?? '');
  const [productId, setProductId] = useState(initial?.productId ?? presetProductId ?? '');
  const [minutes, setMinutes] = useState(String(initial?.estimatedMinutes ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const brands = useBrands();
  const products = useProducts(brandId || undefined);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        description: description.trim(),
        brandId: brandId || null,
        productId: productId || null,
        // Packages have no deadline any more: always clear it.
        deadlineHours: null,
        deadlineAt: null,
        ...(minutes ? { estimatedMinutes: Number(minutes) } : {}),
      };
      return initial
        ? api.patch<AdminPackage>(`/admin/packages/${initial.id}`, body)
        : api.post<AdminPackage>('/admin/packages', body);
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: 'success',
        message: initial ? 'ذخیره شد.' : 'بسته ساخته شد. حالا قسمت‌ها را اضافه کنید.',
      });
      onClose();
      if (!initial) nav(`/admin/packages/${p.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش بسته' : 'بسته آموزشی جدید'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            onClick={() => m.mutate()}
            disabled={title.trim().length < 3}
          >
            {initial ? 'ذخیره' : 'ساخت بسته'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="عنوان بسته"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
        />
        <Textarea
          label="توضیح کوتاه"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="برند"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              setProductId('');
            }}
            error={errors.brandId}
            hint={!brandId ? 'بدون برند = پیش‌نویس بدون تخصیص (قابل انتشار نیست)' : undefined}
          >
            <option value="">— بدون برند —</option>
            {(brands.data ?? [])
              .filter((b) => !b.archived || b.id === brandId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
          <Select
            label="محصول"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={!brandId}
            error={errors.productId}
            hint={brandId && !productId ? 'بدون محصول = آموزش سطح برند' : undefined}
          >
            <option value="">— آموزش سطح برند —</option>
            {(products.data ?? [])
              .filter((p) => !p.archived || p.id === productId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="زمان تقریبی (دقیقه)"
            type="number"
            ltr
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            error={errors.estimatedMinutes}
            hint="خالی = محاسبه خودکار از قسمت‌ها"
          />
        </div>
      </div>
    </Modal>
  );
}
