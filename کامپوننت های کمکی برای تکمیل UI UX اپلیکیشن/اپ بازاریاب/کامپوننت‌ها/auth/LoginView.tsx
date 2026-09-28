import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isValidIranianMobile } from '../../utils/persian';
import { Phone, Lock, LogIn, Sparkles, ShieldCheck, UserPlus, AlertCircle, Clock } from 'lucide-react';

interface LoginViewProps {
  onSwitchToSignup?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSwitchToSignup }) => {
  const { login, isAuthLoading } = useAuth();

  const [phone, setPhone] = useState('09123456789');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPendingApproval(false);

    if (!phone.trim()) {
      setError('شماره موبایل را وارد کنید.');
      return;
    }
    if (!isValidIranianMobile(phone)) {
      setError('شماره موبایل نامعتبر است (مثال: 09123456789)');
      return;
    }

    setError('');
    const result = await login(phone, password);
    if (!result.success) {
      if (result.code === 'ACCOUNT_NOT_ACTIVE' || result.error?.includes('تایید نشده')) {
        setIsPendingApproval(true);
        setError('حساب شما هنوز توسط مدیر سیستم تایید نشده است');
      } else {
        setError(result.error || 'ورود با خطا مواجه شد. لطفاً مجدداً بررسی نمایید.');
      }
    }
  };

  const handleDemoLogin = async () => {
    setIsPendingApproval(false);
    setError('');
    setPhone('09123456789');
    setPassword('123456');
    const result = await login('09123456789', '123456');
    if (!result.success) {
      if (result.code === 'ACCOUNT_NOT_ACTIVE' || result.error?.includes('تایید نشده')) {
        setIsPendingApproval(true);
        setError('حساب شما هنوز توسط مدیر سیستم تایید نشده است');
      } else {
        setError(result.error || 'ورود با خطا مواجه شد.');
      }
    }
  };

  return (
    <div
      id="login-view"
      className="min-h-screen bg-slate-900 flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 border border-slate-100 animate-fadeIn">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 mx-auto flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-emerald-600/30">
            <span>س+</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">سیلانه سبز پلاس</h1>
          <p className="text-xs text-slate-500 font-medium">
            سامانه اختصاصی بازاریاب‌ها و ویزیتورهای هلدینگ
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              id="login-error-alert"
              className={`p-3.5 border rounded-2xl text-xs font-bold leading-relaxed flex items-start gap-2 ${
                isPendingApproval
                  ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-sm'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {isPendingApproval ? (
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p>{error}</p>
                {isPendingApproval && (
                  <p className="text-[11px] font-normal text-amber-700 mt-1">
                    درخواست فعال‌سازی حساب شما پس از ثبت‌نام در سامانه در انتظار تایید سرپرست است.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              شماره موبایل بازاریاب:
            </label>
            <input
              id="login-phone-input"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09123456789"
              className="w-full p-3 text-left bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              رمز عبور:
            </label>
            <input
              id="login-password-input"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full p-3 text-left bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            id="btn-login-submit"
            disabled={isAuthLoading}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
          >
            <LogIn className="w-4 h-4" />
            <span>{isAuthLoading ? 'در حال احراز هویت...' : 'ورود به پنل بازاریاب'}</span>
          </button>
        </form>

        {/* Signup Switch Link */}
        {onSwitchToSignup && (
          <div className="text-center pt-1">
            <button
              type="button"
              id="btn-switch-to-signup"
              onClick={onSwitchToSignup}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-bold transition-colors inline-flex items-center gap-1.5 hover:underline"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
              <span>حساب کاربری ندارید؟ ثبت‌نام کنید</span>
            </button>
          </div>
        )}

        {/* Quick Demo Login */}
        <div className="pt-2 border-t border-slate-100 text-center space-y-2">
          <button
            type="button"
            id="btn-demo-login"
            onClick={handleDemoLogin}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>ورود سریع با حساب نمونه (علیرضا کاظمی)</span>
          </button>

          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            اتصال امن به سامانه پخش سراسری سیلانه سبز
          </p>
        </div>
      </div>
    </div>
  );
};
