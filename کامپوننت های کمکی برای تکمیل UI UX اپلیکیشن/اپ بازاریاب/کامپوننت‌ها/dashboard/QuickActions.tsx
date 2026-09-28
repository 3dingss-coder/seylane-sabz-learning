import React from 'react';
import { useApp } from '../../context/AppContext';
import { PlusCircle, UserPlus, ShoppingBag, Smartphone, Users } from 'lucide-react';

export const QuickActions: React.FC = () => {
  const {
    setIsNewOrderOpen,
    setIsAddCustomerOpen,
    setActiveTab,
    setIsSimulatorOpen,
  } = useApp();

  return (
    <div id="quick-actions-section" className="space-y-2">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
        دسترسی‌های سریع
      </h3>

      <div className="grid grid-cols-2 gap-2.5">
        {/* New Order on behalf of Customer */}
        <button
          id="quick-action-new-order"
          onClick={() => setIsNewOrderOpen(true)}
          className="flex items-center gap-3 p-3.5 bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-2xl shadow-md shadow-emerald-700/20 active:scale-[0.98] transition-all text-right group"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <PlusCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold leading-tight">ثبت سفارش جدید</div>
            <div className="text-[10px] text-emerald-100 mt-0.5">به نمایندگی از مشتری</div>
          </div>
        </button>

        {/* Add Customer */}
        <button
          id="quick-action-add-customer"
          onClick={() => setIsAddCustomerOpen(true)}
          className="flex items-center gap-3 p-3.5 bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-800 rounded-2xl shadow-xs active:scale-[0.98] transition-all text-right group"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold leading-tight">ثبت مشتری جدید</div>
            <div className="text-[10px] text-slate-500 mt-0.5">داروخانه یا فروشگاه</div>
          </div>
        </button>

        {/* Product Catalog */}
        <button
          id="quick-action-catalog"
          onClick={() => setActiveTab('catalog')}
          className="flex items-center gap-3 p-3 bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-800 rounded-2xl shadow-xs active:scale-[0.98] transition-all text-right group"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold leading-tight">کاتالوگ و قیمت‌ها</div>
            <div className="text-[10px] text-slate-500 mt-0.5">برندها و موجودی انبار</div>
          </div>
        </button>

        {/* Live Simulator (Dev only) or Customer Directory (Prod) */}
        {import.meta.env.DEV ? (
          <button
            id="quick-action-simulator"
            onClick={() => setIsSimulatorOpen(true)}
            className="flex items-center gap-3 p-3 bg-white hover:bg-slate-50 border border-emerald-200/90 text-slate-800 rounded-2xl shadow-xs active:scale-[0.98] transition-all text-right group"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight text-emerald-800">تست سفارش مشتری</div>
              <div className="text-[10px] text-slate-500 mt-0.5">شبیه‌ساز اپ مشتریان</div>
            </div>
          </button>
        ) : (
          <button
            id="quick-action-customers-list"
            onClick={() => setActiveTab('customers')}
            className="flex items-center gap-3 p-3 bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-800 rounded-2xl shadow-xs active:scale-[0.98] transition-all text-right group"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight">لیست مشتریان من</div>
              <div className="text-[10px] text-slate-500 mt-0.5">مدیریت و سوابق</div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};
