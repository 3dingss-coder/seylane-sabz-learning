import { Route, Routes } from 'react-router-dom';
import { BarChart3, ClipboardList, LayoutDashboard, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { RetakeList } from '@/components/reports/RetakeList';
import { PanelLayout } from '@/layouts/PanelLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/m/ProfilePage';
import { ManagerDashboard } from './ManagerDashboard';
import { ManagerMember } from './ManagerMember';
import { ManagerReports } from './ManagerReports';

const NAV = [
  { to: '/manager', label: 'داشبورد', icon: LayoutDashboard, match: ['/manager/members'] },
  { to: '/manager/reports', label: 'گزارش تکمیل', icon: BarChart3 },
  { to: '/manager/retakes', label: 'آزمون مجدد', icon: ClipboardList },
  { to: '/manager/profile', label: 'پروفایل', icon: UserRound },
];

export default function ManagerRoutes() {
  return (
    <Routes>
      <Route element={<PanelLayout title="پنل مدیر" items={NAV} />}>
        <Route index element={<ManagerDashboard />} />
        <Route path="reports" element={<ManagerReports />} />
        <Route path="members/:id" element={<ManagerMember />} />
        <Route
          path="retakes"
          element={
            <>
              <PageHeader title="درخواست‌های آزمون مجدد" />
              <RetakeList
                base="/manager"
                memberLink={(id) => `/manager/members/${id}`}
                isAdmin={false}
              />
            </>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
