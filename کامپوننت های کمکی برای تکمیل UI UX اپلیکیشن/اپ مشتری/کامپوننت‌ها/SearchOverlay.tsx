import React, { useState, useEffect, useRef } from 'react';
import { Product, Category } from '../types';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  categories: Category[];
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, delta: number) => void;
  getCartQuantity: (productId: string) => number;
  onSelectCategory: (categoryId: string) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
  products,
  categories,
  onSelectProduct,
  onAddToCart,
  getCartQuantity,
  onSelectCategory,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // State for Recent Searches
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_searches');
    return saved ? JSON.parse(saved) : ['کرم آبرسان کامان', 'دستمال مرطوب', 'خمیر دندان دنتامکس'];
  });

  // Auto focus when overlay opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Trending / Popular Search Tags suited for Cosmetics, Beauty & Health store (سیلانه سبز)
  const popularSearches = [
    'رژ لب',
    'شامپو',
    'کرم آبرسان',
    'میس لیپ',
    'ضد آفتاب',
    'دستمال مرطوب',
  ];

  const addToRecent = (term: string) => {
    if (!term.trim()) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item !== term);
      const updated = [term, ...filtered].slice(0, 6);
      localStorage.setItem('recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const handleRemoveRecent = (term: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((item) => item !== term);
      localStorage.setItem('recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent_searches');
  };

  // Filter products based on search query
  const filteredProducts = query.trim()
    ? products.filter(
        (p) =>
          p.name.includes(query) ||
          p.brand.includes(query) ||
          p.brandEn.toLowerCase().includes(query.toLowerCase()) ||
          p.category.includes(query)
      )
    : [];

  const handleSelectTag = (tag: string) => {
    setQuery(tag);
    addToRecent(tag);
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('fa-IR');
  };

  return (
    <div className="fixed inset-0 z-50 bg-white max-w-[448px] mx-auto flex flex-col h-full animate-in fade-in duration-200 text-right overflow-hidden border-x border-[#e2e8f0]/60">
      {/* Top Search Bar Header */}
      <div
        className="p-3.5 bg-white border-b border-[#e2e8f0]/80 flex items-center gap-3 sticky top-0 z-10 shadow-2xs"
        style={{ paddingTop: 'calc(0.875rem + env(safe-area-inset-top))' }}
      >
        {/* Back Button (RTL arrow pointing right to go back) */}
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#171c1f] transition-colors flex items-center justify-center active:scale-95"
          aria-label="بازگشت"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
        </button>

        {/* Input Container */}
        <div className="flex-1 relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                addToRecent(query.trim());
              }
            }}
            placeholder="جستجو بین همه کالاها"
            className="w-full h-11 bg-[#f1f3f5] rounded-full pr-10 pl-9 text-[13px] font-bold text-[#171c1f] placeholder:text-[#808d85] focus:outline-none focus:ring-2 focus:ring-[#006c4a]/30 focus:bg-white transition-all text-right border border-transparent focus:border-[#006c4a]/40"
          />
          {/* Search Icon */}
          <div className="absolute right-3.5 pointer-events-none text-[#6f7973]">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </div>

          {/* Clear button when typing */}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute left-3 p-1 rounded-full text-[#6f7973] hover:text-[#171c1f] hover:bg-black/5"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-7"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        {/* Default View when NO query is entered */}
        {!query.trim() ? (
          <>
            {/* Section 1: Recent Searches (جستجوهای اخیر) */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[15px] font-extrabold text-[#171c1f] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[20px] text-[#006c4a]">
                      history
                    </span>
                    <span>جستجوهای اخیر</span>
                  </h2>
                  <button
                    onClick={handleClearRecent}
                    className="text-[11px] font-bold text-[#ba1a1a] hover:text-[#931212] flex items-center gap-0.5 transition-colors p-1 rounded-lg hover:bg-[#fef2f2]"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                    <span>پاک کردن</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 justify-start">
                  {recentSearches.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectTag(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] border border-[#e2e8f0] rounded-full text-[12px] font-bold text-[#334155] transition-all cursor-pointer group active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[15px] text-[#6f7973] group-hover:text-[#006c4a]">
                        history
                      </span>
                      <span>{item}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRecent(item);
                        }}
                        className="text-[#94a3b8] hover:text-[#ba1a1a] mr-0.5 flex items-center justify-center p-0.5 rounded-full hover:bg-black/10 transition-colors"
                        title="حذف"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Popular Searches (جستجوهای پرطرفدار) */}
            <div>
              <h2 className="text-[15px] font-extrabold text-[#171c1f] mb-3.5 flex items-center justify-start gap-1.5">
                <span className="material-symbols-outlined text-[20px] text-[#006c4a]">
                  trending_up
                </span>
                <span>جستجوهای پرطرفدار</span>
              </h2>
              <div className="flex flex-wrap gap-2 justify-start">
                {popularSearches.slice(0, 6).map((tag, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectTag(tag)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#e2e8f0] hover:border-[#006c4a] rounded-full text-[12px] font-bold text-[#334155] hover:text-[#006c4a] hover:bg-[#f0fdf4] transition-all shadow-2xs active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[15px] text-[#006c4a] font-semibold rotate-45">
                      north_east
                    </span>
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Shop by Categories (خرید از دسته‌بندی‌ها) */}
            <div>
              <h2 className="text-[15px] font-extrabold text-[#171c1f] mb-3.5">
                خرید از دسته‌بندی‌ها
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onSelectCategory(cat.id);
                      onClose();
                    }}
                    className="bg-[#f2f4f7] hover:bg-[#e8f3ee] border border-transparent hover:border-[#006c4a]/30 rounded-2xl p-2.5 flex flex-col justify-between items-start h-[124px] transition-all group relative overflow-hidden text-right shadow-2xs active:scale-98"
                  >
                    <span className="text-[12px] font-extrabold text-[#1e293b] leading-tight z-10 group-hover:text-[#006c4a] transition-colors">
                      {cat.name}
                    </span>
                    <div className="w-full h-16 flex items-center justify-center mt-auto self-center">
                      <img
                        src={cat.image}
                        alt={cat.name}
                        className="max-h-16 max-w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-110 drop-shadow-xs"
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Search Results View when user types */
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#e2e8f0]">
              <span className="text-[13px] font-bold text-[#6f7973]">
                نتایج جستجو برای «<span className="text-[#006c4a]">{query}</span>»
              </span>
              <span className="text-[12px] bg-[#e6f4ed] text-[#006c4a] px-2.5 py-0.5 rounded-full font-extrabold">
                {filteredProducts.length} کالا
              </span>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((p) => {
                  const qty = getCartQuantity(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (query.trim()) addToRecent(query.trim());
                        onSelectProduct(p);
                      }}
                      className="bg-white border border-[#006c4a]/25 rounded-2xl p-3 flex flex-col justify-between shadow-xs hover:shadow-md transition-all text-right cursor-pointer group relative"
                    >
                      <div className="w-full aspect-square bg-[#f8fafc] rounded-xl mb-2 flex items-center justify-center p-2 relative">
                        <img
                          src={p.image}
                          alt={p.name}
                          className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform"
                        />
                        {p.discountPercent > 0 && (
                          <span className="absolute top-1.5 right-1.5 bg-[#006c4a] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md">
                            %{p.discountPercent}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 flex-1 justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-[#006c4a] block mb-0.5">
                            {p.brand}
                          </span>
                          <h3 className="text-[12px] font-bold text-[#1e293b] line-clamp-2 leading-snug">
                            {p.name}
                          </h3>
                        </div>

                        <div className="mt-2 pt-2 border-t border-dashed border-[#e2e8f0]">
                          {/* Item Price */}
                          <div className="flex items-center justify-between text-[12px] font-extrabold text-[#006c4a]">
                            <span>{formatPrice(p.price)} تومان</span>
                            <span className="text-[9px] text-[#6f7973] font-normal">
                              کارتنی ({p.cartonCount} عددی)
                            </span>
                          </div>

                          {/* Consumer Price (un-striked as requested) */}
                          {p.consumerPrice > 0 && (
                            <div className="flex items-center justify-between text-[10px] text-[#6f7973] mt-1">
                              <span className="text-[11px] font-bold text-[#334155]">
                                {formatPrice(p.consumerPrice)} تومان
                              </span>
                              <span className="text-[9px]">قیمت مصرف‌کننده</span>
                            </div>
                          )}

                          {/* Cart Button */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2.5 flex items-center justify-center"
                          >
                            {qty === 0 ? (
                              <button
                                onClick={() => onAddToCart(p, 1)}
                                className="w-full py-1.5 bg-[#006c4a] hover:bg-[#005238] text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors active:scale-95"
                              >
                                <span className="material-symbols-outlined text-[16px]">add</span>
                                <span>افزودن کارتن</span>
                              </button>
                            ) : (
                              <div className="flex items-center justify-between bg-[#f0fbf6] border border-[#006c4a]/30 rounded-xl px-2 py-1 w-full">
                                <button
                                  onClick={() => onAddToCart(p, 1)}
                                  className="w-6 h-6 rounded-lg bg-[#006c4a] text-white flex items-center justify-center text-[14px] font-bold active:scale-95"
                                >
                                  +
                                </button>
                                <span className="text-[12px] font-extrabold text-[#006c4a]">
                                  {qty} کارتن
                                </span>
                                <button
                                  onClick={() => onAddToCart(p, -1)}
                                  className="w-6 h-6 rounded-lg bg-white border border-[#006c4a]/40 text-[#006c4a] flex items-center justify-center text-[14px] font-bold active:scale-95"
                                >
                                  -
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 bg-[#f8fafc] rounded-2xl border border-dashed border-[#cbd5e1] p-6">
                <span className="material-symbols-outlined text-[48px] text-[#94a3b8] mb-2">
                  search_off
                </span>
                <p className="text-[14px] font-bold text-[#475569] mb-1">
                  کالایی با عبارت «{query}» پیدا نشد!
                </p>
                <p className="text-[11px] text-[#94a3b8]">
                  لطفاً کلمات دیگری مانند نام برند، دسته یا نوع محصول را امتحان فرمایید.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
