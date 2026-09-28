import React from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';

interface PopularProductsProps {
  products: Product[];
  onAddToCart: (product: Product, quantityDelta: number) => void;
  getCartQuantity: (productId: string) => number;
  onSelectProduct: (product: Product) => void;
  onViewAll: () => void;
}

export const PopularProducts: React.FC<PopularProductsProps> = ({
  products,
  onAddToCart,
  getCartQuantity,
  onSelectProduct,
  onViewAll,
}) => {
  const popularList = products.slice(0, 5);

  return (
    <section className="mt-8 mb-2">
      <div className="flex justify-between items-center mb-3.5 px-4">
        <div className="flex items-center gap-1.5 flex-row-reverse">
          <h2 className="font-['Vazirmatn'] text-[17px] font-extrabold text-[#022c22] tracking-tight">
            محبوب‌ترین اقلام
          </h2>
          <span className="material-symbols-outlined text-[#f59e0b] text-[19px] drop-shadow-[0_1px_2px_rgba(245,158,11,0.3)]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
        </div>
        <button
          onClick={onViewAll}
          className="text-[#006c4a] text-[12px] font-bold flex items-center gap-0.5 hover:gap-1.5 transition-all duration-200"
        >
          مشاهده همه
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
      </div>

      <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-3 px-4">
        {popularList.map((product) => {
          const qty = getCartQuantity(product.id);
          return (
            <ProductCard
              key={product.id}
              product={product}
              qty={qty}
              onAddToCart={onAddToCart}
              onSelectProduct={onSelectProduct}
              className="min-w-[168px] w-[168px]"
            />
          );
        })}
      </div>
    </section>
  );
};
