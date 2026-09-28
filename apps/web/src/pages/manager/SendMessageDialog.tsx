import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, useToast } from '@/components/ui';
import { Select, Tabs, Textarea } from '@/components/common/Field';
import { ApiError, api } from '@/lib/api';
import { errMsg } from '@/lib/errors';

const TEMPLATES = [
  'سلام، مهلت آموزش نزدیک است. لطفاً امروز ادامه بده.',
  'آفرین! همین‌طور ادامه بده 👏',
  'اگر جایی گیر کرده‌ای، به من پیام بده.',
];

/** Manager → marketer message (free) or package note (shown on the package page). */
export function SendMessageDialog({
  open,
  onClose,
  userId,
  userName,
  packages,
  defaultPackageId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  packages: Array<{ id: string; title: string }>;
  defaultPackageId?: string | null;
}) {
  const [kind, setKind] = useState<'message' | 'note'>('message');
  const [body, setBody] = useState('');
  const [packageId, setPackageId] = useState(defaultPackageId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () =>
      api.post(`/manager/users/${userId}/${kind === 'message' ? 'messages' : 'notes'}`, {
        body: body.trim(),
        packageId: packageId || null,
      }),
    onSuccess: () => {
      toast.show({
        type: 'success',
        message: kind === 'message' ? 'پیام ارسال شد.' : 'یادداشت ثبت شد.',
      });
      setBody('');
      setErrors({});
      void qc.invalidateQueries({ queryKey: ['manager'] });
      onClose();
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
      title={`ارسال به ${userName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={send.isPending}
            disabled={!body.trim() || (kind === 'note' && !packageId)}
            onClick={() => send.mutate()}
          >
            ارسال
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Tabs
          label="نوع پیام"
          value={kind}
          onChange={setKind}
          items={[
            { value: 'message', label: 'پیام' },
            { value: 'note', label: 'یادداشت روی آموزش' },
          ]}
        />
        {(kind === 'note' || packages.length > 0) && (
          <Select
            label={kind === 'note' ? 'آموزش' : 'آموزش مربوط (اختیاری)'}
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            error={errors.packageId}
          >
            <option value="">{kind === 'note' ? 'انتخاب کنید' : 'بدون آموزش'}</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        )}
        <Textarea
          label="متن"
          value={body}
          maxLength={1000}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
        />
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBody(t)}
              className="min-h-12 rounded-card border border-border px-3 text-start text-xs text-text-secondary hover:border-primary/40"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
