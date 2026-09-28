import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { OrderStatus } from '../types';
import { ShoppingCart, Search, Filter, Eye, Plus, Calendar, FileText, RotateCcw, ArrowUpDown } from 'lucide-react';

interface OrdersPageProps {
  onSelectOrder: (orderId: number) => void;
  onOpenAddModal: () => void;
  onNavigate: (path: string) => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ onSelectOrder, onOpenAddModal, onNavigate }) => {
  const { orders, marketers } = useData();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [marketerFilter, setMarketerFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc'>('newest');

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMarketerFilter('all');
    setSortBy('newest');
  };

  const isFiltered = searchQuery !== '' || statusFilter !== 'all' || marketerFilter !== 'all' || sortBy !== 'newest';

  const filteredOrders = orders
    .filter(ord => {
      const matchesSearch =
        ord.order_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ord.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ord.customer_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || ord.status === statusFilter;
      const matchesMarketer = marketerFilter === 'all' || String(ord.marketer_id) === marketerFilter;

      return matchesSearch && matchesStatus && matchesMarketer;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return b.id - a.id;
      if (sortBy === 'oldest') return a.id - b.id;
      if (sortBy === 'amount_desc') return b.final_amount - a.final_amount;
      if (sortBy === 'amount_asc') return a.final_amount - b.final_amount;
      return 0;
    });

  const statusTabCounts = {
    all: orders.length,
    registered: orders.filter(o => o.status === 'ثبت‌شده').length,
    confirmed: orders.filter(o => o.status === 'تایید شده').length,
    processing: orders.filter(o => o.status === 'در حال پردازش').length,
    shipped: orders.filter(o => o.status === 'ارسال شده').length,
    cancelled: orders.filter(o => o.status === 'لغو شده').length,
  };

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'مدیریت سفارش‌ها', active: true }]} />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#006c4a]" />
            <span>مدیریت فاکتورها و سفارشات عمده</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مشاهده، بررسی و تغییر وضعیت تمامی سفارشات ثبت‌شده توسط بازاریابان اکوسیستم سیلانه سبز
          </p>
        </div>

        <button
          onClick={onOpenAddModal}
          className="px-4 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت سفارش جدید</span>
        </button>
      </div>

      {/* Quick Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', label: 'همه سفارش‌ها', count: statusTabCounts.all },
          { id: 'ثبت‌شده', label: 'ثبت‌شده', count: statusTabCounts.registered },
          { id: 'تایید شده', label: 'تایید شده', count: statusTabCounts.confirmed },
          { id: 'در حال پردازش', label: 'در حال پردازش', count: statusTabCounts.processing },
          { id: 'ارسال شده', label: 'ارسال شده', count: statusTabCounts.shipped },
          { id: 'لغو شده', label: 'لغو شده', count: statusTabCounts.cancelled },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-2 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              statusFilter === tab.id
                ? 'bg-[#006c4a] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو با کد سفارش، نام خریدار یا فروشگاه..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Marketer Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">بازاریاب:</span>
            <select
              value={marketerFilter}
              onChange={e => setMarketerFilter(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="all">همه بازاریابان</option>
              {marketers.map(m => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
              ))}
            </select>
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">مرتب‌سازی:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="newest">جدیدترین فاکتورها</option>
              <option value="oldest">قدیمی‌ترین فاکتورها</option>
              <option value="amount_desc">بیشترین مبلغ فاکتور</option>
              <option value="amount_asc">کمترین مبلغ فاکتور</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-lg transition-colors flex items-center gap-1"
              title="پاک کردن تمام فیلترها"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی فیلترها</span>
            </button>
          )}

        </div>

      </div>

      {/* Result Count Banner */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>نمایش <strong>{filteredOrders.length}</strong> از <strong>{orders.length}</strong> سفارش ثبت‌شده</span>
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          title="هیچ سفارشی یافت نشد"
          description="با توجه به فاکتورها و جستجوی انجام‌شده، هیچ رکوردی در سیستم ثبت نشده است."
          actionLabel="ثبت سفارش عمده جدید"
          onAction={onOpenAddModal}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">کد سفارش</th>
                  <th className="p-3.5">فروشگاه خریدار</th>
                  <th className="p-3.5">مسئول سفارش</th>
                  <th className="p-3.5">بازاریاب ثبت‌کننده</th>
                  <th className="p-3.5 text-left">مبلغ اولیه</th>
                  <th className="p-3.5 text-left">تخفیف</th>
                  <th className="p-3.5 text-left">مبلغ نهایی (تومان)</th>
                  <th className="p-3.5 text-center">وضعیت</th>
                  <th className="p-3.5 text-center">تاریخ ثبت</th>
                  <th className="p-3.5 text-center">جزئیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map(ord => (
                  <tr
                    key={ord.id}
                    onClick={() => onSelectOrder(ord.id)}
                    className="hover:bg-emerald-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="p-3.5 font-extrabold text-[#006c4a]">{ord.order_code}</td>
                    <td className="p-3.5 font-bold text-slate-800">{ord.store_name}</td>
                    <td className="p-3.5 text-slate-600">{ord.customer_name}</td>
                    <td className="p-3.5 text-slate-600 font-medium">{ord.marketer_name}</td>
                    <td className="p-3.5 text-left text-slate-500">{ord.initial_amount.toLocaleString('fa-IR')}</td>
                    <td className="p-3.5 text-left text-rose-600">
                      {ord.discount > 0 ? `-${ord.discount.toLocaleString('fa-IR')}` : '۰'}
                    </td>
                    <td className="p-3.5 text-left font-black text-slate-800 bg-emerald-50/30">
                      {ord.final_amount.toLocaleString('fa-IR')}
                    </td>
                    <td className="p-3.5 text-center">
                      <StatusBadge type="order" value={ord.status} size="sm" />
                    </td>
                    <td className="p-3.5 text-center text-slate-500 font-mono text-[11px]">{ord.order_date}</td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectOrder(ord.id);
                        }}
                        className="p-1.5 rounded-lg bg-emerald-50 text-[#006c4a] group-hover:bg-[#006c4a] group-hover:text-white transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
