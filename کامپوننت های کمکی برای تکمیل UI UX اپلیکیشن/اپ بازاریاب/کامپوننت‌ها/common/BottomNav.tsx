import React from 'react';
import { useApp } from '../../context/AppContext';
import { TabType } from '../../types';
import { LayoutDashboard, ClipboardList, ShoppingBag, Users, User } from 'lucide-react';
import { toPersianDigits } from '../../utils/persian';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, pendingOrdersCount } = useApp();

  const navItems: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'orders', label: 'سفارش‌ها', icon: ClipboardList },
    { id: 'catalog', label: 'کاتالوگ کالا', icon: ShoppingBag },
    { id: 'customers', label: 'مشتریان', icon: Users },
    { id: 'profile', label: 'پروفایل', icon: User },
  ];

  return (
    <nav
      id="bottom-navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 pb-safe"
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-200 min-w-[64px] ${
                isActive
                  ? 'text-emerald-700 font-bold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              {/* Active pill background indicator */}
              {isActive && (
                <span className="absolute -top-1.5 w-8 h-1 bg-emerald-600 rounded-full" />
              )}

              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-emerald-600' : ''}`} />
                
                {/* Pending orders badge on Orders tab */}
                {item.id === 'orders' && pendingOrdersCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] flex items-center justify-center bg-amber-500 text-white text-[9px] font-bold rounded-full px-1 border-2 border-white">
                    {toPersianDigits(pendingOrdersCount)}
                  </span>
                )}
              </div>

              <span className={`text-[11px] mt-1 tracking-tight ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
