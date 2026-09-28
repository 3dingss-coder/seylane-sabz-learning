import React from 'react';
import { CartItem } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
}

const MIN_ORDER_THRESHOLD = 3000000; // 3 Million Tomans minimum B2B order

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCheckout,
}) => {
  if (!isOpen) return null;

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity * item.product.cartonCount,
    0
  );

  const totalConsumerAmount = cartItems.reduce(
    (sum, item) => sum + item.product.consumerPrice * item.quantity * item.product.cartonCount,
    0
  );

  const totalProfit = Math.max(0, totalConsumerAmount - totalAmount);
  const totalItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const progressPercent = Math.min(100, Math.round((totalAmount / MIN_ORDER_THRESHOLD) * 100));
  const isMinOrderReached = totalAmount >= MIN_ORDER_THRESHOLD;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-[448px] h-full flex flex-col shadow-2xl text-right relative">
        {/* Header */}
        <div
          className="bg-[#f6fafe] border-b border-[#e2e8f0] px-4 pb-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004532] text-[24px]">
              shopping_bag
            </span>
            <div className="flex flex-col">
              <span className="font-extrabold text-[16px] text-[#022c22]">
                سبد سفارشات عمده
              </span>
              <span className="text-[11px] text-[#6f7973]">
                {toPersianDigits(totalItemsCount)} کارتن در سبد
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#dfe3e7] text-[#6f7973] transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Minimum B2B Order Progress Bar */}
        <div className="bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] p-3.5 border-b border-[#e2e8f0]">
          <div className="flex justify-between items-center text-[11px] mb-2 font-black">
            <span className="text-[#334155] flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-[#059669]">verified</span>
              حد نصاب حداقل سفارش عمده (سقف فاکتور)
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              isMinOrderReached 
                ? 'bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]' 
                : 'bg-[#fffbe2] text-[#b45309] border border-[#fde68a]'
            }`}>
              {isMinOrderReached
                ? 'حد نصاب تکمیل شد!'
                : `${toPersianDigits(progressPercent)}٪ تکمیل شده`}
            </span>
          </div>

          {/* Curved glowing progress bar */}
          <div className="relative w-full bg-[#cbd5e1]/70 h-3.5 rounded-full p-0.5 shadow-inner my-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#34d399] via-[#10b981] to-[#059669] transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.7)] relative flex items-center justify-end"
              style={{ width: `${Math.max(progressPercent, 2)}%` }}
            >
              {/* Glowing circle at the end of progress line when incomplete */}
              {progressPercent > 0 && progressPercent < 100 && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_10px_rgba(16,185,129,1)] border-2 border-[#10b981] flex items-center justify-center animate-pulse z-10">
                  <div className="w-1.5 h-1.5 bg-[#059669] rounded-full" />
                </div>
              )}
            </div>
          </div>

          {!isMinOrderReached && (
            <div className="text-[10px] font-bold text-[#64748b] mt-1.5 flex justify-between items-center">
              <span>کمبود تا حداقل فاکتور:</span>
              <span className="text-[#dc2626] font-black text-[11px]">
                {formatPrice(MIN_ORDER_THRESHOLD - totalAmount)} تومان
              </span>
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 divide-y divide-[#f1f5f9]">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-[#6f7973]">
              <span className="material-symbols-outlined text-[56px] text-[#bec9c2] mb-2">
                remove_shopping_cart
              </span>
              <span className="text-[14px] font-bold text-[#171c1f]">سبد سفارش شما خالی است</span>
              <span className="text-[12px] text-[#6f7973] mt-1 text-center">
                می‌توانید از بخش محصولات کالاها را به سبد سفارش خود اضافه کنید.
              </span>
            </div>
          ) : (
            cartItems.map((item) => {
              const itemTotal = item.product.price * item.quantity * item.product.cartonCount;
              return (
                <div key={item.product.id} className="py-3 flex gap-3 items-center">
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-16 h-16 object-contain rounded-lg border border-[#e2e8f0] p-1 bg-[#f8fafc] shrink-0"
                  />
                  <div className="flex-1 flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-[#171c1f] leading-snug">
                      {item.product.name}
                    </span>
                    <span className="text-[10px] text-[#6f7973]">
                      بسته {toPersianDigits(item.product.cartonCount)} تایی | فی هر عدد:{' '}
                      {formatPrice(item.product.price)} تومان
                    </span>
                    <div className="flex items-center justify-between mt-2 gap-1.5">
                      <span className="text-[13px] font-black text-[#004532] break-words min-w-0">
                        {formatPrice(itemTotal)} تومان
                      </span>

                      {/* Qty controller */}
                      <div className="flex items-center gap-1.5 bg-[#f0f4f8] rounded-lg p-1 shrink-0">
                        <button
                          onClick={() => onUpdateQty(item.product.id, 1)}
                          className="w-6 h-6 bg-[#004532] text-white rounded flex items-center justify-center font-bold text-[14px]"
                        >
                          +
                        </button>
                        <span className="text-[11px] font-bold px-1 text-[#004532]">
                          {toPersianDigits(item.quantity)} کارتن
                        </span>
                        <button
                          onClick={() => onUpdateQty(item.product.id, -1)}
                          className="w-6 h-6 bg-white text-[#7e0021] border border-[#e2e8f0] rounded flex items-center justify-center font-bold text-[14px]"
                        >
                          -
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveItem(item.product.id)}
                    className="p-1 text-[#bec9c2] hover:text-[#ba1a1a] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer & Invoice Breakdown */}
        {cartItems.length > 0 && (
          <div
            className="bg-[#f6fafe] border-t border-[#e2e8f0] p-4 flex flex-col gap-2"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex justify-between items-center text-[12px] text-[#6f7973]">
              <span>مبلغ کل محصولات (B2B):</span>
              <span className="font-bold text-[#171c1f]">{formatPrice(totalAmount)} تومان</span>
            </div>
            {totalProfit > 0 && (
              <div className="flex justify-between items-center text-[12px] text-[#059669]">
                <span>سود پیش‌بینی شده خرده‌فروشی شما:</span>
                <span className="font-bold">{formatPrice(totalProfit)} تومان</span>
              </div>
            )}
            <div className="flex justify-between items-center text-[15px] font-black text-[#022c22] pt-2 border-t border-[#e2e8f0]">
              <span>مبلغ نهایی فاکتور:</span>
              <span className="text-[#004532] text-[17px]">{formatPrice(totalAmount)} تومان</span>
            </div>

            <div className="flex gap-2.5 mt-2.5">
              <button
                onClick={onClearCart}
                className="py-3.5 px-4 border border-[#cbd5e1] bg-white/80 hover:bg-white text-[#64748b] hover:text-[#1e293b] rounded-2xl text-[12px] font-extrabold transition-all active:scale-95"
              >
                پاکسازی
              </button>
              <button
                disabled={!isMinOrderReached}
                onClick={onCheckout}
                className={`flex-1 py-3.5 rounded-2xl font-black text-[14px] transition-all flex items-center justify-center gap-2 shadow-lg backdrop-blur-md ${
                  isMinOrderReached
                    ? 'bg-gradient-to-r from-[#10b981] via-[#059669] to-[#047857] hover:from-[#34d399] hover:to-[#059669] text-white active:scale-[0.98] shadow-[#059669]/30 border border-white/40 ring-2 ring-[#059669]/20'
                    : 'bg-[#cbd5e1] text-[#94a3b8] cursor-not-allowed border border-[#e2e8f0]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] drop-shadow-xs">check_circle</span>
                <span>تایید و ارسال فاکتور سفارش</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
