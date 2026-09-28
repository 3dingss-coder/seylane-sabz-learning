import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JalaliDateField } from './JalaliDateField';

function Harness({ initial = '', mode }: { initial?: string; mode?: 'date' | 'datetime' }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <JalaliDateField label="مهلت" value={v} onChange={setV} mode={mode} />
      <output data-testid="raw">{v}</output>
    </>
  );
}

describe('JalaliDateField', () => {
  it('shows the stored Gregorian value as a Jalali date', () => {
    render(<Harness initial="2026-09-28" />);
    expect(screen.getByRole('button', { name: 'مهلت' })).toHaveTextContent('۶ مهر ۱۴۰۵');
  });

  it('picks a day and emits a Gregorian YYYY-MM-DD string', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-28" />);
    await user.click(screen.getByRole('button', { name: 'مهلت' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('مهر ۱۴۰۵');
    await user.click(screen.getByRole('button', { name: 'ماه بعد' }));
    await user.click(screen.getByRole('button', { name: '۱ آبان ۱۴۰۵' }));
    expect(screen.getByTestId('raw')).toHaveTextContent('2026-10-23');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the time in datetime mode and can be cleared', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-28T09:30" mode="datetime" />);
    expect(screen.getByRole('button', { name: 'مهلت' })).toHaveTextContent('ساعت ۰۹:۳۰');
    await user.click(screen.getByRole('button', { name: 'مهلت' }));
    await user.click(screen.getByRole('button', { name: '۱۰ مهر ۱۴۰۵' }));
    expect(screen.getByTestId('raw')).toHaveTextContent('2026-10-02T09:30');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'پاک کردن مهلت' }));
    expect(screen.getByTestId('raw')).toBeEmptyDOMElement();
  });
});
