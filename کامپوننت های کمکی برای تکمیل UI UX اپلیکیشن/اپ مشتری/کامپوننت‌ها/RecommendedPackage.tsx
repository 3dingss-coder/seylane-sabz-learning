import React from 'react';
import { PackageBundle } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface RecommendedPackageProps {
  pkg: PackageBundle;
  onOpenPackageDetails: () => void;
  onAddPackageToCart: () => void;
}

export const RecommendedPackage: React.FC<RecommendedPackageProps> = ({
  pkg: RECOMMENDED_PACKAGE,
  onOpenPackageDetails,
  onAddPackageToCart,
}) => {
  return (
    <section className="mt-6 px-4">
      <div className="bg-gradient-to-br from-[#059669] via-[#10b981] to-[#34d399] rounded-2xl p-3.5 flex gap-3 flex-row-reverse shadow-lg border border-white/40 relative overflow-hidden">
        {/* Soft decorative glow circles for depth */}
        <div className="absolute -top-10 -right-10 w-36 h-36 bg-white/25 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-[#34d399]/40 rounded-full blur-xl pointer-events-none" />

        {/* Main Content Card (Right column in RTL view) */}
        <div className="flex-[3] bg-white/95 backdrop-blur-md rounded-2xl p-3.5 flex flex-col gap-2 relative shadow-sm border border-white/80 text-right">
          {/* Badge */}
          <div className="absolute top-2.5 left-2.5 bg-gradient-to-r from-[#f97316] to-[#ea580c] text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm border border-white/30 backdrop-blur-xs">
            {toPersianDigits(RECOMMENDED_PACKAGE.discountPercent)}٪ تخفیف
          </div>

          {/* Package Image */}
          <div className="w-full aspect-[4/3] mb-1 flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] border border-[#e2e8f0]">
            <img
              src={RECOMMENDED_PACKAGE.image}
              alt={RECOMMENDED_PACKAGE.title}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            />
          </div>

          {/* Title & Details */}
          <div className="flex flex-col gap-0.5">
            <h4 className="font-extrabold text-[14px] text-[#0f172a] leading-snug">
              {RECOMMENDED_PACKAGE.title}
            </h4>
            <span className="text-[#64748b] text-[11px] font-medium">
              {toPersianDigits(RECOMMENDED_PACKAGE.itemTypesCount)} نوع محصول
            </span>
          </div>

          {/* Pricing */}
          <div className="flex flex-col gap-1 my-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[#059669] font-black text-[15px]">
                {formatPrice(RECOMMENDED_PACKAGE.price)} تومان
              </span>
              <span className="text-[9px] text-[#6f7973] font-bold">قیمت محصول</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[#475569] font-bold text-[11px]">
                {formatPrice(RECOMMENDED_PACKAGE.consumerPrice)} تومان
              </span>
              <span className="text-[9px] text-[#64748b]">قیمت مصرف‌کننده</span>
            </div>
          </div>

          {/* Time Remaining */}
          <div className="flex items-center gap-1 text-[#b45309] text-[10px] font-bold bg-[#fefce8] px-2.5 py-1 rounded-lg w-fit border border-[#fef08a]">
            <span className="material-symbols-outlined text-[13px]">schedule</span>
            <span>زمان باقی‌مانده: {toPersianDigits(RECOMMENDED_PACKAGE.expiresInDays)} روز دیگر</span>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={onOpenPackageDetails}
              className="flex-1 py-2.5 bg-white/80 hover:bg-white backdrop-blur-md border border-[#cbd5e1] text-[#334155] rounded-xl font-extrabold text-[12px] shadow-2xs active:scale-95 transition-all text-center"
            >
              جزئیات
            </button>
            <button
              onClick={onAddPackageToCart}
              className="flex-1 py-2.5 bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#ea580c] hover:saturate-150 backdrop-blur-md text-white rounded-xl font-black text-[12px] shadow-md shadow-[#f97316]/30 border border-white/40 active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>
              <span>افزودن</span>
            </button>
          </div>
        </div>

        {/* Side Promo Column (Left column in RTL view) */}
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5 py-3 z-10">
          <div className="relative group cursor-pointer" onClick={onOpenPackageDetails}>
            <div className="absolute inset-0 bg-white/20 rounded-full blur-md group-hover:scale-110 transition-transform" />
            <img
              src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Package.png"
              alt="پکیج‌ها"
              className="w-20 h-20 object-contain drop-shadow-xl relative transition-transform group-hover:scale-110 duration-300"
            />
          </div>
          <div className="text-white font-black text-[15px] tracking-wide drop-shadow-md">پکیج‌ها</div>
          <button
            onClick={onOpenPackageDetails}
            className="mt-1 px-3.5 py-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 border border-white/40 backdrop-blur-lg rounded-full text-white font-black text-[10px] flex items-center gap-1 shadow-md shadow-black/5 transition-all active:scale-95"
          >
            <span>مشاهده همه</span>
            <span className="material-symbols-outlined text-[13px]">chevron_left</span>
          </button>
        </div>
      </div>
    </section>
  );
};
