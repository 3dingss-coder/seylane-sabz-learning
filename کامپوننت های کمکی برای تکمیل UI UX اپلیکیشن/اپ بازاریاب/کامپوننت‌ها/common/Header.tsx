import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Bell, ShoppingCart, RefreshCw, Smartphone, LogOut } from 'lucide-react';
import { toPersianDigits } from '../../utils/persian';

export const Header: React.FC = () => {
  const { marketer, logout } = useAuth();
  const {
    unreadNotificationsCount,
    cartTotalCartons,
    setIsNotificationsOpen,
    setIsCartOpen,
    setIsSimulatorOpen,
    refreshData,
    isRefreshing,
    showToast,
  } = useApp();

  const [showQuickLogoutModal, setShowQuickLogoutModal] = useState(false);

  const handleConfirmLogout = () => {
    setShowQuickLogoutModal(false);
    logout();
    showToast('با موفقیت خارج شدید', 'info');
  };

  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 shadow-xs"
    >
      <div className="flex items-center justify-between max-w-md mx-auto">
        {/* Brand & Marketer greeting */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-black text-lg shadow-md shadow-emerald-600/20">
            <span>س+</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold text-slate-900 tracking-tight">سیلانه سبز پلاس</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                بازاریاب
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium truncate max-w-[160px]">
              {marketer ? `${marketer.first_name} ${marketer.last_name}` : 'در حال بارگذاری...'}
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {/* Customer Simulator Button - Only visible in Development */}
          {import.meta.env.DEV && (
            <button
              id="header-simulator-btn"
              onClick={() => setIsSimulatorOpen(true)}
              title="شبیه‌ساز ثبت سفارش توسط مشتری در اپ مشتریان"
              className="relative p-2 text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors active:scale-95 flex items-center gap-1"
            >
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <span className="hidden sm:inline text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
                تست مشتری
              </span>
            </button>
          )}

          {/* Refresh Data Button */}
          <button
            id="header-refresh-btn"
            onClick={refreshData}
            title="به‌روزرسانی اطلاعات"
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {/* Cart Button (if items) */}
          {cartTotalCartons > 0 && (
            <button
              id="header-cart-btn"
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors active:scale-95"
            >
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-emerald-600 text-white text-[10px] font-bold rounded-full px-1 border-2 border-white">
                {toPersianDigits(cartTotalCartons)}
              </span>
            </button>
          )}

          {/* Notifications Button */}
          <button
            id="header-notifications-btn"
            onClick={() => setIsNotificationsOpen(true)}
            className="relative p-2 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors active:scale-95"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-rose-500 text-white text-[10px] font-bold rounded-full px-1 border-2 border-white animate-pulse-subtle">
                {toPersianDigits(unreadNotificationsCount)}
              </span>
            )}
          </button>

          {/* Quick Logout / Switch Account Button */}
          <button
            id="header-logout-btn"
            onClick={() => setShowQuickLogoutModal(true)}
            title="خروج از حساب یا تعویض کاربر"
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors active:scale-95"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Logout Confirmation Modal */}
      {showQuickLogoutModal && (
        <div
          id="header-logout-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn"
        >
          <div
            id="header-logout-modal"
            className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 border border-slate-100 text-center animate-slideUp"
          >
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center border border-rose-100 shadow-inner">
              <LogOut className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-extrabold text-slate-900">
                خروج از حساب کاربری بازاریاب
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                آیا می‌خواهید از حساب فعلی خارج شده و به صفحه ورود و ثبت‌نام بازاریاب‌ها هدایت شوید؟
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                id="btn-header-cancel-logout"
                onClick={() => setShowQuickLogoutModal(false)}
                className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                id="btn-header-confirm-logout"
                onClick={handleConfirmLogout}
                className="py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/25 transition-all"
              >
                خروج از حساب
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
