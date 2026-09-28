import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, Users, Package, Award, Sparkles, UserCheck, Settings, BarChart3, Lock, ChevronLeft, Menu, X, Bell
} from 'lucide-react';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate, isOpenMobile, setIsOpenMobile }) => {
  const { currentUser, hasPermission } = useAuth();

  const menuItems = [
    { path: '/dashboard', label: 'داشبورد اصلی', icon: LayoutDashboard },
    { path: '/orders', label: 'مدیریت سفارش‌ها', icon: ShoppingCart },
    { path: '/customers', label: 'مشتریان و فروشگاه‌ها', icon: Users },
    { path: '/marketers', label: 'بازاریابان و مناطق', icon: UserCheck },
    { path: '/products', label: 'کاتالوگ محصولات', icon: Package },
    { path: '/brands', label: 'برندهای سیلانه سبز', icon: Award },
    { path: '/offers', label: 'آفرهای هفته و پکیج‌ها', icon: Sparkles },
    { path: '/reports', label: 'گزارشات و تحلیل فروش', icon: BarChart3 },
    { path: '/notifications', label: 'ارسال نوتیفیکیشن', icon: Bell, onlySuperAdmin: true },
    { path: '/admin-users', label: 'مدیریت کاربران ادمین', icon: UserCheck, onlySuperAdmin: true },
    { path: '/settings', label: 'تنظیمات سیستم', icon: Settings },
  ];

  const handleItemClick = (path: string, allowed: boolean) => {
    if (!allowed) return;
    onNavigate(path);
    setIsOpenMobile(false);
  };

  const isPending = currentUser?.status === 'pending';

  return (
    <>
      {/* Mobile overlay */}
      {isOpenMobile && (
        <div
          onClick={() => setIsOpenMobile(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-16 right-0 z-40 md:z-30 w-64 h-[calc(100vh-4rem)] bg-white border-l border-slate-200/80 flex flex-col justify-between transition-transform duration-300 ease-in-out shadow-xl md:shadow-none ${
          isOpenMobile ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-3 overflow-y-auto flex-1">
          
          {/* Pending Approval Warning Banner inside Sidebar if user is pending */}
          {isPending && (
            <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>حساب در انتظار تایید</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-tight">
                نقش شما توسط مدیرکل هنوز تایید نشده است. دسترسی اولیه به بخش گزارشات فعال می‌باشد.
              </p>
            </div>
          )}

          <div className="text-[11px] font-bold text-slate-400 px-3 uppercase tracking-wider mb-2">
            منوی اصلی مدیریتی
          </div>

          <nav className="space-y-1">
            {menuItems.map(item => {
              const Icon = item.icon;
              const allowed = hasPermission(item.path);
              const isActive = currentPath === item.path || (item.path !== '/' && item.path !== '/dashboard' && currentPath.startsWith(item.path));

              return (
                <button
                  key={item.path}
                  onClick={() => handleItemClick(item.path, allowed)}
                  disabled={!allowed}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-right ${
                    isActive
                      ? 'bg-[#006c4a] text-white shadow-xs font-bold'
                      : allowed
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-[#006c4a]'
                      : 'text-slate-400 bg-slate-50/70 cursor-not-allowed opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : allowed ? 'text-slate-500' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {!allowed && (
                    <span className="flex items-center gap-1 text-[10px] bg-amber-100/80 text-amber-800 px-1.5 py-0.5 rounded-md font-normal">
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span>قفل</span>
                    </span>
                  )}

                  {allowed && isActive && (
                    <ChevronLeft className="w-3.5 h-3.5 text-white/80" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer info */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div className="bg-white rounded-lg p-2.5 border border-slate-200 text-slate-600 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold text-[#006c4a]">سرور مرکزی فعال</span>
            </div>
            <span className="text-[10px] text-slate-400">نسخه v2.4</span>
          </div>
        </div>
      </aside>
    </>
  );
};
