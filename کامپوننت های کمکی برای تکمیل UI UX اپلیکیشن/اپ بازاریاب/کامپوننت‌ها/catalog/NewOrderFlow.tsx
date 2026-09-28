import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { getBusinessTypeLabel, toPersianDigits, formatToman } from '../../utils/persian';
import {
  X,
  Store,
  Search,
  ShoppingCart,
  Check,
  ChevronLeft,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const NewOrderFlow: React.FC = () => {
  const {
    isNewOrderOpen,
    setIsNewOrderOpen,
    customers,
    products,
    selectedCustomerIdForOrder,
    setSelectedCustomerIdForOrder,
    cart,
    cartTotalAmount,
    cartTotalCartons,
    setIsCartOpen,
  } = useApp();

  const [searchCustomer, setSearchCustomer] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('همه');

  if (!isNewOrderOpen) return null;

  const brands = ['همه', ...Array.from(new Set(products.map((p) => p.brand)))];

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerIdForOrder);

  // Filter customers
  const filteredCustomers = customers.filter(
    (c) =>
      c.store_name.toLowerCase().includes(searchCustomer.toLowerCase()) ||
      c.first_name.toLowerCase().includes(searchCustomer.toLowerCase()) ||
      c.last_name.toLowerCase().includes(searchCustomer.toLowerCase())
  );

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (selectedBrand !== 'همه' && p.brand !== selectedBrand) return false;
    if (searchProduct && !p.name.toLowerCase().includes(searchProduct.toLowerCase()) && !p.brand.toLowerCase().includes(searchProduct.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div
      id="new-order-flow-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="new-order-flow-modal"
        className="bg-white w-full max-w-lg max-h-[94vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                ثبت سفارش به نمایندگی از مشتری
              </h3>
              <p className="text-[11px] text-slate-500">
                {selectedCustomer ? `برای: ${selectedCustomer.store_name}` : 'گام ۱: انتخاب داروخانه یا فروشگاه'}
              </p>
            </div>
          </div>

          <button
            id="btn-close-new-order-flow"
            onClick={() => setIsNewOrderOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Step 1: Customer selection (if not selected) */}
          {!selectedCustomerIdForOrder ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800">
                  انتخاب داروخانه یا فروشگاه مقصد:
                </h4>
              </div>

              {/* Customer Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <input
                  id="search-customer-order-flow"
                  type="text"
                  value={searchCustomer}
                  onChange={(e) => setSearchCustomer(e.target.value)}
                  placeholder="جستجوی نام داروخانه یا مشتری..."
                  className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    id={`select-cust-${c.id}`}
                    onClick={() => setSelectedCustomerIdForOrder(c.id)}
                    className="p-3 bg-white hover:bg-emerald-50/60 border border-slate-200/80 hover:border-emerald-300 rounded-2xl cursor-pointer transition-all active:scale-[0.99] flex items-center justify-between shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-900">{c.store_name}</h5>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {c.first_name} {c.last_name} • {getBusinessTypeLabel(c.business_type)}
                        </p>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Step 2: Product selection */
            <div className="space-y-4">
              {/* Selected Customer banner */}
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-700" />
                  <div>
                    <span className="text-xs font-extrabold text-emerald-950 block">
                      {selectedCustomer?.store_name}
                    </span>
                    <span className="text-[10px] text-emerald-700">
                      {selectedCustomer?.first_name} {selectedCustomer?.last_name}
                    </span>
                  </div>
                </div>
                <button
                  id="btn-change-customer"
                  onClick={() => setSelectedCustomerIdForOrder(null)}
                  className="text-[11px] font-bold text-emerald-800 underline hover:text-emerald-950"
                >
                  تغییر مشتری
                </button>
              </div>

              {/* Product search & brand filters */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                  <input
                    id="search-product-order-flow"
                    type="text"
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    placeholder="جستجوی محصول یا کد کالا..."
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                {/* Brands horizontal scroll */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
                  {brands.map((b) => (
                    <button
                      key={b}
                      onClick={() => setSelectedBrand(b)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                        selectedBrand === b
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products list */}
              <div className="space-y-3">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Bottom Bar with Cart total and Checkout */}
        {selectedCustomerIdForOrder && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-slate-400 block">اقلام انتخاب شده:</span>
              <span className="text-xs font-extrabold text-slate-900">
                {toPersianDigits(cartTotalCartons)} کارتن ({formatToman(cartTotalAmount)})
              </span>
            </div>

            <button
              id="btn-view-cart-checkout"
              disabled={cart.length === 0}
              onClick={() => {
                setIsNewOrderOpen(false);
                setIsCartOpen(true);
              }}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <span>مشاهده فاکتور و ثبت نهایی</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
