import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui';
import { PushOptInBanner } from './PushOptInBanner';

const state = vi.hoisted(() => ({ push: 'default' as string, status: 'authenticated' }));
const enable = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ status: state.status }) }));
vi.mock('@/lib/webPush', () => ({
  webPushState: () => state.push,
  enableWebPush: enable,
}));

const renderBanner = () =>
  render(
    <ToastProvider>
      <PushOptInBanner />
    </ToastProvider>,
  );

describe('PushOptInBanner', () => {
  beforeEach(() => {
    state.push = 'default';
    state.status = 'authenticated';
    localStorage.clear();
    enable.mockReset();
  });

  it('asks signed-in users who have not decided yet, and requests permission on click', async () => {
    enable.mockResolvedValue('granted');
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'فعال‌سازی' }));
    await waitFor(() => expect(enable).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
  });

  it('is hidden for guests, granted and denied users', () => {
    state.status = 'unauthenticated';
    const a = renderBanner();
    expect(screen.queryByRole('region')).toBeNull();
    a.unmount();
    state.status = 'authenticated';
    for (const p of ['granted', 'denied', 'unavailable']) {
      state.push = p;
      const r = renderBanner();
      expect(screen.queryByRole('region')).toBeNull();
      r.unmount();
    }
  });

  it('snoozes for a week when dismissed', () => {
    const r = renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'بعداً' }));
    expect(screen.queryByRole('region')).toBeNull();
    r.unmount();
    renderBanner();
    expect(screen.queryByRole('region')).toBeNull();
  });
});
