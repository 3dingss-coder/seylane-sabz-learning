import React, { useState } from 'react';
import { Send, Bell, Users, Smartphone, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { dataApi } from '../api';

type Audience = 'all' | 'customers';

interface SendResult {
  totalTokens: number;
  successCount: number;
  failCount: number;
  staleRemoved: number;
}

export const NotificationsPage: React.FC = () => {
  const [title, setTitle] = useState('نسخه جدید اپلیکیشن آماده است');
  const [message, setMessage] = useState(
    'برای بروزرسانی به آخرین امکانات، از طریق لینک دانلود مستقیم، نسخه جدید را نصب کنید.',
  );
  const [audience, setAudience] = useState<Audience>('all');
  const [isUpdateNotice, setIsUpdateNotice] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSendClick = () => {
    setError('');
    setResult(null);
    if (!title.trim() || !message.trim()) {
      setError('عنوان و متن پیام نمی‌توانند خالی باشند.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    setConfirmOpen(false);
    setIsSending(true);
    setError('');
    try {
      const res = await dataApi.sendPush(title.trim(), message.trim(), audience, {
        imageUrl: 'https://omidadlii01.github.io/silaneh-sabz-plus/logo-full.png',
        color: '#059669',
        ...(isUpdateNotice
          ? { url: 'https://github.com/omidadlii01/silaneh-sabz-plus/releases/download/latest/silaneh-sabz-plus.apk' }
          : {}),
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'ارسال نوتیفیکیشن با خطا مواجه شد.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-extrabold text-[#171c1f] flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#006c4a]" />
          ارسال نوتیفیکیشن پوش
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          پیام مستقیماً روی گوشی کاربرانی که اپلیکیشن نصب دارند و مجوز نوتیفیکیشن را داده‌اند نمایش داده می‌شود؛
          حتی وقتی اپلیکیشن باز نباشد.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">عنوان نوتیفیکیشن</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#006c4a]"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">متن پیام</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={300}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#006c4a] resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-2">مخاطبان</label>
          <div className="flex gap-3">
            <button
              onClick={() => setAudience('all')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                audience === 'all'
                  ? 'bg-[#006c4a] text-white border-[#006c4a] shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              همه دستگاه‌ها
            </button>
            <button
              onClick={() => setAudience('customers')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                audience === 'customers'
                  ? 'bg-[#006c4a] text-white border-[#006c4a] shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              فقط مشتریان وارد شده
            </button>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-100 transition-all">
            <input
              type="checkbox"
              checked={isUpdateNotice}
              onChange={(e) => setIsUpdateNotice(e.target.checked)}
              className="w-4 h-4 accent-[#006c4a]"
            />
            <div>
              <span className="text-xs font-bold text-slate-700 block">
                این اطلاعیه درباره‌ی نسخه‌ی جدید اپلیکیشن است
              </span>
              <span className="text-[11px] text-slate-500">
                با تیک زدن این گزینه، لمس نوتیفیکیشن روی گوشی کاربر مستقیماً صفحه‌ی دانلود APK را باز می‌کند.
              </span>
            </div>
          </label>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl p-4 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              ارسال به پایان رسید
            </div>
            <div>تعداد دستگاه‌های هدف: {result.totalTokens.toLocaleString('fa-IR')}</div>
            <div>موفق: {result.successCount.toLocaleString('fa-IR')}</div>
            {result.failCount > 0 && <div>ناموفق: {result.failCount.toLocaleString('fa-IR')}</div>}
            {result.staleRemoved > 0 && (
              <div className="text-emerald-600">
                {result.staleRemoved.toLocaleString('fa-IR')} توکن غیرفعال (حذف نصب) از لیست حذف شد.
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSendClick}
          disabled={isSending}
          className="w-full flex items-center justify-center gap-2 bg-[#006c4a] hover:bg-[#005a3d] text-white py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
        >
          {isSending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              در حال ارسال...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              ارسال نوتیفیکیشن
            </>
          )}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-slate-800 mb-2">تایید ارسال</h3>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              این پیام برای{' '}
              <b>{audience === 'all' ? 'همه دستگاه‌های ثبت‌شده' : 'دستگاه‌های مشتریان وارد شده'}</b> ارسال می‌شود و
              قابل بازگشت نیست. مطمئن هستید؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmSend}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#006c4a] text-white hover:bg-[#005a3d]"
              >
                بله، ارسال کن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
