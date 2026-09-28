import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toPersianDigits, formatToman } from '../../utils/persian';
import {
  User,
  Phone,
  MapPin,
  BadgeCheck,
  TrendingUp,
  Server,
  Smartphone,
  LogOut,
  ChevronLeft,
  Shield,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { marketer, logout } = useAuth();
  const {
    orders,
    customers,
    setIsApiConfigOpen,
    setIsSimulatorOpen,
    showToast,
  } = useApp();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const totalSales = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.final_amount, 0);

  const handleLogoutConfirm = () => {
    logout();
    showToast('با موفقیت از حساب کاربری خارج شدید', 'info');
  };

  return (
    <div id="profile-view" className="space-y-4 pb-20 pt-2 animate-fadeIn">
      {/* Profile Header Card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-extrabold text-2xl shadow-md shadow-emerald-600/20 flex-shrink-0">
            {marketer?.avatar_url ? (
              <img
                src={marketer.avatar_url}
                alt="Avatar"
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <span>{marketer?.first_name?.[0] || 'ب'}</span>
            )}
          </div>

          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold text-slate-900">
                {marketer?.first_name} {marketer?.last_name}
              </h3>
              <BadgeCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              کد بازاریاب: {marketer?.personnel_code || 'MK-8842'}
            </p>
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              بازاریاب رسمی سیلانه سبز پلاس
            </span>
          </div>
        </div>

        {/* Details list */}
        <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Phone className="w-3.5 h-3.5" />
              شماره تماس:
            </span>
            <span className="font-bold font-mono text-slate-800" dir="ltr">
              {marketer?.phone}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-600">
            <span className="flex items-center gap-1.5 text-slate-400">
              <MapPin className="w-3.5 h-3.5" />
              منطقه فعالیت:
            </span>
            <span className="font-bold text-slate-800">{marketer?.region}</span>
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          عملکرد ویزیت و فروش
        </h4>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block">سفارش‌ها</span>
            <span className="text-xs font-black text-slate-900 mt-1 block">
              {toPersianDigits(orders.length)}
            </span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block">مشتریان فعال</span>
            <span className="text-xs font-black text-slate-900 mt-1 block">
              {toPersianDigits(customers.length)}
            </span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block">مجموع فروش</span>
            <span className="text-xs font-black text-emerald-700 mt-1 block truncate">
              {formatToman(totalSales, false)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Settings Menu */}
      <div className="bg-white rounded-3xl p-2 border border-slate-200/80 shadow-xs divide-y divide-slate-100">
        {/* Developer & Test Tools (Visible in DEV mode only) */}
        {import.meta.env.DEV && (
          <>
            {/* Simulator Tool */}
            <button
              id="btn-profile-simulator"
              onClick={() => setIsSimulatorOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-2xl transition-colors text-right"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    شبیه‌ساز سفارش مشتری (تست اکوسیستم)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ایجاد سفارش زنده از سمت اپلیکیشن مشتریان
                  </span>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>

            {/* Backend API Configuration */}
            <button
              id="btn-profile-api-config"
              onClick={() => setIsApiConfigOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-2xl transition-colors text-right"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    تنظیمات اتصال به سرور Cloudflare Worker
                  </span>
                  <span className="text-[10px] text-slate-400">
                    پیکربندی API Endpoint دیتابیس مشترک D1
                  </span>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>
          </>
        )}

        {/* Logout */}
        <button
          id="btn-logout"
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center justify-between p-3.5 hover:bg-rose-50 rounded-2xl transition-colors text-right group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-100">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-rose-600 block">
                خروج از حساب کاربری بازاریاب
              </span>
              <span className="text-[10px] text-rose-400">انتقال به صفحه ورود / ثبت‌نام</span>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-rose-400" />
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          id="logout-confirm-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn"
        >
          <div
            id="logout-confirm-modal"
            className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 border border-slate-100 text-center animate-slideUp"
          >
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center border border-rose-100 shadow-inner">
              <LogOut className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-extrabold text-slate-900">
                خروج از حساب کاربری
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                آیا مایل به خروج از حساب کاربری بازاریاب هستید؟ برای ورود مجدد یا ثبت‌نام حساب جدید به صفحه ورود منتقل خواهید شد.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                id="btn-cancel-logout"
                onClick={() => setShowLogoutConfirm(false)}
                className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                id="btn-confirm-logout"
                onClick={handleLogoutConfirm}
                className="py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/25 transition-all"
              >
                بله، خارج شو
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
