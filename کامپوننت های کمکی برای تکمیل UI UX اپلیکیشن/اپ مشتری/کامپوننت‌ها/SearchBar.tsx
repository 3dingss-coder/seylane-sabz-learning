import React, { useState } from 'react';
import { Product } from '../types';

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onClickSearch?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  setSearchQuery,
  products,
  onSelectProduct,
  onClickSearch,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleClick = () => {
    if (onClickSearch) {
      onClickSearch();
    }
  };

  const suggestions = searchQuery.trim()
    ? products.filter(
        (p) =>
          p.name.includes(searchQuery) ||
          p.brand.includes(searchQuery) ||
          p.category.includes(searchQuery)
      ).slice(0, 5)
    : [];

  return (
    <div className="mt-4 px-4 relative z-30">
      <div className="relative flex items-center">
        {/* Custom Rich Placeholder with colored "سیلانه سبز" */}
        {!searchQuery && !isFocused && (
          <div className="absolute right-12 pointer-events-none text-[14px] text-[#6f7973] select-none flex items-center gap-1">
            <span>جستجو در</span>
            <span className="text-[#006c4a] font-black">سیلانه سبز</span>
          </div>
        )}

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClick={handleClick}
          onFocus={() => {
            setIsFocused(true);
            handleClick();
          }}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder=""
          className="w-full h-13 bg-white border border-[#bec9c2]/40 rounded-xl px-4 pr-12 pl-10 focus:ring-2 focus:ring-[#006c4a]/20 focus:border-[#006c4a] transition-all text-right shadow-xs text-[14px] text-[#171c1f] cursor-pointer"
          readOnly={!!onClickSearch}
        />
        <div className="absolute right-4 flex items-center pointer-events-none text-[#006c4a]">
          <span className="material-symbols-outlined text-[22px]">search</span>
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute left-3 p-1 rounded-full text-[#6f7973] hover:text-[#171c1f]"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Instant Search Suggestions Dropdown */}
      {isFocused && suggestions.length > 0 && (
        <div className="absolute top-15 right-4 left-4 bg-white border border-[#e2e8f0] rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in duration-150">
          <div className="p-2.5 text-[11px] font-bold text-[#006c4a] bg-[#f0f4f8] border-b border-[#e2e8f0] text-right">
            نتایج پیشنهادی ({suggestions.length})
          </div>
          {suggestions.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onSelectProduct(item);
                setIsFocused(false);
              }}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#f6fafe] border-b border-[#f1f5f9] last:border-none text-right transition-colors"
            >
              <div className="flex flex-col text-right">
                <span className="text-[13px] font-bold text-[#171c1f]">{item.name}</span>
                <span className="text-[11px] text-[#6f7973]">
                  برند: {item.brand} | کارتنی ({item.cartonCount} عددی)
                </span>
              </div>
              <span className="material-symbols-outlined text-[#006c4a] text-[18px]">chevron_left</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
