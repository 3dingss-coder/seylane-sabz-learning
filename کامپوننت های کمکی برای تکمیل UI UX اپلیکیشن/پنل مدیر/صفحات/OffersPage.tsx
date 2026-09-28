import React from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Sparkles, Plus, Calendar, Target, CheckCircle } from 'lucide-react';

interface OffersPageProps {
  onOpenOfferModal: () => void;
}

export const OffersPage: React.FC<OffersPageProps> = ({ onOpenOfferModal }) => {
  const { offers, updateOfferStatus } = useData();

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'آفرهای هفته و پکیج‌ها', active: true }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span>آفرهای هفته و طرح‌های تشویقی B2B</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تعریف و فعال‌سازی جشنواره‌های فروش، تخفیف‌های حجمی و پکیج‌های ترغیبی داروخانه‌ای
          </p>
        </div>

        <button
          onClick={onOpenOfferModal}
          className="px-4 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>تعریف کمپین / آفر جدید</span>
        </button>
      </div>

      {/* Offers Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {offers.map(off => (
          <div
            key={off.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm shadow-inner">
                    %{off.discount_percentage}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800">{off.title}</h3>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{off.expires_at ? `اعتبار تا ${off.expires_at}` : 'بدون تاریخ انقضا'}</span>
                    </span>
                  </div>
                </div>

                <StatusBadge type="active" value={off.active} size="sm" />
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                {off.items.length} قلم کالا در این پکیج
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 text-[11px] block">قیمت پکیج:</span>
                <span className="font-bold text-[#006c4a] text-xs">{off.price.toLocaleString('fa-IR')} تومان</span>
              </div>

              <button
                onClick={() => updateOfferStatus(off.id, !off.active)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                  off.active
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {off.active ? 'غیرفعال‌سازی آفر' : 'فعال‌سازی مجدد'}
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
