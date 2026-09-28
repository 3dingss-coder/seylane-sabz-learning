import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AppRoutes } from '@/App';
import { ToastProvider } from '@/components/ui';

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ToastProvider>,
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
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'تلاش مجدد' })).toBeInTheDocument();
  });
});
