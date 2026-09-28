import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getBusinessTypeLabel, toPersianDigits } from '../../utils/persian';
import {
  X,
  Smartphone,
  Store,
  Send,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

export const CustomerSimulatorModal: React.FC = () => {
  const {
    isSimulatorOpen,
    setIsSimulatorOpen,
    customers,
    simulateIncomingOrder,
    setActiveTab,
    setOrderStatusFilter,
  } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);
  const [isSimulating, setIsSimulating] = useState(false);

  if (!isSimulatorOpen) return null;

  const handleSimulate = () => {
    setIsSimulating(true);
    setTimeout(() => {
      simulateIncomingOrder(selectedCustomerId);
      setIsSimulating(false);
      setIsSimulatorOpen(false);
      setOrderStatusFilter('pending');
      setActiveTab('orders');
    }, 600);
  };

  return (
    <div
      id="simulator-modal-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="simulator-modal-card"
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-emerald-700 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">شبیه‌ساز رفتار مشتری (اپ مشتریان)</h3>
              <p className="text-[11px] text-emerald-100">تست جریان یکپارچه سفارش‌دهی داروخانه‌ها</p>
            </div>
          </div>

          <button
            id="btn-close-simulator"
            onClick={() => setIsSimulatorOpen(false)}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-700 space-y-2">
            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              سناریوی تست سیستم:
            </div>
            <p className="leading-relaxed text-[11px] text-slate-600">
              با فشردن دکمه زیر، یک سفارش عمده واقعی از طرف یکی از داروخانه‌ها یا فروشگاه‌های شما ثبت می‌شود. بلافاصله نوتیفیکیشن سفارش جدید دریافت شده و سفارش در تب «در انتظار بررسی» جهت تایید شما قرار می‌گیرد.
            </p>
          </div>

          {/* Customer Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              مشتری ثبت‌کننده سفارش:
            </label>
            <select
              id="select-simulator-customer"
              value={selectedCustomerId || ''}
              onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="">-- تصادفی (یکی از داروخانه‌های منطقه) --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.store_name} ({c.first_name} {c.last_name} - {getBusinessTypeLabel(c.business_type)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          <button
            id="btn-cancel-simulator"
            onClick={() => setIsSimulatorOpen(false)}
            className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            بستن
          </button>
          <button
            id="btn-trigger-simulation"
            disabled={isSimulating}
            onClick={handleSimulate}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>{isSimulating ? 'در حال ثبت در اپ مشتریان...' : 'شبیه‌سازی و ارسال سفارش فوری'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
