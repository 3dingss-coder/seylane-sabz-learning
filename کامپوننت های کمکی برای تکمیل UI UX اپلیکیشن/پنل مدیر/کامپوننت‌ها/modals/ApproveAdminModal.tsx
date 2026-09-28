import React, { useState } from 'react';
import { AdminUser, AdminRole } from '../../types';
import { useData } from '../../context/DataContext';
import { X, ShieldCheck, Check } from 'lucide-react';

interface ApproveAdminModalProps {
  adminUser: AdminUser | null;
  onClose: () => void;
}

export const ApproveAdminModal: React.FC<ApproveAdminModalProps> = ({ adminUser, onClose }) => {
  const { approveAdminUser } = useData();

  const [selectedRole, setSelectedRole] = useState<AdminRole>(
    adminUser?.role || 'مدیر فروش'
  );

  if (!adminUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    approveAdminUser(adminUser.id, selectedRole);
    onClose();
  };

  const roleDescriptions: Record<string, string> = {
    'مدیرکل': 'دسترسی کامل و نامحدود به تمامی بخش‌ها، تنظیمات و تایید سایر کاربران ادمین.',
    'مدیر فروش': 'دسترسی به مدیریت سفارش‌ها، لیست مشتریان، فاکتورها و گزارشات فروش.',
    'مدیر محتوا': 'دسترسی به کاتالوگ محصولات، تعریف برندها، آفرها و جشنواره‌ها.',
    'مدیر بازاریابی': 'دسترسی به مدیریت بازاریابان، تخصیص تارگت، مناطق فعالیت و مشتریان.'
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        <div className="bg-[#0F5338] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">
              {adminUser.status === 'pending' ? 'تایید حساب و تعیین نقش ادمین' : 'تغییر نقش مدیر سازمان'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-emerald-900 text-emerald-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-sm font-bold text-slate-800">
              {adminUser.first_name} {adminUser.last_name}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              شماره همراه: {adminUser.phone}
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">انتخاب نقش دسترسی سازمانی:</label>
            <select
              value={selectedRole || 'مدیر فروش'}
              onChange={e => setSelectedRole(e.target.value as AdminRole)}
              className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg font-bold text-[#0F5338] text-xs"
            >
              <option value="مدیرکل">مدیرکل (Super Admin)</option>
              <option value="مدیر فروش">مدیر فروش (Sales Manager)</option>
              <option value="مدیر محتوا">مدیر محتوا (Content Manager)</option>
              <option value="مدیر بازاریابی">مدیر بازاریابی (Marketing Manager)</option>
            </select>
          </div>

          {selectedRole && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
              <span className="font-bold block mb-0.5">اختیارات نقش {selectedRole}:</span>
              {roleDescriptions[selectedRole]}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#006c4a] text-white hover:bg-[#0F5338] font-bold shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{adminUser.status === 'pending' ? 'تایید و فعال‌سازی حساب' : 'ذخیره نقش جدید'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
