import React from 'react';
import { useApp } from '../../context/AppContext';
import { formatRelativeTime } from '../../utils/persian';
import {
  X,
  Bell,
  CheckCheck,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
} from 'lucide-react';

export const NotificationSheet: React.FC = () => {
  const {
    isNotificationsOpen,
    setIsNotificationsOpen,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    openOrderDetails,
    orders,
  } = useApp();

  if (!isNotificationsOpen) return null;

  const handleNotificationClick = async (notif: typeof notifications[0]) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id);
    }
    if (notif.related_order_id) {
      const order = orders.find((o) => o.id === notif.related_order_id);
      if (order) {
        setIsNotificationsOpen(false);
        openOrderDetails(order);
      }
    }
  };

  return (
    <div
      id="notifications-sheet-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="notifications-sheet-content"
        className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">اعلان‌ها و پیام‌ها</h3>
              <p className="text-[11px] text-slate-500">رویدادهای سفارشات و سیستم</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="btn-mark-all-read"
              onClick={markAllNotificationsRead}
              title="علامت‌گذاری همه به عنوان خوانده شده"
              className="p-2 text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors text-xs flex items-center gap-1 font-bold"
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">خواندن همه</span>
            </button>
            <button
              id="btn-close-notifications"
              onClick={() => setIsNotificationsOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              هیچ اعلانی برای نمایش وجود ندارد.
            </div>
          ) : (
            notifications.map((n) => {
              const getIcon = () => {
                switch (n.type) {
                  case 'new_order':
                    return <ShoppingBag className="w-4 h-4 text-emerald-600" />;
                  case 'order_status_change':
                    return <RefreshCw className="w-4 h-4 text-blue-600" />;
                  default:
                    return <AlertCircle className="w-4 h-4 text-amber-600" />;
                }
              };

              return (
                <div
                  key={n.id}
                  id={`notif-item-${n.id}`}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    !n.is_read
                      ? 'bg-emerald-50/50 border-emerald-200/90 shadow-2xs font-semibold'
                      : 'bg-white border-slate-100 text-slate-600'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      !n.is_read ? 'bg-white shadow-2xs' : 'bg-slate-100'
                    }`}
                  >
                    {getIcon()}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">
                        {n.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{n.message}</p>
                    {n.related_order_id && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-bold mt-1">
                        مشاهده جزئیات سفارش
                        <ChevronLeft className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0 mt-1.5" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
