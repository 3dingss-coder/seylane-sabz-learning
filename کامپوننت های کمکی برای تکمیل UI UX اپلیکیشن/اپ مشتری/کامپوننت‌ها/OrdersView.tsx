import React, { useMemo, useState } from 'react';
import { Order } from '../types';
import { formatPrice, toPersianDigits, formatJalaliDateTime, gregorianToJalali, jalaliToGregorian } from '../utils/persian';
import { assetUrl } from '../utils/assets';
import { PersianCalendarPicker, formatJalaliShort, todayJalali } from './PersianCalendarPicker';

interface OrdersViewProps {
  orders: Order[];
  onReorder: (order: Order) => void;
  onDeleteOrder?: (order: Order) => void;
  onAdjustOrderQty?: (order: Order, delta: number) => void;
}

type OrderStage = 'pending' | 'confirmed' | 'shipping' | 'delivered';

// Thin, brand-tinted border used consistently around every "box" in this
// view (order cards, filter bar, status boxes...) — same hue family as the
// bottom nav's gradient border, but a single hairline rather than a thick
// gradient ring, per design feedback.
const THIN_BOX_BORDER = 'border border-[#059669]/25';

const PRIMARY_GRADIENT_BUTTON =
  'bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] hover:from-[#34d399] hover:to-[#059669] text-white shadow-[0_6px_18px_rgba(5,150,105,0.35)] border border-white/40 ring-1 ring-[#059669]/20 backdrop-blur-md active:scale-[0.98] transition-all';

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, onReorder, onDeleteOrder, onAdjustOrderQty }) => {
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'active' | 'delivered'>('all');
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [selectedRatingOrder, setSelectedRatingOrder] = useState<Order | null>(null);
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<Order | null>(null);
  const [selectedScheduleOrder, setSelectedScheduleOrder] = useState<Order | null>(null);
  const [activeStage, setActiveStage] = useState<OrderStage>('pending');
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null);
  const [adjustingOrderId, setAdjustingOrderId] = useState<string | null>(null);

  // --- Filters -------------------------------------------------------
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState<[number, number, number] | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<[number, number, number] | null>(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);

  const activeFilterCount =
    (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0) + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0);

  const resetFilters = () => {
    setFilterDateFrom(null);
    setFilterDateTo(null);
    setMinPrice('');
    setMaxPrice('');
  };

  // Rating form state inside modal
  const [userStars, setUserStars] = useState<number>(5);
  const [userComment, setUserComment] = useState<string>('');
  const [orderRatings, setOrderRatings] = useState<Record<string, { stars: number; comment?: string }>>({
    'ord-102': { stars: 5, comment: 'کیفیت عالی، ارسال سریع و دست‌نخورده' },
  });

  // Store Presence Schedule state per order
  const [presenceSchedules, setPresenceSchedules] = useState<
    Record<string, { jalaliDate: [number, number, number]; timeSlot: string; notes?: string }>
  >({});

  // Form states for presence modal
  const [selectedJalaliDate, setSelectedJalaliDate] = useState<[number, number, number]>(todayJalali());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('۰۹:۰۰ تا ۱۲:۰۰ (صبح)');
  const [presenceNote, setPresenceNote] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const timeSlotOptions = [
    { id: 'morning', label: '۰۸:۰۰ تا ۱۲:۰۰', title: 'شیفت صبح', icon: 'wb_sunny' },
    { id: 'noon', label: '۱۲:۰۰ تا ۱۵:۰۰', title: 'شیفت ظهر', icon: 'partly_cloudy_day' },
    { id: 'afternoon', label: '۱۵:۰۰ تا ۱۸:۰۰', title: 'شیفت عصر', icon: 'light_mode' },
    { id: 'evening', label: '۱۸:۰۰ تا ۲۱:۰۰', title: 'شیفت شب', icon: 'bedtime' },
  ];

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (activeTabFilter === 'active' && o.status === 'delivered') return false;
      if (activeTabFilter === 'delivered' && o.status !== 'delivered') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesOrderNumber = o.orderNumber.toLowerCase().includes(q);
        const matchesItem = o.items.some((it) => it.productName.toLowerCase().includes(q));
        if (!matchesOrderNumber && !matchesItem) return false;
      }

      if (minPrice && o.totalAmount < Number(minPrice)) return false;
      if (maxPrice && o.totalAmount > Number(maxPrice)) return false;

      if (filterDateFrom || filterDateTo) {
        const orderDate = new Date((o.date || '').includes('T') ? o.date : o.date.replace(' ', 'T') + 'Z');
        if (!isNaN(orderDate.getTime())) {
          if (filterDateFrom) {
            const [fy, fm, fd] = filterDateFrom;
            const from = jalaliToGregorian(fy, fm, fd);
            from.setHours(0, 0, 0, 0);
            if (orderDate < from) return false;
          }
          if (filterDateTo) {
            const [ty, tm, td] = filterDateTo;
            const to = jalaliToGregorian(ty, tm, td);
            to.setHours(23, 59, 59, 999);
            if (orderDate > to) return false;
          }
        }
      }

      return true;
    });
  }, [orders, activeTabFilter, searchQuery, minPrice, maxPrice, filterDateFrom, filterDateTo]);

  const handleOpenRating = (order: Order) => {
    const existing = orderRatings[order.id];
    setUserStars(existing ? existing.stars : 5);
    setUserComment(existing?.comment || '');
    setSelectedRatingOrder(order);
  };

  const handleSubmitRating = () => {
    if (selectedRatingOrder) {
      setOrderRatings((prev) => ({
        ...prev,
        [selectedRatingOrder.id]: { stars: userStars, comment: userComment },
      }));
      setSelectedRatingOrder(null);
    }
  };

  const handleOpenTracking = (order: Order) => {
    setSelectedTrackingOrder(order);
    setActiveStage(order.status || 'pending');
  };

  const handleOpenScheduleModal = (order: Order) => {
    const existing = presenceSchedules[order.id];
    if (existing) {
      setSelectedJalaliDate(existing.jalaliDate);
      setSelectedTimeSlot(existing.timeSlot);
      setPresenceNote(existing.notes || '');
    } else {
      setSelectedJalaliDate(todayJalali());
      setSelectedTimeSlot('۰۹:۰۰ تا ۱۲:۰۰ (صبح)');
      setPresenceNote('');
    }
    setSelectedScheduleOrder(order);
  };

  const handleSaveSchedule = () => {
    if (selectedScheduleOrder) {
      setPresenceSchedules((prev) => ({
        ...prev,
        [selectedScheduleOrder.id]: {
          jalaliDate: selectedJalaliDate,
          timeSlot: selectedTimeSlot,
          notes: presenceNote,
        },
      }));

      setToastMessage(
        `زمان حضور شما در مغازه (${formatJalaliShort(selectedJalaliDate)} - ${selectedTimeSlot}) ثبت شد.`
      );
      setSelectedScheduleOrder(null);

      setTimeout(() => {
        setToastMessage(null);
      }, 4000);
    }
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteOrder && onDeleteOrder) {
      await onDeleteOrder(pendingDeleteOrder);
    }
    setPendingDeleteOrder(null);
  };

  const handleAdjustQty = async (order: Order, delta: number) => {
    if (!onAdjustOrderQty) return;
    setAdjustingOrderId(order.id);
    try {
      await onAdjustOrderQty(order, delta);
    } finally {
      setAdjustingOrderId(null);
    }
  };

  const getStatusBadge = (status: Order['status'], text: string) => {
    switch (status) {
      case 'shipping':
        return (
          <span className="bg-[#fff7ed] text-[#ea580c] border border-[#ffedd5] px-3 py-1 rounded-full text-[11.5px] font-black shrink-0 flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#ea580c] animate-ping" />
            {text}
          </span>
        );
      case 'confirmed':
        return (
          <span className="bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] px-3 py-1 rounded-full text-[11.5px] font-black shrink-0 flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#2563eb]" />
            {text}
          </span>
        );
      case 'delivered':
        return (
          <span className="bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0] px-3 py-1 rounded-full text-[11.5px] font-black shrink-0 flex items-center gap-1 shadow-2xs">
            {text}
          </span>
        );
      default:
        return (
          <span className="bg-[#f8fafc] text-[#475569] border border-[#e2e8f0] px-3 py-1 rounded-full text-[11.5px] font-black shrink-0">
            {text}
          </span>
        );
    }
  };

  return (
    <div
      className="pt-3 px-3 text-right bg-[#f8fafc] min-h-screen relative"
      style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-[#004532] text-white p-3.5 rounded-2xl shadow-xl border border-[#059669] flex items-center justify-between text-[12.5px] font-black animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#34d399] text-[20px]">
              check_circle
            </span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/70 hover:text-white">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* 1. Page Title Bar */}
      <div className={`bg-white rounded-2xl p-4 shadow-xs ${THIN_BOX_BORDER} mb-3 flex items-center justify-between`}>
        <h1 className="font-['Vazirmatn'] text-[18px] font-black text-[#0f172a]">
          سفارش‌های من
        </h1>
        <span className="text-[11px] font-black text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] px-3 py-1 rounded-full shadow-2xs">
          {toPersianDigits(orders.length)} سفارش
        </span>
      </div>

      {/* 2. Status Filter Tabs + Filter Toggle */}
      <div className="flex gap-2 mb-2">
        <div className={`flex-1 flex gap-2 bg-white ${THIN_BOX_BORDER} p-1.5 rounded-2xl text-[12px] font-extrabold shadow-2xs`}>
          <button
            onClick={() => setActiveTabFilter('all')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTabFilter === 'all'
                ? 'bg-gradient-to-r from-[#10b981] to-[#047857] text-white shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            همه
          </button>
          <button
            onClick={() => setActiveTabFilter('active')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTabFilter === 'active'
                ? 'bg-gradient-to-r from-[#10b981] to-[#047857] text-white shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            در حال پردازش
          </button>
          <button
            onClick={() => setActiveTabFilter('delivered')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTabFilter === 'delivered'
                ? 'bg-gradient-to-r from-[#10b981] to-[#047857] text-white shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            تحویل شده
          </button>
        </div>

        <button
          onClick={() => setIsFilterPanelOpen((v) => !v)}
          className={`relative shrink-0 w-11 rounded-2xl flex items-center justify-center transition-all shadow-2xs ${
            isFilterPanelOpen || activeFilterCount > 0
              ? 'bg-gradient-to-br from-[#10b981] to-[#047857] text-white'
              : `bg-white ${THIN_BOX_BORDER} text-[#334155]`
          }`}
          title="فیلترها"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[#ea580c] text-white text-[9px] font-black flex items-center justify-center border border-white">
              {toPersianDigits(activeFilterCount)}
            </span>
          )}
        </button>
      </div>

      {/* 2b. Expandable Filter Panel */}
      {isFilterPanelOpen && (
        <div className={`bg-white ${THIN_BOX_BORDER} rounded-2xl p-3.5 mb-3.5 shadow-2xs space-y-3 animate-in fade-in slide-in-from-top-2 duration-200`}>
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined text-[18px] text-[#94a3b8] absolute right-3 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو بر اساس شماره سفارش یا نام کالا..."
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl py-2.5 pr-9 pl-3 text-[12px] text-[#0f172a] focus:outline-hidden focus:border-[#059669]"
            />
          </div>

          {/* Date Range */}
          <div>
            <label className="text-[11.5px] font-black text-[#334155] flex items-center gap-1 mb-1.5">
              <span className="material-symbols-outlined text-[15px] text-[#059669]">event</span>
              بازه زمانی ثبت سفارش
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDatePickerTarget(datePickerTarget === 'from' ? null : 'from')}
                className={`p-2.5 rounded-xl border text-[11.5px] font-bold text-right transition-all ${
                  datePickerTarget === 'from'
                    ? 'border-[#059669] bg-[#ecfdf5] text-[#004532] ring-1 ring-[#059669]/25'
                    : 'border-[#e2e8f0] bg-[#f8fafc] text-[#334155]'
                }`}
              >
                {filterDateFrom ? formatJalaliShort(filterDateFrom) : 'از تاریخ...'}
              </button>
              <button
                onClick={() => setDatePickerTarget(datePickerTarget === 'to' ? null : 'to')}
                className={`p-2.5 rounded-xl border text-[11.5px] font-bold text-right transition-all ${
                  datePickerTarget === 'to'
                    ? 'border-[#059669] bg-[#ecfdf5] text-[#004532] ring-1 ring-[#059669]/25'
                    : 'border-[#e2e8f0] bg-[#f8fafc] text-[#334155]'
                }`}
              >
                {filterDateTo ? formatJalaliShort(filterDateTo) : 'تا تاریخ...'}
              </button>
            </div>

            {datePickerTarget && (
              <div className="mt-2">
                <PersianCalendarPicker
                  value={datePickerTarget === 'from' ? filterDateFrom : filterDateTo}
                  disablePast={false}
                  onChange={(d) => {
                    if (datePickerTarget === 'from') setFilterDateFrom(d);
                    else setFilterDateTo(d);
                    setDatePickerTarget(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* Price Range */}
          <div>
            <label className="text-[11.5px] font-black text-[#334155] flex items-center gap-1 mb-1.5">
              <span className="material-symbols-outlined text-[15px] text-[#059669]">payments</span>
              بازه مبلغ سفارش (تومان)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="حداقل"
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-2.5 text-[11.5px] text-[#0f172a] focus:outline-hidden focus:border-[#059669]"
              />
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="حداکثر"
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-2.5 text-[11.5px] text-[#0f172a] focus:outline-hidden focus:border-[#059669]"
              />
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="w-full py-2 rounded-xl border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] text-[11.5px] font-bold flex items-center justify-center gap-1 transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">restart_alt</span>
              پاک کردن فیلترها
            </button>
          )}
        </div>
      )}

      {/* 3. Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-[#64748b] bg-white rounded-3xl border border-dashed border-[#cbd5e1] text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#ecfdf5] text-[#059669] flex items-center justify-center mb-3.5 shadow-2xs">
            <span className="material-symbols-outlined text-[34px]">receipt_long</span>
          </div>
          <h3 className="font-black text-[15px] text-[#0f172a] mb-1">
            هیچ سفارشی یافت نشد
          </h3>
          <p className="text-[12px] text-[#64748b] leading-relaxed max-w-[260px]">
            هنوز سفارشی در این وضعیت ثبت نکرده‌اید.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {filteredOrders.map((order) => {
            const mainItem = order.items[0];
            const remainingCount = order.items.length - 1;
            const ratingData = orderRatings[order.id];
            const presenceData = presenceSchedules[order.id];
            const isDelivered = order.status === 'delivered';

            return (
              <div
                key={order.id}
                className={`bg-white ${THIN_BOX_BORDER} rounded-3xl p-4 shadow-xs hover:shadow-md transition-all duration-200 text-right space-y-3 relative overflow-hidden`}
              >
                {/* Header Row: Store Logo Avatar + Store Name + Status Badge + Delete */}
                <div className="flex items-start justify-between gap-2 border-b border-[#f1f5f9] pb-3">
                  <div className="flex items-center gap-3">
                    {/* Store Logo Avatar */}
                    <div className="w-11 h-11 rounded-full bg-[#f8fafc] border border-[#e2e8f0] p-1 shrink-0 flex items-center justify-center overflow-hidden shadow-2xs">
                      {/* Fallback was an ephemeral aistudio.google.com googleusercontent
                          URL that no longer resolves; use the app's own brand logo
                          instead when an order has no specific store logo. assetUrl()
                          accounts for the GitHub Pages subpath deployment. */}
                      <img
                        src={order.storeLogo || assetUrl('/logo-full.png')}
                        alt="Store"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>

                    <div className="flex flex-col">
                      <h2 className="text-[14.5px] font-black text-[#0f172a] leading-tight">
                        {order.storeName || 'واحد مرکزی سیلانه سبز'}
                      </h2>
                      <span className="text-[11px] text-[#64748b] leading-snug line-clamp-1 mt-0.5 max-w-[200px]">
                        تحویل به: {order.deliveryAddress}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {getStatusBadge(order.status, order.statusText)}
                    {order.status === 'pending' && onDeleteOrder && (
                      <button
                        onClick={() => setPendingDeleteOrder(order)}
                        className="w-7 h-7 rounded-full text-[#dc2626] hover:bg-[#fef2f2] flex items-center justify-center transition-colors active:scale-90"
                        title="حذف سفارش"
                      >
                        <span className="material-symbols-outlined text-[17px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Main Product Tag Pill + Quantity Stepper (editable while pending) */}
                {mainItem && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 bg-[#f8fafc] border border-[#e2e8f0] text-[#334155] px-3 py-1.5 rounded-xl font-bold text-[12px] shadow-2xs">
                      <span>{mainItem.productName}</span>
                      {remainingCount > 0 && (
                        <span className="text-[#059669] font-black">
                          (+{toPersianDigits(remainingCount)} کالای دیگر)
                        </span>
                      )}
                    </span>

                    {order.status === 'pending' && onAdjustOrderQty && (
                      <div className="flex items-center gap-1 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-0.5 shrink-0">
                        <button
                          onClick={() => handleAdjustQty(order, 1)}
                          disabled={adjustingOrderId === order.id}
                          className="w-6 h-6 bg-gradient-to-br from-[#10b981] to-[#047857] text-white rounded-lg flex items-center justify-center font-black text-[13px] active:scale-90 transition-all disabled:opacity-50"
                          title="افزایش تعداد"
                        >
                          +
                        </button>
                        <span className="text-[11.5px] font-black text-[#0f172a] px-1.5 min-w-[18px] text-center">
                          {toPersianDigits(mainItem.quantity)}
                        </span>
                        <button
                          onClick={() => handleAdjustQty(order, -1)}
                          disabled={adjustingOrderId === order.id || mainItem.quantity <= 1}
                          className="w-6 h-6 bg-white text-[#dc2626] border border-[#fecaca] rounded-lg flex items-center justify-center font-black text-[13px] active:scale-90 transition-all disabled:opacity-40"
                          title="کاهش تعداد"
                        >
                          -
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Price, Date & Time Row */}
                <div className={`flex items-center justify-between text-[12px] font-extrabold text-[#334155] bg-[#f8fafc]/60 p-2.5 rounded-2xl ${THIN_BOX_BORDER}`}>
                  <div className="flex items-center gap-1.5 text-[#0f172a]">
                    <span className="material-symbols-outlined text-[16px] text-[#64748b]">
                      receipt
                    </span>
                    <span className="text-[14px] font-black">
                      {formatPrice(order.totalAmount)} تومان
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[#64748b] font-bold text-[11.5px]">
                    <span className="material-symbols-outlined text-[15px]">calendar_today</span>
                    <span>{formatJalaliDateTime(order.date)}</span>
                  </div>
                </div>

                {/* STORE PRESENCE BANNER BUTTON / DISPLAY BOX */}
                {!isDelivered && (
                  <div className={`bg-[#f0fdf4] ${THIN_BOX_BORDER} p-3 rounded-2xl flex items-center justify-between text-[12px] transition-all`}>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#16a34a] text-[18px]">
                        store
                      </span>
                      {presenceData ? (
                        <span className="font-extrabold text-[#15803d]">
                          زمان حضور: {formatJalaliShort(presenceData.jalaliDate)} | {presenceData.timeSlot}
                        </span>
                      ) : (
                        <span className="font-extrabold text-[#15803d]">
                          مشخص کردن زمان حضور در مغازه جهت تحویل
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenScheduleModal(order)}
                      className="text-[11.5px] font-black text-[#16a34a] bg-white border border-[#86efac] hover:bg-[#dcfce7] px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit_calendar</span>
                      <span>{presenceData ? 'ویرایش زمان' : 'تعیین زمان'}</span>
                    </button>
                  </div>
                )}

                {/* CONDITIONAL BOX: View Tracking Status (For active orders) OR Rating Box (For delivered orders) */}
                {!isDelivered ? (
                  /* Active Order: View Live Status Box */
                  <div className="bg-[#eff6ff] border border-[#dbeafe] p-3 rounded-2xl flex items-center justify-between transition-all">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2563eb] opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#2563eb]" />
                      </span>
                      <span className="text-[12.5px] font-black text-[#1e40af]">
                        وضعیت لحظه‌ای: {order.statusText}
                      </span>
                    </div>

                    <button
                      onClick={() => handleOpenTracking(order)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[12px] font-black flex items-center gap-1 shadow-xs transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">map</span>
                      <span>مشاهده وضعیت سفارش</span>
                    </button>
                  </div>
                ) : (
                  /* Delivered Order: Rating Banner Box */
                  <div className="bg-[#fff8f1] border border-[#ffedd5] p-3 rounded-2xl flex items-center justify-between transition-all">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#ea580c] text-[18px]">
                        star
                      </span>
                      {ratingData ? (
                        <span className="text-[12px] font-extrabold text-[#9a3412]">
                          امتیاز ثبت شده شما: {toPersianDigits(ratingData.stars)} از ۵ ⭐
                        </span>
                      ) : (
                        <span className="text-[12px] font-extrabold text-[#9a3412]">
                          به این سفارش امتیاز دهید
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenRating(order)}
                      className="text-[12px] font-black text-[#ea580c] hover:text-[#c2410c] flex items-center gap-0.5 hover:underline transition-all"
                    >
                      <span>{ratingData ? 'ویرایش امتیاز' : 'ثبت امتیاز'}</span>
                      <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                    </button>
                  </div>
                )}

                {/* Actions Row: Invoice & Reorder */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setSelectedInvoiceOrder(order)}
                    className="w-full py-2.5 rounded-2xl border border-[#cbd5e1] text-[#1e293b] font-black text-[12.5px] hover:bg-[#f8fafc] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 bg-white shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[17px] text-[#64748b]">
                      receipt_long
                    </span>
                    <span>صورت‌حساب</span>
                  </button>

                  <button
                    onClick={() => onReorder(order)}
                    className={`w-full py-2.5 rounded-2xl font-black text-[12.5px] flex items-center justify-center gap-1.5 ${PRIMARY_GRADIENT_BUTTON}`}
                  >
                    <span className="material-symbols-outlined text-[17px]">replay</span>
                    <span>سفارش مجدد</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. STORE PRESENCE & DELIVERY TIME SCHEDULING MODAL ("تعیین زمان حضور در مغازه") */}
      {selectedScheduleOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full my-auto border border-[#e2e8f0] shadow-2xl text-right animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[#e2e8f0] pb-3.5 mb-4">
              <div>
                <span className="text-[11px] font-bold text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-0.5 rounded-full">
                  هماهنگی تحویل مرسوله
                </span>
                <h2 className="text-[16.5px] font-black text-[#0f172a] mt-1">
                  تعیین زمان حضور در مغازه
                </h2>
                <p className="text-[11.5px] text-[#64748b] mt-0.5">
                  لطفاً روز و ساعت دقیق حضور خود در مغازه را مشخص کنید تا سفیر ارسال در زمان مناسب مراجعه کند.
                </p>
              </div>

              <button
                onClick={() => setSelectedScheduleOrder(null)}
                className="w-8 h-8 rounded-full bg-[#f1f5f9] text-[#64748b] flex items-center justify-center hover:bg-[#e2e8f0] shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Step 1: Date Selection — visual Jalali calendar */}
            <div className="space-y-2 mb-4">
              <label className="text-[12.5px] font-black text-[#0f172a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#059669]">
                  calendar_month
                </span>
                <span>۱. انتخاب تاریخ حضور در مغازه</span>
              </label>

              <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl px-3 py-2 flex items-center justify-between mb-2">
                <span className="text-[12.5px] font-black text-[#004532]">
                  {formatJalaliShort(selectedJalaliDate)}
                </span>
                <span className="material-symbols-outlined text-[16px] text-[#059669]">event_available</span>
              </div>

              <PersianCalendarPicker
                value={selectedJalaliDate}
                onChange={setSelectedJalaliDate}
              />
            </div>

            {/* Step 2: Time Window Selection */}
            <div className="space-y-2 mb-4">
              <label className="text-[12.5px] font-black text-[#0f172a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#059669]">
                  schedule
                </span>
                <span>۲. انتخاب بازه زمانی حضور</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {timeSlotOptions.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedTimeSlot(`${slot.label} (${slot.title})`)}
                    className={`p-2.5 rounded-2xl border text-right transition-all flex items-center justify-between ${
                      selectedTimeSlot.includes(slot.label)
                        ? 'border-[#059669] bg-[#ecfdf5] text-[#004532] ring-2 ring-[#059669]/20 font-black shadow-2xs'
                        : 'border-[#e2e8f0] bg-[#f8fafc] text-[#334155] hover:border-[#cbd5e1] font-extrabold'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#64748b]">{slot.title}</span>
                      <span className="text-[12px]">{slot.label}</span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[#059669]">
                      {slot.icon}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Presence Note */}
            <div className="space-y-1.5 mb-5">
              <label className="text-[12.5px] font-black text-[#0f172a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#059669]">
                  notes
                </span>
                <span>۳. توضیحات تحویل (اختیاری)</span>
              </label>
              <input
                type="text"
                value={presenceNote}
                onChange={(e) => setPresenceNote(e.target.value)}
                placeholder="مثال: در صورت غیبت، تحویل همکار مغازه مجاور شود..."
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-3 text-[12px] text-[#0f172a] focus:outline-hidden focus:border-[#059669]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSaveSchedule}
                className={`flex-1 py-3.5 font-black text-[13px] rounded-2xl flex items-center justify-center gap-2 ${PRIMARY_GRADIENT_BUTTON}`}
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>ثبت نهایی زمان حضور</span>
              </button>

              <button
                onClick={() => setSelectedScheduleOrder(null)}
                className="px-4 py-3.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-black text-[12.5px] rounded-2xl border border-[#cbd5e1] transition-all"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4b. DELETE ORDER CONFIRMATION MODAL */}
      {pendingDeleteOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full border border-[#e2e8f0] shadow-2xl text-right animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-[#fef2f2] text-[#dc2626] flex items-center justify-center mb-3.5 mx-auto">
              <span className="material-symbols-outlined text-[28px]">delete</span>
            </div>
            <h3 className="text-[15px] font-black text-[#0f172a] text-center mb-1.5">
              حذف سفارش {pendingDeleteOrder.orderNumber}؟
            </h3>
            <p className="text-[12px] text-[#64748b] text-center leading-relaxed mb-5">
              این سفارش برای همیشه حذف می‌شود و قابل بازگشت نیست.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-3 rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] text-white font-black text-[12.5px] transition-all active:scale-95"
              >
                بله، حذف شود
              </button>
              <button
                onClick={() => setPendingDeleteOrder(null)}
                className="flex-1 py-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-black text-[12.5px] border border-[#cbd5e1] transition-all"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. LIVE ORDER TRACKING MODAL ("مشاهده وضعیت سفارش") */}
      {selectedTrackingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full my-auto border border-[#e2e8f0] shadow-2xl overflow-hidden text-right animate-in zoom-in-95 duration-200">
            {/* Top Navigation & Stage Switcher bar (Allows testing all 4 stages) */}
            <div className="bg-[#0f172a] text-white p-3 flex items-center justify-between border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedTrackingOrder(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  title="بستن"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
                <span className="text-[13.5px] font-black">
                  پیگیری آنلاین سفارش {selectedTrackingOrder.orderNumber}
                </span>
              </div>

              {/* Quick presence schedule trigger button inside tracking modal */}
              <button
                onClick={() => handleOpenScheduleModal(selectedTrackingOrder)}
                className="bg-[#059669] hover:bg-[#047857] text-white px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1 shadow-2xs"
              >
                <span className="material-symbols-outlined text-[14px]">edit_calendar</span>
                <span>زمان حضور</span>
              </button>
            </div>

            {/* Interactive Stage Selector Bar */}
            <div className="bg-[#1e293b] px-2 py-2 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar text-[10.5px] font-black border-b border-[#334155]">
              <button
                onClick={() => setActiveStage('pending')}
                className={`px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                  activeStage === 'pending'
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'bg-white/5 text-[#94a3b8] hover:text-white'
                }`}
              >
                ۱. در انتظار تأیید
              </button>
              <button
                onClick={() => setActiveStage('confirmed')}
                className={`px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                  activeStage === 'confirmed'
                    ? 'bg-[#2563eb] text-white shadow-xs'
                    : 'bg-white/5 text-[#94a3b8] hover:text-white'
                }`}
              >
                ۲. تأیید شد
              </button>
              <button
                onClick={() => setActiveStage('shipping')}
                className={`px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                  activeStage === 'shipping'
                    ? 'bg-[#059669] text-white shadow-xs'
                    : 'bg-white/5 text-[#94a3b8] hover:text-white'
                }`}
              >
                ۳. در حال ارسال پیک
              </button>
              <button
                onClick={() => setActiveStage('delivered')}
                className={`px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                  activeStage === 'delivered'
                    ? 'bg-[#16a34a] text-white shadow-xs'
                    : 'bg-white/5 text-[#94a3b8] hover:text-white'
                }`}
              >
                ۴. تحویل داده شد
              </button>
            </div>

            {/* HEADER AREA: Banner/Products vs Live Map View */}
            {activeStage === 'shipping' ? (
              /* STAGE 3 MAP HEADER: Interactive simulated live map */
              <div className="h-48 w-full bg-[#e2e8f0] relative overflow-hidden flex items-center justify-center border-b border-[#cbd5e1]">
                {/* Simulated Map Background Grid & Roads */}
                <div className="absolute inset-0 bg-[#e5e7eb] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]" />
                
                {/* Simulated Roads */}
                <svg className="absolute inset-0 w-full h-full stroke-[#cbd5e1] stroke-[6] fill-none">
                  <path d="M -20 80 Q 120 40 220 110 T 450 120" />
                  <path d="M 100 -20 Q 140 100 180 200" />
                  <path d="M -10 160 L 400 60" />
                </svg>

                {/* Animated Route Line */}
                <svg className="absolute inset-0 w-full h-full stroke-[#2563eb] stroke-[4] stroke-dasharray-[8_4] fill-none animate-pulse">
                  <path d="M 70 60 Q 180 90 310 130" />
                </svg>

                {/* Store Origin Pin */}
                <div className="absolute top-8 right-16 bg-white px-2.5 py-1 rounded-full border border-[#cbd5e1] shadow-md flex items-center gap-1 text-[10px] font-black text-[#0f172a] animate-bounce">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  <span>انبار مرکزی سیلانه</span>
                </div>

                {/* Moving Courier Bike Marker */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-[#2563eb] text-white shadow-lg flex items-center justify-center border-2 border-white ring-4 ring-[#2563eb]/20 animate-pulse">
                    <span className="text-[26px]">🛵</span>
                  </div>
                  <span className="bg-[#0f172a] text-white text-[9.5px] font-black px-2 py-0.5 rounded-md mt-1 shadow-xs">
                    سفیر در مسیر
                  </span>
                </div>

                {/* Destination Pin */}
                <div className="absolute bottom-6 left-12 bg-white px-2.5 py-1 rounded-full border border-[#cbd5e1] shadow-md flex items-center gap-1 text-[10px] font-black text-[#dc2626]">
                  <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
                  <span>آدرس تحویل شما</span>
                </div>
              </div>
            ) : activeStage === 'delivered' ? (
              /* STAGE 4 DELIVERED HEADER: Celebration Banner & 3D Box with Green Checkmark */
              <div className="h-44 w-full bg-gradient-to-r from-[#047857] via-[#059669] to-[#0f766e] relative overflow-hidden p-4 flex items-center justify-between">
                <div className="z-10 text-white space-y-1">
                  <span className="bg-white/20 text-white border border-white/30 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    تکمیل شده
                  </span>
                  <h3 className="text-[17px] font-black text-white">
                    تحویل با موفقیت انجام شد
                  </h3>
                  <p className="text-[11.5px] text-white/90">
                    تمامی اقلام فاکتور سلامت تحویل گردید.
                  </p>
                </div>

                {/* 3D Box Graphic with Green Checkmark */}
                <div className="relative z-10 shrink-0">
                  <div className="w-20 h-20 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-xs flex items-center justify-center text-[44px] shadow-lg">
                    📦
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#16a34a] text-white border-2 border-white flex items-center justify-center shadow-md">
                    <span className="material-symbols-outlined text-[20px] font-black">check</span>
                  </div>
                </div>
              </div>
            ) : (
              /* STAGE 1 & STAGE 2 HEADER: Brand Banners & Products Showcase Card */
              <div className="bg-gradient-to-r from-[#004e39] via-[#059669] to-[#0284c7] p-4 text-white relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10 blur-lg pointer-events-none" />
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <span className="text-[10px] font-black text-white/80 bg-white/15 px-2.5 py-0.5 rounded-full">
                      گروه صنعتی سیلانه سبز
                    </span>
                    <h3 className="text-[15px] font-black text-white mt-1">
                      اقلام سفارشی ({toPersianDigits(selectedTrackingOrder.items.length)} کالا)
                    </h3>
                  </div>

                  {/* Brand Logos Stack */}
                  <div className="flex -space-x-2 space-x-reverse">
                    <div className="w-9 h-9 rounded-full bg-white border-2 border-[#059669] p-0.5 shadow-xs overflow-hidden flex items-center justify-center">
                      {/* Was an ephemeral aistudio.google.com googleusercontent URL that no
                          longer resolves; the app's own brand logo (already used in Header)
                          is what this was always meant to represent. assetUrl() accounts for
                          the GitHub Pages subpath deployment. */}
                      <img src={assetUrl('/logo-full.png')} alt="سیلانه سبز" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                </div>

                {/* Ordered Items Pill Scroll */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 pt-2 border-t border-white/15">
                  {selectedTrackingOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-xl text-[11px] font-bold text-white shrink-0 border border-white/20"
                    >
                      {item.productName} ({toPersianDigits(item.quantity)} عدد)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="p-5 space-y-5 text-center">
              {/* STAGE 1: PENDING (در انتظار تأیید فروشگاه) */}
              {activeStage === 'pending' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h2 className="text-[19px] font-black text-[#0f172a]">
                      در انتظار تأیید فروشگاه
                    </h2>
                    <p className="text-[12.5px] text-[#64748b]">
                      سفارش شما با موفقیت ثبت شد و در صف بررسی واحد فروش قرار دارد.
                    </p>
                  </div>

                  {/* 3D Store Icon with Animated Ring */}
                  <div className="flex justify-center my-2">
                    <div className="relative flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#ffedd5] to-[#fef3c7] border-4 border-white shadow-xl flex items-center justify-center text-[48px] animate-pulse">
                        🏪
                      </div>
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#ea580c] animate-spin-slow" />
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 2: CONFIRMED (سفارش شما تأیید شد) */}
              {activeStage === 'confirmed' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h2 className="text-[19px] font-black text-[#0f172a]">
                      سفارش شما تأیید شد
                    </h2>
                    <p className="text-[12.5px] text-[#64748b]">
                      در حال آماده‌سازی و بسته‌بندی سفارش در انبار مرکزی.
                    </p>
                  </div>

                  {/* 3D Visitor / Sales Agent Icon + Connected Nodes Pipeline */}
                  <div className="flex flex-col items-center justify-center my-2 space-y-3">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#dbeafe] to-[#e0e7ff] border-4 border-white shadow-xl flex items-center justify-center text-[48px] relative">
                      🧑‍💼
                      <span className="absolute -bottom-1 -right-1 bg-[#2563eb] text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                        ویزیتور فعال
                      </span>
                    </div>

                    {/* 3 Connected Pipeline Nodes */}
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <div className="flex items-center gap-1.5 bg-[#eff6ff] border border-[#bfdbfe] px-2.5 py-1 rounded-xl text-[10.5px] font-black text-[#1d4ed8]">
                        <span>۱. ثبت</span>
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      </div>
                      <div className="w-4 h-0.5 bg-[#bfdbfe]" />
                      <div className="flex items-center gap-1.5 bg-[#eff6ff] border border-[#2563eb] px-2.5 py-1 rounded-xl text-[10.5px] font-black text-[#2563eb] ring-2 ring-[#2563eb]/20">
                        <span>۲. پردازش مالی</span>
                        <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                      </div>
                      <div className="w-4 h-0.5 bg-[#cbd5e1]" />
                      <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-[#e2e8f0] px-2.5 py-1 rounded-xl text-[10.5px] font-bold text-[#94a3b8]">
                        <span>۳. بسته‌بندی</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 3: SHIPPING (سفارش شما تحویل پیک داده شد) */}
              {activeStage === 'shipping' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h2 className="text-[18px] font-black text-[#0f172a]">
                      سفارش شما تحویل پیک داده شد و در حال ارسال است
                    </h2>
                    <p className="text-[12.5px] text-[#64748b]">
                      سفیر اختصاصی سیلانه سبز در مسیر تحویل مرسوله به شماست.
                    </p>
                  </div>

                  {/* 3D Courier Motorbike Icon */}
                  <div className="flex justify-center my-2">
                    <div className="relative flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#d1fae5] to-[#a7f3d0] border-4 border-white shadow-xl flex items-center justify-center text-[48px]">
                        🛵
                      </div>
                      <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#059669] opacity-75" />
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-[#059669]" />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 4: DELIVERED (سفارش با موفقیت تحویل داده شد) */}
              {activeStage === 'delivered' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Top 3D Wink/Thumbs-up Courier Icon with Green Checkmark */}
                  <div className="flex justify-center my-2">
                    <div className="relative flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#dcfce7] to-[#bbf7d0] border-4 border-white shadow-xl flex items-center justify-center text-[52px]">
                        😉
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#16a34a] text-white border-2 border-white flex items-center justify-center shadow-md">
                        <span className="material-symbols-outlined text-[22px] font-black">check</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1 bg-[#dcfce7] text-[#15803d] border border-[#86efac] px-3 py-1 rounded-full text-[11.5px] font-black">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      <span>تحویل داده شد</span>
                    </div>
                    <h2 className="text-[19px] font-black text-[#0f172a] pt-1">
                      سفارش با موفقیت تحویل داده شد
                    </h2>
                    <p className="text-[12.5px] text-[#64748b]">
                      از اعتماد و همکاری شما با گروه صنعتی سیلانه سبز سپاسگزاریم.
                    </p>
                  </div>
                </div>
              )}

              {/* 3 BOTTOM INFORMATION CARDS (FOR STAGES 1, 2, 3) */}
              {activeStage !== 'delivered' && (
                <div className="grid grid-cols-3 gap-2 text-center pt-2">
                  {/* Card 1: Delivery Option */}
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] p-2.5 rounded-2xl flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-[#64748b]">
                      {activeStage === 'shipping' ? 'سفیر ارسال' : 'پیک اکسپرس'}
                    </span>
                    <span className="text-[12px] font-black text-[#0f172a] mt-0.5 line-clamp-1">
                      {activeStage === 'shipping' ? 'علی محمدی' : 'رایگان'}
                    </span>
                  </div>

                  {/* Card 2: Order Total */}
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] p-2.5 rounded-2xl flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-[#64748b]">هزینه سفارش</span>
                    <span className="text-[12px] font-black text-[#059669] mt-0.5 line-clamp-1">
                      {formatPrice(selectedTrackingOrder.totalAmount)}
                    </span>
                  </div>

                  {/* Card 3: Estimated Time */}
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] p-2.5 rounded-2xl flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-[#64748b]">زمان تحویل</span>
                    <span className="text-[12px] font-black text-[#0f172a] mt-0.5 line-clamp-1">
                      {presenceSchedules[selectedTrackingOrder.id]
                        ? presenceSchedules[selectedTrackingOrder.id].timeSlot
                        : activeStage === 'pending'
                        ? 'در حال بررسی'
                        : activeStage === 'confirmed'
                        ? '۳۰ تا ۴۵ دقیقه'
                        : 'حدود ۱۵ دقیقه'}
                    </span>
                  </div>
                </div>
              )}

              {/* BOTTOM FOOTER ACTION BUTTONS */}
              {activeStage === 'delivered' ? (
                /* Stage 4 Footer: Reorder & Back Buttons */
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#e2e8f0]">
                  <button
                    onClick={() => {
                      setSelectedTrackingOrder(null);
                      onReorder(selectedTrackingOrder);
                    }}
                    className="py-3 rounded-2xl bg-[#004532] hover:bg-[#022c22] text-white font-black text-[13px] shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px]">replay</span>
                    <span>سفارش مجدد</span>
                  </button>

                  <button
                    onClick={() => setSelectedTrackingOrder(null)}
                    className="py-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-black text-[13px] border border-[#cbd5e1] active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>بازگشت به سفارشات</span>
                  </button>
                </div>
              ) : (
                /* Stages 1, 2, 3 Footer: Support & Cancel Buttons */
                <div className="flex items-center justify-between pt-3 border-t border-[#e2e8f0] text-[12.5px] font-black">
                  <button
                    onClick={() =>
                      alert('درخواست لغو سفارش به پشتیبانی واحد فروش سیلانه سبز ارسال شد.')
                    }
                    className="text-[#dc2626] hover:underline"
                  >
                    لغو سفارش
                  </button>

                  <button
                    onClick={() => alert('شماره تماس پشتیبانی: ۰۲۱-۸۸۹۹۰۰۰۰')}
                    className="flex items-center gap-1.5 text-[#0f172a] hover:text-[#004532]"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#059669]">
                      headset_mic
                    </span>
                    <span>تماس با پشتیبانی</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Rating Rating Modal */}
      {selectedRatingOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full border border-[#e2e8f0] shadow-xl text-right animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[16px] font-black text-[#0f172a]">
                ثبت امتیاز برای سفارش {selectedRatingOrder.orderNumber}
              </h3>
              <button
                onClick={() => setSelectedRatingOrder(null)}
                className="w-8 h-8 rounded-full bg-[#f1f5f9] text-[#64748b] flex items-center justify-center hover:bg-[#e2e8f0]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-[12px] text-[#64748b] mb-4">
              نظرتان درباره کیفیت تحویل و بسته‌بندی اقلام این سفارش چگونه است؟
            </p>

            {/* Interactive Stars Row */}
            <div className="flex justify-center items-center gap-2 mb-4 bg-[#f8fafc] p-3 rounded-2xl border border-[#e2e8f0]">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setUserStars(star)}
                  className="p-1 transition-transform hover:scale-125 focus:outline-hidden"
                >
                  <span
                    className={`material-symbols-outlined text-[32px] ${
                      star <= userStars
                        ? 'text-[#f59e0b] fill-current'
                        : 'text-[#cbd5e1]'
                    }`}
                  >
                    star
                  </span>
                </button>
              ))}
            </div>

            {/* Comment Area */}
            <textarea
              value={userComment}
              onChange={(e) => setUserComment(e.target.value)}
              placeholder="دیدگاه شما (اختیاری)..."
              rows={3}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-3 text-[12px] text-[#0f172a] focus:outline-hidden focus:border-[#059669] mb-4"
            />

            {/* Submit Button */}
            <button
              onClick={handleSubmitRating}
              className="w-full py-3 bg-[#ea580c] hover:bg-[#c2410c] text-white font-black text-[13px] rounded-2xl shadow-xs transition-all active:scale-95"
            >
              ثبت نهایی امتیاز
            </button>
          </div>
        </div>
      )}

      {/* 7. Invoice Details Modal ("صورت‌حساب") */}
      {selectedInvoiceOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto border border-[#e2e8f0] shadow-2xl text-right animate-in zoom-in-95 duration-200">
            {/* Invoice Header */}
            <div className="flex justify-between items-start border-b border-[#e2e8f0] pb-3 mb-4">
              <div>
                <span className="text-[11px] font-bold text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-0.5 rounded-full">
                  صورت‌حساب رسمی B2B
                </span>
                <h2 className="text-[17px] font-black text-[#0f172a] mt-1">
                  فاکتور: {selectedInvoiceOrder.orderNumber}
                </h2>
                <span className="text-[11px] text-[#64748b]">
                  تاریخ صدور: {formatJalaliDateTime(selectedInvoiceOrder.date)}
                </span>
              </div>

              <button
                onClick={() => setSelectedInvoiceOrder(null)}
                className="w-8 h-8 rounded-full bg-[#f1f5f9] text-[#64748b] flex items-center justify-center hover:bg-[#e2e8f0]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Store & Buyer Info */}
            <div className="bg-[#f8fafc] p-3 rounded-2xl border border-[#e2e8f0] mb-4 text-[12px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#64748b]">فروشنده:</span>
                <span className="font-bold text-[#0f172a]">
                  {selectedInvoiceOrder.storeName || 'شرکت گروه صنعتی سیلانه سبز'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">خریدار:</span>
                <span className="font-bold text-[#0f172a]">داروخانه / فروشگاه مشتری</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">روش پرداخت:</span>
                <span className="font-bold text-[#059669]">
                  {selectedInvoiceOrder.paymentMethod}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-[#e2e8f0] rounded-2xl overflow-hidden mb-4">
              <div className="bg-[#f1f5f9] px-3 py-2 text-[11.5px] font-black text-[#334155] flex justify-between">
                <span>نام کالا</span>
                <span>مبلغ کل</span>
              </div>

              <div className="divide-y divide-[#f1f5f9]">
                {selectedInvoiceOrder.items.map((item, idx) => (
                  <div key={idx} className="p-3 text-[12px] flex justify-between items-center">
                    <div>
                      <p className="font-bold text-[#0f172a]">{item.productName}</p>
                      <p className="text-[11px] text-[#64748b] mt-0.5">
                        {toPersianDigits(item.quantity)} کارتن × {formatPrice(item.unitPrice)} تومان
                      </p>
                    </div>
                    <span className="font-black text-[#0f172a]">
                      {formatPrice(item.quantity * item.unitPrice)} تومان
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Summary Box */}
            <div className="bg-[#004532] text-white p-3.5 rounded-2xl mb-4 flex justify-between items-center">
              <span className="text-[13px] font-bold">مبلغ قابل پرداخت فاکتور:</span>
              <span className="text-[17px] font-black">
                {formatPrice(selectedInvoiceOrder.totalAmount)} تومان
              </span>
            </div>

            {/* PDF Action */}
            <button
              onClick={() =>
                alert(`فاکتور ${selectedInvoiceOrder.orderNumber} در قالب فایل PDF دانلود شد.`)
              }
              className="w-full py-3 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-black text-[12.5px] rounded-2xl border border-[#cbd5e1] flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>دانلود نسخه رسمی PDF فاکتور</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
