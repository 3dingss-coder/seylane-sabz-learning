import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResidencePicker, type Residence } from './ResidencePicker';

/** Controlled host, exactly like the sign-up form and the admin user dialog use it. */
function Host({ initial = { province: '', city: '' } }: { initial?: Residence }) {
  const [value, setValue] = useState(initial);
  return <ResidencePicker value={value} onChange={setValue} />;
}

/** Opens the province list and returns its listbox element. */
const openProvinces = async () => {
  fireEvent.click(screen.getByLabelText('انتخاب محل سکونت'));
  return screen.findByRole('listbox', { name: 'استان‌های ایران' });
};

const selectProvince = async (name: string) => {
  const list = await openProvinces();
  fireEvent.click(await within(list).findByRole('option', { name }));
};

/** Opens the city list (only present after a province is chosen). */
const openCities = async () => {
  fireEvent.click(screen.getByLabelText('شهر'));
  return screen.findByRole('listbox', { name: /شهرهای استان/ });
};

const optionsOf = (list: HTMLElement) => within(list).getAllByRole('option');

describe('ResidencePicker (محل سکونت)', () => {
  it('hides the city field until a province is chosen', async () => {
    render(<Host />);
    expect(screen.getByLabelText('انتخاب محل سکونت')).toBeInTheDocument();
    expect(screen.queryByLabelText('شهر')).toBeNull();
    await selectProvince('خراسان رضوی');
    expect(screen.getByLabelText('شهر')).toHaveTextContent('لطفا شهر خود را انتخاب کنید');
  });

  it('lists every province of Iran in a scrollable, searchable panel', async () => {
    render(<Host />);
    const list = await openProvinces();
    // The prompt sits on top of the open list, per the design brief.
    expect(screen.getByText('لطفا استان خود را وارد کنید')).toBeInTheDocument();
    await waitFor(() => expect(optionsOf(list)).toHaveLength(31));
    // The long list is its own scroll container.
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('overscroll-contain');

    const search = screen.getByRole('combobox', { name: 'جستجوی استان' });
    fireEvent.change(search, { target: { value: 'خراسان' } });
    expect(optionsOf(list).map((o) => o.textContent)).toEqual([
      'خراسان جنوبی',
      'خراسان رضوی',
      'خراسان شمالی',
    ]);
    // Arabic kaf/yeh and the post-office spelling are folded away by the search.
    fireEvent.change(search, { target: { value: 'كرمانشاه' } });
    expect(optionsOf(list).map((o) => o.textContent)).toEqual(['کرمانشاه']);
    fireEvent.change(search, { target: { value: 'سیستان و' } });
    expect(optionsOf(list).map((o) => o.textContent)).toEqual(['سیستان و بلوچستان']);
    fireEvent.change(search, { target: { value: 'زا' } });
    expect(screen.getByText('استانی با این نام پیدا نشد.')).toBeInTheDocument();
  });

  it('shows only the cities of the chosen province and closes after picking one', async () => {
    render(<Host />);
    await selectProvince('خراسان رضوی');
    const list = await openCities();
    await waitFor(() => expect(optionsOf(list).length).toBeGreaterThan(50));
    expect(within(list).getByRole('option', { name: 'مشهد' })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: 'نیشابور' })).toBeInTheDocument();
    // A city of another province is simply not in this list.
    expect(within(list).queryByRole('option', { name: 'تهران' })).toBeNull();

    const search = screen.getByRole('combobox', { name: 'جستجوی شهر' });
    fireEvent.change(search, { target: { value: 'نیشابور' } });
    expect(optionsOf(list).map((o) => o.textContent)).toEqual(['نیشابور']);
    fireEvent.change(search, { target: { value: 'شهری که وجود ندارد' } });
    expect(screen.getByText('شهری با این نام در این استان پیدا نشد.')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'مشهد' } });
    fireEvent.click(within(list).getByRole('option', { name: 'مشهد' }));
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByLabelText('انتخاب محل سکونت')).toHaveTextContent('خراسان رضوی');
    expect(screen.getByLabelText('شهر')).toHaveTextContent('مشهد');
  });

  it('picking a different province clears the previously chosen city', async () => {
    render(<Host initial={{ province: 'تهران', city: 'تهران' }} />);
    expect(screen.getByLabelText('شهر')).toHaveTextContent('تهران');
    await selectProvince('یزد');
    expect(screen.getByLabelText('انتخاب محل سکونت')).toHaveTextContent('یزد');
    expect(screen.getByLabelText('شهر')).toHaveTextContent('لطفا شهر خود را انتخاب کنید');
  });

  it('supports keyboard selection (arrows + Enter) and Escape to close', async () => {
    render(<Host />);
    fireEvent.click(screen.getByLabelText('انتخاب محل سکونت'));
    const search = await screen.findByRole('combobox', { name: 'جستجوی استان' });
    const list = await screen.findByRole('listbox', { name: 'استان‌های ایران' });
    await waitFor(() => expect(optionsOf(list).length).toBeGreaterThan(0));

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const active = optionsOf(list)[1];
    expect(active).toBeDefined();
    expect(search).toHaveAttribute('aria-activedescendant', active?.id);
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByLabelText('انتخاب محل سکونت')).toHaveTextContent(active?.textContent ?? '');

    // Escape closes the list without changing the selection.
    fireEvent.click(screen.getByLabelText('شهر'));
    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'جستجوی شهر' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByLabelText('شهر')).toHaveTextContent('لطفا شهر خود را انتخاب کنید');
  });

  it('closes the list when tapping outside', async () => {
    render(<Host />);
    await openProvinces();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });
});
