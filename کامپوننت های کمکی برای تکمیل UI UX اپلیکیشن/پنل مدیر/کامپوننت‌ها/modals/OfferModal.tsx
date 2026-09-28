import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { X, Sparkles, Check } from 'lucide-react';

interface OfferModalProps {
  onClose: () => void;
}

export const OfferModal: React.FC<OfferModalProps> = ({ onClose }) => {
  const { addOffer } = useData();

  const [title, setTitle] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(20);
  const [price, setPrice] = useState<number>(40000000);
  const [consumerPrice, setConsumerPrice] = useState<number>(50000000);
  const [expiresAt, setExpiresAt] = useState('۱۴۰۳/۰۵/۳۱');
  const [active, setActive] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    addOffer({
      title,
      discount_percentage: Number(discountPercentage),
      price: Number(price),
      consumer_price: Number(consumerPrice),
      expires_at: expiresAt,
      active,
      items: []
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-[#0F5338] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <h2 className="text-sm font-bold">تعریف آفر هفته / پکیج تخفیف جدید</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">عنوان کمپین تخفیف:</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="مثلا: پکیج ویژه تابستانه کامان"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">درصد تخفیف (%):</label>
              <input
                type="number"
                required
                value={discountPercentage}
                onChange={e => setDiscountPercentage(Number(e.target.value))}
                className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg font-bold text-[#006c4a]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">قیمت با تخفیف (تومان):</label>
              <input
                type="number"
                required
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">قیمت اصلی (تومان):</label>
              <input
                type="number"
                required
                value={consumerPrice}
                onChange={e => setConsumerPrice(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">تاریخ انقضا:</label>
              <input
                type="text"
                required
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="offAct"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 text-[#006c4a] rounded"
            />
            <label htmlFor="offAct" className="font-bold text-slate-700">آفر فعال باشد</label>
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
              <span>ایجاد آفر</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
