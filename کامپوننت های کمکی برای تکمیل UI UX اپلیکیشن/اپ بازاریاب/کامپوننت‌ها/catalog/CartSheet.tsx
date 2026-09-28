import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { toPersianDigits, formatToman, getBusinessTypeLabel } from '../../utils/persian';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  Store,
  Check,
  FileText,
  Percent,
} from 'lucide-react';

export const CartSheet: React.FC = () => {
  const {
    isCartOpen,
    setIsCartOpen,
    cart,
    customers,
    selectedCustomerIdForOrder,
    setSelectedCustomerIdForOrder,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    cartTotalAmount,
    cartTotalCartons,
    placeNewOrder,
  } = useApp();

  const [customerNote, setCustomerNote] = useState('');
  const [marketerNote, setMarketerNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCartOpen) return null;

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerIdForOrder);
  const discountAmount = Math.round(cartTotalAmount * 0.05);
  const finalAmount = cartTotalAmount - discountAmount;

  const handleSubmit = async () => {
    if (!selectedCustomerIdForOrder) {
      alert('لطفاً مشتری مورد نظر را انتخاب نمایید.');
      return;
    }

    setIsSubmitting(true);
    const order = await placeNewOrder(customerNote, marketerNote);
    setIsSubmitting(false);

    if (order) {
      setIsCartOpen(false);
      setCustomerNote('');
      setMarketerNote('');
    }
  };

  return (
    <div
      id="cart-sheet-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="cart-sheet-content"
        className="bg-white w-full max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">سبد سفارش عمده</h3>
              <p className="text-[11px] text-slate-500">
                {toPersianDigits(cartTotalCartons)} کارتن اقلام انتخاب شده
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {cart.length > 0 && (
              <button
                id="btn-clear-cart"
                onClick={clearCart}
                title="خالی کردن سبد"
                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors text-xs font-bold"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              id="btn-close-cart"
              onClick={() => setIsCartOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Target Customer Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              سفارش برای مشتری / داروخانه:
            </label>
            <select
              id="select-cart-customer"
              value={selectedCustomerIdForOrder || ''}
              onChange={(e) => setSelectedCustomerIdForOrder(e.target.value ? Number(e.target.value) : null)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="">-- انتخاب مشتری از لیست --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.store_name} ({c.first_name} {c.last_name} - {getBusinessTypeLabel(c.business_type)})
                </option>
              ))}
            </select>
          </div>

          {selectedCustomer && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3 text-xs space-y-1">
              <div className="font-extrabold text-emerald-900">{selectedCustomer.store_name}</div>
              <div className="text-[11px] text-emerald-700">{selectedCustomer.address}</div>
            </div>
          )}

          {/* Cart items */}
          {cart.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-600">سبد سفارش شما در حال حاضر خالی است.</p>
              <p className="text-[11px] text-slate-400">از تب کاتالوگ، کالاهای مورد نیاز را اضافه کنید.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <h4 className="text-xs font-extrabold text-slate-800">اقلام سفارش</h4>
              {cart.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {product.brand}
                      </span>
                      <h5 className="text-xs font-bold text-slate-900 mt-1 line-clamp-1">
                        {product.name}
                      </h5>
                    </div>
                    <button
                      id={`btn-remove-cart-item-${product.id}`}
                      onClick={() => removeFromCart(product.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs font-extrabold text-slate-900">
                      {formatToman(product.price * quantity)}
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                      <button
                        id={`btn-cart-inc-${product.id}`}
                        onClick={() => updateCartQuantity(product.id, quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center active:scale-90"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-extrabold text-slate-800 px-1 min-w-[20px] text-center">
                        {toPersianDigits(quantity)}
                      </span>
                      <button
                        id={`btn-cart-dec-${product.id}`}
                        onClick={() => updateCartQuantity(product.id, quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center active:scale-90"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {cart.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  یادداشت مشتری (اختیاری):
                </label>
                <input
                  id="input-cart-customer-note"
                  type="text"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="مثال: تحویل قبل از ساعت ۱۲ ظهر، فاکتور رسمی..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  یادداشت بازاریاب به انبار:
                </label>
                <input
                  id="input-cart-marketer-note"
                  type="text"
                  value={marketerNote}
                  onChange={(e) => setMarketerNote(e.target.value)}
                  placeholder="مثال: سفارش حضوری ویزیت شد، اولویت پخش عادی..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* Financial summary */}
          {cart.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>جمع کل اقلام:</span>
                <span className="font-bold">{formatToman(cartTotalAmount)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span className="flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  تخفیف ویژه پخش ۵٪:
                </span>
                <span className="font-extrabold">- {formatToman(discountAmount)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-slate-900 font-extrabold text-sm">
                <span>مبلغ نهایی قابل پرداخت:</span>
                <span className="text-emerald-700 font-black">{formatToman(finalAmount)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
            <button
              id="btn-submit-final-order"
              disabled={isSubmitting || !selectedCustomerIdForOrder}
              onClick={handleSubmit}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ثبت در سامانه...' : 'ثبت نهایی سفارش و ارسال به انبار'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
