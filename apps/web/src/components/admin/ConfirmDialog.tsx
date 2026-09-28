import type { ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmText = 'تأیید',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-7 text-text-secondary">{children}</div>
    </Modal>
  );
}
