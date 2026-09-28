import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { BarChart3, Download, Calendar, Filter, Award, TrendingUp, Users, Building2, CheckCircle2 } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { marketers, customers, orders } = useData();
  const [timeRange, setTimeRange] = useState('current_month');
  const [exportedNotice, setExportedNotice] = useState(false);

  // Rankings
  const rankedMarketers = [...marketers].sort((a, b) => b.achieved_sales - a.achieved_sales);

  const handleExport = () => {
    const headers = ['رتبه', 'کد پرسنلی', 'نام بازاریاب', 'منطقه', 'تارگت ماهانه', 'فروش محقق‌شده', 'درصد تحقق'];
    const rows = rankedMarketers.map((m, idx) => {
      const percent = m.monthly_target > 0 ? Math.round((m.achieved_sales / m.monthly_target) * 100) : 0;
      return [idx + 1, m.personnel_code, `${m.first_name} ${m.last_name}`, m.region, m.monthly_target, m.achieved_sales, percent];
    });
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش-بازاریابان-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExportedNotice(true);
    setTimeout(() => setExportedNotice(false), 3000);
  };

  // Regional breakdown
  const regionalSales: Record<string, number> = {};
  marketers.forEach(m => {
    regionalSales[m.region] = (regionalSales[m.region] || 0) + m.achieved_sales;
  });

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'گزارشات و تحلیل فروش', active: true }]} />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#006c4a]" />
            <span>گزارش جامع عملکرد بازاریابان و تحلیل فروش</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            رتبه‌بندی نهایی، سهم بازار مناطق و خروجی گزارشات مدیریتی
          </p>
        </div>

        <div className="flex items-center gap-2">
          {exportedNotice && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
              ✓ فایل گزارش CSV تولید شد
            </span>
          )}

          <button
            onClick={handleExport}
            className="px-4 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>خروجی اکسل / CSV</span>
          </button>
        </div>
      </div>

      {/* Time Range Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-slate-700">دوره زمانی گزارش:</span>
        </div>

        <div className="flex items-center gap-2">
          {[
            { key: 'current_month', label: 'ماه جاری (مرداد ۱۴۰۳)' },
            { key: 'prev_month', label: 'ماه گذشته (تیر ۱۴۰۳)' },
            { key: 'quarter', label: '۳ ماه اخیر' },
            { key: 'year', label: 'سال ۱۴۰۳' }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setTimeRange(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeRange === item.key
                  ? 'bg-[#006c4a] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <h2 className="text-sm font-bold text-[#171c1f] flex items-center gap-2 mb-4">
          <Award className="w-4 h-4 text-amber-500" />
          <span>جدول رتبه‌بندی بازاریابان بر اساس میزان فروش محقق‌شده</span>
        </h2>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5 text-center">رتبه</th>
                <th className="p-3.5">کد پرسنلی</th>
                <th className="p-3.5">نام بازاریاب</th>
                <th className="p-3.5">منطقه تحت پوشش</th>
                <th className="p-3.5 text-left">تارگت مصوب (تومان)</th>
                <th className="p-3.5 text-left">فروش محقق‌شده (تومان)</th>
                <th className="p-3.5 text-center">درصد تحقق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rankedMarketers.map((m, idx) => {
                const percent = Math.min(Math.round((m.achieved_sales / m.monthly_target) * 100), 100);
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 text-center">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-xs ${
                        idx === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                        idx === 1 ? 'bg-slate-300 text-slate-800' :
                        idx === 2 ? 'bg-amber-700 text-white' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600 font-bold">{m.personnel_code}</td>
                    <td className="p-3.5 font-bold text-slate-800">{m.first_name} {m.last_name}</td>
                    <td className="p-3.5 text-slate-600">{m.region}</td>
                    <td className="p-3.5 text-left text-slate-600 font-mono">{m.monthly_target.toLocaleString('fa-IR')}</td>
                    <td className="p-3.5 text-left font-extrabold text-[#006c4a] bg-emerald-50/40">{m.achieved_sales.toLocaleString('fa-IR')}</td>
                    <td className="p-3.5 text-center">
                      <span className={`font-bold px-2.5 py-1 rounded-md text-xs ${
                        percent >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-800'
                      }`}>
                        {percent}٪
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparative Bar Chart */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <h2 className="text-sm font-bold text-[#171c1f] flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-[#006c4a]" />
          <span>نمودار مقایسه‌ای فروش محقق‌شده در برابر تارگت</span>
        </h2>

        {rankedMarketers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">هنوز بازاریابی ثبت نشده است.</p>
        ) : (
          <div className="space-y-3.5">
            {rankedMarketers.map((m) => {
              const maxVal = Math.max(...rankedMarketers.map(x => Math.max(x.achieved_sales, x.monthly_target)), 1);
              const achievedPct = Math.min((m.achieved_sales / maxVal) * 100, 100);
              const targetPct = Math.min((m.monthly_target / maxVal) * 100, 100);
              return (
                <div key={m.id} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-700">{m.first_name} {m.last_name}</span>
                    <span className="text-slate-500 font-mono">{m.achieved_sales.toLocaleString('fa-IR')} / {m.monthly_target.toLocaleString('fa-IR')}</span>
                  </div>
                  <div className="relative h-4 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 right-0 border-l-2 border-dashed border-slate-400"
                      style={{ width: `${targetPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 bg-[#006c4a] rounded-lg transition-all"
                      style={{ width: `${achievedPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-2">
              <span className="flex items-center gap-1"><span className="w-3 h-2.5 bg-[#006c4a] rounded-sm inline-block" /> فروش محقق‌شده</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2.5 border-l-2 border-dashed border-slate-400 inline-block" /> خط تارگت</span>
            </div>
          </div>
        )}
      </div>

      {/* Regional Share Cards */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <h2 className="text-sm font-bold text-[#171c1f] flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-[#006c4a]" />
          <span>توزیع فروش بر اساس مناطق پنج‌گانه</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(regionalSales).map(([reg, sales], i) => (
            <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 block mb-1">{reg}</span>
              <div className="text-base font-black text-[#006c4a]">
                {(sales / 1000000).toLocaleString('fa-IR')} میلیون تومان
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
