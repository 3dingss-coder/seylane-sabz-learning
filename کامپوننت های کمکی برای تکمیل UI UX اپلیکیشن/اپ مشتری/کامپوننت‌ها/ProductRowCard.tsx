import React from 'react';
import { Product } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface ProductRowCardProps {
  product: Product;
  qty: number;
  onAddToCart: (product: Product, delta: number) => void;
  onSelectProduct: (product: Product) => void;
}

export const ProductRowCard: React.FC<ProductRowCardProps> = ({
  product,
  qty,
  onAddToCart,
  onSelectProduct,
}) => {
  return (
    <div className="bg-white border border-[#eef2f0] hover:border-[#059669]/40 rounded-2xl p-3 flex items-center justify-between gap-3 relative shadow-[0_1px_2px_rgba(2,44,34,0.04),0_8px_20px_-14px_rgba(2,44,34,0.22)] hover:shadow-[0_2px_4px_rgba(2,44,34,0.06),0_14px_28px_-12px_rgba(0,108,74,0.26)] transition-all duration-300 ease-out text-right group overflow-hidden">
      {/* Right Side: Product Image & Floating Add Button (RTL Layout) */}
      <div className="relative w-[105px] h-[105px] bg-gradient-to-b from-[#f8fafc] to-[#f0f5f2] rounded-xl p-1.5 flex items-center justify-center shrink-0 border border-[#f1f5f9] overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          onClick={() => onSelectProduct(product)}
          className="h-full w-auto object-contain mix-blend-multiply cursor-pointer transition-transform duration-300 ease-out group-hover:scale-[1.07]"
        />

        {/* Floating Add '+' button or Stepper on Image Bottom-Left */}
        {qty === 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(product, 1);
            }}
            className="absolute bottom-1.5 left-1.5 w-8 h-8 rounded-xl bg-white border border-[#006c4a]/25 text-[#006c4a] hover:bg-gradient-to-br hover:from-[#059669] hover:to-[#006c4a] hover:text-white hover:border-transparent flex items-center justify-center shadow-[0_2px_6px_rgba(2,44,34,0.12)] hover:shadow-[0_4px_12px_rgba(0,108,74,0.35)] active:scale-90 transition-all duration-200 z-10"
            title="افزودن به سبد خرید"
            aria-label="افزودن"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">add</span>
          </button>
        ) : (
          <div className="absolute bottom-1 left-1 right-1 bg-white/95 backdrop-blur-md border border-[#059669]/40 rounded-lg p-0.5 flex items-center justify-between shadow-[0_2px_8px_rgba(2,44,34,0.15)] z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(product, 1);
              }}
              className="w-6 h-6 bg-gradient-to-br from-[#059669] to-[#006c4a] text-white rounded-md flex items-center justify-center font-bold text-[14px] active:scale-90 transition-all duration-150"
            >
              +
            </button>
            <span className="text-[11px] font-black text-[#0f172a] px-1">
              {toPersianDigits(qty)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(product, -1);
              }}
              className="w-6 h-6 bg-white text-[#ba1a1a] border border-[#e2e8f0] rounded-md flex items-center justify-center font-bold text-[14px] active:scale-90 transition-all duration-150"
            >
              -
            </button>
          </div>
        )}
      </div>

      {/* Left Side: Info, Details & Price */}
      <div className="flex-1 flex flex-col justify-between h-full py-0.5 pr-1">
        {/* Title & Brand */}
        <div onClick={() => onSelectProduct(product)} className="cursor-pointer">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[10px] font-black text-[#006c4a] bg-[#ecfdf5] px-2 py-0.5 rounded-md border border-[#a7f3d0]/70">
              {product.brand}
            </span>
            {product.subCategory && (
              <span className="text-[9px] font-bold text-[#64748b]">
                {product.subCategory}
              </span>
            )}
          </div>

          <h3 className="font-['Vazirmatn'] text-[13px] font-extrabold text-[#0f172a] leading-snug line-clamp-2">
            {product.name}
          </h3>

          {/* Carton Count Badge */}
          <div className="flex items-center gap-1 text-[#64748b] text-[10.5px] font-semibold mt-1">
            <span className="material-symbols-outlined text-[13px] text-[#059669]">inventory_2</span>
            <span>{toPersianDigits(product.cartonCount)} عدد در کارتن</span>
          </div>
        </div>

        {/* Pricing & Profit Grid */}
        <div className="mt-2 pt-1.5 border-t border-[#f1f5f9]">
          <div className="flex items-start justify-between gap-2">
            {/* Right Column (RTL): Main Price (Top) and Consumer Price (Bottom - Directly Underneath) */}
            <div className="flex flex-col text-right min-w-0 flex-1">
              {/* Main Wholesale Price */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-baseline gap-1 flex-wrap">
                  <span className="text-[#0f172a] font-black text-[14px] break-words">
                    {formatPrice(product.price)}
                  </span>
                  <span className="text-[9.5px] text-[#64748b] font-bold">تومان</span>
                </div>
                <span className="text-[8.5px] text-[#64748b] font-semibold">قیمت اصلی</span>
              </div>

              {/* Consumer Price (Directly underneath main price) */}
              {product.consumerPrice > 0 && (
                <div className="flex flex-col mt-1 pt-0.5 border-t border-dashed border-[#e2e8f0]/80 min-w-0">
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="text-[11px] font-bold text-[#334155] break-words">
                      {formatPrice(product.consumerPrice)}
                    </span>
                    <span className="text-[9px] text-[#64748b]">تومان</span>
                  </div>
                  <span className="text-[8.5px] text-[#64748b] font-semibold">قیمت مصرف‌کننده</span>
                </div>
              )}
            </div>

            {/* Left Column (RTL): Discount Badge (Top) and Profit (Bottom - Directly Underneath) */}
            <div className="flex flex-col items-end text-left min-w-0 shrink-0">
              {/* Top: Discount Badge */}
              {product.discountPercent > 0 ? (
                <span className="bg-gradient-to-l from-[#059669] to-[#10b981] text-white px-2 py-0.5 rounded-md text-[10.5px] font-black shadow-[0_2px_5px_rgba(5,150,105,0.3)] whitespace-nowrap">
                  {toPersianDigits(product.discountPercent)}٪ تخفیف
                </span>
              ) : (
                <div className="h-4" />
              )}

              {/* Bottom: Profit Amount (Directly underneath discount) */}
              {product.consumerPrice > product.price && (
                <div className="flex flex-col items-end mt-1 pt-0.5 min-w-0">
                  <div className="flex items-baseline gap-0.5 flex-wrap justify-end">
                    <span className="text-[11px] font-black text-[#059669] break-words">
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
    </div>
  );
};
