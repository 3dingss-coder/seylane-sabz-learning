import React from 'react';
import { Order, OrderStatus } from '../../types';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatToman, formatRelativeTime, toPersianDigits, getBusinessTypeLabel } from '../../utils/persian';
import { Store, Phone, Check, ChevronLeft, Package, Clock, Eye } from 'lucide-react';

interface OrderCardProps {
  order: Order;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order }) => {
  const { openOrderDetails, updateOrderStatus } = useApp();

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (order.customer_phone) {
      window.location.href = `tel:${order.customer_phone}`;
    }
  };

  const handleQuickApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateOrderStatus(order.id, 'confirmed', 'تایید سریع از طریق کارت سفارش');
  };

  const handleQuickShip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateOrderStatus(order.id, 'shipped', 'تحویل به ناوگان ارسال شرکت');
  };

  return (
    <div
      id={`order-card-${order.id}`}
      onClick={() => openOrderDetails(order)}
      className="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all active:scale-[0.99] space-y-3"
    >
      {/* Top Header: Code, Store, Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-emerald-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-extrabold text-slate-900 leading-tight">
                {order.store_name}
              </h4>
              {order.order_code && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {order.order_code}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {order.customer_name} • {getBusinessTypeLabel(order.business_type || 'pharmacy')}
            </p>
          </div>
        </div>

        <StatusBadge status={order.status} size="sm" />
      </div>

      {/* Date & Note Preview */}
      <div className="text-[11px] text-slate-500 flex items-center justify-between">
        <span>{formatRelativeTime(order.order_date || order.created_at)}</span>
        <span className="font-semibold text-slate-700">
          {toPersianDigits(order.items?.length || 1)} قلم کالا
        </span>
      </div>

      {order.customer_note && (
        <div className="text-[11px] bg-slate-50 p-2 rounded-xl text-slate-600 border border-slate-100 line-clamp-1">
          <span className="font-bold text-slate-700">یادداشت مشتری: </span>
          {order.customer_note}
        </div>
      )}

      {/* Footer: Final Amount & Quick Actions */}
      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-400 block">مبلغ نهایی فاکتور</span>
          <span className="text-xs font-black text-slate-900">
            {formatToman(order.final_amount)}
          </span>
        </div>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {order.customer_phone && (
            <button
              id={`btn-call-order-${order.id}`}
              onClick={handleCall}
              title="تماس با مشتری"
              className="p-2 text-slate-600 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 rounded-xl transition-colors active:scale-95"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}

          {/* 1-Tap Quick Action for Pending orders */}
          {order.status === 'pending' && (
            <button
              id={`btn-quick-approve-${order.id}`}
              onClick={handleQuickApprove}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 flex items-center gap-1 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>تایید سفارش</span>
            </button>
          )}

          {order.status === 'processing' && (
            <button
              id={`btn-quick-ship-${order.id}`}
              onClick={handleQuickShip}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm shadow-purple-600/20 flex items-center gap-1 transition-all"
            >
              <Package className="w-3.5 h-3.5" />
              <span>ارسال شد</span>
            </button>
          )}

          <button
            id={`btn-view-order-${order.id}`}
            onClick={() => openOrderDetails(order)}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
