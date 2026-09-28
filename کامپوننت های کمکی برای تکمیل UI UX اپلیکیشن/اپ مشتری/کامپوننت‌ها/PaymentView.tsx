import React, { useState } from 'react';
import { CartItem, UserProfileData } from '../types';
import { PaymentDetails } from '../api';
import { formatPrice, toPersianDigits } from '../utils/persian';
import { PersianCalendarPicker } from './PersianCalendarPicker';

export type PaymentMethodId = 'credit' | 'cheque' | 'cash';

interface PaymentViewProps {
  cartItems: CartItem[];
  profile: UserProfileData;
  onBack: () => void;
  onConfirm: (methodLabel: string, details: PaymentDetails | undefined) => void;
  isSubmitting: boolean;
}

const BANKS = [
  'ملی', 'ملت', 'صادرات', 'تجارت', 'سپه', 'پارسیان', 'پاسارگاد', 'اقتصاد نوین', 'سامان', 'کشاورزی',
];

const METHODS: { id: PaymentMethodId; label: string; icon: string; desc: string }[] = [
  { id: 'credit', label: 'کسر از اعتبار', icon: 'account_balance_wallet', desc: 'مبلغ از سقف اعتباری فروشگاه شما کسر می‌شود' },
  { id: 'cheque', label: 'پرداخت چک', icon: 'receipt_long', desc: 'ثبت اطلاعات چک صادرشده بابت این فاکتور' },
  { id: 'cash', label: 'پرداخت نقدی', icon: 'payments', desc: 'نقد در محل تحویل یا واریز/کارت‌به‌کارت' },
];

export const PaymentView: React.FC<PaymentViewProps> = ({
  cartItems,
  profile,
  onBack,
  onConfirm,
  isSubmitting,
}) => {
  const [selected, setSelected] = useState<PaymentMethodId | null>(null);

  // Cheque form state
  const [chequeBank, setChequeBank] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeAccountNumber, setChequeAccountNumber] = useState('');
  const [chequeDueDate, setChequeDueDate] = useState<[number, number, number] | null>(null);
  const [showChequeCalendar, setShowChequeCalendar] = useState(false);

  // Cash form state
  const [cashMode, setCashMode] = useState<'delivery' | 'transfer'>('delivery');
  const [transferReceiptNote, setTransferReceiptNote] = useState('');
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity * item.product.cartonCount,
    0
  );
  const itemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const availableCredit = Math.max(0, profile.creditLimit - profile.creditUsed);
  const creditIsEnough = profile.creditLimit > 0 ? availableCredit >= totalAmount : true;
  const creditKnown = profile.creditLimit > 0;

  const isChequeValid =
    chequeBank !== '' && chequeNumber.trim() !== '' && chequeAccountNumber.trim() !== '' && chequeDueDate !== null;
  const isCashValid = cashMode === 'delivery' || transferReceiptNote.trim() !== '' || receiptFileName !== null;

  const canConfirm =
    selected === 'credit'
      ? true
      : selected === 'cheque'
      ? isChequeValid
      : selected === 'cash'
      ? isCashValid
      : false;

  const jalaliDueDateLabel = chequeDueDate
    ? `${toPersianDigits(chequeDueDate[2])} ${
        ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][
          chequeDueDate[1]
        ]
      } ${toPersianDigits(chequeDueDate[0])}`
    : 'انتخاب تاریخ سررسید';

  const handleConfirm = () => {
    if (!selected || !canConfirm || isSubmitting) return;

    if (selected === 'credit') {
      onConfirm('اعتباری', undefined);
    } else if (selected === 'cheque') {
      onConfirm('چک', {
        chequeBank,
        chequeNumber,
        chequeAccountNumber,
        chequeDueDate: chequeDueDate
          ? `${chequeDueDate[0]}/${String(chequeDueDate[1]).padStart(2, '0')}/${String(chequeDueDate[2]).padStart(2, '0')}`
          : undefined,
      });
    } else if (selected === 'cash') {
      onConfirm(cashMode === 'delivery' ? 'نقدی (محل تحویل)' : 'نقدی (واریز بانکی)', {
        cashMode,
        transferReceiptNote: cashMode === 'transfer' ? transferReceiptNote : undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#f6fafe] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-[#e2e8f0] px-4 py-3.5 flex items-center gap-3">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="w-9 h-9 rounded-full bg-[#f1f5f9] flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[20px] text-[#171c1f]">arrow_forward</span>
        </button>
        <h1 className="font-['Vazirmatn'] text-[15px] font-extrabold text-[#171c1f]">پرداخت فاکتور سفارش</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4 pb-32">
        {/* Order summary */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0]/70 shadow-xs p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#6f7973] font-bold mb-1">
              {toPersianDigits(itemsCount)} قلم کالا
            </p>
            <p className="text-[13px] font-extrabold text-[#171c1f]">مبلغ قابل پرداخت</p>
          </div>
          <span className="text-[19px] font-black text-[#006c4a]">
            {formatPrice(totalAmount)} <span className="text-[11px] font-bold text-[#6f7973]">تومان</span>
          </span>
        </div>

        {/* Method selection */}
        <div className="space-y-3">
          <h2 className="text-[13px] font-extrabold text-[#171c1f] px-1">روش پرداخت را انتخاب کنید</h2>

          {METHODS.map((m) => {
            const isActive = selected === m.id;
            return (
              <div
                key={m.id}
                className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                  isActive ? 'border-[#006c4a] ring-2 ring-[#006c4a]/15' : 'border-[#e2e8f0]/70'
                }`}
              >
                <button
                  onClick={() => setSelected(isActive ? null : m.id)}
                  className="w-full flex items-center gap-3 p-4 text-right active:scale-[0.99] transition-transform"
                >
                  <div
                    className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${
                      isActive ? 'bg-[#006c4a] text-white' : 'bg-[#f1f5f9] text-[#525b56]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[22px]">{m.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-extrabold text-[#171c1f]">{m.label}</p>
                    <p className="text-[11px] text-[#6f7973] font-medium mt-0.5">{m.desc}</p>
                  </div>
                  <span
                    className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      isActive ? 'border-[#006c4a]' : 'border-[#cbd5e1]'
                    }`}
                  >
                    {isActive && <span className="w-2.5 h-2.5 rounded-full bg-[#006c4a]" />}
                  </span>
                </button>

                {/* Expanded content per method */}
                {isActive && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#f1f5f9] space-y-3">
                    {m.id === 'credit' && (
                      <div className="bg-[#f8fafc] rounded-xl p-3.5 space-y-2">
                        {creditKnown ? (
                          <>
                            <div className="flex justify-between text-[12px]">
                              <span className="text-[#6f7973] font-bold">اعتبار در دسترس شما</span>
                              <span className="font-extrabold text-[#171c1f]">
                                {formatPrice(availableCredit)} تومان
                              </span>
                            </div>
                            <div className="flex justify-between text-[12px]">
                              <span className="text-[#6f7973] font-bold">مانده پس از این سفارش</span>
                              <span
                                className={`font-extrabold ${
                                  creditIsEnough ? 'text-[#006c4a]' : 'text-[#dc2626]'
                                }`}
                              >
                                {formatPrice(Math.max(0, availableCredit - totalAmount))} تومان
                              </span>
                            </div>
                            {!creditIsEnough && (
                              <p className="text-[11px] text-[#dc2626] font-bold flex items-center gap-1 pt-1">
                                <span className="material-symbols-outlined text-[15px]">warning</span>
                                اعتبار فعلی کافی نیست — سفارش پس از تایید ادمین با اعتبار اضافه بررسی می‌شود.
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-[#6f7973] font-bold leading-6">
                            سقف اعتباری شما هنوز توسط کارشناس فروش تعیین نشده — این سفارش با «کسر از اعتبار» ثبت و
                            پس از هماهنگی نهایی می‌شود.
                          </p>
                        )}
                      </div>
                    )}

                    {m.id === 'cheque' && (
                      <div className="space-y-2.5">
                        <select
                          value={chequeBank}
                          onChange={(e) => setChequeBank(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-3 text-[12.5px] font-bold text-[#171c1f] focus:outline-none focus:border-[#006c4a]"
                        >
                          <option value="">بانک صادرکننده چک را انتخاب کنید</option>
                          {BANKS.map((b) => (
                            <option key={b} value={b}>
                              بانک {b}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="شماره چک"
                          value={chequeNumber}
                          onChange={(e) => setChequeNumber(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-3 text-[12.5px] font-bold text-[#171c1f] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#006c4a]"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="شماره حساب / شبا"
                          value={chequeAccountNumber}
                          onChange={(e) => setChequeAccountNumber(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-3 text-[12.5px] font-bold text-[#171c1f] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#006c4a]"
                        />

                        <button
                          onClick={() => setShowChequeCalendar((s) => !s)}
                          className="w-full flex items-center justify-between bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-3 text-[12.5px] font-bold"
                        >
                          <span className={chequeDueDate ? 'text-[#171c1f]' : 'text-[#94a3b8]'}>
                            {jalaliDueDateLabel}
                          </span>
                          <span className="material-symbols-outlined text-[18px] text-[#006c4a]">
                            calendar_month
                          </span>
                        </button>
                        {showChequeCalendar && (
                          <div className="bg-[#f8fafc] rounded-xl p-2 border border-[#e2e8f0]">
                            <PersianCalendarPicker
                              value={chequeDueDate}
                              onChange={(d) => {
                                setChequeDueDate(d);
                                setShowChequeCalendar(false);
                              }}
                              disablePast
                            />
                          </div>
                        )}

                        <label className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-[#cbd5e1] rounded-xl px-3.5 py-3 text-[12px] font-bold text-[#6f7973] cursor-pointer">
                          <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                          {receiptFileName ? receiptFileName : 'افزودن عکس چک (اختیاری)'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setReceiptFileName(e.target.files?.[0]?.name || null)}
                          />
                        </label>
                      </div>
                    )}

                    {m.id === 'cash' && (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setCashMode('delivery')}
                            className={`py-2.5 rounded-xl text-[12px] font-extrabold border transition-all ${
                              cashMode === 'delivery'
                                ? 'bg-[#006c4a] text-white border-[#006c4a]'
                                : 'bg-[#f8fafc] text-[#525b56] border-[#e2e8f0]'
                            }`}
                          >
                            نقد هنگام تحویل
                          </button>
                          <button
                            onClick={() => setCashMode('transfer')}
                            className={`py-2.5 rounded-xl text-[12px] font-extrabold border transition-all ${
                              cashMode === 'transfer'
                                ? 'bg-[#006c4a] text-white border-[#006c4a]'
                                : 'bg-[#f8fafc] text-[#525b56] border-[#e2e8f0]'
                            }`}
                          >
                            واریز / کارت‌به‌کارت
                          </button>
                        </div>

                        {cashMode === 'delivery' ? (
                          <p className="text-[11px] text-[#6f7973] font-bold bg-[#f8fafc] rounded-xl p-3 leading-6">
                            مبلغ فاکتور نقداً از راننده هنگام تحویل کالا دریافت می‌شود.
                          </p>
                        ) : (
                          <>
                            <div className="bg-[#f8fafc] rounded-xl p-3 text-[11.5px] text-[#171c1f] font-bold leading-7">
                              شماره کارت: <bdi dir="ltr">6274-1211-XXXX-XXXX</bdi>
                              <br />
                              به نام: شرکت سیلانه سبز
                            </div>
                            <input
                              type="text"
                              placeholder="کد پیگیری واریز / ۴ رقم آخر کارت مبدا"
                              value={transferReceiptNote}
                              onChange={(e) => setTransferReceiptNote(e.target.value)}
                              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-3 text-[12.5px] font-bold text-[#171c1f] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#006c4a]"
                            />
                            <label className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-[#cbd5e1] rounded-xl px-3.5 py-3 text-[12px] font-bold text-[#6f7973] cursor-pointer">
                              <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                              {receiptFileName ? receiptFileName : 'افزودن عکس فیش واریزی'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => setReceiptFileName(e.target.files?.[0]?.name || null)}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10.5px] text-[#94a3b8] font-medium text-center px-4 leading-5">
          این نسخهٔ نمونهٔ صفحهٔ پرداخت است و فعلاً به درگاه بانکی واقعی وصل نیست؛ اطلاعات وارد شده صرفاً برای ثبت
          سفارش ذخیره می‌شود.
        </p>
      </div>

      {/* Sticky bottom confirm button */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[448px] bg-white/95 backdrop-blur-xl border-t border-[#e2e8f0] px-4 pt-3 z-20"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || isSubmitting}
          className={`w-full py-3.5 rounded-2xl font-black text-[14px] transition-all flex items-center justify-center gap-2 shadow-lg ${
            canConfirm && !isSubmitting
              ? 'bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] text-white active:scale-[0.98]'
              : 'bg-[#cbd5e1] text-[#94a3b8] cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              در حال ثبت سفارش...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">lock</span>
              تایید و پرداخت {formatPrice(totalAmount)} تومان
            </>
          )}
        </button>
      </div>
    </div>
  );
};
