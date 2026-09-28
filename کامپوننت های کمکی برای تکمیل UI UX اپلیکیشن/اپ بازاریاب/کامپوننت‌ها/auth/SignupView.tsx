import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isValidIranianMobile } from '../../utils/persian';
import { User, Phone, Lock, MapPin, UserPlus, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface SignupViewProps {
  onSwitchToLogin: () => void;
}

const REGION_OPTIONS = [
  'تهران - منطقه ۱ و ۲ (شمال)',
  'تهران - منطقه ۳ و ۶ (مرکز و ونک)',
  'تهران - منطقه ۴ و ۸ (شرق)',
  'تهران - منطقه ۵ و ۲۲ (غرب)',
  'تهران - جنوب و حومه',
  'کرج و استان البرز',
  'مشهد و استان خراسان',
  'اصفهان و حومه',
  'شیراز و استان فارس',
  'تبریز و آذربایجان شرقی',
  'سایر استان‌ها و شهرستان‌ها',
];

export const SignupView: React.FC<SignupViewProps> = ({ onSwitchToLogin }) => {
  const { signup, isAuthLoading } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [region, setRegion] = useState(REGION_OPTIONS[0]);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim()) {
      setError('لطفاً نام خود را وارد کنید.');
      return;
    }

    if (!lastName.trim()) {
      setError('لطفاً نام خانوادگی خود را وارد کنید.');
      return;
    }

    if (!phone.trim()) {
      setError('لطفاً شماره موبایل خود را وارد کنید.');
      return;
    }

    if (!isValidIranianMobile(phone)) {
      setError('شماره موبایل نامعتبر است (مثال: 09123456789)');
      return;
    }

    if (!password) {
      setError('لطفاً رمز عبور را وارد کنید.');
      return;
    }

    if (password.length < 5) {
      setError('رمز عبور باید حداقل ۵ کاراکتر باشد.');
      return;
    }

    if (password !== confirmPassword) {
      setError('رمز عبور و تکرار آن با یکدیگر مطابقت ندارند.');
      return;
    }

    const result = await signup({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      password,
      region,
    });

    if (result.success) {
      // If auto-login succeeded, isAuthenticated flips to true and the
      // parent App switches away from this screen automatically (to the
      // pending-approval welcome popup). This success card is only ever
      // seen as a fallback — when auto-login couldn't complete — so the
      // user still has a way forward (manual login).
      setIsSuccess(true);
      setSuccessMessage(result.message || 'ثبت‌نام شما با موفقیت انجام شد. حساب شما پس از تایید مدیر سیستم فعال خواهد شد.');
    } else {
      setError(result.error || 'ثبت‌نام با خطا مواجه شد. لطفاً مجدداً بررسی فرمایید.');
    }
  };

  return (
    <div
      id="signup-view"
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
            ثبت‌نام بازاریاب و ویزیتور جدید هلدینگ
          </p>
        </div>

        {isSuccess ? (
          /* Success Screen */
          <div id="signup-success-card" className="space-y-5 text-center py-2 animate-fadeIn">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center border border-emerald-100 shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-black text-slate-800">ثبت‌نام با موفقیت انجام شد</h2>
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-xs text-emerald-900 font-bold leading-relaxed">
                {successMessage}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed px-1">
                اطلاعات شما در پنل مدیریت ثبت شده است. پس از تایید توسط سرپرست فروش، می‌توانید با شماره همراه خود وارد سامانه شوید.
              </p>
            </div>

            <button
              type="button"
              id="btn-return-to-login"
              onClick={onSwitchToLogin}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <span>بازگشت به صفحه‌ی ورود</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Registration Form */
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && (
              <div id="signup-error-alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* First & Last Name */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  نام:
                </label>
                <input
                  id="signup-firstname-input"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="مثال: علی"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">
                  نام خانوادگی:
                </label>
                <input
                  id="signup-lastname-input"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="مثال: رضایی"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" />
                شماره موبایل بازاریاب:
              </label>
              <input
                id="signup-phone-input"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                className="w-full p-2.5 text-left bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold"
              />
            </div>

            {/* Region */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                منطقه فعالیت (ویزیت):
              </label>
              <select
                id="signup-region-select"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800 font-medium"
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                رمز عبور:
              </label>
              <input
                id="signup-password-input"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="حداقل ۵ کاراکتر"
                className="w-full p-2.5 text-left bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                تکرار رمز عبور:
              </label>
              <input
                id="signup-confirm-password-input"
                type="password"
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="تکرار مجدد رمز عبور"
                className="w-full p-2.5 text-left bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Signup Submit Button */}
            <button
              type="submit"
              id="btn-signup-submit"
              disabled={isAuthLoading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all mt-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isAuthLoading ? 'در حال ثبت اطلاعات...' : 'ثبت‌نام در سامانه بازاریاب‌ها'}</span>
            </button>
          </form>
        )}

        {/* Bottom Switch Link */}
        <div className="pt-2 border-t border-slate-100 text-center space-y-2">
          <button
            type="button"
            id="btn-switch-to-login"
            onClick={onSwitchToLogin}
            className="text-xs text-emerald-700 hover:text-emerald-800 font-bold transition-colors inline-flex items-center gap-1"
          >
            <span>قبلاً ثبت‌نام کرده‌اید؟ وارد شوید</span>
          </button>

          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            اطلاعات شما نزد هلدینگ سیلانه سبز محفوظ است
          </p>
        </div>
      </div>
    </div>
  );
};
