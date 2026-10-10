import { Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Bot,
  FolderTree,
  Library,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings2,
  Share2,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
import { PanelLayout } from '@/layouts/PanelLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/m/ProfilePage';
import { AdminDashboard } from './AdminDashboard';
import { AssignmentsPage } from './AssignmentsPage';
import { AuditPage } from './AuditPage';
import { BrandDetailPage } from './BrandDetailPage';
import { ContentPage } from './ContentPage';
import { NotificationsPage } from './NotificationsPage';
import { PushCampaignEditorPage } from './PushCampaignEditorPage';
import { PushAutomationsPage } from './PushAutomationsPage';
import { PushCampaignsPage } from './PushCampaignsPage';
import { MediaLibraryPage } from './MediaLibraryPage';
import { MentorGuidesPage } from './MentorGuidesPage';
import { PackageEditorPage } from './PackageEditorPage';
import { PoliciesPage } from './PoliciesPage';
import { QuizBuilderPage } from './QuizBuilderPage';
import { ReportsPage } from './ReportsPage';
import { TeamsPage } from './TeamsPage';
import { AdminUserDetail, UsersPage } from './UsersPage';

const NAV = [
  { to: '/admin', label: 'داشبورد', icon: LayoutDashboard },
  {
    to: '/admin/content',
    label: 'محتوای آموزشی',
    icon: FolderTree,
    match: ['/admin/packages', '/admin/quizzes'],
  },
  { to: '/admin/media', label: 'کتابخانه رسانه', icon: Library },
  { to: '/admin/mentor', label: 'رفتار منتور', icon: Bot },
  { to: '/admin/assignments', label: 'مسیرها و مخاطبان', icon: Share2 },
  { to: '/admin/users', label: 'کاربران', icon: Users },
  { to: '/admin/teams', label: 'تیم‌ها', icon: UsersRound },
  { to: '/admin/reports', label: 'گزارش‌ها', icon: BarChart3 },
  { to: '/admin/notifications', label: 'اعلان‌ها', icon: Bell },
  { to: '/admin/push-campaigns', label: 'کمپین‌های Push', icon: Megaphone },
  { to: '/admin/policies', label: 'سیاست‌ها', icon: Settings2 },
  { to: '/admin/audit', label: 'لاگ تغییرات', icon: ScrollText },
  { to: '/admin/profile', label: 'پروفایل', icon: UserRound },
];

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<PanelLayout title="پنل ادمین" items={NAV} />}>
        <Route index element={<AdminDashboard />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="mentor" element={<MentorGuidesPage />} />
        <Route path="content/brands/:id" element={<BrandDetailPage />} />
        <Route path="packages/:id" element={<PackageEditorPage />} />
        <Route path="quizzes/:id" element={<QuizBuilderPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="push-campaigns" element={<PushCampaignsPage />} />
        {/* The automation engine lives inside the same section: one URL namespace, one mental model
            («کمپین‌های Push» = دستی + خودکار). Registered before `:id` for readability only — React
            Router already prefers a static segment over a param. */}
        <Route path="push-campaigns/automations" element={<PushAutomationsPage />} />
        <Route path="push-campaigns/new" element={<PushCampaignEditorPage />} />
        <Route path="push-campaigns/:id" element={<PushCampaignEditorPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
