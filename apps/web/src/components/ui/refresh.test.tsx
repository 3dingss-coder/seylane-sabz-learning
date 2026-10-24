import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/layout/BottomNav';
import { isItemActive } from '@/lib/navMatch';
import { ShieldCheck, Users } from 'lucide-react';
import { Confetti, CountUp, ErrorBoundary, KpiCard, Modal, ProgressBar } from './index';

describe('design refresh — ui', () => {
  it('KpiCard keeps Persian digits and suffix (count-up is off under test)', () => {
    render(<KpiCard title="نرخ تکمیل" value="۱۲٪" icon={Users} />);
    expect(screen.getByText('۱۲٪')).toBeInTheDocument();
  });

  it('KpiCard never mangles decimals or fractions', () => {
    render(<KpiCard title="a" value="۱٫۵ ساعت" icon={Users} />);
    render(<KpiCard title="b" value="۱ / ۳" icon={ShieldCheck} />);
    expect(screen.getByText('۱٫۵ ساعت')).toBeInTheDocument();
    expect(screen.getByText('۱ / ۳')).toBeInTheDocument();
  });

  it('CountUp formats with the given formatter', () => {
    render(<CountUp value={1250} format={(n) => n.toLocaleString('fa-IR')} />);
    expect(screen.getByText(/۱[٬,]?۲۵۰/)).toBeInTheDocument();
  });

  it('ProgressBar clamps and exposes aria values', () => {
    render(<ProgressBar value={250} label="پیشرفت" />);
    expect(screen.getByRole('progressbar', { name: 'پیشرفت' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  it('Confetti renders nothing when motion is off', () => {
    const { container } = render(<Confetti />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Modal unmounts when closed and calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="تأیید">
        محتوا
      </Modal>,
    );
    fireEvent.click(document.querySelector('[aria-hidden="true"].bg-scrim') as Element);
    expect(onClose).toHaveBeenCalled();
    rerender(
      <Modal open={false} onClose={onClose} title="تأیید">
        محتوا
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ErrorBoundary shows a friendly fallback and recovers when the route changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let boom = true;
    function Bomb() {
      if (boom) throw new Error('x');
      return <p>سالم</p>;
    }
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('یک مشکل پیش آمد');
    boom = false;
    rerender(
      <ErrorBoundary resetKey="/b">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('سالم')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('design refresh — navigation', () => {
  it('BottomNav keeps «آموزش‌ها» active on package/section/quiz pages', () => {
    render(
      <MemoryRouter initialEntries={['/packages/p1']}>
        <BottomNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /آموزش‌ها/ }).className).toContain('text-primary');
    expect(screen.getByRole('link', { name: /خانه/ }).className).not.toContain('text-primary');
  });

  it('isItemActive: exact for top-level entries, prefix for deeper ones, aliases for details', () => {
    const dash = { to: '/admin', label: 'د', icon: Users };
    const content = { to: '/admin/content', label: 'م', icon: Users, match: ['/admin/packages'] };
    expect(isItemActive('/admin', dash)).toBe(true);
    expect(isItemActive('/admin/users', dash)).toBe(false);
    expect(isItemActive('/admin/content/brands/b1', content)).toBe(true);
    expect(isItemActive('/admin/packages/p1', content)).toBe(true);
    expect(isItemActive('/admin/packagesX', content)).toBe(false);
  });
});
