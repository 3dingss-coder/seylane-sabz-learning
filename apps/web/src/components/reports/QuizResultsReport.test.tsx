import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QuizResultsReport } from './QuizResultsReport';
import type { QuizAttemptRow, QuizReport, QuizSummaryRow } from '@/lib/types';

const base = {
  teamId: 't',
  province: null,
  city: null,
  packageId: 'p1',
  packageTitle: 'آموزش یک',
  brandName: null,
  productName: null,
  sectionId: 's1',
  sectionTitle: 'قسمت اول',
  quizId: 'q1',
};
const attempt = (
  id: string,
  userName: string,
  n: number,
  correct: number,
  wrong: number,
  passed: boolean,
): QuizAttemptRow => ({
  ...base,
  attemptId: id,
  userId: userName,
  userName,
  attemptNumber: n,
  total: correct + wrong,
  correct,
  wrong,
  unanswered: 0,
  score: Math.round((correct / (correct + wrong)) * 100),
  passScore: 70,
  passed,
  startedAt: '2026-10-05T10:00:00Z',
  submittedAt: '2026-10-05T10:05:00Z',
  durationSec: 300,
});
const summary = (userName: string, over: Partial<QuizSummaryRow>): QuizSummaryRow => ({
  ...base,
  userId: userName,
  userName,
  attempts: 1,
  passed: true,
  passedAtAttempt: 1,
  firstScore: 100,
  lastScore: 100,
  bestScore: 100,
  passScore: 70,
  lastTotal: 4,
  lastCorrect: 4,
  lastWrong: 0,
  totalCorrect: 4,
  totalWrong: 0,
  inProgress: false,
  lastSubmittedAt: '2026-10-05T10:05:00Z',
  ...over,
});
const data: QuizReport = {
  attempts: [
    attempt('1', 'علی', 1, 1, 3, false),
    attempt('2', 'علی', 2, 4, 0, true),
    attempt('3', 'سارا', 1, 2, 2, false),
  ],
  summary: [
    summary('علی', {
      attempts: 2,
      passedAtAttempt: 2,
      firstScore: 25,
      totalCorrect: 5,
      totalWrong: 3,
    }),
    summary('سارا', {
      passed: false,
      passedAtAttempt: null,
      firstScore: 50,
      lastScore: 50,
      bestScore: 50,
      lastCorrect: 2,
      lastWrong: 2,
      totalCorrect: 2,
      totalWrong: 2,
    }),
  ],
};
const bodyRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent ?? '');

describe('QuizResultsReport', () => {
  it('shows attempts, correct/wrong and pass result per learner', () => {
    render(
      <MemoryRouter>
        <QuizResultsReport data={data} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    const ali = rows.find((r) => r.includes('علی')) ?? '';
    expect(ali).toContain('قبول');
    expect(ali).toContain('۲'); // two attempts
    const sara = rows.find((r) => r.includes('سارا')) ?? '';
    expect(sara).toContain('مردود');
  });
  it('lists every attempt in the second view and filters by result', async () => {
    render(
      <MemoryRouter>
        <QuizResultsReport data={data} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('tab', { name: /همه تلاش‌ها/ }));
    expect(bodyRows()).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('نتیجه'), 'failed');
    expect(bodyRows()).toHaveLength(2);
  });
});
