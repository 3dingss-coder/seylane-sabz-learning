import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/ui';
import { GalleryPage } from '@/pages/GalleryPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Routes grow per PROMPT (002 auth, 008 marketer home, 013 manager, 004+ admin).
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GalleryPage />} />
      <Route path="/gallery" element={<GalleryPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  );
}
