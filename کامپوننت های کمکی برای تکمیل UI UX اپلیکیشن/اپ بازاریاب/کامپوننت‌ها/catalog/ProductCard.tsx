import React from 'react';
import { Product } from '../../types';
import { useApp } from '../../context/AppContext';
import { toPersianDigits, formatToman } from '../../utils/persian';
import { Plus, Minus, Check, Sparkles, Tag, ShoppingCart } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { cart, addToCart, updateCartQuantity } = useApp();

  const cartItem = cart.find((item) => item.product.id === product.id);
  const quantityInCart = cartItem?.quantity || 0;

  const handleAddOne = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quantityInCart === 0) {
      addToCart(product, 1);
    } else {
      updateCartQuantity(product.id, quantityInCart + 1);
    }
  };

  const handleMinusOne = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quantityInCart > 0) {
      updateCartQuantity(product.id, quantityInCart - 1);
    }
  };

  return (
    <div
      id={`product-card-${product.id}`}
      className={`bg-white rounded-2xl p-3.5 border transition-all flex flex-col justify-between space-y-3 ${
        quantityInCart > 0
          ? 'border-emerald-500 ring-2 ring-emerald-500/10 shadow-md'
          : 'border-slate-200/80 shadow-xs hover:border-slate-300'
      }`}
    >
      {/* Top badges & Brand */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
          برند {product.brand}
        </span>

        <div className="flex items-center gap-1">
          {product.discount_percentage ? (
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 flex items-center gap-0.5">
              <Tag className="w-2.5 h-2.5" />
              {toPersianDigits(product.discount_percentage)}٪ تخفیف
            </span>
          ) : null}
          {product.is_new ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              جدید
            </span>
          ) : null}
        </div>
      </div>

      {/* Product Image & Details */}
      <div className="flex gap-3 items-start">
        {product.image_url ? (
          <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-100">
            <img
              src={product.image_url}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="w-6 h-6" />
          </div>
        )}

        <div className="flex-1 space-y-1">
          <h4 className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-2">
            {product.name}
          </h4>
          <p className="text-[10px] text-slate-500">
            کارتن {toPersianDigits(product.carton_quantity)} عددی • کد {product.code}
          </p>
        </div>
      </div>

      {/* Price & Carton Info */}
      <div className="pt-2 border-t border-slate-100 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">قیمت هر کارتن:</span>
          <span className="font-extrabold text-slate-900 text-xs">
            {formatToman(product.price)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>قیمت تکی محصول:</span>
          <span>{formatToman(product.unit_price)}</span>
        </div>
      </div>

      {/* Cart Stepper / Add Button */}
      <div className="pt-1">
        {quantityInCart > 0 ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-1">
            <button
              id={`btn-plus-product-${product.id}`}
              onClick={handleAddOne}
              className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-90 text-white flex items-center justify-center transition-transform"
            >
              <Plus className="w-4 h-4" />
            </button>

            <div className="text-center px-2">
              <span className="text-xs font-black text-emerald-900 block">
                {toPersianDigits(quantityInCart)} کارتن
              </span>
              <span className="text-[9px] text-emerald-700">
                ({toPersianDigits(quantityInCart * product.carton_quantity)} عدد)
              </span>
            </div>

            <button
              id={`btn-minus-product-${product.id}`}
              onClick={handleMinusOne}
              className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-100 active:scale-90 flex items-center justify-center transition-transform"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            id={`btn-add-to-cart-${product.id}`}
            onClick={handleAddOne}
            className="w-full py-2 bg-slate-900 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن به سبد سفارش</span>
          </button>
        )}
      </div>
    </div>
  );
};
