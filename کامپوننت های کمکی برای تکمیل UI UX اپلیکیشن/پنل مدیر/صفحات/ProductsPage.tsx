import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Product } from '../types';
import { Package, Search, Plus, Edit2, RotateCcw, AlertTriangle, ArrowUpDown } from 'lucide-react';

interface ProductsPageProps {
  onOpenProductModal: (product?: Product) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onOpenProductModal }) => {
  const { products, brands, updateProduct } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock_asc' | 'stock_desc' | 'price_desc' | 'price_asc'>('name');

  const handleResetFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setSortBy('name');
  };

  const isFiltered = searchQuery !== '' || brandFilter !== 'all' || sortBy !== 'name';

  const filteredProducts = products
    .filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;

      return matchesSearch && matchesBrand;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'fa');
      if (sortBy === 'stock_asc') return a.stock_count - b.stock_count;
      if (sortBy === 'stock_desc') return b.stock_count - a.stock_count;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'price_asc') return a.price - b.price;
      return 0;
    });

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'کاتالوگ محصولات', active: true }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <Package className="w-5 h-5 text-[#006c4a]" />
            <span>مدیریت کاتالوگ محصولات عمده</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تعریف و بروزرسانی قیمت‌های تکی و کارتنی، موجودی انبار و وضعیت کالاها
          </p>
        </div>

        <button
          onClick={() => onOpenProductModal()}
          className="px-4 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن کالا به کاتالوگ</span>
        </button>
      </div>

      {/* Search & Brand Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو با نام کالا، کد یا دسته‌بندی..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">فیلتر برند:</span>
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="all">همه برندها ({products.length})</option>
              {brands.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">مرتب‌سازی:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="name">نام کالا (الفبا)</option>
              <option value="stock_asc">کمترین موجودی انبار</option>
              <option value="stock_desc">بیشترین موجودی انبار</option>
              <option value="price_desc">گران‌ترین (قیمت کارتن)</option>
              <option value="price_asc">ارزان‌ترین (قیمت کارتن)</option>
            </select>
          </div>

          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی فیلترها</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          title="هیچ کالایی یافت نشد"
          description="با توجه به عبارت جستجو یا برند انتخابی، کالایی پیدا نشد."
          actionLabel="افزودن کالا به کاتالوگ"
          onAction={() => onOpenProductModal()}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">کد کالا</th>
                  <th className="p-3.5">عنوان کالا</th>
                  <th className="p-3.5">برند</th>
                  <th className="p-3.5">دسته‌بندی</th>
                  <th className="p-3.5 text-center">تعداد در کارتن</th>
                  <th className="p-3.5 text-left">قیمت واحد (تومان)</th>
                  <th className="p-3.5 text-left">قیمت کارتن (تومان)</th>
                  <th className="p-3.5 text-center">موجودی انبار</th>
                  <th className="p-3.5 text-center">وضعیت</th>
                  <th className="p-3.5 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(p => {
                  const isLowStock = p.stock_count < 100;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5 font-mono text-slate-600 font-bold">{p.code}</td>
                      <td className="p-3.5 font-bold text-slate-800">{p.name}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-[#006c4a] font-semibold border border-emerald-200">
                          {p.brand}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600">{p.category}</td>
                      <td className="p-3.5 text-center font-bold text-slate-700">{p.carton_quantity}</td>
                      <td className="p-3.5 text-left text-slate-600 font-bold">{p.unit_price.toLocaleString('fa-IR')}</td>
                      <td className="p-3.5 text-left font-black text-[#006c4a]">
                        {p.price.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold ${
                          isLowStock ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {isLowStock && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                          <span>{p.stock_count.toLocaleString('fa-IR')} کارتن</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => updateProduct(p.id, { active: !p.active })}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <StatusBadge type="active" value={p.active} size="sm" />
                        </button>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => onOpenProductModal(p)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          title="ویرایش کالا"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
