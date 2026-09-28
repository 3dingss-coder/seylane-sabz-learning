import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { toPersianDigits, formatToman } from '../../utils/persian';
import { Clock, Users, TrendingUp, Target, ChevronLeft, AlertCircle } from 'lucide-react';

export const StatCards: React.FC = () => {
  const { orders, customers, pendingOrdersCount, setActiveTab, setOrderStatusFilter } = useApp();
  const { marketer } = useAuth();

  // Calculate sales stats
  const totalSales = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.final_amount, 0);

  const monthlyTarget = marketer?.monthly_target || 350000000;
  const progressPercent = Math.min(Math.round((totalSales / monthlyTarget) * 100), 100);

  const handlePendingClick = () => {
    setOrderStatusFilter('pending');
    setActiveTab('orders');
  };

  const handleCustomersClick = () => {
    setActiveTab('customers');
  };

  return (
    <div id="dashboard-stats" className="space-y-3">
      {/* Pending Orders Alert Banner (High priority visual anchor) */}
      {pendingOrdersCount > 0 && (
        <div
          id="pending-orders-alert"
          onClick={handlePendingClick}
          className="cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-3.5 text-white shadow-lg shadow-amber-500/20 flex items-center justify-between transition-transform active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-white animate-pulse-subtle" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold bg-white/30 px-2 py-0.5 rounded-full">
                  نیازمند بررسی فوری
                </span>
              </div>
              <h4 className="text-sm font-bold mt-0.5">
                {toPersianDigits(pendingOrdersCount)} سفارش جدید در انتظار تایید شماست
              </h4>
            </div>
          </div>
          <ChevronLeft className="w-5 h-5 text-white/80" />
        </div>
      )}

      {/* Main KPI 2-column Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Sales */}
        <div
          id="stat-card-sales"
          className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">فروش ثبت شده</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-slate-900 tracking-tight">
              {formatToman(totalSales)}
            </div>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
              مجموع {toPersianDigits(orders.length)} سفارش
            </p>
          </div>
        </div>

        {/* Active Customers */}
        <div
          id="stat-card-customers"
          onClick={handleCustomersClick}
          className="cursor-pointer bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">مشتریان تحت پوشش</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-slate-900">
              {toPersianDigits(customers.length)} <span className="text-xs font-normal text-slate-500">داروخانه و فروشگاه</span>
            </div>
            <p className="text-[10px] text-blue-600 font-semibold mt-0.5 flex items-center gap-0.5">
              مشاهده لیست مشتریان
              <ChevronLeft className="w-3 h-3" />
            </p>
          </div>
        </div>
      </div>

      {/* Target Progress Bar */}
      <div
        id="stat-card-target"
        className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs"
      >
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <Target className="w-4 h-4 text-emerald-600" />
            <span>هدف فروش ماهانه منطقه</span>
          </div>
          <span className="font-extrabold text-emerald-700">
            {toPersianDigits(progressPercent)}٪ محقق شده
          </span>
        </div>

        {/* Progress bar line */}
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 font-medium">
          <span>هدف: {formatToman(monthlyTarget)}</span>
          <span>منطقه: {marketer?.region || 'تهران'}</span>
        </div>
      </div>
    </div>
  );
};
