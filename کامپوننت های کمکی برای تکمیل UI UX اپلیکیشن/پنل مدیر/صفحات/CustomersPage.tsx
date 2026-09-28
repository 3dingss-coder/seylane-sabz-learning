import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Customer } from '../types';
import { Users, Search, Plus, Store, Phone, MapPin, UserCheck, Edit2, RotateCcw, ArrowUpDown, Eye } from 'lucide-react';

interface CustomersPageProps {
  onOpenCustomerModal: (customer?: Customer) => void;
  onNavigate: (path: string) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ onOpenCustomerModal, onNavigate }) => {
  const { customers, marketers, updateCustomerMarketer, updateCustomerStatus } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [bizFilter, setBizFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'spent_desc' | 'orders_desc' | 'newest'>('newest');

  const handleResetFilters = () => {
    setSearchQuery('');
    setBizFilter('all');
    setSortBy('newest');
  };

  const isFiltered = searchQuery !== '' || bizFilter !== 'all' || sortBy !== 'newest';

  const filteredCustomers = customers
    .filter(c => {
      const matchesSearch =
        c.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.customer_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.last_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesBiz = bizFilter === 'all' || c.business_type === bizFilter;

      return matchesSearch && matchesBiz;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.store_name.localeCompare(b.store_name, 'fa');
      if (sortBy === 'spent_desc') return (b.total_spent || 0) - (a.total_spent || 0);
      if (sortBy === 'orders_desc') return (b.total_orders_count || 0) - (a.total_orders_count || 0);
      if (sortBy === 'newest') return (b.created_at || '').localeCompare(a.created_at || '');
      return 0;
    });

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'مشتریان و فروشگاه‌ها', active: true }]} />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#006c4a]" />
            <span>بانک اطلاعاتی خریداران عمده و فروشگاه‌ها</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مدیریت لیست داروخانه‌ها، گالری‌های آرایشی و هایپرمارکت‌های طرف قرارداد و تخصیص بازاریاب مسئول
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو با نام فروشگاه، نام خریدار یا کد مشتری..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">نوع کسب‌وکار:</span>
            <select
              value={bizFilter}
              onChange={e => setBizFilter(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="all">همه دسته‌ها ({customers.length})</option>
              <option value="pharmacy">داروخانه‌ها</option>
              <option value="cosmetics">فروشگاه‌های آرایشی</option>
              <option value="supermarket">سوپرمارکت‌ها</option>
              <option value="hypermarket">هایپرمارکت‌ها</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">مرتب‌سازی:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="spent_desc">بیشترین حجم خرید</option>
              <option value="orders_desc">بیشترین تعداد سفارش</option>
              <option value="newest">جدیدترین ثبت‌نام</option>
              <option value="name">نام فروشگاه (الفبا)</option>
            </select>
          </div>

          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی فیلترها</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>نمایش <strong>{filteredCustomers.length}</strong> از <strong>{customers.length}</strong> خریدار ثبت‌شده</span>
      </div>

      {/* Customer Table */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          title="مشتری یافت نشد"
          description="هیچ فروشگاهی منطبق با عبارت جستجو پیدا نشد."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">کد خریدار</th>
                  <th className="p-3.5">نام فروشگاه / مجموعه</th>
                  <th className="p-3.5">نوع کسب‌وکار</th>
                  <th className="p-3.5">نام مسئول / تماس</th>
                  <th className="p-3.5">بازاریاب مسئول (تغییر آنلاین)</th>
                  <th className="p-3.5 text-center">تعداد سفارش</th>
                  <th className="p-3.5 text-left">مجموع خرید (تومان)</th>
                  <th className="p-3.5">تاریخ ثبت‌نام</th>
                  <th className="p-3.5 text-center">وضعیت</th>
                  <th className="p-3.5 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map(cust => (
                  <tr
                    key={cust.id}
                    className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                    onClick={() => onNavigate(`/customers/${cust.id}`)}
                  >
                    <td className="p-3.5 font-bold text-slate-800">{cust.customer_code}</td>
                    <td className="p-3.5 font-bold text-[#0F5338] hover:underline">{cust.store_name}</td>
                    <td className="p-3.5">
                      <StatusBadge type="business" value={cust.business_type} size="sm" />
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">{cust.first_name} {cust.last_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{cust.phone}</div>
                    </td>

                    {/* Inline Marketer Change Dropdown */}
                    <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={cust.marketer_id}
                        onChange={e => updateCustomerMarketer(cust.id, Number(e.target.value))}
                        className="p-1.5 bg-emerald-50/70 border border-emerald-300 rounded-lg text-xs font-bold text-[#006c4a] focus:outline-none focus:ring-1 focus:ring-[#006c4a]"
                      >
                        {marketers.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.first_name} {m.last_name} ({m.region})
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-3.5 text-center font-bold text-slate-800">{cust.total_orders_count || 0}</td>
                    <td className="p-3.5 text-left font-black text-[#006c4a]">
                      {(cust.total_spent || 0).toLocaleString('fa-IR')}
                    </td>
                    <td className="p-3.5 text-slate-600 whitespace-nowrap">
                      {cust.created_at
                        ? new Date(cust.created_at.replace(' ', 'T') + 'Z').toLocaleString('fa-IR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => updateCustomerStatus(cust.id, !cust.active)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        title="تغییر وضعیت فعال/غیرفعال"
                      >
                        <StatusBadge type="active" value={cust.active} size="sm" />
                      </button>
                    </td>
                    <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onNavigate(`/customers/${cust.id}`)}
                          className="p-1.5 rounded-lg bg-emerald-50 text-[#006c4a] hover:bg-emerald-100 transition-colors"
                          title="مشاهده جزئیات کامل حساب"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenCustomerModal(cust)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          title="ویرایش اطلاعات"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
