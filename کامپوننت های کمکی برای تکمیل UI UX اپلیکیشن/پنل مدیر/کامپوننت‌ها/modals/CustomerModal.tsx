import React, { useState } from 'react';
import { Customer, BusinessType } from '../../types';
import { useData } from '../../context/DataContext';
import { X, Store, Check } from 'lucide-react';

interface CustomerModalProps {
  customer?: Customer | null;
  onClose: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ customer, onClose }) => {
  const { marketers, updateCustomerMarketer, updateCustomerStatus } = useData();

  const [marketerId, setMarketerId] = useState<number>(customer?.marketer_id || marketers[0]?.id || 101);
  const [active, setActive] = useState<boolean>(customer ? customer.active : true);

  if (!customer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCustomerMarketer(customer.id, Number(marketerId));
    updateCustomerStatus(customer.id, active);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        <div className="bg-[#0F5338] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">ویرایش مشتری {customer.store_name}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-slate-600">
            <div><span className="font-bold text-slate-800">فروشگاه:</span> {customer.store_name}</div>
            <div><span className="font-bold text-slate-800">مسئول:</span> {customer.first_name} {customer.last_name}</div>
            <div><span className="font-bold text-slate-800">تماس:</span> {customer.phone}</div>
            <div><span className="font-bold text-slate-800">نشانی:</span> {customer.address}</div>
            <p className="text-[10px] text-slate-400 pt-1">این اطلاعات فقط از طریق خود مشتری در اپ فروشگاهی قابل ویرایش است.</p>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">بازاریاب مسئول این مشتری (تغییر آنی):</label>
            <select
              value={marketerId}
              onChange={e => setMarketerId(Number(e.target.value))}
              className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg font-bold text-[#0F5338]"
            >
              {marketers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name} ({m.region}) - {m.personnel_code}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="custActive"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 text-[#006c4a] rounded"
            />
            <label htmlFor="custActive" className="font-bold text-slate-700">
              حساب خریدار فعال باشد (مجاز به ثبت سفارش جدید)
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
              <span>ذخیره اطلاعات</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
