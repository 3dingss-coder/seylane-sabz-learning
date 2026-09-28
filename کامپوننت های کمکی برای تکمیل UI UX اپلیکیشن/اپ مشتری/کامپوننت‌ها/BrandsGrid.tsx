import React from 'react';
import { Brand } from '../types';
import { handleImgError } from '../utils/image';

interface BrandsGridProps {
  brands: Brand[];
  onSelectBrand: (brandNameFa: string) => void;
  selectedBrand?: string | null;
  onViewAllBrands: () => void;
}

export const BrandsGrid: React.FC<BrandsGridProps> = ({
  brands,
  onSelectBrand,
  selectedBrand,
  onViewAllBrands,
}) => {
  return (
    <section id="brands-section" className="mt-6 px-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-1.5 flex-row-reverse">
          <h2 className="font-['Vazirmatn'] text-[16px] font-extrabold text-[#022c22] tracking-tight">
            برندهای سیلانه سبز
          </h2>
          <span className="material-symbols-outlined text-[#006c4a] text-[20px] drop-shadow-[0_1px_2px_rgba(0,108,74,0.25)]">
            military_tech
          </span>
        </div>
        <button
          onClick={onViewAllBrands}
          className="text-[#006c4a] text-[12px] font-bold flex items-center gap-0.5 hover:gap-1.5 transition-all duration-200"
        >
          مشاهده همه
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-2.5 auto-rows-fr">
        {brands.map((brand: Brand) => {
          const isSelected = selectedBrand === brand.nameFa;
          return (
            <div
              key={brand.id}
              onClick={() => onSelectBrand(brand.nameFa)}
              className={`h-full bg-white border rounded-2xl p-2 flex flex-col items-center text-center cursor-pointer active:scale-95 transition-all duration-250 ease-out shadow-[0_1px_2px_rgba(2,44,34,0.04),0_6px_14px_-10px_rgba(2,44,34,0.2)] ${
                isSelected
                  ? 'border-[#006c4a] bg-gradient-to-b from-[#ecfdf5] to-[#d8f5e5] ring-2 ring-[#006c4a]/25 scale-105 shadow-[0_4px_12px_-4px_rgba(0,108,74,0.3)]'
                  : 'border-[#eef2f0] hover:border-[#006c4a]/40 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(2,44,34,0.06),0_10px_18px_-10px_rgba(0,108,74,0.25)]'
              }`}
            >
              <div className="aspect-square w-full p-1.5 flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={brand.logo}
                  alt={brand.nameFa}
                  onError={handleImgError}
                  className="max-w-full max-h-full w-auto h-auto object-contain transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <span className="font-bold text-[11px] text-[#171c1f] truncate w-full">
                {brand.nameFa}
              </span>
              <span className="text-[9px] text-[#6f7973] truncate w-full">
                {brand.nameEn}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
