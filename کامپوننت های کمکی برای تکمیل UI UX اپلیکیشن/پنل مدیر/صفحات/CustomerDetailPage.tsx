import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { dataApi } from '../api';
import {
  Phone,
  MapPin,
  ShoppingCart,
  Edit2,
  Store,
  History,
  PackageCheck,
  PackagePlus,
  Truck,
  Bell,
  UserCog,
} from 'lucide-react';

interface CustomerDetailPageProps {
  customerId: number;
  onNavigate: (path: string) => void;
  onOpenCustomerModal: (customer: any) => void;
  onSelectOrder: (orderId: number) => void;
}

interface ActivityItem {
  id: number;
  type: string;
  related_order_id?: number;
  title: string;
  message: string;
  created_at: string;
}

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  order_status_change: <Truck className="w-4 h-4" />,
  new_order: <PackagePlus className="w-4 h-4" />,
  customer_registered: <UserCog className="w-4 h-4" />,
};

export const CustomerDetailPage: React.FC<CustomerDetailPageProps> = ({
  customerId,
  onNavigate,
  onOpenCustomerModal,
  onSelectOrder,
}) => {
  const { customers, orders, marketers } = useData();
  const [activeTab, setActiveTab] = useState<'orders' | 'activity'>('orders');
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [activityError, setActivityError] = useState('');

  const customer = customers.find((c) => c.id === customerId);
  const customerOrders = orders.filter((o) => o.customer_id === customerId);
  const marketer = marketers.find((m) => m.id === customer?.marketer_id);

  useEffect(() => {
    setActivity(null);
    setActivityError('');
    dataApi
      .getCustomerNotifications(customerId)
      .then((r) => setActivity(r.notifications))
      .catch(() => setActivityError('دریافت تاریخچه فعالیت با خطا مواجه شد.'));
  }, [customerId]);

  if (!customer) {
    return <div className="p-8 text-center text-slate-600">مشتری موردنظر پیدا نشد.</div>;
  }

  const totalSpent = customerOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'مشتری‌ها', onClick: () => onNavigate('/customers') },
          { label: customer.store_name, active: true },
        ]}
      />

      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#006c4a] text-white font-black text-2xl flex items-center justify-center shadow-md border border-emerald-400">
              <Store className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-extrabold text-[#171c1f]">{customer.store_name}</h1>
                <StatusBadge type="active" value={customer.active} size="sm" />
                <StatusBadge type="business" value={customer.business_type} size="sm" />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1 font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">
                  کد خریدار: {customer.customer_code}
                </span>
                <span className="font-semibold text-slate-700">
                  {customer.first_name} {customer.last_name}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono">{customer.phone}</span>
                </span>
                {customer.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#006c4a]" />
                    <span>{customer.address}</span>
                  </span>
                )}
              </div>

              {marketer && (
                <div className="mt-2 text-xs text-slate-500">
                  بازاریاب مسئول:{' '}
                  <button
                    onClick={() => onNavigate(`/marketers/${marketer.id}`)}
                    className="font-bold text-[#006c4a] hover:underline"
                  >
                    {marketer.first_name} {marketer.last_name}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenCustomerModal(customer)}
              className="px-4 py-2 bg-emerald-50 text-[#006c4a] hover:bg-emerald-100 font-bold rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Edit2 className="w-4 h-4" />
              <span>ویرایش بازاریاب / وضعیت</span>
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[10px]">تعداد سفارشات ثبت‌شده:</span>
            <span className="font-bold text-slate-800 text-sm">{customerOrders.length} سفارش</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[10px]">مجموع خرید (تومان):</span>
            <span className="font-extrabold text-[#006c4a] text-sm">{totalSpent.toLocaleString('fa-IR')}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[10px]">نوع کسب‌وکار:</span>
            <span className="font-bold text-slate-800 text-sm">
              <StatusBadge type="business" value={customer.business_type} size="sm" />
            </span>
          </div>
        </div>
      </div>

      {/* Tabs: Orders / Activity */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-6">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'orders' ? 'bg-[#006c4a] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>سفارشات ({customerOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'activity' ? 'bg-[#006c4a] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>تاریخچه فعالیت حساب {activity ? `(${activity.length})` : ''}</span>
          </button>
        </div>

        {/* Tab 1: Orders */}
        {activeTab === 'orders' && (
          <div>
            {customerOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">هنوز سفارشی برای این مشتری ثبت نشده است.</div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">کد سفارش</th>
                      <th className="p-3 text-left">مجموع فاکتور (تومان)</th>
                      <th className="p-3 text-center">وضعیت</th>
                      <th className="p-3 text-center">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerOrders
                      .slice()
                      .sort((a, b) => b.id - a.id)
                      .map((o) => (
                        <tr key={o.id} onClick={() => onSelectOrder(o.id)} className="hover:bg-emerald-50/50 cursor-pointer">
                          <td className="p-3 font-bold text-[#006c4a]">{o.order_code}</td>
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

        {/* Tab 2: Full account activity timeline (every notification/event recorded for this customer) */}
        {activeTab === 'activity' && (
          <div>
            {activityError && (
              <div className="p-4 text-center text-rose-600 text-xs bg-rose-50 rounded-xl border border-rose-200">
                {activityError}
              </div>
            )}
            {!activity && !activityError && (
              <div className="p-8 text-center text-slate-400 text-xs">در حال بارگذاری...</div>
            )}
            {activity && activity.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs">
                هنوز رویدادی برای این حساب ثبت نشده است.
              </div>
            )}
            {activity && activity.length > 0 && (
              <ol className="relative border-r-2 border-slate-100 pr-6 space-y-6">
                {activity.map((item) => (
                  <li key={item.id} className="relative">
                    <span className="absolute -right-[31px] top-0 w-4 h-4 rounded-full bg-[#006c4a] border-2 border-white shadow flex items-center justify-center text-white">
                      {ACTIVITY_ICON[item.type] || <Bell className="w-3 h-3" />}
                    </span>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-xs">{item.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.created_at}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{item.message}</p>
                      {item.related_order_id && (
                        <button
                          onClick={() => onSelectOrder(item.related_order_id!)}
                          className="text-[10px] font-bold text-[#006c4a] hover:underline mt-1.5 flex items-center gap-1"
                        >
                          <PackageCheck className="w-3 h-3" />
                          مشاهده سفارش مرتبط
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
