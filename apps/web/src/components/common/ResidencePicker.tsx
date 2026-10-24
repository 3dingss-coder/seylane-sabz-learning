import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { motionOff } from '@/lib/motion';

/** The 1547-city directory is ~30 kB, so it is pulled in as its own chunk the first time a list
 *  opens — the sign-up screen (and the admin dialog) stay light for everyone else. */
type IranLocations = typeof import('@/lib/iranLocations');
let locationsPromise: Promise<IranLocations> | null = null;
const loadLocations = (): Promise<IranLocations> =>
  (locationsPromise ??= import('@/lib/iranLocations'));

export interface Residence {
  province: string;
  city: string;
}

interface LocationFieldProps {
  id: string;
  label: string;
  /** Sentence shown on top of the open list («لطفا استان خود را وارد کنید»). */
  prompt: string;
  placeholder: string;
  searchLabel: string;
  emptyText: string;
  listLabel: string;
  value: string;
  /** Search box value → matching names (already ranked by the directory helpers). */
  filter: (query: string) => readonly string[];
  status: 'loading' | 'ready' | 'error';
  disabled?: boolean;
  error?: string;
  /** Renders a clear (×) button — used where the field is optional (admin user dialog). */
  clearable?: boolean;
  onOpen: () => void;
  onSelect: (value: string) => void;
  onClear?: () => void;
}

/**
 * One searchable dropdown («استان» / «شهر»).
 *
 * Mobile-first, per ARIA APG's combobox+listbox pattern: the trigger opens a panel with a search
 * box (focused straight away) and a long, independently scrollable list. Arrow keys move the active
 * option, Enter selects, Escape/outside tap closes. Options are plain `li[role=option]` (clicks are
 * delegated from the list) so keyboard handling lives in the combobox input only.
 */
function LocationField({
  id,
  label,
  prompt,
  placeholder,
  searchLabel,
  emptyText,
  listLabel,
  value,
  filter,
  status,
  disabled,
  error,
  clearable,
  onOpen,
  onSelect,
  onClear,
}: LocationFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const options = open ? filter(query) : [];
  const optionId = (index: number) => `${id}-opt-${index}`;
  const showList = status === 'ready' && options.length > 0;
  // aria-activedescendant must point at a rendered option, otherwise screen readers announce nothing.
  const activeId = showList && active < options.length ? optionId(active) : undefined;

  const openPanel = useCallback(() => {
    onOpen();
    setQuery('');
    setActive(0);
    setOpen(true);
    // On a phone the panel opens downwards; make sure the field (and its list) is fully on screen.
    // (jsdom has no scrollIntoView, hence the guard.)
    requestAnimationFrame(() => {
      const el = wrapRef.current;
      if (el && typeof el.scrollIntoView === 'function')
        el.scrollIntoView({ block: 'nearest', behavior: motionOff() ? 'auto' : 'smooth' });
    });
  }, [onOpen]);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = useCallback(
    (option: string) => {
      onSelect(option);
      close(true);
    },
    [close, onSelect],
  );

  // Focus the search box on open — that is also where the keyboard/ARIA wiring lives.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Outside tap / click closes without stealing the focus ring.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close();
      return;
    }
    if (!showList) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      {/* The panel is intentionally not closed from `blur`: clicking an option blurs the search box
          first, and closing there would unmount the option before its click is delivered. Outside
          taps (pointerdown listener), Escape and Tab close it instead. */}
      <div ref={wrapRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          onClick={() => (open ? close() : openPanel())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'flex min-h-12 w-full items-center gap-2 rounded-input border bg-surface px-3.5 text-start text-base shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-muted focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15 disabled:cursor-not-allowed disabled:opacity-40',
            clearable && value ? 'pe-16' : 'pe-10',
            error ? 'border-danger' : 'border-border',
          )}
        >
          <span className={cn('flex-1 truncate', value ? 'text-text' : 'text-muted-fg')}>
            {value || placeholder}
          </span>
          {!clearable && (
            <ChevronDown
              aria-hidden
              className={cn(
                'size-5 shrink-0 text-muted-fg transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          )}
        </button>
        {/* pointer-events-none lets taps on the chevron fall through to the trigger button. */}
        {clearable && value && (
          <span className="pointer-events-none absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              aria-label={`پاک کردن ${label}`}
              onClick={() => {
                onClear?.();
                close(true);
              }}
              className="pointer-events-auto grid size-8 place-items-center rounded-full text-muted-fg hover:bg-surface-2 focus:outline-none focus:ring-4 focus:ring-info/15"
            >
              <X aria-hidden className="size-4" />
            </button>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-5 text-muted-fg transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </span>
        )}

        {open && (
          <div className="animate-scale-in absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-card border border-border bg-surface shadow-lg">
            <p className="border-b border-border bg-surface-2 px-3.5 py-2 text-xs font-semibold text-text-secondary">
              {prompt}
            </p>
            <div className="flex items-center gap-2 border-b border-border px-3.5">
              <Search aria-hidden className="size-4 shrink-0 text-muted-fg" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                aria-label={searchLabel}
                autoComplete="off"
                spellCheck={false}
                placeholder="جستجو…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted-fg"
              />
              {status === 'loading' && <Spinner className="size-4 text-muted-fg" />}
            </div>
            {/* Always rendered so `aria-controls` resolves; the listbox role only appears with options.
                ARIA listbox pattern: the options are not focusable — the combobox input above owns the
                keyboard (arrows/Enter/Home/End) and taps are delegated to this list. */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- keyboard is handled on the combobox input (ARIA APG) */}
            <ul
              id={listId}
              role={showList ? 'listbox' : undefined}
              aria-label={showList ? listLabel : undefined}
              className="max-h-64 overflow-y-auto overscroll-contain scroll-py-1 py-1"
              onClick={(e) => {
                const el = (e.target as HTMLElement).closest('[role="option"]');
                const option = el?.getAttribute('data-value');
                if (option) choose(option);
              }}
            >
              {!showList && (
                <li className="px-3.5 py-2.5 text-sm text-text-secondary" aria-live="polite">
                  {status === 'loading'
                    ? 'در حال بارگذاری فهرست…'
                    : status === 'error'
                      ? 'فهرست دریافت نشد. اتصال اینترنت را بررسی کنید.'
                      : emptyText}
                </li>
              )}
              {showList &&
                options.map((option, index) => {
                  const selected = option === value;
                  return (
                    <li
                      key={option}
                      id={optionId(index)}
                      role="option"
                      data-value={option}
                      aria-selected={selected}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3.5 text-sm',
                        index === active && 'bg-primary-light',
                        selected ? 'font-bold text-primary' : 'text-text',
                      )}
                    >
                      <span className="truncate">{option}</span>
                      {selected && <Check aria-hidden className="size-4 shrink-0" />}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>
      <p id={errorId} aria-live="polite" className="min-h-0 text-xs font-medium text-danger-fg">
        {error}
      </p>
    </div>
  );
}

interface ResidencePickerProps {
  value: Residence;
  onChange: (value: Residence) => void;
  /** Label of the province field; the city field is labelled «شهر». */
  label?: string;
  provinceError?: string;
  cityError?: string;
  disabled?: boolean;
  /** Let the user clear the pair (optional field, e.g. the admin user dialog). */
  clearable?: boolean;
}

/**
 * «محل سکونت»: pick a province, then a city of that province.
 *
 * The city field only exists once a province is chosen (and changing the province clears the city,
 * so a city from another province can never be submitted). Both lists support search + scrolling.
 */
export function ResidencePicker({
  value,
  onChange,
  label = 'انتخاب محل سکونت',
  provinceError,
  cityError,
  disabled,
  clearable,
}: ResidencePickerProps) {
  const [locations, setLocations] = useState<IranLocations | null>(null);
  const [failed, setFailed] = useState(false);
  const baseId = useId();

  const openList = useCallback(() => {
    if (locations || failed) return;
    void loadLocations()
      .then(setLocations)
      .catch(() => setFailed(true));
  }, [locations, failed]);

  const status = locations ? 'ready' : failed ? 'error' : 'loading';
  const provinceFilter = useCallback(
    (query: string) => (locations ? locations.searchProvinces(query) : []),
    [locations],
  );
  const cityFilter = useCallback(
    (query: string) => (locations ? locations.searchCities(value.province, query) : []),
    [locations, value.province],
  );

  return (
    <>
      <LocationField
        id={`${baseId}-province`}
        label={label}
        prompt="لطفا استان خود را وارد کنید"
        placeholder="لطفا استان خود را انتخاب کنید"
        searchLabel="جستجوی استان"
        emptyText="استانی با این نام پیدا نشد."
        listLabel="استان‌های ایران"
        value={value.province}
        filter={provinceFilter}
        status={status}
        disabled={disabled}
        error={provinceError}
        clearable={clearable}
        onOpen={openList}
        onSelect={(province) => onChange({ province, city: '' })}
        onClear={() => onChange({ province: '', city: '' })}
      />
      {value.province !== '' && (
        <LocationField
          id={`${baseId}-city`}
          label="شهر"
          prompt="لطفا شهر خود را انتخاب کنید"
          placeholder="لطفا شهر خود را انتخاب کنید"
          searchLabel="جستجوی شهر"
          emptyText="شهری با این نام در این استان پیدا نشد."
          listLabel={`شهرهای استان ${value.province}`}
          value={value.city}
          filter={cityFilter}
          status={status}
          disabled={disabled}
          error={cityError}
          onOpen={openList}
          onSelect={(city) => onChange({ ...value, city })}
        />
      )}
    </>
  );
}
