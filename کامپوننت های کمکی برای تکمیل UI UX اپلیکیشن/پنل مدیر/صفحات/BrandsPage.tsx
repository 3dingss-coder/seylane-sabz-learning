import React from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Award, Plus, Package } from 'lucide-react';

interface BrandsPageProps {
  onOpenBrandModal: () => void;
}

export const BrandsPage: React.FC<BrandsPageProps> = ({ onOpenBrandModal }) => {
  const { brands, products } = useData();

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'برندهای سیلانه سبز', active: true }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#006c4a]" />
            <span>برندهای تخصصی گروه صنعتی سیلانه سبز</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مدیریت زیربرندهای مراقبت از پوست، مو، بهداشت دهان و دندان و محصولات کودک
          </p>
        </div>

        <button
          onClick={onOpenBrandModal}
          className="px-4 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن برند جدید</span>
        </button>
      </div>

      {/* Brands Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {brands.map(b => (
          <div
            key={b.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#0F5338] text-white font-extrabold flex items-center justify-center text-sm shadow-xs">
                    {b.name[0]}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800">{b.name}</h3>
                    <span className="text-[10px] text-slate-500">کد شناسه برند: BRD-{b.id}</span>
                  </div>
                </div>

                <StatusBadge type="active" value={b.active} size="sm" />
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                {b.english_name}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1 font-medium">
                <Package className="w-3.5 h-3.5 text-[#006c4a]" />
                <span>تعداد کالاهای فعال:</span>
              </span>
              <span className="font-bold text-[#006c4a] bg-emerald-50 px-2.5 py-1 rounded-lg">
                {products.filter(p => p.brand === b.name).length} محصول
              </span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
