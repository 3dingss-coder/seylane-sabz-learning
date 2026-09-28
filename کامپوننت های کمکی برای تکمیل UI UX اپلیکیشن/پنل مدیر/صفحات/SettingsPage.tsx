import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Settings, Save, CheckCircle } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { appSettings, updateAppSettings } = useData();

  const [bannerText, setBannerText] = useState(appSettings.banner_text || '');
  const [bannerActive, setBannerActive] = useState(appSettings.banner_active || false);
  const [welcomeMessage, setWelcomeMessage] = useState(appSettings.welcome_message || '');
  const [supportPhone, setSupportPhone] = useState(appSettings.support_phone || '');
  const [announcement, setAnnouncement] = useState(appSettings.announcement || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateAppSettings({
      banner_text: bannerText,
      banner_active: bannerActive,
      welcome_message: welcomeMessage,
      support_phone: supportPhone,
      announcement: announcement
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'تنظیمات سیستم', active: true }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#006c4a]" />
            <span>تنظیمات عمومی اکوسیستم سیلانه سبز پلاس</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تنظیم بنر، پیام خوش‌آمدگویی، تلفن پشتیبانی و اعلانات سیستم
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 text-xs max-w-3xl">
        
        {savedSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold flex items-center gap-2 text-xs animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>تنظیمات سیستم با موفقیت بروزرسانی شد.</span>
          </div>
        )}

        <div>
          <label className="font-bold text-slate-700 block mb-1">متن بنر اطلاعیه بالا:</label>
          <input
            type="text"
            value={bannerText}
            onChange={e => setBannerText(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="bannerActiveCheckbox"
            checked={bannerActive}
            onChange={e => setBannerActive(e.target.checked)}
            className="w-4 h-4 text-[#006c4a] rounded"
          />
          <label htmlFor="bannerActiveCheckbox" className="font-bold text-slate-700">بنر فعال باشد</label>
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">پیام خوش‌آمدگویی:</label>
          <input
            type="text"
            value={welcomeMessage}
            onChange={e => setWelcomeMessage(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">شماره تلفن پشتیبانی:</label>
          <input
            type="text"
            value={supportPhone}
            onChange={e => setSupportPhone(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">اطلاعیه عمومی سیستم:</label>
          <textarea
            rows={3}
            value={announcement}
            onChange={e => setAnnouncement(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>ذخیره تنظیمات</span>
          </button>
        </div>

      </form>

    </div>
  );
};
