import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  icon: LucideIcon;
  iconBgColor?: string;
  badgeText?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  iconBgColor = 'bg-[#006c4a]/10 text-[#006c4a]',
  badgeText
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200 relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-slate-500 block mb-1">{title}</span>
          <div className="text-2xl font-extrabold text-[#171c1f] tracking-tight">{value}</div>
        </div>

        <div className={`p-3 rounded-xl ${iconBgColor} transition-transform group-hover:scale-105 duration-200`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        {trend && (
          <div className={`flex items-center gap-1 font-semibold ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span>{trend.isPositive ? '↑' : '↓'}</span>
            <span>{trend.value}</span>
            <span className="text-slate-400 font-normal">نسبت به ماه قبل</span>
          </div>
        )}

        {subtitle && !trend && (
          <span className="text-slate-500 font-normal">{subtitle}</span>
        )}

        {badgeText && (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
            {badgeText}
          </span>
        )}
      </div>
    </div>
  );
};
