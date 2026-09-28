import React from 'react';
import { formatPrice } from '../utils/persian';

interface PaymentSuccessViewProps {
  orderNumber: string;
  totalAmount: number;
  paymentMethodLabel: string;
  onViewOrders: () => void;
  onBackToHome: () => void;
}

export const PaymentSuccessView: React.FC<PaymentSuccessViewProps> = ({
  orderNumber,
  totalAmount,
  paymentMethodLabel,
  onViewOrders,
  onBackToHome,
}) => {
  return (
    <div className="fixed inset-0 z-[90] bg-[#f6fafe] flex flex-col items-center justify-center px-6 text-center animate-in fade-in duration-300">
      <div className="relative w-24 h-24 flex items-center justify-center mb-5">
        <div className="absolute inset-0 rounded-full bg-[#d1fae5] animate-ping opacity-40" />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#10b981] to-[#006c4a] flex items-center justify-center shadow-[0_10px_30px_rgba(0,108,74,0.35)]">
          <span className="material-symbols-outlined text-[46px] text-white">check</span>
        </div>
      </div>

      <h1 className="font-['Vazirmatn'] text-[18px] font-black text-[#171c1f] mb-1.5">
        سفارش شما با موفقیت ثبت شد
      </h1>
      <p className="text-[12.5px] text-[#6f7973] font-medium mb-6 leading-6">
        فاکتور برای شما صادر شد و تیم فروش سیلانه سبز به‌زودی سفارش را بررسی می‌کند.
      </p>

      <div className="w-full max-w-[320px] bg-white rounded-2xl border border-[#e2e8f0]/70 shadow-xs p-4 space-y-2.5 mb-8">
        <div className="flex justify-between text-[12px]">
          <span className="text-[#6f7973] font-bold">شماره سفارش</span>
          <span className="font-extrabold text-[#171c1f]">{orderNumber}</span>
        </div>
        <div className="flex justify-between text-[12px] pt-2.5 border-t border-[#f1f5f9]">
          <span className="text-[#6f7973] font-bold">روش پرداخت</span>
          <span className="font-extrabold text-[#171c1f]">{paymentMethodLabel}</span>
        </div>
        <div className="flex justify-between text-[12px] pt-2.5 border-t border-[#f1f5f9]">
          <span className="text-[#6f7973] font-bold">مبلغ فاکتور</span>
          <span className="font-extrabold text-[#006c4a]">{formatPrice(totalAmount)} تومان</span>
        </div>
      </div>

      <div className="w-full max-w-[320px] flex flex-col gap-2.5">
        <button
          onClick={onViewOrders}
          className="w-full py-3.5 rounded-2xl font-black text-[13px] bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] text-white active:scale-[0.98] transition-all shadow-lg"
        >
          مشاهده سفارشات
        </button>
        <button
          onClick={onBackToHome}
          className="w-full py-3.5 rounded-2xl font-extrabold text-[13px] bg-white border border-[#e2e8f0] text-[#525b56] active:scale-[0.98] transition-all"
        >
          بازگشت به فروشگاه
        </button>
      </div>
    </div>
  );
};
