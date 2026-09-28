import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Lock, BarChart3, KeyRound } from 'lucide-react';

interface AuthPageProps {
  onNavigate: (path: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { login, signup, loginWithToken, authError } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [showTokenLogin, setShowTokenLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Login states
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [ownerToken, setOwnerToken] = useState('');

  // Signup states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [signupPendingSuccess, setSignupPendingSuccess] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(loginPhone, loginPassword);
    setSubmitting(false);
    if (ok) onNavigate('/dashboard');
  };

  const handleTokenLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await loginWithToken(ownerToken);
    setSubmitting(false);
    if (ok) onNavigate('/dashboard');
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await signup(firstName, lastName, phone, password);
    setSubmitting(false);
    if (ok) setSignupPendingSuccess(true);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#0F5338] text-white p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-400/20 border border-emerald-400/40 flex items-center justify-center font-black text-emerald-300 text-2xl mx-auto mb-2 shadow-inner">
            س
          </div>
          <h1 className="text-lg font-black text-white">سیلانه سبز پلاس</h1>
          <p className="text-xs text-emerald-200/80 mt-1">ورود / ثبت‌نام مدیران و سرپرستان سازمان</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 text-xs font-bold">
          <button
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-3 text-center transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'login'
                ? 'border-b-2 border-[#006c4a] text-[#006c4a] bg-emerald-50/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>ورود به حساب</span>
          </button>

          <button
            onClick={() => setActiveTab('signup')}
            className={`flex-1 py-3 text-center transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'signup'
                ? 'border-b-2 border-[#006c4a] text-[#006c4a] bg-emerald-50/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>ثبت‌نام مدیر جدید</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">

          {authError && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold text-center">
              {authError}
            </div>
          )}

          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">شماره همراه ادمین:</label>
                <input
                  type="text"
                  required
                  value={loginPhone}
                  onChange={e => setLoginPhone(e.target.value)}
                  placeholder="۰۹۱۲۱۱۱۱۱۱۱"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a] font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">رمز عبور حساب:</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 text-xs disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>ورود به داشبورد مدیریتی</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTokenLogin(v => !v)}
                className="w-full text-center text-[11px] text-slate-500 hover:text-[#006c4a] font-bold flex items-center justify-center gap-1 pt-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>ورود مدیرکل با توکن اختصاصی</span>
              </button>

              {showTokenLogin && (
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <input
                    type="password"
                    value={ownerToken}
                    onChange={e => setOwnerToken(e.target.value)}
                    placeholder="توکن مدیرکل"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTokenLoginSubmit}
                    disabled={submitting}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs disabled:opacity-60"
                  >
                    ورود با توکن
                  </button>
                </div>
              )}
            </form>
          )}

          {activeTab === 'signup' && (
            <div>
              {signupPendingSuccess ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-center space-y-3">
                  <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm text-amber-950">
                    حساب شما با موفقیت ثبت گردید
                  </h3>
                  <p className="text-xs leading-relaxed text-amber-800">
                    حساب شما در انتظار تایید مدیرکل است. تا زمان تایید نهایی و تخصیص نقش، دسترسی شما بصورت محدود به بخش گزارشات فعال می‌باشد.
                  </p>

                  <button
                    onClick={() => onNavigate('/reports')}
                    className="w-full py-2 bg-[#006c4a] text-white rounded-lg text-xs font-bold hover:bg-[#0F5338] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>مشاهده بخش گزارشات</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">نام:</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="علی"
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">نام خانوادگی:</label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="امینی"
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">شماره همراه:</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">رمز عبور دلخواه:</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 text-xs"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>ثبت درخواست حساب مدیر جدید</span>
                  </button>
                </form>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
