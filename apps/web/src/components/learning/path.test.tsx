import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CelebrationScreen } from './CelebrationScreen';
import { PathScreen } from './PathScreen';
import { StationTile } from './StationTile';
import type { PackageSummary } from '@/lib/types';

const pkg = (
  id: string,
  status: PackageSummary['status'],
  order: number,
  title = `آموزش ${id}`,
): PackageSummary => ({
  id,
  title,
  description: '',
  brand: { id: 'b1', name: 'فورمی', logoUrl: '/logo.png' },
  product: null,
  deadlineAt: null,
  estimatedMinutes: 10,
  status,
  packageStatus: 'published',
  percent: status === 'completed' ? 100 : status === 'in_progress' ? 40 : 0,
  overdue: false,
  completedAt: null,
  onTime: null,
  lastActivityAt: null,
  pathOrder: order,
  totalDurationSec: 600,
  sectionCount: 3,
  completedSections: status === 'completed' ? 3 : 1,
});

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PHASE-4 learning components', () => {
  it('StationTile marks the current step and numbers the upcoming ones', () => {
    wrap(
      <>
        <StationTile index={1} title="ایستگاه یک" state="done" to="/packages/a" />
        <StationTile index={2} title="ایستگاه دو" state="current" to="/packages/b" />
        <StationTile index={3} title="ایستگاه سه" state="upcoming" to="/packages/c" />
      </>,
    );
    expect(screen.getByRole('link', { name: /ایستگاه دو/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('link', { name: /ایستگاه سه/ })).not.toHaveAttribute('aria-current');
    // upcoming tiles show their station number (Latin digits, per the digits policy)
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('PathScreen orders stations and hides the streak chip when the streak is 0', () => {
    wrap(
      <PathScreen
        packages={[pkg('a', 'completed', 1), pkg('b', 'in_progress', 2), pkg('c', 'new', 3)]}
        points={120}
        streakDays={0}
        totalProgress={33}
      />,
    );
    const stations = screen.getAllByRole('link', { name: /ایستگاه|آموزش/ });
    expect(stations).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'ادامه مسیر' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/پیوستگی/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/سکهٔ توانمندی/)).toBeInTheDocument();
  });

  it('PathScreen shows a real streak when the API reports one', () => {
    wrap(
      <PathScreen
        packages={[pkg('a', 'in_progress', 1)]}
        points={0}
        streakDays={4}
        totalProgress={10}
      />,
    );
    expect(screen.getByLabelText('پیوستگی ۴ روز')).toBeInTheDocument();
  });

  it('CelebrationScreen keeps the caller testid and only counts a real gain', () => {
    wrap(
      <CelebrationScreen
        testId="quiz-result"
        title="بسته تمام شد!"
        pointsEarned={20}
        streakDays={2}
        actionLabel="بازگشت به خانه"
        onAction={() => undefined}
      />,
    );
    expect(screen.getByTestId('quiz-result')).toHaveTextContent('بسته تمام شد');
    expect(screen.getByLabelText('۲۰ امتیاز گرفتی')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازگشت به خانه' })).toBeInTheDocument();
  });
});
