import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  formatJalali,
  jalaliMonthLength,
  jalaliToday,
  toGregorian,
  toJalali,
  weekdaySatFirst,
  type JDate,
} from '@/lib/jalali';

/**
 * Jalali date / date-time field (spec §16.9: Jalali display, UTC storage). Ported from the
 * helper kit's PersianCalendarPicker, restyled with §16 tokens, 48px targets and keyboard support.
 *
 * Drop-in for native inputs: `value` uses the same format as `<input type="date">`
 * (`YYYY-MM-DD`, Gregorian) or `type="datetime-local"` (`YYYY-MM-DDTHH:mm`, local time).
 */
export interface JalaliDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: 'date' | 'datetime';
  error?: string;
  hint?: string;
  /** Disallow days before today. */
  disablePast?: boolean;
  /** Default time for a newly picked day in datetime mode. */
  defaultTime?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parse(value: string): { date: JDate | null; time: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(value);
  if (!m) return { date: null, time: '' };
  return { date: toJalali(Number(m[1]), Number(m[2]), Number(m[3])), time: m[4] ?? '' };
}

function format(date: JDate, time: string, mode: 'date' | 'datetime') {
  const [gy, gm, gd] = toGregorian(...date);
  const d = `${gy}-${pad(gm)}-${pad(gd)}`;
  return mode === 'date' ? d : `${d}T${time || '18:00'}`;
}

export function JalaliDateField({
  label,
  value,
  onChange,
  mode = 'date',
  error,
  hint,
  disablePast = false,
  defaultTime = '18:00',
}: JalaliDateFieldProps) {
  const id = useId();
  const { date, time } = parse(value);
  const today = jalaliToday();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<[number, number]>(() => [
    date?.[0] ?? today[0],
    date?.[1] ?? today[1],
  ]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const [vy, vm] = view;
  const move = (delta: number) => {
    const idx = vy * 12 + (vm - 1) + delta;
    setView([Math.floor(idx / 12), (idx % 12) + 1]);
  };
  const first = toGregorian(vy, vm, 1);
  const lead = weekdaySatFirst(first[0], first[1], first[2]);
  const days = jalaliMonthLength(vy, vm);
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const cmp = (a: JDate, b: JDate) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const pick = (d: number) => {
    onChange(format([vy, vm, d], time || defaultTime, mode));
    if (mode === 'date') setOpen(false);
  };

  const display = date
    ? `${formatJalali(date)}${mode === 'datetime' && time ? ` • ساعت ${toPersianDigits(time)}` : ''}`
    : '';

  return (
    <div className="relative flex flex-col gap-1.5" ref={box}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="flex gap-2">
        <button
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={error ? `${id}-err` : undefined}
          onClick={() => {
            if (date) setView([date[0], date[1]]);
            setOpen((o) => !o);
          }}
          className={cn(
            'flex min-h-12 flex-1 items-center gap-2 rounded-input border bg-surface px-3 text-start text-base',
            'focus:border-info focus:outline-none focus:ring-2 focus:ring-info/30',
            error ? 'border-danger' : 'border-border',
          )}
        >
          <CalendarDays className="size-5 shrink-0 text-muted" aria-hidden />
          <span className={display ? 'text-text' : 'text-muted-fg'}>
            {display || 'انتخاب تاریخ'}
          </span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`پاک کردن ${label}`}
            className="flex size-12 shrink-0 items-center justify-center rounded-input border border-border text-muted hover:text-danger"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {hint && !error && <p className="text-xs text-text-secondary">{hint}</p>}
      <p id={`${id}-err`} aria-live="polite" className="text-xs font-medium text-danger">
        {error}
      </p>

      {open && (
        <div
          role="dialog"
          aria-label={`تقویم ${label}`}
          className="absolute top-full z-40 mt-1 w-[19rem] max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="ماه قبل"
              className="flex size-12 items-center justify-center rounded-input text-primary hover:bg-primary-light"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="text-sm font-bold text-text" aria-live="polite">
              {JALALI_MONTHS[vm - 1]} {toPersianDigits(vy)}
            </span>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="ماه بعد"
              className="flex size-12 items-center justify-center rounded-input text-primary hover:bg-primary-light"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-text-secondary">
            {JALALI_WEEKDAYS_SHORT.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const cur: JDate = [vy, vm, d];
              const selected = !!date && cmp(cur, date) === 0;
              const isToday = cmp(cur, today) === 0;
              const disabled = disablePast && cmp(cur, today) < 0;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(d)}
                  aria-pressed={selected}
                  aria-label={formatJalali(cur)}
                  className={cn(
                    'flex aspect-square min-h-10 items-center justify-center rounded-input text-sm font-bold transition-colors',
                    selected
                      ? 'bg-primary text-white'
                      : disabled
                        ? 'cursor-not-allowed text-muted opacity-40'
                        : isToday
                          ? 'border border-primary/40 bg-primary-light text-primary'
                          : 'text-text hover:bg-primary-light',
                  )}
                >
                  {toPersianDigits(d)}
                </button>
              );
            })}
          </div>
          {mode === 'datetime' && (
            <label className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
              ساعت
              <input
                type="time"
                dir="ltr"
                value={time || defaultTime}
                disabled={!date}
                onChange={(e) => date && onChange(format(date, e.target.value, mode))}
                className="min-h-12 rounded-input border border-border bg-surface px-3 disabled:opacity-40"
              />
            </label>
          )}
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              className="min-h-12 px-3 text-sm font-bold text-primary"
              onClick={() => {
                setView([today[0], today[1]]);
                onChange(format(today, time || defaultTime, mode));
                if (mode === 'date') setOpen(false);
              }}
            >
              امروز
            </button>
            <button
              type="button"
              className="min-h-12 px-3 text-sm font-bold text-text-secondary"
              onClick={() => setOpen(false)}
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
