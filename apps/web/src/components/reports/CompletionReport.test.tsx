import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CompletionReport } from './CompletionReport';
import type { CompletionRow } from '@/lib/types';

const row = (id: string, deadlineAt: string | null, percent: number): CompletionRow => ({
  userId: id,
  userName: `user-${id}`,
  teamId: 't',
  province: null,
  city: null,
  packageId: `p-${id}`,
  packageTitle: `pkg-${id}`,
  brandId: null,
  brandName: null,
  productId: null,
  productName: null,
  percent,
  status: 'in_progress',
  overdue: false,
  lagging: false,
  deadlineAt,
  completedAt: null,
  onTime: null,
  lastActivityAt: null,
  stuckAt: null,
});
const rows = [
  row('a', '2026-10-01T10:00:00Z', 10),
  row('b', '2026-10-05T22:00:00Z', 50), // 2026-10-06 01:30 Tehran
  row('c', '2026-10-09T10:00:00Z', 90),
];
const names = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell').at(0)?.textContent);

describe('CompletionReport', () => {
  it('filters by Tehran-day range', () => {
    render(
      <MemoryRouter initialEntries={['/r?from=2026-10-06&to=2026-10-09']}>
        <CompletionReport rows={rows} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    expect(names()).toEqual(['user-b', 'user-c']);
  });
  it('sorts newest → oldest by deadline', async () => {
    render(
      <MemoryRouter>
        <CompletionReport rows={rows} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'مهلت' }));
    expect(names()).toEqual(['user-c', 'user-b', 'user-a']);
    await userEvent.click(screen.getByRole('button', { name: 'مهلت' }));
    expect(names()).toEqual(['user-a', 'user-b', 'user-c']);
  });
});
