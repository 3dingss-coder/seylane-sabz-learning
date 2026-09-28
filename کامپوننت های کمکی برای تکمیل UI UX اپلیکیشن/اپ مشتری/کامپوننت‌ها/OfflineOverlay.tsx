import React from 'react';
import { Unplug, RotateCw } from 'lucide-react';

interface OfflineOverlayProps {
  onRetry: () => void;
}

export const OfflineOverlay: React.FC<OfflineOverlayProps> = ({ onRetry }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0f5338]/97 backdrop-blur-sm px-6 animate-in fade-in duration-300">
      <div className="w-full max-w-[340px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] px-6 py-8 flex flex-col items-center text-center gap-5">
        <div className="relative w-28 h-28 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-[#fee2e2]" />
          <div className="absolute inset-2 rounded-full bg-white shadow-inner" />
          <Unplug className="relative w-12 h-12 text-[#dc2626]" strokeWidth={1.8} />
          <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-[#dc2626] border-2 border-white" />
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="font-['Vazirmatn'] text-[17px] font-extrabold text-[#171c1f]">
            متأسفیم، اتصال برقرار نشد!
          </h2>
          <p className="font-['Vazirmatn'] text-[13px] text-[#6f7973] leading-6">
            لطفاً وضعیت اینترنت خود را بررسی کنید و مجدد تلاش کنید.
          </p>
        </div>

        <button
          onClick={onRetry}
          className="w-full flex items-center justify-center gap-2 bg-[#006c4a] hover:bg-[#005238] active:bg-[#003825] text-white rounded-2xl py-3 text-[13px] font-extrabold active:scale-95 transition-all shadow-xs"
        >
          <RotateCw className="w-4 h-4" strokeWidth={2.2} />
          تلاش مجدد
        </button>

        <span className="text-[11px] text-[#94a3b8] font-medium">
          به محض برقراری اتصال، این پیام به‌صورت خودکار بسته می‌شود
        </span>
      </div>
    </div>
  );
};
