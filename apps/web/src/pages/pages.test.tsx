import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AppRoutes } from '@/App';
import { ToastProvider } from '@/components/ui';
import { ProductImage } from '@/components/common/ProductImage';
import { BrandLogo } from '@/components/brand/BrandLogo';
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
    // 5s, not the 1s default: with all 24 files running in parallel this page can take longer
    // than a second to resolve the manifest, and the flake was the timeout, not the assertion.
    expect(
      await screen.findByRole('img', { name: 'لوگوی دافی' }, { timeout: 5000 }),
    ).toHaveAttribute('src', '/catalog/brands/brand-sb-2/logo.png');
  });

  it('gallery shows retry on manifest failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderAt('/gallery');
    expect(await screen.findByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument();
  });

  it('redirects anonymous users from the marketer home to login', async () => {
    localStorage.clear();
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'ورود' })).toBeInTheDocument();
    expect(screen.getByLabelText('شماره موبایل')).toBeInTheDocument();
  });

  it('protects the admin panel', async () => {
    localStorage.clear();
    renderAt('/admin');
    expect(await screen.findByRole('button', { name: 'ورود' })).toBeInTheDocument();
  });

  it('resets image error state when ProductImage or BrandLogo src changes', () => {
    const { rerender } = render(<ProductImage src="/bad.png" alt="محصول الف" />);
    const img = screen.getByRole('img', { name: 'محصول الف' });
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'محصول الف' })).toBeNull();
    expect(screen.getByText('محصول الف')).toBeInTheDocument();

    rerender(<ProductImage src="/good.png" alt="محصول الف" />);
    expect(screen.getByRole('img', { name: 'محصول الف' })).toHaveAttribute('src', '/good.png');

    const { rerender: rerenderLogo } = render(<BrandLogo name="ویت‌آس" logoUrl="/bad-logo.png" />);
    fireEvent.error(screen.getByRole('img', { name: 'لوگوی ویت‌آس' }));
    expect(screen.queryByRole('img', { name: 'لوگوی ویت‌آس' })).toBeNull();

    rerenderLogo(<BrandLogo name="ویت‌آس" logoUrl="/good-logo.png" />);
    expect(screen.getByRole('img', { name: 'لوگوی ویت‌آس' })).toHaveAttribute(
      'src',
      '/good-logo.png',
    );
  });
});
