import React from 'react';
import { FileQuestion, RefreshCw, Plus } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'اطلاعاتی یافت نشد',
  description = 'هیچ داده‌ای متناسب با فیلترها یا وضعیت درخواستی پیدا نشد.',
  actionLabel,
  onAction,
  icon
}) => {
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center justify-center min-h-[260px]">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#006c4a] flex items-center justify-center mb-4 border border-emerald-100 shadow-xs">
        {icon || <FileQuestion className="w-7 h-7" />}
      </div>
      <h3 className="text-base font-bold text-[#171c1f] mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mb-6 leading-relaxed">{description}</p>
      
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#006c4a] text-white hover:bg-[#0F5338] transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

export const ErrorState: React.FC<{ onRetry?: () => void; message?: string }> = ({
  onRetry,
  message = 'بروز خطا در دریافت اطلاعات. لطفا مجددا تلاش کنید.'
}) => {
  return (
    <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
      <p className="text-sm font-semibold text-rose-800 mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>تلاش مجدد</span>
        </button>
      )}
    </div>
  );
};
