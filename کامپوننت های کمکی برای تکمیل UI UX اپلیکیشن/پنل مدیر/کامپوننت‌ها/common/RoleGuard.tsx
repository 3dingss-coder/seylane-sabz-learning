import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, BarChart3, LayoutDashboard } from 'lucide-react';

interface RoleGuardProps {
  path: string;
  children: React.ReactNode;
  onNavigate: (path: string) => void;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ path, children, onNavigate }) => {
  const { currentUser, hasPermission } = useAuth();

  if (hasPermission(path)) {
    return <>{children}</>;
  }

  const isPending = currentUser?.status === 'pending';

  return (
    <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-amber-200/80 shadow-md text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
        <Lock className="w-8 h-8" />
      </div>

      <h2 className="text-lg font-bold text-[#171c1f] mb-2">
        {isPending ? 'حساب شما در انتظار تایید مدیرکل است' : 'عدم دسترسی به این بخش'}
      </h2>

      <p className="text-xs text-slate-600 leading-relaxed mb-6">
        {isPending
          ? 'حساب ادمین جدید شما هنوز توسط مدیرکل تایید نشده است. پس از تخصیص نقش توسط مدیرکل، دسترسی کامل شما فعال خواهد شد. در حال حاضر می‌توانید از بخش گزارشات بازدید نمایید.'
          : `نقش فعلی شما (${currentUser?.role || 'بدون نقش'}) اجازه دسترسی به این صفحه (${path}) را ندارد.`}
      </p>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => onNavigate('/reports')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
        >
          <BarChart3 className="w-4 h-4 text-[#006c4a]" />
          <span>مشاهده گزارشات</span>
        </button>

        <button
          onClick={() => onNavigate('/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>بازگشت به داشبورد</span>
        </button>
      </div>
    </div>
  );
};
