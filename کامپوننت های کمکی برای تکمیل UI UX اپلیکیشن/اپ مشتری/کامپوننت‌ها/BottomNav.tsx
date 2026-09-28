import React from 'react';
import { TabType } from '../types';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'home', label: 'خانه', icon: 'home' },
    { id: 'products', label: 'محصولات', icon: 'grid_view' },
    { id: 'orders', label: 'سفارشات', icon: 'receipt_long' },
    { id: 'visitor', label: 'ارتباط با ویزیتور', icon: 'support_agent' },
    { id: 'profile', label: 'حساب کاربری', icon: 'person' },
  ];

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-0 w-[calc(100%-24px)] max-w-[424px] z-40 pt-[2px] px-[2px] rounded-t-2xl bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#059669] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
    >
      {/* overflow-visible so the active tab's bubble can pop up above the bar's top edge */}
      <nav
        className="relative w-full overflow-visible bg-white rounded-t-[14px] px-1.5"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-around items-end w-full h-18">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex flex-col items-center justify-end flex-1 h-full active:scale-95 transition-transform"
            >
              {/* Soft "socket" shadow pooled into the bar under the raised bubble */}
              <span
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 w-11 h-4 rounded-full bg-[#006c4a]/15 blur-[3px] transition-all duration-300 ease-out ${
                  isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                }`}
              />

              {/* Bubble: pops above the bar when active, sits flat inline otherwise */}
              <div
                className={`relative flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                  isActive
                    ? '-translate-y-3.5 w-12 h-12 bg-gradient-to-br from-[#10b981] to-[#00694a] shadow-[0_6px_16px_rgba(0,108,74,0.45)] ring-[3px] ring-[#f4fbf7]'
                    : 'translate-y-0 w-9 h-9 bg-transparent'
                }`}
              >
                <span
                  className={`material-symbols-outlined leading-none transition-all duration-300 ${
                    isActive ? 'text-[22px] text-white' : 'text-[22px] text-[#7c8a83]'
                  }`}
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {tab.icon}
                </span>
              </div>

              <span
                className={`font-['Vazirmatn'] text-[10.5px] leading-none mt-1 transition-all duration-300 ${
                  isActive ? 'text-[#006c4a] font-extrabold opacity-100' : 'text-[#7c8a83] font-bold opacity-80'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
        </div>
      </nav>
    </div>
  );
};
