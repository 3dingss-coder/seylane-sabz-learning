import React, { useState } from 'react';
import { UserProfileData } from '../types';
import { formatPrice, toPersianDigits } from '../utils/persian';

interface ProfileViewProps {
  profile: UserProfileData;
  onUpdateProfile: (updated: UserProfileData) => Promise<void>;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onLogout?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ profile, onUpdateProfile, onOpenAuth, onLogout }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UserProfileData>(profile);
  const [saveAlert, setSaveAlert] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [logoutAlert, setLogoutAlert] = useState(false);

  const availableCredit = profile.creditLimit - profile.creditUsed;
  const creditUsedPercent = profile.creditLimit > 0 ? Math.round((profile.creditUsed / profile.creditLimit) * 100) : 0;

  const handleSave = () => {
    setIsSaving(true);
    setSaveError('');
    onUpdateProfile(formData)
      .then(() => {
        setIsEditing(false);
        setSaveAlert(true);
        setTimeout(() => setSaveAlert(false), 3000);
      })
      .catch(() => {
        setSaveError('ذخیره اطلاعات با خطا مواجه شد. لطفاً دوباره تلاش کنید.');
      })
      .finally(() => setIsSaving(false));
  };

  const handleLogout = () => {
    setLogoutAlert(true);
    if (onLogout) onLogout();
    if (onOpenAuth) {
      onOpenAuth('login');
    }
  };

  return (
    <div
      className="pt-4 px-4 text-right space-y-3.5"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {/* Profile Card Header */}
      <div className="bg-white border border-[#bec9c2]/40 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-[#f1f5f9] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#004532] text-white flex items-center justify-center font-black text-[18px]">
              {profile.storeName.substring(0, 2)}
            </div>
            <div className="flex flex-col">
              <h2 className="font-extrabold text-[16px] text-[#022c22]">
                {profile.storeName}
              </h2>
              <span className="text-[11px] text-[#6f7973] mt-0.5">
                کد مشتری B2B: <span className="font-bold text-[#006c4a]">{profile.customerCode}</span>
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              if (!isEditing) setFormData(profile);
              setSaveError('');
              setIsEditing(!isEditing);
            }}
            className="py-1.5 px-3 border border-[#bec9c2] text-[#006c4a] rounded-xl text-[11px] font-bold hover:bg-[#f0f4f8] transition-colors"
          >
            {isEditing ? 'انصراف' : 'ویرایش اطلاعات'}
          </button>
        </div>

        {saveAlert && (
          <div className="bg-[#ecfdf5] text-[#059669] p-2.5 rounded-xl mb-3 text-[12px] font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            اطلاعات حساب کاربری با موفقیت به روزرسانی شد.
          </div>
        )}

        {logoutAlert && (
          <div className="bg-[#fff7ed] text-[#c2410c] border border-[#ffedd5] p-3 rounded-2xl text-[12.5px] font-black flex items-center justify-between animate-in fade-in mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#ea580c]">
                check_circle
              </span>
              <span>خروج از حساب کاربری انجام شد.</span>
            </div>
            <button onClick={() => setLogoutAlert(false)} className="text-[#ea580c]/70 hover:text-[#ea580c]">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* Credit Limit Meter */}
        <div className="bg-[#f0f4f8] rounded-xl p-3 border border-[#e2e8f0]">
          <div className="flex justify-between items-center text-[12px] font-bold mb-1">
            <span className="text-[#022c22]">وضعیت اعتبار خرید چک / اعتباری</span>
            <span className="text-[#006c4a]">
              مانده اعتبار: {formatPrice(availableCredit)} تومان
            </span>
          </div>
          <div className="w-full bg-[#dfe3e7] h-2.5 rounded-full overflow-hidden mb-1">
            <div
              className="bg-[#006c4a] h-full transition-all duration-300"
              style={{ width: `${creditUsedPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-[#6f7973]">
            <span>استفاده شده: {toPersianDigits(creditUsedPercent)}٪</span>
            <span>سقف کل: {formatPrice(profile.creditLimit)} تومان</span>
          </div>
        </div>
      </div>

      {/* Edit Form or View Cards */}
      {isEditing ? (
        <div className="bg-white border border-[#bec9c2]/40 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
          <h3 className="font-extrabold text-[14px] text-[#022c22]">ویرایش مشخصات فروشگاه</h3>

          <div>
            <label className="text-[11px] font-bold text-[#6f7973] block mb-1">نام فروشگاه / داروخانه</label>
            <input
              type="text"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="w-full h-10 border border-[#bec9c2] rounded-xl px-3 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#6f7973] block mb-1">نام داروساز / صاحب امتیاز</label>
            <input
              type="text"
              value={formData.ownerName}
              onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
              className="w-full h-10 border border-[#bec9c2] rounded-xl px-3 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#6f7973] block mb-1">شماره تماس ثابت</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full h-10 border border-[#bec9c2] rounded-xl px-3 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#6f7973] block mb-1">نشانی تحویل بار</label>
            <textarea
              rows={3}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full border border-[#bec9c2] rounded-xl p-3 text-[13px]"
            />
          </div>

          {saveError && (
            <div className="bg-[#fef2f2] text-[#dc2626] p-2.5 rounded-xl text-[12px] font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {saveError}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#0F5338] hover:bg-[#004532] text-white py-3 rounded-xl font-bold text-[13px] mt-2 active:scale-95 transition-all shadow-xs disabled:opacity-60"
          >
            {isSaving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Detailed Info Group */}
          <div className="bg-white border border-[#bec9c2]/40 rounded-2xl p-4 shadow-xs divide-y divide-[#f1f5f9]">
            <div className="py-2.5 flex justify-between items-center text-[13px]">
              <span className="text-[#6f7973]">مسئول / صاحب پروانه:</span>
              <span className="font-bold text-[#171c1f]">{profile.ownerName}</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-[13px]">
              <span className="text-[#6f7973]">شماره نظام پزشکی / پروانه:</span>
              <span className="font-bold text-[#171c1f]">{profile.licenseNumber}</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-[13px]">
              <span className="text-[#6f7973]">تلفن داروخانه:</span>
              <span className="font-bold text-[#171c1f] font-mono">{profile.phone}</span>
            </div>
            <div className="py-2.5 flex flex-col text-[13px] gap-1">
              <span className="text-[#6f7973]">نشانی ثبت شده ارسال:</span>
              <span className="font-bold text-[#171c1f] leading-relaxed">{profile.address}</span>
            </div>
          </div>

          {/* Business Support Card */}
          <div className="bg-[#f0f4f8] border border-[#bec9c2]/40 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#006c4a] text-[32px]">
                support_agent
              </span>
              <div className="flex flex-col">
                <span className="font-bold text-[13px] text-[#022c22]">پشتیبانی امور مشتریان سیلانه سبز</span>
                <span className="text-[11px] text-[#6f7973]">شماره تماس: ۰۲۱-۸۸۰۰۹۹۰۰</span>
              </div>
            </div>
            <a
              href="tel:02188009900"
              className="bg-[#004532] text-white px-3 py-1.5 rounded-xl font-bold text-[11px]"
            >
              تماس
            </a>
          </div>

          {/* Light Orange Glassmorphic Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full mt-1 py-3.5 px-4 rounded-2xl bg-[#fff7ed]/80 hover:bg-[#ffedd5] text-[#ea580c] border border-[#ffedd5] backdrop-blur-md shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 font-black text-[13.5px]"
          >
            <span className="material-symbols-outlined text-[20px] text-[#ea580c]">
              logout
            </span>
            <span>خروج از حساب کاربری</span>
          </button>
        </div>
      )}
    </div>
  );
};
