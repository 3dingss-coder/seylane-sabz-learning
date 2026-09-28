import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { KPICard } from '../components/common/KPICard';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  ShoppingCart, DollarSign, Users, UserCheck, TrendingUp, ArrowLeft, Plus, Eye, Award, Target, Calendar
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
  onOpenOrderModal: () => void;
  onSelectOrder: (orderId: number) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onOpenOrderModal,
  onSelectOrder
}) => {
  const { orders, customers, marketers } = useData();

  // Calculations for KPIs
  const totalSales = orders.reduce((acc, o) => acc + (o.status !== 'لغو شده' ? o.final_amount : 0), 0);
  const activeCustomersCount = customers.filter(c => c.active).length;
  const activeMarketersCount = marketers.filter(m => m.active).length;
  const recentOrders = orders.slice(0, 5);

  // Top marketers sorted by achieved sales
  const topMarketers = [...marketers].sort((a, b) => b.achieved_sales - a.achieved_sales).slice(0, 4);

  // 30-day Sales chart mock points
  const chartPoints = [
    { day: '۱ مرداد', sales: 45 },
    { day: '۵ مرداد', sales: 78 },
    { day: '۱۰ مرداد', sales: 62 },
    { day: '۱۵ مرداد', sales: 95 },
    { day: '۲۰ مرداد', sales: 110 },
    { day: '۲۵ مرداد', sales: 140 },
    { day: '۳۰ مرداد', sales: 185 },
  ];

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Welcome */}
      <div className="bg-gradient-to-r from-[#0F5338] via-[#006c4a] to-emerald-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-emerald-200 text-xs font-semibold mb-2 backdrop-blur-xs">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
            <span>نظارت آنلاین لحظه‌ای بر سفارش‌ها</span>
          </span>
          <h1 className="text-xl md:text-2xl font-black text-white leading-tight">
            داشبورد مدیریتی سیلانه سبز پلاس
          </h1>
          <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed">
            گزارش عملکرد فروش عمده، وضعیت سفارشات در جریان و ارزیابی تارگت بازاریابان مناطق پنج‌گانه.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <button
            onClick={onOpenOrderModal}
            className="px-4 py-2.5 bg-white text-[#006c4a] hover:bg-emerald-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت سفارش عمده جدید</span>
          </button>
        </div>

        {/* Decorative background circle */}
        <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="مجموع فروش ثبت‌شده این ماه"
          value={`${(totalSales / 1000000).toLocaleString('fa-IR')} میلیون تومان`}
          trend={{ value: '۱۲.۵٪', isPositive: true }}
          icon={DollarSign}
          iconBgColor="bg-emerald-100 text-[#006c4a]"
        />
        <KPICard
          title="تعداد کل سفارشات جاری"
          value={`${orders.length} فاکتور`}
          subtitle="۸ فاکتور امروز ثبت گردید"
          icon={ShoppingCart}
          iconBgColor="bg-blue-100 text-blue-700"
        />
        <KPICard
          title="مشتریان فعال سیستم"
          value={`${activeCustomersCount} فروشگاه`}
          badgeText="داروخانه و آرایشی"
          icon={Users}
          iconBgColor="bg-teal-100 text-teal-800"
        />
        <KPICard
          title="بازاریابان فعال در مناطق"
          value={`${activeMarketersCount} نفر`}
          subtitle="تارگت ماهانه کل: ۱.۵ میلیارد"
          icon={UserCheck}
          iconBgColor="bg-amber-100 text-amber-800"
        />
      </div>

      {/* Sales Trend Chart Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h2 className="text-sm font-bold text-[#171c1f] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#006c4a]" />
              <span>روند رشد فروش ۳۰ روز اخیر (میلیون تومان)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">مقایسه فروش هفتگی فاکتورهای عمده تایید شده</p>
          </div>

          <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-50 text-[#006c4a] border border-emerald-200">
            میانگین روزانه: ۶.۱ میلیون تومان
          </span>
        </div>

        {/* Visual Bar Chart using CSS/SVG */}
        <div className="h-48 w-full flex items-end justify-between gap-3 pt-6 pb-2 px-4 bg-slate-50/60 rounded-xl border border-slate-100">
          {chartPoints.map((pt, i) => {
            const heightPercent = Math.min(Math.round((pt.sales / 200) * 100), 100);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                <span className="text-[10px] font-bold text-[#006c4a] opacity-0 group-hover:opacity-100 transition-opacity">
                  {pt.sales}م
                </span>
                <div
                  style={{ height: `${heightPercent}%` }}
                  className="w-full max-w-[36px] bg-gradient-to-t from-[#0F5338] to-[#006c4a] rounded-t-lg transition-all duration-300 group-hover:brightness-110 shadow-xs relative"
                />
                <span className="text-[10px] font-semibold text-slate-500 whitespace-nowrap">{pt.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid: Recent Orders + Top Marketers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Orders Table (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[#171c1f] flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#006c4a]" />
              <span>آخرین سفارشات ثبت‌شده</span>
            </h2>

            <button
              onClick={() => onNavigate('/orders')}
              className="text-xs font-semibold text-[#006c4a] hover:underline flex items-center gap-1"
            >
              <span>مشاهده همه</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">کد سفارش</th>
                  <th className="p-3">فروشگاه خریدار</th>
                  <th className="p-3">بازاریاب</th>
                  <th className="p-3">مبلغ نهایی</th>
                  <th className="p-3 text-center">وضعیت</th>
                  <th className="p-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map(ord => (
                  <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-bold text-slate-800">{ord.order_code}</td>
                    <td className="p-3 text-slate-700 font-medium">{ord.store_name}</td>
                    <td className="p-3 text-slate-600">{ord.marketer_name}</td>
                    <td className="p-3 font-bold text-[#006c4a]">{ord.final_amount.toLocaleString('fa-IR')} تومان</td>
                    <td className="p-3 text-center">
                      <StatusBadge type="order" value={ord.status} size="sm" />
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onSelectOrder(ord.id)}
                        className="p-1.5 rounded-lg bg-emerald-50 text-[#006c4a] hover:bg-emerald-100 transition-colors"
                        title="مشاهده فاکتور"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Marketers Leaderboard (1 Col) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#171c1f] flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>برترین بازاریاب‌های ماه</span>
              </h2>
              <button
                onClick={() => onNavigate('/marketers')}
                className="text-xs font-semibold text-[#006c4a] hover:underline"
              >
                مدیریت همه
              </button>
            </div>

            <div className="space-y-4">
              {topMarketers.map((m, idx) => {
                const percent = Math.min(Math.round((m.achieved_sales / m.monthly_target) * 100), 100);
                return (
                  <div
                    key={m.id}
                    onClick={() => onNavigate(`/marketers/${m.id}`)}
                    className="p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#006c4a] text-white text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-xs text-slate-800">{m.first_name} {m.last_name}</div>
                          <div className="text-[10px] text-slate-500">{m.region}</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#006c4a]">{percent}٪ تارگت</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div
                        style={{ width: `${percent}%` }}
                        className={`h-full rounded-full transition-all duration-500 ${
                          percent >= 100 ? 'bg-emerald-500' : 'bg-[#006c4a]'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            بر اساس میزان تحقق فاکتورهای صادرشده ماه جاری
          </div>
        </div>

      </div>

    </div>
  );
};
