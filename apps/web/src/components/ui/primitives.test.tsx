import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Card } from './Card';
import { Select } from './Select';
import { Textarea } from './Textarea';
import { Tabs } from './Tabs';
import { Table } from './Table';
// Back-compat shims must keep serving the old import paths unchanged.
import { Select as LegacySelect, Tabs as LegacyTabs } from '@/components/common/Field';
import { DataTable as LegacyDataTable } from '@/components/admin/DataTable';

describe('Select (ui primitive, promoted from common/Field)', () => {
  it('links label, error and hint for accessibility', () => {
    render(
      <Select label="استان" error="استان را انتخاب کنید">
        <option value="">—</option>
        <option value="tehran">تهران</option>
      </Select>,
    );
    const select = screen.getByLabelText('استان');
    expect(select).toBeInTheDocument();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('استان را انتخاب کنید')).toBeInTheDocument();
    expect(select.className).toContain('min-h-12');
  });
  it('legacy common/Field import renders the same primitive', () => {
    render(
      <LegacySelect label="شهر">
        <option value="a">الف</option>
      </LegacySelect>,
    );
    expect(screen.getByLabelText('شهر').className).toContain('min-h-12');
  });
});

describe('Textarea (ui primitive)', () => {
  it('renders with label and forwards value changes', () => {
    const onChange = vi.fn();
    render(<Textarea label="توضیحات" onChange={onChange} />);
    const area = screen.getByLabelText('توضیحات');
    fireEvent.change(area, { target: { value: 'متن' } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Tabs (ui primitive)', () => {
  const items = [
    { value: 'a' as const, label: 'الف', count: 2 },
    { value: 'b' as const, label: 'ب' },
  ];
  it('marks the selected tab, shows fa-IR counts, fires onChange, keeps 48px targets', () => {
    const onChange = vi.fn();
    render(<Tabs label="فیلتر" value="a" onChange={onChange} items={items} />);
    const selected = screen.getByRole('tab', { name: /الف/ });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.className).toContain('min-h-12');
    expect(selected).toHaveTextContent('۲');
    fireEvent.click(screen.getByRole('tab', { name: 'ب' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
  it('legacy Field Tabs is the same component', () => {
    expect(LegacyTabs).toBe(Tabs);
  });
});

describe('Table (ui primitive, promoted from admin/DataTable)', () => {
  const rows = [{ id: '1', name: 'سارا', score: 10 }];
  const columns = [
    { key: 'name', header: 'نام', cell: (r: (typeof rows)[number]) => r.name },
    { key: 'score', header: 'امتیاز', cell: (r: (typeof rows)[number]) => r.score },
  ];
  it('renders a real table with sr-only caption plus the mobile card list', () => {
    render(<Table rows={rows} columns={columns} rowKey={(r) => r.id} caption="نتایج تیم" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('نتایج تیم')).toBeInTheDocument();
    expect(screen.getAllByText('سارا').length).toBeGreaterThanOrEqual(1);
  });
  it('legacy admin/DataTable import is the same component', () => {
    expect(LegacyDataTable).toBe(Table);
  });
});

describe('Stage-2 additive variants', () => {
  it('Button energy variant uses dark-on-energy classes only (never white text)', () => {
    render(<Button variant="energy">جایزه</Button>);
    const btn = screen.getByRole('button', { name: 'جایزه' });
    expect(btn.className).toContain('bg-brand-energy');
    expect(btn.className).toContain('text-on-energy');
    expect(btn.className).not.toContain('text-white');
    expect(btn.className).toContain('min-h-12');
  });
  it('Card energy tone renders dark text on the energy surface', () => {
    render(<Card tone="energy">کارت جایزه</Card>);
    const card = screen.getByText('کارت جایزه');
    expect(card.className).toContain('bg-brand-energy');
    expect(card.className).toContain('text-on-energy');
  });
});
