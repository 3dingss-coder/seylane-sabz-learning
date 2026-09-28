import React from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';

interface ProductSectionProps {
  title: string;
  iconName: string;
  products: Product[];
  onAddToCart: (product: Product, quantityDelta: number) => void;
  getCartQuantity: (productId: string) => number;
  onSelectProduct: (product: Product) => void;
  onViewAll: () => void;
}

export const ProductSection: React.FC<ProductSectionProps> = ({
  title,
  iconName,
  products,
  onAddToCart,
  getCartQuantity,
  onSelectProduct,
  onViewAll,
}) => {
  if (!products || products.length === 0) return null;

  return (
    <section className="mt-8 mb-2">
      {/* Section Header */}
      <div className="flex justify-between items-center mb-3.5 px-4">
        <div className="flex items-center gap-1.5 flex-row-reverse">
          <h2 className="font-['Vazirmatn'] text-[17px] font-extrabold text-[#022c22]">
            {title}
          </h2>
          <span className="material-symbols-outlined text-[#006c4a] text-[20px]">
            {iconName}
          </span>
        </div>
        <button
          onClick={onViewAll}
          className="text-[#006c4a] text-[12px] font-bold flex items-center gap-0.5 hover:underline"
        >
          مشاهده همه
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
      </div>

      {/* Product Horizontal Carousel */}
      <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-3 px-4">
        {products.map((product) => {
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
