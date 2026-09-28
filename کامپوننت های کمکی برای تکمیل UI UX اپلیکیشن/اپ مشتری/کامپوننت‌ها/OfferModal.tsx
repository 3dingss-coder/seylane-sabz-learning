import React from 'react';
import { OfferSlide } from './WeeklyOffer';
import { formatPrice } from '../utils/persian';

interface OfferModalProps {
  isOpen: boolean;
  offer: OfferSlide | null;
  onClose: () => void;
  onAddOfferItems: () => void;
}

export const OfferModal: React.FC<OfferModalProps> = ({ isOpen, offer, onClose, onAddOfferItems }) => {
  if (!isOpen || !offer) return null;
  const WEEKLY_OFFER = offer;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-[400px] shadow-2xl p-5 text-right relative">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-full bg-[#eaeef2] text-[#6f7973] hover:text-[#171c1f]"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>

        <div className="bg-gradient-to-l from-[#ecfdf5] to-[#f0fdf4] rounded-xl p-3 border border-[#059669]/20 mb-4 flex items-center gap-3">
          <img
            src={WEEKLY_OFFER.image}
            alt={WEEKLY_OFFER.title}
            className="w-16 h-16 object-contain rounded-lg bg-white p-1 border border-[#e2e8f0]"
          />
          <div className="flex flex-col">
            <h3 className="font-extrabold text-[16px] text-[#022c22]">
              {WEEKLY_OFFER.title} - {WEEKLY_OFFER.subTitle}
            </h3>
            <span className="text-[13px] font-black text-[#006c4a]">
              سود حاشیه فروش: {WEEKLY_OFFER.discountText}
            </span>
          </div>
        </div>

        <p className="text-[12px] text-[#3f4944] mb-4 leading-relaxed">
          با ثبت سفارش این هفته در سبد محصولات گلها، از تخفیف پله‌ای تا ۳۴٪ سود خالص خرده‌فروشی و ارسال رایگان فاکتور بهره‌مند شوید.
        </p>

        <div className="bg-[#f8fafc] rounded-xl p-3 mb-4 text-[12px] space-y-2 border border-[#e2e8f0]">
          {WEEKLY_OFFER.items.map((it, idx) => (
            <div key={idx} className="flex justify-between font-bold text-[#171c1f]">
              <span>• {it.productName} (تعداد {it.qty})</span>
              <span className="text-[#006c4a]">{formatPrice(it.unitPrice)} تومان</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            onAddOfferItems();
            onClose();
          }}
          className="w-full bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] hover:from-[#34d399] hover:to-[#059669] text-white py-3.5 rounded-xl font-extrabold text-[13px] active:scale-95 transition-all shadow-md shadow-[#059669]/25 border border-white/30 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">shopping_cart_checkout</span>
          افزودن محصولات آفر هفته به سبد خرید
        </button>
      </div>
    </div>
  );
};
