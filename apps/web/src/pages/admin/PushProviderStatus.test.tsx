import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushProviderStatus } from './NotificationsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get },
  ApiError: class ApiError extends Error {
    fields: Record<string, string> = {};
  },
}));

afterEach(() => {
  mocks.get.mockReset();
});

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PushProviderStatus />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

describe('PushProviderStatus', () => {
  it('shows a clear warning when the provider is not configured', async () => {
    mocks.get.mockResolvedValue({ configured: false });
    renderStatus();
    expect(await screen.findByText('ارسال Push پیکربندی نشده است')).toBeInTheDocument();
    expect(screen.getByText(/مقدار Secret را در کد یا گفتگو وارد نکنید/)).toBeInTheDocument();
  });

  it('does not show a configuration warning when the provider is configured', async () => {
    mocks.get.mockResolvedValue({ configured: true });
    const { client } = renderStatus();
    await waitFor(() =>
      expect(client.getQueryState(['admin', 'push-provider-status'])?.status).toBe('success'),
    );
    expect(screen.queryByText('ارسال Push پیکربندی نشده است')).not.toBeInTheDocument();
  });
});
