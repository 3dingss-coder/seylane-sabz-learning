import React, { useEffect, useState } from 'react';
import { Product } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantityDelta: number) => void;
  currentCartQty: number;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  onClose,
  onAddToCart,
  currentCartQty,
}) => {
  const [cartonQty, setCartonQty] = useState(1);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  useEffect(() => {
    setCartonQty(1);
    setIsDescriptionExpanded(false);
  }, [product?.id]);

  if (!product) return null;

  const description = product.description?.trim();
  const isLongDescription = !!description && description.length > 90;

  const handleAdd = () => {
    onAddToCart(product, cartonQty);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl p-5 text-right relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-full bg-[#eaeef2] text-[#6f7973] hover:text-[#171c1f] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        {/* Brand & Stock badges */}
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-[#065f46]/10 text-[#065f46] text-[11px] font-extrabold px-2.5 py-1 rounded-full">
            برند {product.brand} ({product.brandEn})
          </span>
          <span className="bg-[#ecfdf5] text-[#059669] text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
            موجود در انبار ({toPersianDigits(product.stockCount)} عدد)
          </span>
        </div>

        {/* Product Image */}
        <div className="w-full aspect-square bg-[#f8fafc] rounded-xl p-4 flex items-center justify-center mb-4 border border-[#e2e8f0]">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-auto object-contain"
          />
        </div>

        {/* Name & Category */}
        <h3 className="text-[17px] font-black text-[#022c22] mb-1 leading-snug">
          {product.name}
        </h3>
        <p className="text-[12px] text-[#6f7973] mb-4">
          دسته‌بندی: <span className="font-bold text-[#171c1f]">{product.category}</span>
        </p>

        {/* Description */}
        {description && (
          <div className="mb-4">
            <h4 className="text-[13px] font-extrabold text-[#022c22] mb-1">توضیحات محصول</h4>
            <div className="bg-[#ffffff] p-2.5 rounded-lg border border-[#e2e8f0]">
              <p
                className={`text-[12px] text-[#3f4944] leading-relaxed whitespace-pre-line ${
                  isLongDescription && !isDescriptionExpanded ? 'line-clamp-2' : ''
                }`}
              >
                {description}
              </p>
              {isLongDescription && (
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                  className="mt-1.5 text-[11px] font-extrabold text-[#006c4a] hover:underline"
                >
                  {isDescriptionExpanded ? 'نمایش کمتر' : 'مشاهده بیشتر'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pricing Box */}
        <div className="bg-[#f6fafe] border border-[#e2e8f0] rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-[#6f7973]">قیمت عمده هر عدد:</span>
            <span className="text-[15px] font-black text-[#004532]">
              {formatPrice(product.price)} تومان
            </span>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-[#6f7973]">قیمت یک کارتن ({toPersianDigits(product.cartonCount)} تایی):</span>
            <span className="text-[14px] font-extrabold text-[#022c22]">
              {formatPrice(product.price * product.cartonCount)} تومان
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#e2e8f0]">
            <span className="text-[12px] text-[#6f7973]">قیمت مصوب مصرف‌کننده:</span>
            <span className="text-[13px] text-[#6f7973] line-through">
              {formatPrice(product.consumerPrice)} تومان
            </span>
          </div>
        </div>

        {/* Carton specs alert */}
        <div className="bg-[#f0f4f8] border border-[#bec9c2]/40 rounded-xl p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#006c4a]">package_2</span>
            <div className="flex flex-col text-right">
              <span className="text-[12px] font-bold text-[#171c1f]">بسته‌بندی عمده (کارتن)</span>
              <span className="text-[11px] text-[#6f7973]">
                هر کارتن شامل {toPersianDigits(product.cartonCount)} عدد می‌باشد.
              </span>
            </div>
          </div>
        </div>

        {/* Specs Table */}
        {product.specs && product.specs.length > 0 && (
          <div className="mb-5">
            <h4 className="text-[13px] font-extrabold text-[#022c22] mb-1.5">مشخصات فنی</h4>
            <div className="border border-[#e2e8f0] rounded-lg overflow-hidden divide-y divide-[#e2e8f0]">
              {product.specs.map((spec, i) => (
                <div key={i} className="flex justify-between px-3 py-2 text-[12px] bg-white">
                  <span className="text-[#6f7973]">{spec.label}</span>
                  <span className="font-bold text-[#171c1f]">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Carton Stepper & Add Button */}
        <div className="flex items-center gap-3 pt-3 border-t border-[#e2e8f0]">
          <div className="flex items-center bg-[#f0f4f8] rounded-xl p-1 border border-[#bec9c2]/40">
            <button
              onClick={() => setCartonQty(cartonQty + 1)}
              className="w-9 h-9 bg-[#004532] text-white rounded-lg flex items-center justify-center font-bold text-[16px] active:scale-95"
            >
              +
            </button>
            <span className="px-4 font-black text-[14px] text-[#004532]">
              {toPersianDigits(cartonQty)} کارتن
            </span>
            <button
              onClick={() => setCartonQty(Math.max(1, cartonQty - 1))}
              className="w-9 h-9 bg-white border border-[#e2e8f0] text-[#7e0021] rounded-lg flex items-center justify-center font-bold text-[16px] active:scale-95"
            >
              -
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="flex-1 bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] hover:from-[#34d399] hover:to-[#059669] text-white py-3 rounded-xl font-extrabold text-[13px] active:scale-95 transition-all shadow-md shadow-[#059669]/25 border border-white/30 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
            افزودن به سبد سفارش
          </button>
        </div>
      </div>
    </div>
  );
};
