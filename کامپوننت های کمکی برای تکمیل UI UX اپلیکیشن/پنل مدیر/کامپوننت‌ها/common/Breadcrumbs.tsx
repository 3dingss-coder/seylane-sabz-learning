import React from 'react';
import { ChevronLeft, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

export const Breadcrumbs: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => {
  return (
    <nav className="flex items-center gap-2 text-xs text-slate-500 mb-6 bg-white/60 backdrop-blur-xs px-3 py-2 rounded-lg border border-slate-200/60 inline-flex">
      <span className="flex items-center gap-1 text-slate-400">
        <Home className="w-3.5 h-3.5" />
        <span>پنل مدیران</span>
      </span>

      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-300 rtl:rotate-0" />
          {item.active || !item.onClick ? (
            <span className="font-semibold text-[#006c4a]">{item.label}</span>
          ) : (
            <button
              onClick={item.onClick}
              className="hover:text-[#006c4a] hover:underline transition-colors"
            >
              {item.label}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
