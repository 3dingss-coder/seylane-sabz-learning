import React, { useState, useRef, useEffect } from 'react';
import { Product, Category, Brand } from '../types';
import { toPersianDigits } from '../utils/persian';
import { assetUrl } from '../utils/assets';
import { ProductCard } from './ProductCard';
import { ProductRowCard } from './ProductRowCard';

interface ProductsViewProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  onAddToCart: (product: Product, delta: number) => void;
  getCartQuantity: (productId: string) => number;
  onSelectProduct: (product: Product) => void;
  initialCategory?: string;
  initialBrand?: string | null;
  onBackToHome?: () => void;
}

type SortType = 'popular' | 'newest' | 'discount' | 'price_asc' | 'price_desc';
type ViewMode = 'list' | 'grid';

const SUB_CATEGORIES_MAP: Record<string, string[]> = {
  all: ['همه زیردسته‌ها', 'پر‌تخفیف‌ترین‌ها', 'ارسال فوری', 'آفر ویژه'],
  healthcare: ['همه زیردسته‌ها', 'دستمال مرطوب', 'ضدعفونی‌کننده', 'مراقبت جنسی', 'پد بهداشتی'],
  beauty: ['همه زیردسته‌ها', 'کرم پودر', 'رژ لب', 'ریمل و آرایش چشم', 'آرایش پاک‌کن'],
  skin: ['همه زیردسته‌ها', 'کرم آبرسان', 'ژل شستشوی صورت', 'لوسیون بدن', 'ضد آفتاب'],
  hair: ['همه زیردسته‌ها', 'شامپو مو', 'ماسک مو', 'سرم و اسپری', 'روغن آرگان'],
  dental: ['همه زیردسته‌ها', 'خمیر دندان', 'مسواک', 'نخ دندان', 'دهان‌شویه'],
  baby: ['همه زیردسته‌ها', 'پوشک کودک', 'شامپو کودک', 'صابون و لوسیون', 'دستمال مرطوب کودک'],
};

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  categories,
  brands,
  onAddToCart,
  getCartQuantity,
  onSelectProduct,
  initialCategory = 'all',
  initialBrand = null,
  onBackToHome,
}) => {
  const [selectedCat, setSelectedCat] = useState<string>(initialCategory);
  const [selectedSubCat, setSelectedSubCat] = useState<string>('همه زیردسته‌ها');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(initialBrand);
  const [sortBy, setSortBy] = useState<SortType>('popular');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list'); // Default to list view matching screenshot
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Sync selected brand when initialBrand prop updates
  useEffect(() => {
    if (initialBrand !== undefined) {
      setSelectedBrand(initialBrand);
    }
  }, [initialBrand]);

  // Scroll to top when view mounts or brand/category changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [selectedBrand, initialBrand, initialCategory]);

  // Active Brand Object if a brand is selected
  const activeBrandObj = selectedBrand
    ? brands.find((b) => b.nameFa === selectedBrand || b.id === selectedBrand) || {
        id: 'brand',
        nameFa: selectedBrand,
        nameEn: selectedBrand,
        // Was an ephemeral aistudio.google.com googleusercontent URL that no
        // longer resolves; replaced with the app's own brand logo asset
        // (same one already used in Header) for this "official products" tile.
        // assetUrl() accounts for the GitHub Pages subpath deployment.
        logo: assetUrl('/logo-full.png'),
        gradient: 'from-[#004e39] via-[#059669] to-[#0284c7]',
        description: 'محصولات رسمی تولیدی گروه صنعتی سیلانه سبز',
      }
    : null;

  // Horizontal Category Scroll State & Handlers
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(true);

  const checkScrollState = () => {
    const el = categoryTabsRef.current;
    if (!el) return;
    const scrollPos = Math.abs(el.scrollLeft);
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollRight(scrollPos > 10);
    setCanScrollLeft(scrollPos < maxScroll - 10);
  };

  useEffect(() => {
    checkScrollState();
    const el = categoryTabsRef.current;
    if (el) {
      el.addEventListener('scroll', checkScrollState);
      window.addEventListener('resize', checkScrollState);
      return () => {
        el.removeEventListener('scroll', checkScrollState);
        window.removeEventListener('resize', checkScrollState);
      };
    }
  }, []);

  const handleScrollLeft = () => {
    if (categoryTabsRef.current) {
      categoryTabsRef.current.scrollBy({ left: -180, behavior: 'smooth' });
      setTimeout(checkScrollState, 350);
    }
  };

  const handleScrollRight = () => {
    if (categoryTabsRef.current) {
      categoryTabsRef.current.scrollBy({ left: 180, behavior: 'smooth' });
      setTimeout(checkScrollState, 350);
    }
  };

  // Available Subcategories for current active main category
  const activeSubCats = SUB_CATEGORIES_MAP[selectedCat] || SUB_CATEGORIES_MAP['all'];

  // Handle Main Category Switch
  const handleSelectCategory = (catId: string) => {
    setSelectedCat(catId);
    setSelectedSubCat('همه زیردسته‌ها');
  };

  // Filtering
  let filtered = products.filter((p) => {
    if (selectedCat !== 'all' && p.categoryId !== selectedCat) return false;
    if (selectedSubCat !== 'همه زیردسته‌ها' && p.subCategory && p.subCategory !== selectedSubCat) {
      return false;
    }
    if (selectedBrand && p.brand !== selectedBrand) return false;
    if (inStockOnly && !p.inStock) return false;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.subCategory && p.subCategory.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sortBy === 'price_asc') return a.price - b.price;
    if (sortBy === 'price_desc') return b.price - a.price;
    if (sortBy === 'discount') return b.discountPercent - a.discountPercent;
    if (sortBy === 'newest') return b.stockCount - a.stockCount;
    return b.discountPercent - a.discountPercent; // default popular
  });

  return (
    <div
      className="pt-3 px-3 text-right bg-[#f8fafc] min-h-screen"
      style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
    >
      {/* 1. Top Navbar Header */}
      <div className="flex justify-between items-center mb-3 bg-white p-3 rounded-2xl shadow-xs border border-[#e2e8f0]">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (onBackToHome) {
                onBackToHome();
              } else if (selectedBrand) {
                setSelectedBrand(null);
              }
            }}
            className="w-9 h-9 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] flex items-center justify-center transition-all active:scale-95"
            title="بازگشت"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
          <h1 className="font-['Vazirmatn'] text-[16.5px] font-black text-[#0f172a]">
            {activeBrandObj ? `محصولات ${activeBrandObj.nameFa}` : 'دسته‌بندی‌ها'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Filter Search Toggle Icon */}
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isFilterOpen ? 'bg-[#059669] text-white shadow-xs' : 'bg-[#f1f5f9] text-[#64748b] hover:text-[#0f172a]'
            }`}
            title="جستجو و فیلتر"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>

          {/* View Mode Toggle Button */}
          <div className="flex bg-[#f1f5f9] p-0.5 rounded-xl border border-[#e2e8f0]">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-[#059669] shadow-2xs font-bold'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
              title="نمایش لیستی"
            >
              <span className="material-symbols-outlined text-[18px]">view_list</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-[#059669] shadow-2xs font-bold'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
              title="نمایش شبکه‌ای"
            >
              <span className="material-symbols-outlined text-[18px]">grid_view</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Brand Hero Banner Template (When a Brand is Selected) */}
      {activeBrandObj ? (
        <div className="bg-white rounded-3xl overflow-hidden mb-3.5 shadow-xs border border-[#e2e8f0] animate-in fade-in duration-300">
          {/* Hero Gradient Background Banner */}
          <div
            className={`h-36 sm:h-40 w-full bg-gradient-to-r ${
              activeBrandObj.gradient || 'from-[#004e39] via-[#059669] to-[#0284c7]'
            } relative overflow-hidden flex items-center justify-center`}
          >
            {/* Ambient Water Bubbles & Mesh Overlay Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.22)_0%,transparent_65%)] pointer-events-none" />
            <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute -left-10 -top-10 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none" />

            {/* Subtle Brand Watermark Name */}
            <span className="text-white/15 text-4xl font-black uppercase tracking-widest select-none pointer-events-none">
              {activeBrandObj.nameEn}
            </span>
          </div>

          {/* Overlapping Floating Brand Card */}
          <div className="relative px-3.5 pb-3.5 pt-0">
            <div className="-mt-11 bg-white/95 backdrop-blur-md rounded-2xl p-3 border border-[#e2e8f0] shadow-md flex items-center justify-between gap-3">
              {/* Right: Logo & Brand Information */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl border border-[#e2e8f0] p-1.5 bg-white shadow-xs shrink-0 flex items-center justify-center overflow-hidden">
                  <img
                    src={activeBrandObj.logo}
                    alt={activeBrandObj.nameFa}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[16px] font-black text-[#0f172a]">
                      محصولات {activeBrandObj.nameFa}
                    </h2>
                  </div>
                  <span className="text-[11px] font-bold text-[#64748b]">
                    {activeBrandObj.nameEn}
                  </span>
                  <div className="flex items-center gap-1 mt-1 text-[10px] font-black text-[#059669]">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    <span>تضمین اصالت کالای سیلانه سبز</span>
                  </div>
                </div>
              </div>

              {/* Left: Item Counter Badge */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[11px] font-black text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] px-3 py-1 rounded-full shadow-2xs">
                  {toPersianDigits(filtered.length)} کالا
                </span>
                <button
                  onClick={() => setSelectedBrand(null)}
                  className="text-[10px] font-bold text-[#64748b] hover:text-[#dc2626] transition-colors mt-0.5"
                >
                  تغییر برند
                </button>
              </div>
            </div>

            {/* Brand Description */}
            {activeBrandObj.description && (
              <p className="text-[11.5px] text-[#475569] font-medium leading-relaxed mt-2.5 px-1">
                {activeBrandObj.description}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Standard Main Categories Tabs Bar */
        <div className="bg-white rounded-2xl shadow-xs border border-[#e2e8f0] mb-3 overflow-hidden relative">
          {/* Scroll Right Arrow Button */}
          {canScrollRight && (
            <button
              onClick={handleScrollRight}
              className="absolute right-1 top-1 z-20 w-[26px] h-[26px] rounded-full bg-[#059669] text-white shadow-md flex items-center justify-center hover:bg-[#047857] active:scale-90 transition-all duration-200 ring-2 ring-white animate-in fade-in zoom-in-75"
              title="بازگشت به راست"
              aria-label="اسکرول به راست"
            >
              <span className="material-symbols-outlined text-[16px] font-black">chevron_right</span>
            </button>
          )}

          {/* Scroll Left Arrow Button */}
          {canScrollLeft && (
            <button
              onClick={handleScrollLeft}
              className="absolute left-1 top-1 z-20 w-[26px] h-[26px] rounded-full bg-[#059669] text-white shadow-md flex items-center justify-center hover:bg-[#047857] active:scale-90 transition-all duration-200 ring-2 ring-white animate-in fade-in zoom-in-75"
              title="مشاهده سایر دسته‌بندی‌ها"
              aria-label="اسکرول به چپ"
            >
              <span className="material-symbols-outlined text-[16px] font-black">chevron_left</span>
            </button>
          )}

          <div
            ref={categoryTabsRef}
            className="flex gap-1 overflow-x-auto no-scrollbar px-3 pt-2 border-b border-[#f1f5f9] scroll-smooth"
          >
            <button
              onClick={() => handleSelectCategory('all')}
              className={`pb-2.5 px-3 text-[13px] font-black shrink-0 transition-all relative ${
                selectedCat === 'all' ? 'text-[#dc2626]' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              همه
              {selectedCat === 'all' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#dc2626] rounded-full" />
              )}
            </button>

            {categories.map((cat) => {
              const isActive = selectedCat === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`pb-2.5 px-3 text-[13px] font-black shrink-0 transition-all relative ${
                    isActive ? 'text-[#dc2626]' : 'text-[#64748b] hover:text-[#0f172a]'
                  }`}
                >
                  {cat.name}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#dc2626] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Subcategory Pills Bar */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar p-2.5 bg-[#fafafa]">
            {activeSubCats.map((sub, idx) => {
              const isSubActive = selectedSubCat === sub;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedSubCat(sub)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold shrink-0 transition-all border ${
                    isSubActive
                      ? 'bg-white border-[#059669] text-[#059669] shadow-xs ring-2 ring-[#059669]/10'
                      : 'bg-white border-[#cbd5e1] text-[#475569] hover:bg-[#f1f5f9]'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Action Filter & Sort Bar (Matching screenshot filter pills) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-3">
        {/* Filters Button */}
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-extrabold shrink-0 border transition-all ${
            isFilterOpen || selectedBrand || inStockOnly
              ? 'bg-[#059669] text-white border-[#059669] shadow-xs'
              : 'bg-white border-[#e2e8f0] text-[#334155] hover:bg-[#f8fafc]'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">tune</span>
          <span>فیلترها</span>
          {(selectedBrand || inStockOnly) && (
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          )}
        </button>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-1 px-3 py-2 bg-white border border-[#e2e8f0] rounded-xl text-[12px] shrink-0 shadow-2xs">
          <span className="material-symbols-outlined text-[16px] text-[#64748b]">swap_vert</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
            className="bg-transparent font-extrabold text-[#0f172a] border-none focus:ring-0 p-0 text-[12px] cursor-pointer"
          >
            <option value="popular">مرتب‌سازی: محبوب‌ترین</option>
            <option value="discount">بیشترین تخفیف</option>
            <option value="price_asc">ارزان‌ترین</option>
            <option value="price_desc">گران‌ترین</option>
            <option value="newest">موجودی انبار</option>
          </select>
        </div>
      </div>

      {/* Expandable Filter Drawer / Panel */}
      {isFilterOpen && (
        <div className="bg-white rounded-2xl p-3.5 mb-3 border border-[#cbd5e1] shadow-md space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-2">
            <span className="font-extrabold text-[13px] text-[#0f172a]">تنظیمات فیلتر پیشرفته</span>
            <button
              onClick={() => {
                setSelectedBrand(null);
                setInStockOnly(false);
                setFilterQuery('');
              }}
              className="text-[#dc2626] font-bold text-[11px] hover:underline"
            >
              پاکسازی همه
            </button>
          </div>

          {/* Quick Search */}
          <div>
            <div className="relative">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="جستجوی عنوان محصول یا برند..."
                className="w-full h-10 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 pr-9 text-[12px] focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669]"
              />
              <span className="material-symbols-outlined text-[#64748b] absolute right-2.5 top-2.5 text-[18px]">
                search
              </span>
            </div>
          </div>

          {/* Brands Filter Horizontal Scroll */}
          <div>
            <span className="text-[11px] font-extrabold text-[#64748b] mb-1.5 block">فیلتر برند:</span>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setSelectedBrand(null)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 border transition-all ${
                  selectedBrand === null
                    ? 'bg-[#059669] text-white border-[#059669]'
                    : 'bg-[#f1f5f9] border-[#e2e8f0] text-[#475569]'
                }`}
              >
                همه برندها
              </button>
              {brands.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBrand(selectedBrand === b.nameFa ? null : b.nameFa)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 border transition-all ${
                    selectedBrand === b.nameFa
                      ? 'bg-[#059669] text-white border-[#059669]'
                      : 'bg-[#f1f5f9] border-[#e2e8f0] text-[#334155]'
                  }`}
                >
                  {b.nameFa}
                </button>
              ))}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[12px] text-[#334155]">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="rounded text-[#059669] focus:ring-[#059669] w-4 h-4"
              />
              فقط کالاهای موجود
            </label>
          </div>
        </div>
      )}

      {/* 5. Products List / Grid Container */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-[#64748b] bg-white rounded-2xl border border-[#e2e8f0] shadow-xs">
          <span className="material-symbols-outlined text-[54px] text-[#cbd5e1] mb-2">
            search_off
          </span>
          <span className="font-extrabold text-[14px] text-[#0f172a]">هیچ کالایی با این فیلتر یافت نشد</span>
          <button
            onClick={() => {
              setSelectedCat('all');
              setSelectedSubCat('همه زیردسته‌ها');
              setSelectedBrand(null);
              setFilterQuery('');
              setInStockOnly(false);
            }}
            className="mt-3 text-[#059669] font-bold text-[12px] underline hover:text-[#047857]"
          >
            حذف تمام فیلترها و مشاهده کامل
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* List View matching screenshot layout */
        <div className="space-y-2.5">
          {filtered.map((product) => {
            const qty = getCartQuantity(product.id);
            return (
              <ProductRowCard
                key={product.id}
                product={product}
                qty={qty}
                onAddToCart={onAddToCart}
                onSelectProduct={onSelectProduct}
              />
            );
          })}
        </div>
      ) : (
        /* Grid View (2-column) */
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((product) => {
            const qty = getCartQuantity(product.id);
            return (
              <ProductCard
                key={product.id}
                product={product}
                qty={qty}
                onAddToCart={onAddToCart}
                onSelectProduct={onSelectProduct}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
