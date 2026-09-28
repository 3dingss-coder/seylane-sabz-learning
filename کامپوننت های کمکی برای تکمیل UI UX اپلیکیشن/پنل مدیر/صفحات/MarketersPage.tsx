import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Marketer } from '../types';
import { UserCheck, Search, Plus, Target, Phone, MapPin, Edit2, ArrowLeft, Eye } from 'lucide-react';

interface MarketersPageProps {
  onOpenMarketerModal: (marketer?: Marketer) => void;
  onNavigate: (path: string) => void;
}

export const MarketersPage: React.FC<MarketersPageProps> = ({ onOpenMarketerModal, onNavigate }) => {
  const { marketers, updateMarketer } = useData();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMarketers = marketers.filter(m =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.personnel_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'بازاریابان و مناطق', active: true }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#006c4a]" />
            <span>مدیریت عملکرد تیم بازاریابان میدان</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            نظارت بر تارگت‌های ماهانه، مناطق پوشش‌دهی و وضعیت فعالیت هر بازاریاب
          </p>
        </div>

        <button
          onClick={() => onOpenMarketerModal()}
          className="px-4 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت بازاریاب جدید</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between text-xs">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو با نام، کد پرسنلی یا منطقه..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
          />
        </div>
      </div>

      {/* Marketer Cards / Table */}
      {filteredMarketers.length === 0 ? (
        <EmptyState
          title="بازاریابی پیدا نشد"
          description="رکوردی متناسب با فیلتر ثبت نشده است."
          actionLabel="ثبت بازاریاب جدید"
          onAction={() => onOpenMarketerModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMarketers.map(m => {
            const percent = Math.min(Math.round((m.achieved_sales / m.monthly_target) * 100), 100);

            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#006c4a] font-black flex items-center justify-center text-sm border border-emerald-200 shadow-inner">
                        {m.first_name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm text-slate-800">{m.first_name} {m.last_name}</h3>
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                            {m.personnel_code}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{m.region}</span>
                        </span>
                      </div>
                    </div>

                    <StatusBadge type="active" value={m.active} size="sm" />
                  </div>

                  {/* Target progress gauge */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 my-3">
                    <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                      <span className="text-slate-600 flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-[#006c4a]" />
                        <span>تحقق تارگت ماهانه:</span>
                      </span>
                      <span className="text-[#006c4a] font-extrabold">{percent}٪</span>
                    </div>

                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                      <div
                        style={{ width: `${percent}%` }}
                        className={`h-full rounded-full transition-all duration-500 ${
                          percent >= 100 ? 'bg-emerald-500' : 'bg-[#006c4a]'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>فروش تحقق‌یافته: {(m.achieved_sales / 1000000).toLocaleString('fa-IR')} میلیون</span>
                      <span>تارگت: {(m.monthly_target / 1000000).toLocaleString('fa-IR')} میلیون</span>
                    </div>
                  </div>
                </div>

                {/* Card actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenMarketerModal(m)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>ویرایش</span>
                    </button>

                    <button
                      onClick={() => updateMarketer(m.id, { active: !m.active })}
                      className={`px-2.5 py-1.5 rounded-lg font-semibold text-[11px] ${
                        m.active ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {m.active ? 'غیرفعال‌سازی' : 'تایید و فعال‌سازی'}
                    </button>
                  </div>

                  <button
                    onClick={() => onNavigate(`/marketers/${m.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>جزئیات عملکرد</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
