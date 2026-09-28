import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AppRoutes } from '@/App';
import { ToastProvider } from '@/components/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';

function renderAt(path: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('routing', () => {
  it('shows Persian 404 for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'این صفحه پیدا نشد' })).toBeInTheDocument();
  });

  it('gallery renders real brand logos from the manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          brands: [
            {
              id: 'brand-sb-2',
              name: 'دافی',
              nameLatin: 'Dafi',
              sortOrder: 5,
              logoUrl: '/catalog/brands/brand-sb-2/logo.png',
            },
          ],
          products: [],
        }),
      }),
    );
    renderAt('/gallery');
    expect(await screen.findByRole('img', { name: 'لوگوی دافی' })).toHaveAttribute(
      'src',
      '/catalog/brands/brand-sb-2/logo.png',
    );
  });

  it('gallery shows retry on manifest failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderAt('/gallery');
    expect(await screen.findByRole('button', { name: 'تلاش مجدد' })).toBeInTheDocument();
  });

  it('redirects anonymous users from the marketer home to login', async () => {
    localStorage.clear();
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'ورود' })).toBeInTheDocument();
    expect(screen.getByLabelText('شماره موبایل یا ایمیل')).toBeInTheDocument();
  });

  it('protects the admin panel', async () => {
    localStorage.clear();
    renderAt('/admin');
    expect(await screen.findByRole('button', { name: 'ورود' })).toBeInTheDocument();
  });
});
