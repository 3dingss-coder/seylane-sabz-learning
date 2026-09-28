import React from 'react';
import { Product } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface ProductCardProps {
  product: Product;
  qty: number;
  onAddToCart: (product: Product, delta: number) => void;
  onSelectProduct: (product: Product) => void;
  className?: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  qty,
  onAddToCart,
  onSelectProduct,
  className = '',
}) => {
  return (
    <div
      className={`bg-white border border-[#e7ece9] shadow-[0_1px_2px_rgba(2,44,34,0.04),0_10px_24px_-16px_rgba(2,44,34,0.28)] hover:shadow-[0_2px_4px_rgba(2,44,34,0.06),0_16px_32px_-14px_rgba(0,108,74,0.28)] hover:border-[#006c4a]/40 hover:-translate-y-0.5 rounded-2xl p-3.5 flex flex-col justify-between relative text-right transition-all duration-300 ease-out group overflow-hidden ${className}`}
    >
      {/* Top Left '+' Button (Visible ONLY when qty === 0) */}
      {qty === 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product, 1);
          }}
          className="absolute top-2.5 left-2.5 z-10 w-8 h-8 rounded-xl bg-white border border-[#006c4a]/25 text-[#006c4a] hover:bg-gradient-to-br hover:from-[#059669] hover:to-[#006c4a] hover:text-white hover:border-transparent flex items-center justify-center transition-all duration-200 shadow-[0_2px_6px_rgba(2,44,34,0.1)] hover:shadow-[0_4px_12px_rgba(0,108,74,0.35)] active:scale-90"
          title="افزودن به سبد خرید"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
      )}

      {/* Clickable Image & Info */}
      <div onClick={() => onSelectProduct(product)} className="cursor-pointer flex flex-col">
        {/* Product Image */}
        <div className="aspect-square w-full flex items-center justify-center mb-2 p-1.5 bg-gradient-to-b from-[#f8fafc] to-[#f1f5f4] rounded-xl overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-auto object-contain mix-blend-multiply transition-transform duration-300 ease-out group-hover:scale-[1.07]"
          />
        </div>

        {/* Brand */}
        <span className="text-[10px] text-[#006c4a] font-black mb-0.5 tracking-tight">
          {product.brand}
        </span>

        {/* Product Name */}
        <h3 className="text-[#171c1f] text-[12px] font-bold line-clamp-2 min-h-[34px] leading-tight">
          {product.name}
        </h3>

        {/* Carton Capacity */}
        <div className="flex items-center gap-1 text-[#6f7973] text-[10px] mt-1.5">
          <span className="material-symbols-outlined text-[14px]">inventory_2</span>
          <span>{toPersianDigits(product.cartonCount)} عدد در کارتن</span>
        </div>
      </div>

      {/* Middle Stepper (Visible ONLY when qty > 0) */}
      <div className="mt-2.5 pt-2 border-t border-[#f1f5f9]">
        {qty > 0 ? (
          <div className="bg-gradient-to-b from-[#f4f9f7] to-[#eef4f1] border border-[#dce7e2] rounded-xl p-1 flex items-center justify-between mb-2 shadow-inner">
            <button
              onClick={() => onAddToCart(product, 1)}
              className="w-8 h-8 bg-gradient-to-br from-[#059669] to-[#006c4a] hover:brightness-110 text-white rounded-lg flex items-center justify-center font-black text-[16px] active:scale-90 transition-all duration-150 shadow-[0_2px_6px_rgba(0,108,74,0.35)]"
              title="افزودن تعداد"
            >
              +
            </button>
            <span className="text-[13px] font-black text-[#022c22] px-2">
              {toPersianDigits(qty)}
            </span>
            <button
              onClick={() => onAddToCart(product, -1)}
              className="w-8 h-8 bg-white hover:bg-[#fef2f2] text-[#ba1a1a] border border-[#e2e8f0] rounded-lg flex items-center justify-center font-black text-[16px] active:scale-90 transition-all duration-150 shadow-xs"
              title="کاهش تعداد"
            >
              -
            </button>
          </div>
        ) : (
          <div className="h-2" />
        )}

        {/* Pricing & Profit Grid */}
        <div className="flex items-start justify-between gap-1 pt-2 border-t border-[#f1f5f9] mt-1">
          {/* Right Column (RTL): Main Price (Top) and Consumer Price (Bottom - Directly underneath) */}
          <div className="flex flex-col text-right min-w-0 flex-1">
            {/* Main Wholesale Price */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-0.5 flex-wrap">
                <span className="text-[#022c22] font-black text-[13.5px] break-words">
                  {formatPrice(product.price)}
                </span>
                <span className="text-[9px] text-[#6f7973] font-bold">تومان</span>
              </div>
              <span className="text-[8.5px] text-[#6f7973] font-semibold">قیمت اصلی</span>
            </div>

            {/* Consumer Price (Directly underneath main price) */}
            {product.consumerPrice > 0 && (
              <div className="flex flex-col mt-1.5 pt-1 border-t border-dashed border-[#e2e8f0] min-w-0">
                <div className="flex items-baseline gap-0.5 flex-wrap">
                  <span className="text-[11px] font-extrabold text-[#334155] break-words">
                    {formatPrice(product.consumerPrice)}
                  </span>
                  <span className="text-[8.5px] text-[#6f7973]">تومان</span>
                </div>
                <span className="text-[8.5px] text-[#6f7973] font-semibold">قیمت مصرف‌کننده</span>
              </div>
            )}
          </div>

          {/* Left Column (RTL): Discount Badge (Top) and Profit (Bottom - Directly underneath) */}
          <div className="flex flex-col items-end text-left min-w-0 shrink-0">
            {/* Discount Badge */}
            {product.discountPercent > 0 ? (
              <span className="bg-gradient-to-l from-[#059669] to-[#10b981] text-white px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0 whitespace-nowrap shadow-[0_2px_5px_rgba(5,150,105,0.3)]">
                {toPersianDigits(product.discountPercent)}٪ تخفیف
              </span>
            ) : (
              <div className="h-4" />
            )}

            {/* Profit Amount (Directly underneath discount percentage) */}
            {product.consumerPrice > product.price && (
              <div className="flex flex-col items-end mt-1.5 pt-1 min-w-0">
                <div className="flex items-baseline gap-0.5 flex-wrap justify-end">
                  <span className="text-[10.5px] font-black text-[#059669] break-words">
                    {formatPrice(product.consumerPrice - product.price)}
                  </span>
                  <span className="text-[8.5px] text-[#059669] font-bold">تومان</span>
                </div>
                <span className="text-[8.5px] font-bold text-[#059669]">سود شما</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
