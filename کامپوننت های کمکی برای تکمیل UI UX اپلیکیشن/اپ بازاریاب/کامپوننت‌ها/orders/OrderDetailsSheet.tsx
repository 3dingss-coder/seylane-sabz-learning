import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { OrderStatus } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import {
  formatToman,
  formatShamsiDate,
  toPersianDigits,
  getBusinessTypeLabel,
} from '../../utils/persian';
import {
  X,
  Store,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  XCircle,
  FileText,
  MessageSquare,
  Share2,
  Calendar,
} from 'lucide-react';

export const OrderDetailsSheet: React.FC = () => {
  const {
    isOrderDetailsOpen,
    closeOrderDetails,
    selectedOrderForDetails: order,
    updateOrderStatus,
  } = useApp();

  const [marketerNoteInput, setMarketerNoteInput] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  if (!isOrderDetailsOpen || !order) return null;

  const handleStatusChange = async (newStatus: OrderStatus) => {
    setIsUpdatingStatus(true);
    await updateOrderStatus(order.id, newStatus, marketerNoteInput || order.marketer_note);
    setIsUpdatingStatus(false);
  };

  const handleCall = () => {
    if (order.customer_phone) {
      window.location.href = `tel:${order.customer_phone}`;
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `فاکتور سفارش ${order.order_code || order.id}`,
          text: `سفارش ${order.store_name} به مبلغ ${formatToman(order.final_amount)}`,
        })
        .catch(() => {});
    }
  };

  const statuses: { id: OrderStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
    { id: 'pending', label: 'در انتظار بررسی', icon: Clock, color: 'hover:bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'confirmed', label: 'تایید شد', icon: CheckCircle2, color: 'hover:bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'processing', label: 'در حال آماده‌سازی', icon: Package, color: 'hover:bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'shipped', label: 'ارسال شد', icon: Truck, color: 'hover:bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'cancelled', label: 'لغو سفارش', icon: XCircle, color: 'hover:bg-rose-50 text-rose-700 border-rose-200' },
  ];

  return (
    <div
      id="order-details-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="order-details-content"
        className="bg-white w-full max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                جزئیات سفارش {order.order_code}
              </h3>
              <StatusBadge status={order.status} size="sm" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatShamsiDate(order.order_date || order.created_at)}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="btn-share-order-details"
              onClick={handleShare}
              title="اشتراک‌گذاری"
              className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              id="btn-close-order-details"
              onClick={closeOrderDetails}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Customer Info Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{order.store_name}</h4>
                  <p className="text-[11px] text-slate-500">
                    {order.customer_name} • {getBusinessTypeLabel(order.business_type || 'pharmacy')}
                  </p>
                </div>
              </div>

              {order.customer_phone && (
                <button
                  id="btn-call-customer-details"
                  onClick={handleCall}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all shadow-2xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>تماس</span>
                </button>
              )}
            </div>

            {order.customer_address && (
              <div className="text-[11px] text-slate-600 flex items-start gap-1.5 pt-2 border-t border-slate-200/60">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <span>{order.customer_address}</span>
              </div>
            )}
          </div>

          {/* Items Breakdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-emerald-600" />
                اقلام سفارش داده شده ({toPersianDigits(order.items?.length || 0)} قلم)
              </h4>
            </div>

            <div className="space-y-2">
              {order.items?.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-3 border border-slate-200/80 flex items-center justify-between shadow-2xs"
                >
                  <div className="space-y-0.5 flex-1 pr-1">
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">
                      {item.product_name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {toPersianDigits(item.quantity)} کارتن • هر کارتن{' '}
                      {formatToman(item.unit_price)}
                    </p>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <span className="text-xs font-extrabold text-slate-900">
                      {formatToman(item.total_price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Totals */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>مبلغ اولیه اقلام:</span>
              <span className="font-semibold">{formatToman(order.initial_amount)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>تخفیف ویژه پخش:</span>
                <span className="font-bold">- {formatToman(order.discount)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 flex justify-between text-slate-900 font-extrabold text-sm">
              <span>مبلغ نهایی پرداختی:</span>
              <span className="text-emerald-700 font-black">{formatToman(order.final_amount)}</span>
            </div>
          </div>

          {/* Notes Section */}
          <div className="space-y-2.5">
            {order.customer_note && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-800">
                  <MessageSquare className="w-3.5 h-3.5" />
                  یادداشت مشتری:
                </div>
                <p className="leading-relaxed text-[11px]">{order.customer_note}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                یادداشت بازاریاب برای انبار و مشتری:
              </label>
              <textarea
                id="marketer-note-textarea"
                rows={2}
                defaultValue={order.marketer_note || ''}
                onChange={(e) => setMarketerNoteInput(e.target.value)}
                placeholder="توضیحات هماهنگی تحویل، زمان‌بندی، یا یادداشت اختصاصی بازاریاب..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {/* Change Order Status Section (Key requirement) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-extrabold text-slate-800">
              تغییر وضعیت سفارش (تعامل با انبار و مشتری)
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {statuses.map((st) => {
                const Icon = st.icon;
                const isCurrent = order.status === st.id;
                return (
                  <button
                    key={st.id}
                    id={`btn-set-status-${st.id}`}
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusChange(st.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                      isCurrent
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                        : `bg-white ${st.color}`
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{st.label}</span>
                    {isCurrent && <span className="text-[10px] mr-auto bg-white/20 px-1.5 py-0.5 rounded">فعلی</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          <button
            id="btn-close-sheet-bottom"
            onClick={closeOrderDetails}
            className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
