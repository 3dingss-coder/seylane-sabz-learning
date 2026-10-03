import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary, ToastProvider } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isNative, registerPush } from '@/lib/native';
import { resumeWebPush } from '@/lib/webPush';
import { setCrashUser, track } from '@/lib/telemetry';
import { MarketerLayout } from '@/layouts/MarketerLayout';
import { FullPageSpinner, RequireAuth } from '@/layouts/RequireAuth';
import { AuthPage } from '@/pages/auth/AuthPage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
import { CardsPage } from '@/pages/m/CardsPage';
import { HomePage } from '@/pages/m/HomePage';
import { LearnPage } from '@/pages/m/LearnPage';
import { MentorPage } from '@/pages/m/MentorPage';
import { MessagesPage } from '@/pages/m/MessagesPage';
import { PackagePage } from '@/pages/m/PackagePage';
import { ProfilePage } from '@/pages/m/ProfilePage';
import { QuizPage } from '@/pages/m/QuizPage';
import { SectionPage } from '@/pages/m/SectionPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Panels are code-split: marketers (mobile, weak networks) never download admin code.
const ManagerRoutes = lazy(() => import('@/pages/manager/ManagerRoutes'));
const AdminRoutes = lazy(() => import('@/pages/admin/AdminRoutes'));
const GalleryPage = lazy(() =>
  import('@/pages/GalleryPage').then((m) => ({ default: m.GalleryPage })),
);

/** App-open event, push registration (Android + web) and crash-report user tag. */
function NativeBridge() {
  const { status, user } = useAuth();
  const nav = useNavigate();
  const uid = user?.id ?? null;
  useEffect(() => {
    setCrashUser(uid);
  }, [uid]);
  useEffect(() => {
    if (status !== 'authenticated') return;
    track('app_opened', { native: isNative() });
    void registerPush((to) => nav(to));
    void resumeWebPush();
  }, [status, nav]);
  return null;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage initial="register" />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth roles={['marketer']}>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth roles={['marketer']}>
              <MarketerLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="packages/:id" element={<PackagePage />} />
          <Route path="sections/:id" element={<SectionPage />} />
          <Route path="quiz/:sectionId" element={<QuizPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="mentor" element={<MentorPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route
          path="/manager/*"
          element={
            <RequireAuth roles={['manager']}>
              <ManagerRoutes />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/*"
          element={
            <RequireAuth roles={['admin', 'superadmin']}>
              <AdminRoutes />
            </RequireAuth>
          }
        />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

/** Error boundary that recovers automatically when the user navigates elsewhere. */
function RouteGuard() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <AppRoutes />
    </ErrorBoundary>
  );
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 3600_000,
        refetchOnWindowFocus: true,
        retry: (count, e) =>
          !(
            e instanceof ApiError &&
            ['FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'UNAUTHENTICATED'].includes(e.code)
          ) && count < 2,
      },
    },
  });
}

export default function App() {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <NativeBridge />
            <RouteGuard />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
