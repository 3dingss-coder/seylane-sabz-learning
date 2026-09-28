import React from 'react';
import { useApp } from '../../context/AppContext';
import { OrderStatus } from '../../types';
import { Search, X } from 'lucide-react';
import { toPersianDigits } from '../../utils/persian';

export const OrderFilters: React.FC = () => {
  const {
    orderStatusFilter,
    setOrderStatusFilter,
    orderSearchQuery,
    setOrderSearchQuery,
    orders,
  } = useApp();

  const filterOptions: { id: OrderStatus | 'all'; label: string; count?: number }[] = [
    { id: 'all', label: 'همه سفارش‌ها', count: orders.length },
    { id: 'pending', label: 'در انتظار بررسی', count: orders.filter((o) => o.status === 'pending').length },
    { id: 'confirmed', label: 'تایید شده', count: orders.filter((o) => o.status === 'confirmed').length },
    { id: 'processing', label: 'در حال آماده‌سازی', count: orders.filter((o) => o.status === 'processing').length },
    { id: 'shipped', label: 'ارسال شده', count: orders.filter((o) => o.status === 'shipped').length },
    { id: 'cancelled', label: 'لغو شده', count: orders.filter((o) => o.status === 'cancelled').length },
  ];

  return (
    <div id="order-filters-container" className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          id="order-search-input"
          type="text"
          value={orderSearchQuery}
          onChange={(e) => setOrderSearchQuery(e.target.value)}
          placeholder="جستجو با نام داروخانه، مشتری یا کد سفارش..."
          className="w-full pr-10 pl-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
        />
        {orderSearchQuery && (
          <button
            id="clear-order-search-btn"
            onClick={() => setOrderSearchQuery('')}
            className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Horizontal Scrollable Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
        {filterOptions.map((opt) => {
          const isSelected = orderStatusFilter === opt.id;
          return (
            <button
              key={opt.id}
              id={`filter-tab-${opt.id}`}
              onClick={() => setOrderStatusFilter(opt.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <span>{opt.label}</span>
              {opt.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {toPersianDigits(opt.count)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
