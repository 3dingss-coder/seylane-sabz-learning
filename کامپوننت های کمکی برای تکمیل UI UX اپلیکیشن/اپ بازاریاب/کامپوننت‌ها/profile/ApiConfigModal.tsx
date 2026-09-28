import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import { X, Server, Check, RefreshCw, Database, AlertCircle } from 'lucide-react';

export const ApiConfigModal: React.FC = () => {
  const { apiBaseUrl, setApiBaseUrl } = useAuth();
  const { isApiConfigOpen, setIsApiConfigOpen, showToast, refreshData } = useApp();

  const [inputUrl, setInputUrl] = useState(apiBaseUrl || '');
  const [isTesting, setIsTesting] = useState(false);

  const [isResetConfirming, setIsResetConfirming] = useState(false);

  if (!isApiConfigOpen) return null;

  const handleSave = () => {
    setApiBaseUrl(inputUrl.trim());
    showToast('تنظیمات آدرس سرور با موفقیت ذخیره شد', 'success');
    setIsApiConfigOpen(false);
  };

  const handleResetData = () => {
    apiService.resetToFactoryData();
    refreshData();
    showToast('داده‌ها به حالت اولیه کارخانه بازنشانی شدند', 'info');
    setIsResetConfirming(false);
    setIsApiConfigOpen(false);
  };

  return (
    <div
      id="api-config-modal-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        id="api-config-modal-content"
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">تنظیمات سرور بک‌اند و دیتابیس</h3>
              <p className="text-[11px] text-slate-500">Cloudflare Worker & D1 API Endpoint</p>
            </div>
          </div>

          <button
            id="btn-close-api-config"
            onClick={() => setIsApiConfigOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>معماری یکپارچه سیلانه سبز پلاس</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              این اپلیکیشن مستقیماً به سرویس مشترک Cloudflare Worker و دیتابیس D1 که اپ‌های مشتریان و مدیران نیز به آن متصلند وصل می‌شود. در صورت خالی بودن آدرس، اپلیکیشن به صورت آفلاین-فرست با داده‌های نمونه کار می‌کند.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              آدرس Base URL سرور بک‌اند (اختیاری):
            </label>
            <input
              id="input-api-base-url"
              type="url"
              dir="ltr"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://silaneh-worker.example.workers.dev"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-left"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            {isResetConfirming ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 animate-fadeIn">
                <p className="text-[11px] text-rose-800 font-bold text-center">
                  آیا از بازنشانی کلیه داده‌ها به حالت اولیه کارخانه اطمینان دارید؟
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsResetConfirming(false)}
                    className="py-1.5 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    id="btn-confirm-factory-reset"
                    onClick={handleResetData}
                    className="py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg"
                  >
                    بله، بازنشانی کن
                  </button>
                </div>
              </div>
            ) : (
              <button
                id="btn-reset-factory-data"
                onClick={() => setIsResetConfirming(true)}
                type="button"
                className="w-full py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>بازنشانی داده‌های نمونه اولیه (Factory Reset)</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          <button
            id="btn-cancel-api-config"
            onClick={() => setIsApiConfigOpen(false)}
            className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            انصراف
          </button>
          <button
            id="btn-save-api-config"
            onClick={handleSave}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>ذخیره تنظیمات</span>
          </button>
        </div>
      </div>
    </div>
  );
};
