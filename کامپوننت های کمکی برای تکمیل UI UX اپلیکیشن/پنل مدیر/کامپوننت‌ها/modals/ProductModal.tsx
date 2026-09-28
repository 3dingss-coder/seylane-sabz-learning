import React, { useState } from 'react';
import { Product } from '../../types';
import { useData } from '../../context/DataContext';
import { X, Package, Check } from 'lucide-react';

interface ProductModalProps {
  product?: Product | null;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, onClose }) => {
  const { brands, addProduct, updateProduct } = useData();

  const [name, setName] = useState(product?.name || '');
  const [code, setCode] = useState(product?.code || '');
  const [brand, setBrand] = useState<string>(product?.brand || brands[0]?.name || 'کامان (Comeon)');
  const [category, setCategory] = useState(product?.category || 'مراقبت پوست');
  const [unitPrice, setUnitPrice] = useState<number>(product?.unit_price || 450000);
  const [price, setPrice] = useState<number>(product?.price || 10800000);
  const [cartonQuantity, setCartonQuantity] = useState<number>(product?.carton_quantity || 24);
  const [stockCount, setStockCount] = useState<number>(product?.stock_count || 1000);
  const [description, setDescription] = useState<string>(product?.description || '');
  const [active, setActive] = useState<boolean>(product ? product.active : true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (product) {
      updateProduct(product.id, {
        name,
        code,
        brand,
        category,
        unit_price: Number(unitPrice),
        price: Number(price),
        carton_quantity: Number(cartonQuantity),
        stock_count: Number(stockCount),
        in_stock: Number(stockCount) > 0,
        description,
        active
      });
    } else {
      addProduct({
        name,
        code: code || `CMN-${Date.now().toString().slice(-4)}`,
        brand,
        category,
        unit_price: Number(unitPrice),
        price: Number(price),
        carton_quantity: Number(cartonQuantity),
        stock_count: Number(stockCount),
        in_stock: Number(stockCount) > 0,
        description,
        active
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        <div className="bg-[#0F5338] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">
              {product ? `ویرایش کالا: ${product.name}` : 'افزودن محصول جدید به کاتالوگ'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          <div>
            <label className="font-bold text-slate-700 block mb-1">عنوان کامل محصول:</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="کرم آبرسان پمپی..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">کد کالا:</label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="CMN-500"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg uppercase"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">برند سازنده:</label>
              <select
                value={brand}
                onChange={e => setBrand(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-medium"
              >
                {brands.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">دسته‌بندی:</label>
              <input
                type="text"
                required
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="مراقبت پوست"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">تعداد در کارتن:</label>
              <input
                type="number"
                required
                value={cartonQuantity}
                onChange={e => setCartonQuantity(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">موجودی انبار (عدد):</label>
              <input
                type="number"
                required
                value={stockCount}
                onChange={e => setStockCount(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-[#006c4a]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">قیمت واحد تکی (تومان):</label>
              <input
                type="number"
                required
                value={unitPrice}
                onChange={e => setUnitPrice(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">قیمت کل کارتن (تومان):</label>
              <input
                type="number"
                required
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg font-bold text-[#006c4a]"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">توضیحات محصول (اختیاری):</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="توضیح کوتاهی درباره محصول برای نمایش در صفحه محصول..."
              rows={3}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="prodActive"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 text-[#006c4a] rounded"
            />
            <label htmlFor="prodActive" className="font-bold text-slate-700">
              کالا فعال و قابل سفارش در اپلیکیشن باشد
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
              <span>ذخیره کالا</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
