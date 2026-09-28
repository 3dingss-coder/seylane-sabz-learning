import React, { ReactNode } from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  icon?: ReactNode;
  id?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionText,
  onAction,
  icon,
  id = 'empty-state',
}) => {
  return (
    <div
      id={id}
      className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-slate-100 shadow-sm my-4"
    >
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
        {icon || <PackageOpen className="w-8 h-8" />}
      </div>
      <h3 className="text-base font-bold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-xs mb-5 leading-relaxed">{description}</p>
      {actionText && onAction && (
        <button
          id={`${id}-action-btn`}
          onClick={onAction}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
