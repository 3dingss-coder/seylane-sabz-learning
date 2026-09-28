import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { OrderItem } from '../../types';
import { X, Plus, Trash2, ShoppingCart, Check } from 'lucide-react';

interface AddOrderModalProps {
  onClose: () => void;
}

export const AddOrderModal: React.FC<AddOrderModalProps> = ({ onClose }) => {
  const { customers, marketers, products, addOrder } = useData();

  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(customers[0]?.id || 0);
  const [selectedMarketerId, setSelectedMarketerId] = useState<number>(marketers[0]?.id || 0);
  const [marketerNote, setMarketerNote] = useState('');
  
  const [cartItems, setCartItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: products[0]?.id || 'sb-501', quantity: 10 }
  ]);

  const customer = customers.find(c => c.id === Number(selectedCustomerId));
  const marketer = marketers.find(m => m.id === Number(selectedMarketerId));

  const handleAddItemRow = () => {
    if (products.length > 0) {
      setCartItems(prev => [...prev, { productId: products[0].id, quantity: 10 }]);
    }
  };

  const handleRemoveRow = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, key: 'productId' | 'quantity', val: string | number) => {
    setCartItems(prev =>
      prev.map((item, i) => (i === index ? { ...item, [key]: val } : item))
    );
  };

  // Calculations
  let initialAmount = 0;
  const items: OrderItem[] = cartItems.map((ci, idx) => {
    const prod = products.find(p => p.id === ci.productId) || products[0];
    const qty = Number(ci.quantity) || 1;
    const itemTotal = prod.price * qty;
    initialAmount += itemTotal;
    return {
      id: idx + 1,
      product_id: prod.id,
      product_name: prod.name,
      quantity: qty,
      unit_price: prod.price,
      total_price: itemTotal
    };
  });

  const discount = Math.round(initialAmount * 0.05); // 5% standard wholesale discount
  const finalAmount = initialAmount - discount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !marketer || items.length === 0) return;

    addOrder({
      customer_id: customer.id,
      items: items.map(({ product_id, product_name, quantity, unit_price, total_price }) => ({
        product_id, product_name, quantity, unit_price, total_price,
      })),
      initial_amount: initialAmount,
      discount: discount,
      final_amount: finalAmount,
      marketer_note: marketerNote,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        <div className="bg-[#0F5338] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold">ثبت سفارش عمده جدید</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          
          {/* Select Customer & Marketer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">انتخاب خریدار / فروشگاه:</label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a] font-semibold text-slate-800"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.store_name} ({c.customer_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">بازاریاب ثبت‌کننده مسئول:</label>
              <select
                value={selectedMarketerId}
                onChange={e => setSelectedMarketerId(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a] font-semibold text-slate-800"
              >
                {marketers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name} ({m.region})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cart items list */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-700">اقلام سفارش عمده (تعداد کارتن):</span>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#006c4a] bg-emerald-50 px-2.5 py-1 rounded-md hover:bg-emerald-100"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن کالا</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {cartItems.map((ci, idx) => (
                <div key={idx} className="p-3 bg-slate-50/50 flex items-center gap-3">
                  <select
                    value={ci.productId}
                    onChange={e => handleUpdateItem(idx, 'productId', e.target.value)}
                    className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} - کارتن {p.carton_quantity} تایی ({p.price.toLocaleString('fa-IR')} تومان)
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1 w-32">
                    <input
                      type="number"
                      min={1}
                      value={ci.quantity}
                      onChange={e => handleUpdateItem(idx, 'quantity', Number(e.target.value))}
                      className="w-16 p-2 bg-white border border-slate-300 rounded-lg text-center font-bold text-[#006c4a]"
                    />
                    <span className="text-slate-500 text-[10px]">کارتن</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    disabled={cartItems.length === 1}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">یادداشت سفارشی یا توضیحات تحویل:</label>
            <input
              type="text"
              value={marketerNote}
              onChange={e => setMarketerNote(e.target.value)}
              placeholder="مثلا: ارسال فوری با باربری تحویل صبح"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          {/* Total summary */}
          <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-200 flex items-center justify-between text-xs font-bold text-[#006c4a]">
            <div>
              <span>مبلغ فاکتور: {initialAmount.toLocaleString('fa-IR')} تومان</span>
              <span className="block text-[11px] text-rose-600 font-normal">تخفیف ۵٪: -{discount.toLocaleString('fa-IR')} تومان</span>
            </div>
            <div className="text-sm font-black text-[#0F5338]">
              خالص پرداختی: {finalAmount.toLocaleString('fa-IR')} تومان
            </div>
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
              className="px-6 py-2 rounded-lg bg-[#006c4a] text-white hover:bg-[#0F5338] font-bold shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>ثبت نهایی سفارش</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
