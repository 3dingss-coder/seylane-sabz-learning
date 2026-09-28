import React, { useState } from 'react';
import { Brand } from '../../types';
import { useData } from '../../context/DataContext';
import { X, Award, Check } from 'lucide-react';

interface BrandModalProps {
  onClose: () => void;
}

export const BrandModal: React.FC<BrandModalProps> = ({ onClose }) => {
  const { addBrand } = useData();

  const [name, setName] = useState('');
  const [active, setActive] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addBrand({
      name,
      active
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-[#0F5338] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">تعریف برند جدید سیلانه سبز</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">نام رسمی برند:</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثلا: کامان (Comeon)"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="brandAct"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 text-[#006c4a] rounded"
            />
            <label htmlFor="brandAct" className="font-bold text-slate-700">برند فعال و قابل نمایش باشد</label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#006c4a] text-white font-bold shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>ذخیره برند</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
