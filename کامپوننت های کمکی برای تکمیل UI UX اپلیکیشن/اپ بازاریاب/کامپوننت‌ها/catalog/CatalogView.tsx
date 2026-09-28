import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';
import { Search, X, ShoppingBag, Filter, Sparkles } from 'lucide-react';
import { toPersianDigits } from '../../utils/persian';

export const CatalogView: React.FC = () => {
  const {
    products,
    isLoading,
    productSearchQuery,
    setProductSearchQuery,
    selectedProductCategory,
    setSelectedProductCategory,
    cartTotalCartons,
    setIsCartOpen,
  } = useApp();

  const [selectedBrand, setSelectedBrand] = useState<string>('همه');

  const categories = ['همه', 'مراقبت پوست', 'مراقبت مو', 'بهداشت دهان و دندان', 'شوینده و پاک‌کننده', 'بهداشت فردی'];
  const brands = ['همه', ...Array.from(new Set(products.map((p) => p.brand)))];

  const filteredProducts = products.filter((product) => {
    if (selectedProductCategory !== 'همه' && product.category !== selectedProductCategory) {
      return false;
    }
    if (selectedBrand !== 'همه' && product.brand !== selectedBrand) {
      return false;
    }
    if (productSearchQuery.trim()) {
      const q = productSearchQuery.toLowerCase().trim();
      const matchName = product.name.toLowerCase().includes(q);
      const matchBrand = product.brand.toLowerCase().includes(q);
      const matchCode = product.code.toLowerCase().includes(q);
      if (!matchName && !matchBrand && !matchCode) {
        return false;
      }
    }
    return true;
  });

  return (
    <div id="catalog-view" className="space-y-4 pb-20 pt-2 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">کاتالوگ محصولات</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            سبد کالایی هلدینگ سیلانه سبز پلاس ({toPersianDigits(products.length)} قلم)
          </p>
        </div>

        {cartTotalCartons > 0 && (
          <button
            id="btn-cart-from-catalog"
            onClick={() => setIsCartOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>سبد ({toPersianDigits(cartTotalCartons)})</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          id="product-search-input"
          type="text"
          value={productSearchQuery}
          onChange={(e) => setProductSearchQuery(e.target.value)}
          placeholder="جستجوی نام کالا، برند یا کد محصول..."
          className="w-full pr-10 pl-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
        />
        {productSearchQuery && (
          <button
            id="clear-product-search-btn"
            onClick={() => setProductSearchQuery('')}
            className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
        {categories.map((cat) => {
          const isSelected = selectedProductCategory === cat;
          return (
            <button
              key={cat}
              id={`cat-filter-${cat}`}
              onClick={() => setSelectedProductCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Brand Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1 text-[11px]">
        <span className="text-slate-400 font-bold ml-1 flex-shrink-0">برند:</span>
        {brands.map((b) => (
          <button
            key={b}
            id={`brand-filter-${b}`}
            onClick={() => setSelectedBrand(b)}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedBrand === b
                ? 'bg-slate-900 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title="محصولی یافت نشد"
          description="با فیلترها یا عبارت جستجوی دیگری تلاش کنید."
          actionText="پاک کردن فیلترها"
          onAction={() => {
            setProductSearchQuery('');
            setSelectedProductCategory('همه');
            setSelectedBrand('همه');
          }}
          icon={<ShoppingBag className="w-8 h-8 text-emerald-600" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};
