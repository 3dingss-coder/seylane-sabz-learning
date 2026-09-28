import React from 'react';
import { PackageBundle } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface PackageModalProps {
  packageBundle: PackageBundle | null;
  onClose: () => void;
  onAddPackageToCart: () => void;
}

export const PackageModal: React.FC<PackageModalProps> = ({
  packageBundle,
  onClose,
  onAddPackageToCart,
}) => {
  if (!packageBundle) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl p-5 text-right relative">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-full bg-[#eaeef2] text-[#6f7973] hover:text-[#171c1f] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex items-center gap-2 mb-2">
          <span className="bg-[#f97316] text-white text-[11px] font-black px-2.5 py-1 rounded-full">
            ویژه پخش عمده ({toPersianDigits(packageBundle.discountPercent)}٪ تخفیف)
          </span>
          <span className="bg-[#b45309]/10 text-[#b45309] text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {toPersianDigits(packageBundle.expiresInDays)} روز باقی‌مانده
          </span>
        </div>

        <h3 className="text-[18px] font-black text-[#022c22] mb-3">
          {packageBundle.title}
        </h3>

        <div className="w-full aspect-video rounded-xl overflow-hidden mb-4 border border-[#e2e8f0]">
          <img
            src={packageBundle.image}
            alt={packageBundle.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Included items list */}
        <div className="mb-4">
          <h4 className="text-[13px] font-extrabold text-[#022c22] mb-2">محتویات پکیج:</h4>
          <div className="flex flex-col gap-2">
            {packageBundle.items.map((item, idx) => (
              <div
                key={idx}
                className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-2.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#006c4a] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {toPersianDigits(idx + 1)}
                  </span>
                  <span className="text-[12px] font-bold text-[#171c1f]">
                    {item.productName}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#006c4a] bg-[#82f5c1]/20 px-2 py-0.5 rounded-md shrink-0">
                  {toPersianDigits(item.qty)} عدد
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial summary */}
        <div className="bg-[#0F5338]/5 border border-[#006c4a]/30 rounded-xl p-3 mb-4 text-right">
          <div className="flex justify-between items-center mb-1 text-[12px] text-[#6f7973]">
            <span>قیمت مصوب مصرف‌کننده:</span>
            <span className="line-through">{formatPrice(packageBundle.consumerPrice)} تومان</span>
          </div>
          <div className="flex justify-between items-center text-[15px] font-black text-[#004532]">
            <span>قیمت خالص پکیج B2B:</span>
            <span className="text-[17px] text-[#006c4a]">{formatPrice(packageBundle.price)} تومان</span>
          </div>
          <div className="text-[11px] text-[#059669] font-bold mt-1 text-left">
            میزان سود شما از این پکیج: {formatPrice(packageBundle.consumerPrice - packageBundle.price)} تومان
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => {
            onAddPackageToCart();
            onClose();
          }}
          className="w-full bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] hover:from-[#34d399] hover:to-[#059669] text-white py-3.5 rounded-xl font-extrabold text-[14px] active:scale-95 transition-all shadow-md shadow-[#059669]/25 border border-white/30 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">add_shopping_cart</span>
          ثبت و افزودن پکیج به سبد خرید
        </button>
      </div>
    </div>
  );
};
