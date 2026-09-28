import React from 'react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatToman, formatRelativeTime, toPersianDigits } from '../../utils/persian';
import { ChevronLeft, Store, ArrowRight, Eye, Phone } from 'lucide-react';
import { OrderCardSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';

export const RecentOrders: React.FC = () => {
  const { orders, isLoading, openOrderDetails, setActiveTab, setOrderStatusFilter } = useApp();

  const recentOrders = orders.slice(0, 4);

  const handleViewAll = () => {
    setOrderStatusFilter('all');
    setActiveTab('orders');
  };

  return (
    <div id="recent-orders-section" className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          آخرین سفارش‌های ثبت شده
        </h3>
        <button
          id="btn-view-all-orders"
          onClick={handleViewAll}
          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5"
        >
          مشاهده همه ({toPersianDigits(orders.length)})
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </div>
      ) : recentOrders.length === 0 ? (
        <EmptyState
          title="هنوز سفارشی ثبت نشده است"
          description="با کلیک روی ثبت سفارش جدید، می‌توانید اولین سفارش عمده را ثبت کنید."
        />
      ) : (
        <div className="space-y-2.5">
          {recentOrders.map((order) => (
            <div
              key={order.id}
              id={`recent-order-card-${order.id}`}
              onClick={() => openOrderDetails(order)}
              className="cursor-pointer bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all active:scale-[0.99] space-y-2.5"
            >
              {/* Header: Store Name & Status Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 leading-tight">
                      {order.store_name}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {order.customer_name} • {formatRelativeTime(order.order_date || order.created_at)}
                    </p>
                  </div>
                </div>

                <StatusBadge status={order.status} size="sm" />
              </div>

              {/* Items summary & Total Amount */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {toPersianDigits(order.items?.length || 1)} قلم کالا
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-900">
                    {formatToman(order.final_amount)}
                  </span>
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
