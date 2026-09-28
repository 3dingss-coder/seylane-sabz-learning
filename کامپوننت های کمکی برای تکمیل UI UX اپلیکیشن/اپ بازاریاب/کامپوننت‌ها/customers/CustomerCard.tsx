import React from 'react';
import { Customer } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  toPersianDigits,
  formatToman,
  formatRelativeTime,
  getBusinessTypeLabel,
} from '../../utils/persian';
import { Store, Phone, MapPin, PlusCircle, History, ChevronLeft } from 'lucide-react';

interface CustomerCardProps {
  customer: Customer;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({ customer }) => {
  const { startOrderForCustomer, setOrderStatusFilter, setOrderSearchQuery, setActiveTab } = useApp();

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (customer.phone) {
      window.location.href = `tel:${customer.phone}`;
    }
  };

  const handleCreateOrder = (e: React.MouseEvent) => {
    e.stopPropagation();
    startOrderForCustomer(customer.id);
  };

  const handleViewOrders = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderSearchQuery(customer.store_name);
    setOrderStatusFilter('all');
    setActiveTab('orders');
  };

  return (
    <div
      id={`customer-card-${customer.id}`}
      className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all space-y-3"
    >
      {/* Top row: Store Name, Customer Code & Business Type */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-extrabold text-slate-900 leading-tight">
                {customer.store_name}
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                {customer.customer_code}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              مدیریت: {customer.first_name} {customer.last_name}
            </p>
          </div>
        </div>

        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
          {getBusinessTypeLabel(customer.business_type)}
        </span>
      </div>

      {/* Address */}
      {customer.address && (
        <div className="text-[11px] text-slate-600 flex items-start gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2 leading-relaxed">{customer.address}</span>
        </div>
      )}

      {/* Stats row */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <div className="space-y-0.5">
          <span className="text-slate-400 block text-[10px]">تعداد سفارش‌ها:</span>
          <span className="font-bold text-slate-800">
            {toPersianDigits(customer.total_orders_count || 0)} سفارش
          </span>
        </div>

        <div className="space-y-0.5 text-left">
          <span className="text-slate-400 block text-[10px]">مجموع خرید:</span>
          <span className="font-extrabold text-emerald-700">
            {formatToman(customer.total_spent || 0)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 flex items-center gap-2">
        <button
          id={`btn-create-order-customer-${customer.id}`}
          onClick={handleCreateOrder}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>ثبت سفارش برای مشتری</span>
        </button>

        <button
          id={`btn-history-customer-${customer.id}`}
          onClick={handleViewOrders}
          title="مشاهده سابقه سفارشات"
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors active:scale-95"
        >
          <History className="w-4 h-4" />
        </button>

        {customer.phone && (
          <button
            id={`btn-call-customer-${customer.id}`}
            onClick={handleCall}
            title="تماس تلفنی با مشتری"
            className="p-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-xl transition-colors active:scale-95"
          >
            <Phone className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
