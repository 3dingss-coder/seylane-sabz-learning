import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Marketer } from '../types';
import { UserCheck, Phone, MapPin, Target, Users, ShoppingCart, ArrowRight, Edit2, Calendar } from 'lucide-react';

interface MarketerDetailPageProps {
  marketerId: number;
  onNavigate: (path: string) => void;
  onOpenMarketerModal: (marketer: Marketer) => void;
  onSelectOrder: (orderId: number) => void;
}

export const MarketerDetailPage: React.FC<MarketerDetailPageProps> = ({
  marketerId,
  onNavigate,
  onOpenMarketerModal,
  onSelectOrder
}) => {
  const { marketers, customers, orders } = useData();
  const [activeTab, setActiveTab] = useState<'customers' | 'orders'>('customers');

  const marketer = marketers.find(m => m.id === marketerId) || marketers[0];

  if (!marketer) {
    return <div className="p-8 text-center text-slate-600">بازاریاب موردنظر پیدا نشد.</div>;
  }

  const marketerCustomers = customers.filter(c => c.marketer_id === marketer.id);
  const marketerOrders = orders.filter(o => o.marketer_id === marketer.id);

  const percent = Math.min(Math.round((marketer.achieved_sales / marketer.monthly_target) * 100), 100);

  return (
    <div className="space-y-6">
      
      <Breadcrumbs
        items={[
          { label: 'بازاریابان و مناطق', onClick: () => onNavigate('/marketers') },
          { label: `${marketer.first_name} ${marketer.last_name}`, active: true }
        ]}
      />

      {/* Main Header profile & Gauge */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#006c4a] text-white font-black text-2xl flex items-center justify-center shadow-md border border-emerald-400">
              {marketer.first_name[0]}
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold text-[#171c1f]">
                  {marketer.first_name} {marketer.last_name}
                </h1>
                <StatusBadge type="active" value={marketer.active} size="sm" />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1 font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">
                  کد پرسنلی: {marketer.personnel_code}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#006c4a]" />
                  <span>{marketer.region}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono">{marketer.phone}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>عضویت: {marketer.created_at}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenMarketerModal(marketer)}
              className="px-4 py-2 bg-emerald-50 text-[#006c4a] hover:bg-emerald-100 font-bold rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Edit2 className="w-4 h-4" />
              <span>ویرایش منطقه و تارگت</span>
            </button>
          </div>

        </div>

        {/* Large Target Achievement Gauge */}
        <div className="mt-6 pt-6 border-t border-slate-100 bg-slate-50/70 p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#006c4a]" />
              <span className="text-sm font-bold text-slate-800">گیج سنجش تحقق تارگت ماه جاری:</span>
            </div>
            <span className="text-lg font-black text-[#006c4a]">{percent}٪ محقق شده</span>
          </div>

          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden mb-3">
            <div
              style={{ width: `${percent}%` }}
              className={`h-full rounded-full transition-all duration-700 ${
                percent >= 100 ? 'bg-emerald-500' : 'bg-[#006c4a]'
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[10px]">تارگت ماهانه مصوب:</span>
              <span className="font-bold text-slate-800 text-sm">{(marketer.monthly_target / 1000000).toLocaleString('fa-IR')} میلیون تومان</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[10px]">فروش ثبت‌شده تا امروز:</span>
              <span className="font-extrabold text-[#006c4a] text-sm">{(marketer.achieved_sales / 1000000).toLocaleString('fa-IR')} میلیون تومان</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[10px]">تعداد مشتریان تحت پوشش:</span>
              <span className="font-bold text-slate-800 text-sm">{marketerCustomers.length} فروشگاه</span>
            </div>
          </div>
        </div>

      </div>

      {/* Tabs section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-6">
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'customers'
                ? 'bg-[#006c4a] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>مشتریان تحت پوشش او ({marketerCustomers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'bg-[#006c4a] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>فاکتورها و سفارشات او ({marketerOrders.length})</span>
          </button>
        </div>

        {/* Tab 1: Customers */}
        {activeTab === 'customers' && (
          <div>
            {marketerCustomers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                هیچ مشتری هنوز به این بازاریاب اختصاص داده نشده است.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">کد خریدار</th>
                      <th className="p-3">نام فروشگاه</th>
                      <th className="p-3">نوع کسب‌وکار</th>
                      <th className="p-3">شماره تماس</th>
                      <th className="p-3 text-center">تعداد سفارش</th>
                      <th className="p-3 text-left">مجموع خرید (تومان)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {marketerCustomers.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-800">{c.customer_code}</td>
                        <td className="p-3 font-bold text-[#0F5338]">{c.store_name}</td>
                        <td className="p-3">
                          <StatusBadge type="business" value={c.business_type} size="sm" />
                        </td>
                        <td className="p-3 font-mono text-slate-600">{c.phone}</td>
                        <td className="p-3 text-center font-bold">{c.total_orders_count || 0}</td>
                        <td className="p-3 text-left font-bold text-[#006c4a]">
                          {(c.total_spent || 0).toLocaleString('fa-IR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Orders */}
        {activeTab === 'orders' && (
          <div>
            {marketerOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                هیچ سفارشی توسط این بازاریاب ثبت نشده است.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">کد سفارش</th>
                      <th className="p-3">نام خریدار</th>
                      <th className="p-3 text-left">مجموع فاکتور (تومان)</th>
                      <th className="p-3 text-center">وضعیت</th>
                      <th className="p-3 text-center">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {marketerOrders.map(o => (
                      <tr
                        key={o.id}
                        onClick={() => onSelectOrder(o.id)}
                        className="hover:bg-emerald-50/50 cursor-pointer"
                      >
                        <td className="p-3 font-bold text-[#006c4a]">{o.order_code}</td>
                        <td className="p-3 font-semibold text-slate-800">{o.store_name}</td>
                        <td className="p-3 text-left font-black text-slate-800">{o.final_amount.toLocaleString('fa-IR')}</td>
                        <td className="p-3 text-center">
                          <StatusBadge type="order" value={o.status} size="sm" />
                        </td>
                        <td className="p-3 text-center text-slate-500 font-mono text-[11px]">{o.order_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};
