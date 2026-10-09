import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Bot,
  FolderTree,
  Library,
  LayoutDashboard,
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
const AdminDashboard = lazy(() => import('./AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AssignmentsPage = lazy(() => import('./AssignmentsPage').then((m) => ({ default: m.AssignmentsPage })));
const AuditPage = lazy(() => import('./AuditPage').then((m) => ({ default: m.AuditPage })));
const BrandDetailPage = lazy(() => import('./BrandDetailPage').then((m) => ({ default: m.BrandDetailPage })));
const ContentPage = lazy(() => import('./ContentPage').then((m) => ({ default: m.ContentPage })));
const NotificationsPage = lazy(() => import('./NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const MediaLibraryPage = lazy(() => import('./MediaLibraryPage').then((m) => ({ default: m.MediaLibraryPage })));
const MentorGuidesPage = lazy(() => import('./MentorGuidesPage').then((m) => ({ default: m.MentorGuidesPage })));
const PackageEditorPage = lazy(() => import('./PackageEditorPage').then((m) => ({ default: m.PackageEditorPage })));
const PoliciesPage = lazy(() => import('./PoliciesPage').then((m) => ({ default: m.PoliciesPage })));
const QuizBuilderPage = lazy(() => import('./QuizBuilderPage').then((m) => ({ default: m.QuizBuilderPage })));
const ReportsPage = lazy(() => import('./ReportsPage').then((m) => ({ default: m.ReportsPage })));
const TeamsPage = lazy(() => import('./TeamsPage').then((m) => ({ default: m.TeamsPage })));
const UsersPage = lazy(() => import('./UsersPage').then((m) => ({ default: m.UsersPage })));
const AdminUserDetail = lazy(() => import('./UsersPage').then((m) => ({ default: m.AdminUserDetail })));

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
  { to: '/admin/policies', label: 'سیاست‌ها', icon: Settings2 },
  { to: '/admin/audit', label: 'لاگ تغییرات', icon: ScrollText },
  { to: '/admin/profile', label: 'پروفایل', icon: UserRound },
];

export default function AdminRoutes() {
  return (
    <Suspense fallback={<div role="status" aria-live="polite" className="p-6 text-center">در حال بارگذاری…</div>}>
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
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
