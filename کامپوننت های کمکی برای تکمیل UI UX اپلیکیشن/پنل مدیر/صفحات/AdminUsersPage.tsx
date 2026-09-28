import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { AdminUser } from '../types';
import { ShieldCheck, Search, Edit2, CheckCircle, Clock } from 'lucide-react';

interface AdminUsersPageProps {
  onOpenApproveModal: (user: AdminUser) => void;
}

export const AdminUsersPage: React.FC<AdminUsersPageProps> = ({ onOpenApproveModal }) => {
  const { adminUsers } = useData();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = adminUsers.filter(u =>
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.phone.includes(searchQuery)
  );

  const pendingCount = adminUsers.filter(u => u.status === 'pending').length;

  return (
    <div className="space-y-6">
      
      <Breadcrumbs items={[{ label: 'مدیریت کاربران ادمین', active: true }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-[#171c1f] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#006c4a]" />
            <span>مدیریت دسترسی کاربران و مدیران سازمان</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            بررسی درخواست‌های ثبت‌نام ادمین‌های جدید، تایید نقش‌های سازمانی و تخصیص سطوح دسترسی
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="px-3.5 py-2 bg-amber-50 text-amber-800 font-bold rounded-xl text-xs border border-amber-200 flex items-center gap-1.5 shrink-0">
            <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
            <span>{pendingCount} مدیر در انتظار تایید نقش</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between text-xs">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو با نام یا شماره همراه ادمین..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#006c4a]"
          />
        </div>
      </div>

      {/* Admin Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">نام مدیر</th>
                <th className="p-3.5">شماره همراه</th>
                <th className="p-3.5">نقش فعلی</th>
                <th className="p-3.5 text-center">وضعیت حساب</th>
                <th className="p-3.5 text-center">تاریخ درخواست</th>
                <th className="p-3.5 text-center">عملیات مدیریت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 font-bold text-slate-800">
                    {user.first_name} {user.last_name}
                  </td>
                  <td className="p-3.5 font-mono text-slate-600 font-bold">{user.phone}</td>
                  <td className="p-3.5">
                    <StatusBadge type="role" value={user.role} size="sm" />
                  </td>
                  <td className="p-3.5 text-center">
                    <StatusBadge type="adminStatus" value={user.status} size="sm" />
                  </td>
                  <td className="p-3.5 text-center text-slate-500 font-mono">{user.created_at}</td>
                  <td className="p-3.5 text-center">
                    {user.status === 'pending' ? (
                      <button
                        onClick={() => onOpenApproveModal(user)}
                        className="px-3 py-1.5 bg-[#006c4a] hover:bg-[#0F5338] text-white font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1 mx-auto"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>تایید و تخصیص نقش</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenApproveModal(user)}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors mx-auto flex items-center gap-1 text-[11px] font-semibold"
                        title="ویرایش نقش"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>تغییر نقش</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
