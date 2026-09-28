import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  ShieldAlert, Bell, LogOut, ChevronDown, CheckCircle, UserCheck, Lock, Megaphone, Sparkles, Building2
} from 'lucide-react';

interface HeaderProps {
  onNavigate?: (path: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigate }) => {
  const { currentUser, logout } = useAuth();
  const { appSettings, adminUsers } = useData();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const pendingUsersCount = adminUsers.filter(u => u.status === 'pending').length;

  const handleNotificationClick = () => {
    setShowNotifications(false);
    if (onNavigate) {
      onNavigate('/admin-users');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0F5338] text-white shadow-md border-b border-emerald-900">
      
      {/* Backdrop for open menus */}
      {(showNotifications || showProfileMenu) && (
        <div
          onClick={() => {
            setShowNotifications(false);
            setShowProfileMenu(false);
          }}
          className="fixed inset-0 z-40 bg-transparent"
        />
      )}

      {/* Header Main Bar */}

      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative z-50">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white text-[#006c4a] font-black text-lg flex items-center justify-center shadow-inner border border-emerald-200">
            س
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-sm md:text-base text-white tracking-wide">
                سیلانه سبز پلاس
              </h1>
              <span className="text-[10px] font-mono bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-700 font-semibold">
                پنل مدیریت
              </span>
            </div>
            <p className="text-[10px] text-emerald-200/80 hidden sm:block">
              سامانه یکپارچه مدیریت فروش، بازاریابان و کاتالوگ محصولات
            </p>
          </div>
        </div>

        {/* User Info & Actions */}
        {currentUser ? (
          <div className="flex items-center gap-3">
            
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowProfileMenu(false);
                }}
                className="p-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-900 text-emerald-100 transition-colors relative"
                title="اعلان‌های سیستم"
              >
                <Bell className="w-4 h-4" />
                {pendingUsersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse">
                    {pendingUsersCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute left-0 mt-2 w-80 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 p-3.5 z-50 text-xs animate-in fade-in">
                  <div className="font-bold text-slate-900 pb-2 mb-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-[#006c4a]" />
                      <span>اعلان‌های مدیریت</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-[#006c4a] px-2 py-0.5 rounded-full font-bold">
                      {pendingUsersCount} مورد
                    </span>
                  </div>

                  {pendingUsersCount > 0 ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                        <div className="font-bold mb-1 text-amber-950 flex items-center gap-1">
                          <UserCheck className="w-4 h-4 text-amber-600" />
                          <span>درخواست‌های ادمین جدید</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-tight">
                          <strong>{pendingUsersCount} کاربر جدید</strong> در انتظار تایید نقش مدیریتی هستند.
                        </p>
                        {onNavigate && (
                          <button
                            onClick={handleNotificationClick}
                            className="mt-2.5 w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs flex items-center justify-center gap-1"
                          >
                            <span>بررسی و تعیین نقش</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-center py-6 text-[11px] flex flex-col items-center gap-1">
                      <CheckCircle className="w-6 h-6 text-emerald-500 mb-1" />
                      <span>تمامی درخواست‌ها بررسی شده‌اند.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Current User Badge & Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 bg-emerald-900/60 hover:bg-emerald-900/90 p-1.5 px-3 rounded-xl border border-emerald-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-[#006c4a] text-white font-extrabold text-xs flex items-center justify-center border border-emerald-500">
                  {currentUser.first_name[0]}
                </div>

                <div className="text-right hidden sm:block">
                  <div className="font-bold text-xs text-white">
                    {currentUser.first_name} {currentUser.last_name}
                  </div>
                  <div className="text-[10px] text-emerald-300 font-semibold flex items-center gap-1">
                    <span>نقش:</span>
                    <span className="font-bold text-amber-300">
                      {currentUser.role || 'در انتظار تایید'}
                    </span>
                  </div>
                </div>

                <ChevronDown className="w-3.5 h-3.5 text-emerald-200" />
              </button>

              {/* Profile Dropdown Menu */}
              {showProfileMenu && (
                <div className="absolute left-0 mt-2 w-56 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 text-xs animate-in fade-in">
                  <div className="p-2 border-b border-slate-100 mb-1 bg-slate-50 rounded-xl">
                    <div className="font-bold text-slate-900">{currentUser.first_name} {currentUser.last_name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{currentUser.phone || 'ورود با توکن مدیرکل'}</div>
                  </div>

                  {onNavigate && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onNavigate('/settings');
                      }}
                      className="w-full text-right px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors font-semibold flex items-center gap-2"
                    >
                      <Building2 className="w-4 h-4 text-slate-500" />
                      <span>تنظیمات سیستم</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full text-right px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors font-bold flex items-center gap-2 mt-1"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>خروج از پنل</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Logout button */}
            <button
              onClick={logout}
              className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-200 transition-colors border border-rose-900/80"
              title="خروج سریع"
            >
              <LogOut className="w-4 h-4" />
            </button>

          </div>
        ) : null}

      </div>
    </header>
  );
};
