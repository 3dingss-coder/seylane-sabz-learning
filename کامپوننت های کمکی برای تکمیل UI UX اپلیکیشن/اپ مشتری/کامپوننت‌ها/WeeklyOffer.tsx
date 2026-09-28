import React, { useState, useEffect } from 'react';
import { PackageBundle } from '../types';
import { toPersianDigits } from '../utils/persian';

// Display-ready shape for a promotional slide. The real backend (weekly_offers
// table) only stores title/price/discount/items/expiry — the marketing copy
// below (badge/cta/gradient) is generated client-side from a rotating preset
// since there's no CMS field for it yet.
export interface OfferSlide {
  id: string;
  title: string;
  discountText: string;
  subTitle: string;
  badge: string;
  image: string;
  bgGradient: string;
  badgeBg: string;
  cta: string;
  items: { productName: string; qty: number; unitPrice: number }[];
}

const STYLE_PRESETS = [
  { badge: 'پیشنهاد طلایی هفته', bgGradient: 'from-[#e6f4ed] via-[#f0fdf4] to-[#ffffff]', badgeBg: 'bg-[#006c4a] text-white', cta: 'ثبت سفارش آفر' },
  { badge: 'تخفیف ویژه B2B', bgGradient: 'from-[#eff6ff] via-[#f0f9ff] to-[#ffffff]', badgeBg: 'bg-[#2563eb] text-white', cta: 'مشاهده اقلام تخفیف‌دار' },
  { badge: 'پیشنهاد ویژه', bgGradient: 'from-[#fffbe2] via-[#fefce8] to-[#ffffff]', badgeBg: 'bg-[#b45309] text-white', cta: 'مشاهده بسته' },
  { badge: 'ارسال رایگان', bgGradient: 'from-[#fdf2f2] via-[#fff5f5] to-[#ffffff]', badgeBg: 'bg-[#dc2626] text-white', cta: 'سفارش پکیج' },
];

export function packagesToSlides(offers: PackageBundle[]): OfferSlide[] {
  return offers.map((o, idx) => {
    const preset = STYLE_PRESETS[idx % STYLE_PRESETS.length];
    return {
      id: o.id,
      title: o.title,
      discountText: `${toPersianDigits(o.discountPercent)}٪ تخفیف`,
      subTitle: o.items.map((it) => it.productName).join('، '),
      image: o.image,
      items: o.items,
      ...preset,
    };
  });
}

interface WeeklyOfferProps {
  offers: PackageBundle[];
  onOpenOfferModal: (offer: OfferSlide) => void;
}

export const WeeklyOffer: React.FC<WeeklyOfferProps> = ({ offers, onOpenOfferModal }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slides = packagesToSlides(offers);

  if (slides.length === 0) return null;

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [isPaused, slides.length]);

  const currentSlide = slides[currentIndex % slides.length];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <section
      className="mt-6 px-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="relative overflow-hidden rounded-[22px] shadow-sm border border-[#e2e8f0]/80 transition-all duration-500">
        {/* Banner Slide Content with Gradient */}
        <div
          className={`bg-gradient-to-l ${currentSlide.bgGradient} p-4 flex items-center justify-between gap-3 relative transition-all duration-500 min-h-[148px]`}
        >
          {/* Right Side Image Container (RTL layout) */}
          <div className="w-[110px] h-[110px] bg-white rounded-2xl shadow-xs border border-white/80 p-2 flex items-center justify-center shrink-0 relative group overflow-hidden">
            <img
              src={currentSlide.image}
              alt={currentSlide.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-xl transition-transform duration-500 group-hover:scale-105"
            />
            {/* Soft decorative glow */}
            <div className="absolute inset-0 bg-black/5 pointer-events-none rounded-xl" />
          </div>

          {/* Left Side Content */}
          <div className="flex-1 flex flex-col justify-between h-full py-0.5 text-right pr-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md shadow-2xs ${currentSlide.badgeBg}`}
                >
                  {currentSlide.badge}
                </span>
              </div>
              <h3 className="font-['Vazirmatn'] text-[15px] font-extrabold text-[#0f172a] leading-tight mb-0.5">
                {currentSlide.title}
              </h3>
              <div className="text-[#006c4a] font-black text-[16px] leading-tight mb-0.5">
                {currentSlide.discountText}
              </div>
              <p className="text-[#64748b] text-[11px] font-bold line-clamp-1">
                {currentSlide.subTitle}
              </p>
            </div>

            <button
              onClick={() => onOpenOfferModal(currentSlide)}
              className="bg-[#006c4a] hover:bg-[#005238] active:bg-[#003825] text-white rounded-xl py-1.5 px-4 text-[12px] font-extrabold w-fit active:scale-95 transition-all shadow-xs mt-2 flex items-center gap-1.5"
            >
              <span>{currentSlide.cta}</span>
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            </button>
          </div>

          {/* Navigation Arrows for Slider */}
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 border border-[#e2e8f0] text-[#1e293b] shadow-xs flex items-center justify-center hover:bg-white active:scale-90 transition-all z-10"
            title="قبلی"
            aria-label="اسلاید قبلی"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>

          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 border border-[#e2e8f0] text-[#1e293b] shadow-xs flex items-center justify-center hover:bg-white active:scale-90 transition-all z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            title="بعدی"
            aria-label="اسلاید بعدی"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>

        {/* 5-Second Animated Progress Bar */}
        <div className="w-full bg-[#e2e8f0] h-1 relative overflow-hidden">
          <div
            key={currentIndex}
            className={`h-full bg-[#006c4a] transition-all duration-[5000ms] ease-linear ${
              isPaused ? 'opacity-50' : 'w-full'
            }`}
            style={{
              width: isPaused ? '100%' : undefined,
              animationName: 'progressTimer',
              animationDuration: '5s',
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
            }}
          />
        </div>
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center items-center gap-1.5 mt-2.5">
        {slides.map((slide, idx) => (
          <button
            key={slide.id}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-300 ${
              currentIndex === idx
                ? 'w-6 h-2 rounded-full bg-[#006c4a] shadow-2xs'
                : 'w-2 h-2 rounded-full bg-[#cbd5e1] hover:bg-[#94a3b8]'
            }`}
            title={`اسلاید ${idx + 1}`}
            aria-label={`رفتن به اسلاید ${idx + 1}`}
          />
        ))}
      </div>
    </section>
  );
};
