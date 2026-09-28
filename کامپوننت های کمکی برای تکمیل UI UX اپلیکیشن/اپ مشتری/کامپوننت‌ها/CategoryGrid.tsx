import React from 'react';
import { Category } from '../types';

interface CategoryGridProps {
  categories: Category[];
  onSelectCategory: (categoryId: string) => void;
  selectedCategory?: string;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  categories,
  onSelectCategory,
  selectedCategory,
}) => {
  return (
    <section className="mt-6 px-4">
      <div className="grid grid-cols-3 gap-4">
        {categories.map((cat: Category) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <div
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex flex-col items-center gap-1.5 cursor-pointer group active:scale-95 transition-all duration-200 ${
                isSelected ? 'scale-105' : ''
              }`}
            >
              <div
                className={`aspect-square w-full rounded-2xl bg-white flex items-center justify-center p-2.5 border transition-all duration-300 ease-out shadow-[0_1px_2px_rgba(2,44,34,0.04),0_8px_18px_-14px_rgba(2,44,34,0.25)] ${
                  isSelected
                    ? 'border-[#006c4a] bg-gradient-to-b from-[#ecfdf5] to-[#d8f5e5] ring-2 ring-[#006c4a]/25 shadow-[0_4px_14px_-4px_rgba(0,108,74,0.3)]'
                    : 'border-[#eef2f0] group-hover:border-[#006c4a]/40 group-hover:shadow-[0_2px_4px_rgba(2,44,34,0.06),0_12px_24px_-12px_rgba(0,108,74,0.28)] group-hover:-translate-y-0.5'
                }`}
              >
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="w-full h-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.08]"
                  loading="lazy"
                />
              </div>
              <span
                className={`text-[12px] font-semibold text-center mt-1 leading-tight ${
                  isSelected ? 'text-[#004532] font-black' : 'text-[#171c1f]'
                }`}
              >
                {cat.name}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
