import React, { useState } from 'react';
import { Marketer } from '../../types';
import { useData } from '../../context/DataContext';
import { X, UserCheck, Check } from 'lucide-react';

interface MarketerModalProps {
  marketer?: Marketer | null;
  onClose: () => void;
}

export const MarketerModal: React.FC<MarketerModalProps> = ({ marketer, onClose }) => {
  const { addMarketer, updateMarketer } = useData();

  const [firstName, setFirstName] = useState(marketer?.first_name || '');
  const [lastName, setLastName] = useState(marketer?.last_name || '');
  const [phone, setPhone] = useState(marketer?.phone || '');
  const [region, setRegion] = useState(marketer?.region || 'منطقه ۱ - شمال تهران');
  const [monthlyTarget, setMonthlyTarget] = useState<number>(marketer?.monthly_target || 300000000);
  const [active, setActive] = useState<boolean>(marketer ? marketer.active : true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (marketer) {
      updateMarketer(marketer.id, {
        first_name: firstName,
        last_name: lastName,
        phone,
        region,
        monthly_target: Number(monthlyTarget),
        active
      });
    } else {
      addMarketer({
        first_name: firstName,
        last_name: lastName,
        phone,
        region,
        monthly_target: Number(monthlyTarget)
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        <div className="bg-[#0F5338] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">
              {marketer ? `ویرایش اطلاعات بازاریاب ${marketer.first_name} ${marketer.last_name}` : 'ثبت بازاریاب جدید'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">نام:</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">نام خانوادگی:</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">شماره همراه بازاریاب:</label>
            <input
              type="text"
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">منطقه فعالیت تخصصی:</label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-medium"
            >
              <option value="منطقه ۱ - شمال تهران">منطقه ۱ - شمال تهران</option>
              <option value="منطقه ۲ - غرب تهران">منطقه ۲ - غرب تهران</option>
              <option value="منطقه ۳ - مرکز و بازار">منطقه ۳ - مرکز و بازار</option>
              <option value="منطقه ۴ - شرق تهران">منطقه ۴ - شرق تهران</option>
              <option value="منطقه ۵ - کرج و استان البرز">منطقه ۵ - کرج و استان البرز</option>
              <option value="منطقه ۶ - جنوب تهران">منطقه ۶ - جنوب تهران</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">تارگت فروش ماهانه (تومان):</label>
            <input
              type="number"
              step={10000000}
              required
              value={monthlyTarget}
              onChange={e => setMonthlyTarget(Number(e.target.value))}
              className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg font-bold text-[#006c4a]"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              برابری با: {(monthlyTarget / 10000000).toLocaleString('fa-IR')} میلیون تومان
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="mkActive"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 text-[#006c4a] rounded"
            />
            <label htmlFor="mkActive" className="font-bold text-slate-700">
              بازاریاب فعال باشد (مجاز به ورود به اپ بازاریابان)
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#006c4a] text-white hover:bg-[#0F5338] font-bold shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>ذخیره بازاریاب</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
