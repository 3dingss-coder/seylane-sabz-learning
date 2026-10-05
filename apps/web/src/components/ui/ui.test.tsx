import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/layout/BottomNav';
import { BrandLogo } from '@/components/brand/BrandLogo';
import {
  Button,
  Card,
  CountdownChip,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PackageCardSkeleton,
  ProgressRing,
  StatusBadge,
  ToastProvider,
  useToast,
} from './index';

describe('Button', () => {
  it('renders and handles click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>ادامه</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('is disabled and busy while loading', () => {
    render(<Button loading>ثبت</Button>);
    const btn = screen.getByRole('button', { name: 'ثبت' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
  it('meets the 48px minimum touch height (md = 52px, lg = 56px)', () => {
    const { rerender } = render(<Button>ورود</Button>);
    // min-h-13 = 3.25rem = 52px — above the §16.5 floor of 48px
    expect(screen.getByRole('button').className).toContain('min-h-13');
    rerender(<Button size="lg">ورود</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-14');
  });
});

describe('Input', () => {
  it('links label and error for accessibility', () => {
    render(<Input label="شماره موبایل" error="شماره درست نیست" />);
    const input = screen.getByLabelText('شماره موبایل');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('شماره درست نیست')).toBeInTheDocument();
  });
});

describe('Card / Skeleton / States', () => {
  it('renders card content', () => {
    render(<Card>محتوا</Card>);
    expect(screen.getByText('محتوا')).toBeInTheDocument();
  });
  it('skeleton is hidden from assistive tech', () => {
    const { container } = render(<PackageCardSkeleton />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden');
  });
  it('empty state renders CTA', () => {
    const onAction = vi.fn();
    render(<EmptyState title="خالی" actionText="شروع" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'شروع' }));
    expect(onAction).toHaveBeenCalled();
  });
  it('error state has retry', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('ProgressRing', () => {
  it('clamps and exposes value', () => {
    render(<ProgressRing value={140} label="پیشرفت" />);
    expect(screen.getByRole('progressbar', { name: 'پیشرفت' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });
});

describe('CountdownChip', () => {
  it('shows warning state with spoken label', () => {
    const now = Date.UTC(2026, 0, 1);
    render(<CountdownChip deadline={now + 30 * 3_600_000} now={now} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('مهلت نزدیک');
    expect(timer.getAttribute('aria-label')).toContain('ساعت');
  });
  it('shows overdue', () => {
    const now = Date.UTC(2026, 0, 1);
    render(<CountdownChip deadline={now - 1000} now={now} />);
    expect(screen.getByRole('timer')).toHaveTextContent('مهلت گذشته');
  });
});

describe('StatusBadge', () => {
  it('shows Persian label', () => {
    render(<StatusBadge status="locked" />);
    expect(screen.getByText('قفل')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('opens as dialog and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="تأیید">
        <p>متن</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'تأیید' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => undefined} title="x">
        y
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <button onClick={() => toast.show({ type: 'success', message: 'ذخیره شد' })}>نمایش</button>
    );
  }
  it('shows and auto-dismisses after 3s', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('نمایش'));
    expect(screen.getByRole('status')).toHaveTextContent('ذخیره شد');
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByText('ذخیره شد')).toBeNull();
    vi.useRealTimers();
  });
});

describe('BottomNav', () => {
  it('renders the 4 spec tabs', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>,
    );
    for (const label of ['خانه', 'آموزش‌ها', 'پیام‌ها', 'کارت‌ها']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });
});

describe('BrandLogo', () => {
  it('falls back to brand name text (never a fake image) on load error', () => {
    render(<BrandLogo name="دافی" logoUrl="/catalog/brands/brand-sb-2/logo.png" />);
    const img = screen.getByRole('img', { name: 'لوگوی دافی' });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('دافی')).toBeInTheDocument();
  });
});
