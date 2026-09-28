import React, { useState } from 'react';
import { Order, OrderStatus } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { X, CheckCircle, Store, User, Phone, MapPin, Calendar, FileText, Printer, Save, AlertCircle } from 'lucide-react';

interface OrderDetailModalProps {
  order: Order | null;
  onClose: () => void;
  onUpdateStatus: (orderId: number, status: OrderStatus, adminNote?: string) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ order, onClose, onUpdateStatus }) => {
  if (!order) return null;

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(order.status);
  const [adminNote, setAdminNote] = useState<string>(order.admin_note || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const statusOptions: OrderStatus[] = ['ثبت‌شده', 'تایید شده', 'در حال پردازش', 'ارسال شده', 'لغو شده'];

  const handleSave = () => {
    onUpdateStatus(order.id, selectedStatus, adminNote);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="printable-invoice bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Header */}
        <div className="bg-[#0F5338] text-white p-5 flex items-center justify-between border-b border-emerald-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center font-black text-emerald-300">
              #
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">جزئیات سفارش {order.order_code}</h2>
                <StatusBadge type="order" value={order.status} size="sm" />
              </div>
              <span className="text-xs text-emerald-200/80 block mt-0.5">تاریخ ثبت: {order.order_date}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="no-print p-1.5 rounded-lg bg-emerald-950/40 text-emerald-100 hover:text-white hover:bg-emerald-900/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Box */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                <Store className="w-4 h-4 text-[#006c4a]" />
                <span>اطلاعات خریدار و فروشگاه</span>
              </div>
              <div className="text-sm font-bold text-slate-800">{order.store_name}</div>
              <div className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>تحویل‌گیرنده: {order.customer_name}</span>
              </div>
            </div>

            {/* Marketer Box */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#006c4a]" />
                <span>بازاریاب مسئول سفارش</span>
              </div>
              <div className="text-sm font-bold text-slate-800">{order.marketer_name}</div>
              <div className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>ثبت‌شده از طریق اپلیکیشن بازاریابان</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              اقلام فاکتور سفارش ({order.items.length} کالا)
            </h3>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">نام کالا</th>
                    <th className="p-3 text-center">تعداد</th>
                    <th className="p-3 text-left">قیمت واحد (تومان)</th>
                    <th className="p-3 text-left">مجموع (تومان)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-800">{item.product_name}</td>
                      <td className="p-3 text-center font-bold text-[#006c4a] bg-emerald-50/50">{item.quantity} عدد</td>
                      <td className="p-3 text-left text-slate-700">{item.unit_price.toLocaleString('fa-IR')}</td>
                      <td className="p-3 text-left font-bold text-slate-800">{item.total_price.toLocaleString('fa-IR')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                  <tr>
                    <td colSpan={4} className="p-3 text-left text-slate-600">مبلغ اولیه فاکتور:</td>
                    <td className="p-3 text-left text-slate-800">{order.initial_amount.toLocaleString('fa-IR')} تومان</td>
                  </tr>
                  {order.discount > 0 && (
                    <tr className="text-rose-600">
                      <td colSpan={4} className="p-3 text-left">مجموع تخفیف‌های اعمال شده:</td>
                      <td className="p-3 text-left">- {order.discount.toLocaleString('fa-IR')} تومان</td>
                    </tr>
                  )}
                  <tr className="text-[#006c4a] text-sm bg-emerald-50/80">
                    <td colSpan={4} className="p-3 text-left font-extrabold">مبلغ قابل پرداخت نهایی:</td>
                    <td className="p-3 text-left font-black">{order.final_amount.toLocaleString('fa-IR')} تومان</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Marketer Note */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5">
              <div className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                <span>یادداشت بازاریاب:</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed italic">
                {order.marketer_note || 'توضیحات تکمیلی توسط بازاریاب ثبت نشده است.'}
              </p>
            </div>

            {/* Admin Note Edit */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <label className="text-xs font-bold text-slate-700 mb-1 block">
                یادداشت مدیریت سازمان (توضیحات انبار / مالی):
              </label>
              <textarea
                rows={2}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="یادداشت جهت پیگیری فاکتور یا کد مرسوله پستی..."
                className="w-full p-2 bg-white text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
              />
            </div>
          </div>

          {/* Status Change Controls */}
          <div className="no-print bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-4">
            <h4 className="text-xs font-bold text-[#0F5338] mb-3 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-[#006c4a]" />
              <span>تغییر وضعیت جریان کاری سفارش</span>
            </h4>

            <div className="flex flex-wrap items-center gap-2">
              {statusOptions.map((st, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedStatus(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    selectedStatus === st
                      ? 'bg-[#006c4a] text-white border-[#006c4a] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="no-print bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs"
          >
            <Printer className="w-4 h-4" />
            <span>چاپ فاکتور</span>
          </button>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-xs font-bold text-emerald-600 animate-in fade-in">
                ✓ با موفقیت بروزرسانی شد
              </span>
            )}

            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#006c4a] hover:bg-[#0F5338] rounded-lg transition-colors shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>ذخیره تغییرات</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
