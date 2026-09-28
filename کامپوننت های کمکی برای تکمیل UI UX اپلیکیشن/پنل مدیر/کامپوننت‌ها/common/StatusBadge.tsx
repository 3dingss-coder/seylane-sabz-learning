import React from 'react';
import { OrderStatus, BusinessType, AdminRole, AdminStatus } from '../../types';

interface StatusBadgeProps {
  type: 'order' | 'business' | 'active' | 'role' | 'adminStatus';
  value: OrderStatus | BusinessType | boolean | AdminRole | AdminStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, value, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  if (type === 'order') {
    const status = value as OrderStatus;
    switch (status) {
      case 'ثبت‌شده':
        return <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          ثبت‌شده
        </span>;
      case 'تایید شده':
        return <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          تایید شده
        </span>;
      case 'در حال پردازش':
        return <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          در حال پردازش
        </span>;
      case 'ارسال شده':
        return <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60`}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
          ارسال شده
        </span>;
      case 'لغو شده':
        return <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          لغو شده
        </span>;
      default:
        return <span className={`${sizeClasses} rounded-full bg-slate-100 text-slate-700`}>{String(value)}</span>;
    }
  }

  if (type === 'business') {
    const biz = value as BusinessType;
    const labels: Record<BusinessType, { text: string; bg: string }> = {
      pharmacy: { text: 'داروخانه', bg: 'bg-teal-50 text-teal-800 border-teal-200/60' },
      cosmetics: { text: 'فروشگاه آرایشی', bg: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200/60' },
      supermarket: { text: 'سوپرمارکت', bg: 'bg-amber-50 text-amber-800 border-amber-200/60' },
      hypermarket: { text: 'هایپرمارکت', bg: 'bg-indigo-50 text-indigo-800 border-indigo-200/60' },
      other: { text: 'سایر کسب‌وکارها', bg: 'bg-slate-50 text-slate-800 border-slate-200/60' }
    };
    const item = labels[biz] || labels.other;
    return <span className={`${sizeClasses} rounded-md border ${item.bg}`}>{item.text}</span>;
  }

  if (type === 'active') {
    const isActive = Boolean(value);
    return isActive ? (
      <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60`}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        فعال
      </span>
    ) : (
      <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200`}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        غیرفعال
      </span>
    );
  }

  if (type === 'adminStatus') {
    const st = value as AdminStatus;
    return st === 'active' ? (
      <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70`}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        فعال
      </span>
    ) : (
      <span className={`${sizeClasses} inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/70`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        در انتظار تایید
      </span>
    );
  }

  if (type === 'role') {
    const role = value as AdminRole;
    if (!role) return <span className={`${sizeClasses} rounded-full bg-slate-100 text-slate-500`}>تعیین نشده</span>;
    const colors: Record<string, string> = {
      'مدیرکل': 'bg-emerald-800 text-white font-bold shadow-xs',
      'مدیر فروش': 'bg-[#006c4a] text-white font-medium',
      'مدیر محتوا': 'bg-teal-700 text-white font-medium',
      'مدیر بازاریابی': 'bg-emerald-600 text-white font-medium'
    };
    return <span className={`${sizeClasses} rounded-md ${colors[role] || 'bg-slate-200 text-slate-700'}`}>{role}</span>;
  }

  return <span className={`${sizeClasses} rounded-full bg-slate-100 text-slate-700`}>{String(value)}</span>;
};
