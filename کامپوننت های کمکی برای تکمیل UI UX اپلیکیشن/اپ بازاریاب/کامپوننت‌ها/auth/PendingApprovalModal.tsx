import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface PendingApprovalModalProps {
  onDismiss: () => void;
}

export const PendingApprovalModal: React.FC<PendingApprovalModalProps> = ({ onDismiss }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        id="pending-approval-modal"
        className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5 border border-slate-100 animate-fadeIn"
      >
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center border border-emerald-100 shadow-inner">
          <CheckCircle2 className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-slate-900">ممنون از ثبت‌نام شما</h2>
          <p className="text-xs text-slate-600 font-bold leading-relaxed">
            بعد از تایید مدیر بازاریابی شما به طور خودکار می‌توانید از اپلیکیشن بازاریابی سیلانه سبز استفاده کنید.
          </p>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">ممنون از شکیبایی شما</p>
        </div>

        <button
          type="button"
          id="btn-pending-approval-dismiss"
          onClick={onDismiss}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all"
        >
          متوجه شدم
        </button>
      </div>
    </div>
  );
};
