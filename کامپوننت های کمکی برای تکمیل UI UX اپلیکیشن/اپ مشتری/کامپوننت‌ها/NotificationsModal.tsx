import React, { useState, useEffect, useCallback } from 'react';
import { apiGetNotifications, apiMarkNotificationRead, apiMarkAllNotificationsRead, apiDeleteNotification, ApiNotification } from '../api';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId?: string;
}

type CategoryType = 'all' | 'orders' | 'wallet' | 'offers' | 'products';

interface NotificationItem {
  id: string;
  category: CategoryType;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  icon: string;
  amount?: string;
  actionText?: string;
  badgeText?: string;
  badgeColor?: string;
}

function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z');
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

function mapApiNotification(n: ApiNotification): NotificationItem {
  return {
    id: n.id,
    category: (['orders', 'wallet', 'offers', 'products'].includes(n.category) ? n.category : 'orders') as CategoryType,
    title: n.title,
    body: n.body,
    time: formatNotificationTime(n.time),
    unread: n.unread,
    icon: n.icon,
    amount: n.amount,
    badgeText: n.badgeText,
    badgeColor: n.badgeColor,
  };
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({ isOpen, onClose, customerId }) => {
  const [activeTab, setActiveTab] = useState<CategoryType>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(true);
  const tabsRef = React.useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(() => {
    if (!customerId) return;
    setIsLoading(true);
    setError('');
    apiGetNotifications(customerId)
      .then((data) => setNotifications(data.map(mapApiNotification)))
      .catch(() => setError('دریافت پیام‌ها با خطا مواجه شد.'))
      .finally(() => setIsLoading(false));
  }, [customerId]);

  const checkScroll = () => {
    if (!tabsRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
    const absScroll = Math.abs(scrollLeft);
    const maxScroll = scrollWidth - clientWidth;
    
    // In RTL, 0 or max is start point depending on browser. absScroll > 10 means scrolled left away from start.
    setCanScrollRight(absScroll > 10);
    setCanScrollLeft(absScroll < maxScroll - 10);
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(checkScroll, 100);
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  if (!isOpen) return null;

  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const amount = direction === 'left' ? -180 : 180;
      tabsRef.current.scrollBy({ left: amount, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  const tabs: { id: CategoryType; label: string; icon: string }[] = [
    { id: 'all', label: 'همه', icon: 'mark_as_unread' },
    { id: 'orders', label: 'سفارشات', icon: 'package_2' },
    { id: 'wallet', label: 'تراکنش‌ها و کیف پول', icon: 'account_balance_wallet' },
    { id: 'offers', label: 'اعتبار و جشنواره‌ها', icon: 'loyalty' },
    { id: 'products', label: 'کالاها و تخفیفات', icon: 'local_offer' },
  ];

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
    if (customerId) apiMarkAllNotificationsRead(customerId).catch(() => loadNotifications());
  };

  const handleToggleRead = (id: string) => {
    const target = notifications.find((n) => n.id === id);
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: !item.unread } : item))
    );
    // Backend only supports marking as read (not un-reading); on the "mark
    // as read" direction, persist it. Toggling back to unread is local-only.
    if (target?.unread) {
      apiMarkNotificationRead(id).catch(() => loadNotifications());
    }
  };

  const handleDeleteNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    apiDeleteNotification(id).catch(() => loadNotifications());
  };

  const filteredNotifications =
    activeTab === 'all'
      ? notifications
      : notifications.filter((item) => item.category === activeTab);

  const totalUnread = notifications.filter((item) => item.unread).length;

  const getUnreadCountByTab = (tabId: CategoryType) => {
    if (tabId === 'all') return totalUnread;
    return notifications.filter((item) => item.category === tabId && item.unread).length;
  };


  return (
    <div className="fixed inset-0 z-50 bg-white max-w-[448px] mx-auto flex flex-col h-full animate-in fade-in duration-200 text-right overflow-hidden border-x border-[#e2e8f0]/60">
      {/* Top Header */}
      <div
        className="p-3.5 bg-white border-b border-[#e2e8f0]/80 flex items-center justify-between sticky top-0 z-10 shadow-2xs"
        style={{ paddingTop: 'calc(0.875rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#171c1f] transition-colors flex items-center justify-center active:scale-95"
            aria-label="بازگشت"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-[17px] text-[#171c1f]">پیام‌ها</h1>
            {totalUnread > 0 && (
              <span className="bg-[#ba1a1a] text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                {totalUnread} خوانده نشده
              </span>
            )}
          </div>
        </div>

        {totalUnread > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-[11px] font-bold text-[#006c4a] hover:text-[#005238] flex items-center gap-1 bg-[#e6f4ed] hover:bg-[#d8edd3] px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px]">done_all</span>
            <span>خوانده شد</span>
          </button>
        )}
      </div>

      {/* Horizontal Tabs Navigation with Dynamic Left/Right Scroll Arrows */}
      <div
        className="bg-[#f8fafc] border-b border-[#e2e8f0] py-2.5 sticky z-10 relative group"
        style={{ top: 'calc(61px + env(safe-area-inset-top))' }}
      >
        {/* Right Scroll Arrow Button (shown when scrolled left) */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 pl-4 bg-gradient-to-l from-[#f8fafc] via-[#f8fafc]/80 to-transparent z-10 animate-in fade-in duration-200">
            <button
              onClick={() => handleScrollTabs('right')}
              className="w-7 h-7 rounded-full bg-white border border-[#006c4a]/30 shadow-xs hover:bg-[#e6f4ed] hover:border-[#006c4a] text-[#006c4a] flex items-center justify-center transition-all active:scale-90"
              title="بازگشت به ابتدا"
              aria-label="بازگشت به ابتدا"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        )}

        {/* Scrollable Tabs Container */}
        <div
          ref={tabsRef}
          onScroll={checkScroll}
          className="px-3 overflow-x-auto no-scrollbar scroll-smooth flex items-center gap-2"
        >
          {tabs.map((tab) => {
            const count = getUnreadCountByTab(tab.id);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-extrabold transition-all shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-[#006c4a] text-white shadow-xs'
                    : 'bg-white text-[#475569] border border-[#e2e8f0] hover:bg-[#f1f5f9] hover:text-[#1e293b]'
                }`}
              >
                <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-white' : 'text-[#006c4a]'}`}>
                  {tab.icon}
                </span>
                <span className="whitespace-nowrap">{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`ml-1 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white text-[#006c4a]' : 'bg-[#ba1a1a] text-white'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Small Round Left Scroll Arrow with Fade Overlay */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 flex items-center pl-2 pr-4 bg-gradient-to-r from-[#f8fafc] via-[#f8fafc]/80 to-transparent z-10 animate-in fade-in duration-200">
            <button
              onClick={() => handleScrollTabs('left')}
              className="w-7 h-7 rounded-full bg-white border border-[#006c4a]/30 shadow-xs hover:bg-[#e6f4ed] hover:border-[#006c4a] text-[#006c4a] flex items-center justify-center transition-all active:scale-90"
              title="مشاهده بخش‌های دیگر"
              aria-label="مشاهده بخش‌های دیگر"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
          </div>
        )}
      </div>

      {/* Notifications Content Area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#f8fafc]"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {isLoading ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-[36px] text-[#006c4a] animate-spin">progress_activity</span>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-[#fda4af] p-6 mt-4">
            <span className="material-symbols-outlined text-[48px] text-[#dc2626] mb-2">error</span>
            <p className="text-[14px] font-bold text-[#475569] mb-3">{error}</p>
            <button
              onClick={loadNotifications}
              className="text-[12px] font-bold text-white bg-[#006c4a] px-4 py-2 rounded-lg"
            >
              تلاش مجدد
            </button>
          </div>
        ) : filteredNotifications.length > 0 ? (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleToggleRead(n.id)}
              className={`p-4 rounded-2xl border transition-all text-right relative group cursor-pointer ${
                n.unread
                  ? 'bg-white border-[#006c4a]/40 shadow-xs ring-1 ring-[#006c4a]/10'
                  : 'bg-white/80 border-[#e2e8f0] hover:border-[#cbd5e1]'
              }`}
            >
              {/* Card Header: Icon + Title + Time */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2.5 flex-1">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      n.unread ? 'bg-[#e6f4ed] text-[#006c4a]' : 'bg-[#f1f5f9] text-[#64748b]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{n.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`text-[13px] font-extrabold leading-snug ${n.unread ? 'text-[#0f172a]' : 'text-[#334155]'}`}>
                        {n.title}
                      </h3>
                      {n.badgeText && (
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${n.badgeColor}`}>
                          {n.badgeText}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#94a3b8] font-bold block mt-0.5">{n.time}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {n.unread && <span className="w-2.5 h-2.5 rounded-full bg-[#006c4a] animate-pulse" title="خوانده نشده" />}
                  <button
                    onClick={(e) => handleDeleteNotification(n.id, e)}
                    className="p-1 rounded-lg text-[#cbd5e1] hover:text-[#ba1a1a] hover:bg-[#fef2f2] transition-colors"
                    title="حذف پیام"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>

              {/* Body */}
              <p className="text-[12px] text-[#475569] leading-relaxed pr-11 pl-2 mb-2 font-medium">
                {n.body}
              </p>

              {/* Amount tag if present */}
              {n.amount && (
                <div className="pr-11 flex items-center justify-start">
                  <span className="inline-flex items-center gap-1 text-[12px] font-extrabold text-[#006c4a] bg-[#f0fdf4] px-2.5 py-1 rounded-lg border border-[#006c4a]/20">
                    <span className="material-symbols-outlined text-[16px]">payments</span>
                    <span>{n.amount}</span>
                  </span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-[#cbd5e1] p-6 mt-4">
            <span className="material-symbols-outlined text-[48px] text-[#94a3b8] mb-2">
              notifications_off
            </span>
            <p className="text-[14px] font-bold text-[#475569] mb-1">هیچ پیام جدیدی در این بخش وجود ندارد!</p>
            <p className="text-[11px] text-[#94a3b8]">
              اطلاعیه‌ها و پیام‌های جدید مربوط به {tabs.find((t) => t.id === activeTab)?.label} در این قسمت قرار می‌گیرند.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
