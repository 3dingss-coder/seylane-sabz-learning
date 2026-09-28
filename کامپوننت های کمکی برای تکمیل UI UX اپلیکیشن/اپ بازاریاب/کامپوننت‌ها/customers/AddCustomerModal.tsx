import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BusinessType } from '../../types';
import { isValidIranianMobile, toEnglishDigits } from '../../utils/persian';
import { X, Store, User, Phone, MapPin, Building, Check } from 'lucide-react';

export const AddCustomerModal: React.FC = () => {
  const { isAddCustomerOpen, setIsAddCustomerOpen, addNewCustomer } = useApp();

  const [storeName, setStoreName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('pharmacy');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('تهران');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isAddCustomerOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!storeName.trim()) {
      newErrors.storeName = 'نام فروشگاه یا داروخانه الزامی است';
    }
    if (!firstName.trim()) {
      newErrors.firstName = 'نام صاحب کسب‌وکار الزامی است';
    }
    if (!lastName.trim()) {
      newErrors.lastName = 'نام خانوادگی الزامی است';
    }
    if (!phone.trim()) {
      newErrors.phone = 'شماره موبایل الزامی است';
    } else if (!isValidIranianMobile(phone)) {
      newErrors.phone = 'شماره موبایل نامعتبر است (مثال: 09121234567)';
    }
    if (!address.trim()) {
      newErrors.address = 'آدرس کامل الزامی است';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const result = await addNewCustomer({
      storeName: storeName.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: toEnglishDigits(phone).trim(),
      businessType,
      address: address.trim(),
      city: city.trim(),
    });

    setIsSubmitting(false);
    if (result) {
      // Reset form
      setStoreName('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setAddress('');
      setErrors({});
    }
  };

  return (
    <div
      id="add-customer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="add-customer-modal-card"
        className="bg-white w-full max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">ثبت مشتری / داروخانه جدید</h3>
              <p className="text-[11px] text-slate-500">افزودن فروشگاه جدید به لیست مشتریان تحت پوشش</p>
            </div>
          </div>

          <button
            id="btn-close-add-customer"
            onClick={() => setIsAddCustomerOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Store Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              نام فروشگاه / داروخانه <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-customer-store-name"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="مثال: داروخانه شبانه‌روزی دکتر حسینی"
              className={`w-full p-2.5 bg-slate-50 border rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                errors.storeName
                  ? 'border-rose-300 focus:ring-rose-200'
                  : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
              }`}
            />
            {errors.storeName && (
              <p className="text-[10px] text-rose-500 font-medium mt-0.5">{errors.storeName}</p>
            )}
          </div>

          {/* Business Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              نوع فعالیت کسب‌وکار <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'pharmacy', label: 'داروخانه' },
                { id: 'cosmetics', label: 'آرایشی و بهداشتی' },
                { id: 'hypermarket', label: 'هایپرمارکت' },
                { id: 'supermarket', label: 'سوپرمارکت' },
                { id: 'other', label: 'سایر فروشگاه‌ها' },
              ].map((b) => (
                <button
                  type="button"
                  key={b.id}
                  id={`btn-business-type-${b.id}`}
                  onClick={() => setBusinessType(b.id as BusinessType)}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    businessType === b.id
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-2xs font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* First & Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                نام مدیر <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-customer-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="مثال: محمدرضا"
                className={`w-full p-2.5 bg-slate-50 border rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.firstName
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.firstName && (
                <p className="text-[10px] text-rose-500 font-medium mt-0.5">{errors.firstName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                نام خانوادگی <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-customer-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="مثال: حسینی"
                className={`w-full p-2.5 bg-slate-50 border rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.lastName
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.lastName && (
                <p className="text-[10px] text-rose-500 font-medium mt-0.5">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Phone Number (Iranian validation) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              شماره موبایل جهت هماهنگی و ورود <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="input-customer-phone"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                className={`w-full p-2.5 text-left bg-slate-50 border rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.phone
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
            </div>
            {errors.phone && (
              <p className="text-[10px] text-rose-500 font-medium mt-0.5">{errors.phone}</p>
            )}
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">شهر / منطقه</label>
            <input
              id="input-customer-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="مثال: تهران - تجریش"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Full Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              آدرس دقیق فروشگاه و محل تحویل بار <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="input-customer-address"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="خیابان اصلی، کوچه، پلاک، طبقه یا واحد..."
              className={`w-full p-2.5 bg-slate-50 border rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                errors.address
                  ? 'border-rose-300 focus:ring-rose-200'
                  : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
              }`}
            />
            {errors.address && (
              <p className="text-[10px] text-rose-500 font-medium mt-0.5">{errors.address}</p>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 border-t border-slate-100 flex gap-2">
            <button
              type="button"
              id="btn-cancel-add-customer"
              onClick={() => setIsAddCustomerOpen(false)}
              className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              id="btn-submit-add-customer"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ثبت...' : 'ثبت و تایید مشتری'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
