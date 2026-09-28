import React, { useState } from 'react';
import {
  gregorianToJalali,
  jalaliToGregorian,
  jalaliMonthLength,
  jalaliMonthName,
  jalaliWeekdayName,
  jalaliWeekday,
  todayJalali,
  toPersianDigits,
} from '../utils/persian';

interface PersianCalendarPickerProps {
  /** Selected Jalali date as [jy, jm, jd], or null if nothing selected yet. */
  value: [number, number, number] | null;
  onChange: (date: [number, number, number]) => void;
  /** Disallow picking dates before today (defaults to true — you can't schedule a delivery in the past). */
  disablePast?: boolean;
}

export const PersianCalendarPicker: React.FC<PersianCalendarPickerProps> = ({
  value,
  onChange,
  disablePast = true,
}) => {
  const [todayY, todayM, todayD] = todayJalali();
  const [viewYear, setViewYear] = useState(value ? value[0] : todayY);
  const [viewMonth, setViewMonth] = useState(value ? value[1] : todayM);

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const daysInMonth = jalaliMonthLength(viewYear, viewMonth);
  const firstOfMonthGregorian = jalaliToGregorian(viewYear, viewMonth, 1);
  const firstWeekday = jalaliWeekday(firstOfMonthGregorian); // 0 = Saturday

  const isPastDisabled = (d: number) => {
    if (!disablePast) return false;
    if (viewYear < todayY) return true;
    if (viewYear > todayY) return false;
    if (viewMonth < todayM) return true;
    if (viewMonth > todayM) return false;
    return d < todayD;
  };

  const isToday = (d: number) => viewYear === todayY && viewMonth === todayM && d === todayD;
  const isSelected = (d: number) =>
    !!value && value[0] === viewYear && value[1] === viewMonth && value[2] === d;

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white border border-[#059669]/20 rounded-2xl p-3 shadow-[0_1px_2px_rgba(2,44,34,0.04),0_8px_18px_-14px_rgba(2,44,34,0.25)]">
      {/* Month navigator */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={goPrevMonth}
          className="w-8 h-8 rounded-xl bg-[#f8fafc] hover:bg-[#ecfdf5] text-[#006c4a] flex items-center justify-center transition-colors active:scale-90"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>

        <span className="text-[13px] font-black text-[#022c22]">
          {jalaliMonthName(viewMonth)} {toPersianDigits(viewYear)}
        </span>

        <button
          type="button"
          onClick={goNextMonth}
          className="w-8 h-8 rounded-xl bg-[#f8fafc] hover:bg-[#ecfdf5] text-[#006c4a] flex items-center justify-center transition-colors active:scale-90"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {[0, 1, 2, 3, 4, 5, 6].map((w) => (
          <div key={w} className="text-center text-[10px] font-bold text-[#64748b] py-1">
            {jalaliWeekdayName(w, true)}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (d === null) return <div key={`empty-${idx}`} />;
          const disabled = isPastDisabled(d);
          const selected = isSelected(d);
          const today = isToday(d);
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onChange([viewYear, viewMonth, d])}
              className={`aspect-square rounded-xl text-[12px] font-bold flex items-center justify-center transition-all duration-150 ${
                selected
                  ? 'bg-gradient-to-br from-[#10b981] to-[#047857] text-white shadow-[0_2px_8px_rgba(5,150,105,0.4)] scale-105'
                  : disabled
                  ? 'text-[#cbd5e1] cursor-not-allowed'
                  : today
                  ? 'bg-[#ecfdf5] text-[#006c4a] border border-[#a7f3d0] hover:bg-[#d8f5e5]'
                  : 'text-[#334155] hover:bg-[#f0fdf4] active:scale-90'
              }`}
            >
              {toPersianDigits(d)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export function formatJalaliShort(date: [number, number, number] | null): string {
  if (!date) return '';
  const [y, m, d] = date;
  return `${toPersianDigits(d)} ${jalaliMonthName(m)} ${toPersianDigits(y)}`;
}

export { gregorianToJalali, jalaliToGregorian, todayJalali };
