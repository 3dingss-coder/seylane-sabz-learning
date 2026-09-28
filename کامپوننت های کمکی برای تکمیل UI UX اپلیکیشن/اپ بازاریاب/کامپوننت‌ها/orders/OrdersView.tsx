import React from 'react';
import { useApp } from '../../context/AppContext';
import { OrderFilters } from './OrderFilters';
import { OrderCard } from './OrderCard';
import { OrderCardSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';
import { PlusCircle, ClipboardList } from 'lucide-react';
import { toEnglishDigits } from '../../utils/persian';

export const OrdersView: React.FC = () => {
  const {
    orders,
    isLoading,
    orderStatusFilter,
    orderSearchQuery,
    setIsNewOrderOpen,
  } = useApp();

  // Filter orders by status and search query
  const filteredOrders = orders.filter((order) => {
    // Status filter
    if (orderStatusFilter !== 'all' && order.status !== orderStatusFilter) {
      return false;
    }

    // Search query
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase().trim();
      const qEng = toEnglishDigits(q);
      const matchStore = order.store_name?.toLowerCase().includes(q);
      const matchCustomer = order.customer_name?.toLowerCase().includes(q);
      const matchCode = order.order_code?.toLowerCase().includes(qEng) || order.order_code?.toLowerCase().includes(q);
      const matchPhone = order.customer_phone?.includes(qEng) || order.customer_phone?.includes(q);

      if (!matchStore && !matchCustomer && !matchCode && !matchPhone) {
        return false;
      }
    }

    return true;
  });

  return (
    <div id="orders-view" className="space-y-4 pb-20 pt-2 animate-fadeIn">
      {/* Header with Title & Action */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">مدیریت سفارش‌ها</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            پیگیری سفارش‌های ثبت شده توسط مشتری یا بازاریاب
          </p>
        </div>

        <button
          id="btn-add-order-from-orders-page"
          onClick={() => setIsNewOrderOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>ثبت سفارش</span>
        </button>
      </div>

      {/* Filters and Search */}
      <OrderFilters />

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-3">
          <OrderCardSkeleton />
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="سفارشی یافت نشد"
          description={
            orderSearchQuery
              ? 'هیچ سفارشی با عبارت جستجو شده همخوانی ندارد.'
              : 'در این دسته‌بندی فعلاً سفارشی ثبت نشده است.'
          }
          actionText="ثبت سفارش جدید"
          onAction={() => setIsNewOrderOpen(true)}
          icon={<ClipboardList className="w-8 h-8 text-emerald-600" />}
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
};
