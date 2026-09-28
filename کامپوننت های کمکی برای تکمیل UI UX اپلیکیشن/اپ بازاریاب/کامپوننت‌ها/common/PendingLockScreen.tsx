import React, { useEffect, useRef } from 'react';
import { Hourglass, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';

const APPROVAL_POLL_INTERVAL_MS = 15000;

export const PendingLockScreen: React.FC = () => {
  const { marketer, updateProfile, logout } = useAuth();
  const { showToast } = useApp();
  const marketerIdRef = useRef(marketer?.id);
  marketerIdRef.current = marketer?.id;

  useEffect(() => {
    if (!marketer?.id) return;

    let cancelled = false;

    const checkApproval = async () => {
      const id = marketerIdRef.current;
      if (!id) return;
      const fresh = await apiService.getMarketerProfile(id);
      if (!cancelled && fresh && (fresh.active === true || fresh.active === 1)) {
        updateProfile(fresh);
        showToast(
          'دسترسی شما به اپ بازاریابی سیلانه سبز تایید شد. هم‌اکنون می‌توانید از تمامی خدمات این اپ استفاده کنید.',
          'success',
        );
      }
    };

    checkApproval();
    const intervalId = setInterval(() => {
      if (!document.hidden) checkApproval();
    }, APPROVAL_POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (!document.hidden) checkApproval();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [marketer?.id, updateProfile, showToast]);

  return (
    <div
      id="pending-lock-screen"
      className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center space-y-6"
    >
      <div className="w-20 h-20 rounded-3xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 animate-pulse">
        <Hourglass className="w-10 h-10" />
      </div>

      <div className="space-y-2 max-w-xs">
        <h1 className="text-base font-black text-white">در انتظار تایید مدیر بازاریابی</h1>
        <p className="text-xs text-slate-400 font-medium leading-relaxed">
          حساب شما هنوز توسط مدیر بازاریابی تایید نشده است. به محض تایید، به‌صورت خودکار به همه‌ی امکانات اپ
          دسترسی خواهید داشت.
        </p>
      </div>

      <button
        type="button"
        id="btn-pending-lock-logout"
        onClick={logout}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors px-4 py-2.5 rounded-xl hover:bg-white/5"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>خروج از حساب</span>
      </button>
    </div>
  );
};
