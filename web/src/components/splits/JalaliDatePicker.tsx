import React from 'react';
import { Calendar } from 'lucide-react';
import { Jalali } from '../../core/jalali';
import { Money } from '../../core/money';
import { Select } from '../Select';

interface JalaliDatePickerProps {
  label: string;
  valueMs: number;
  onChangeMs: (ms: number) => void;
}

export function JalaliDatePicker({ label, valueMs, onChangeMs }: JalaliDatePickerProps) {
  const j = Jalali.of(valueMs);
  const nowJ = Jalali.of(Date.now());
  const minYear = Math.min(nowJ.y - 3, j.y);
  const maxYear = Math.max(nowJ.y + 2, j.y);

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, idx) => {
    const y = minYear + idx;
    return { value: y, label: Money.fa(String(y)) };
  });

  const months = Jalali.MONTHS.map((name, idx) => ({
    value: idx + 1,
    label: name,
  }));

  const maxDay = Jalali.monthDays(j.y, j.m);
  const days = Array.from({ length: maxDay }, (_, idx) => {
    const d = idx + 1;
    return { value: d, label: Money.fa(String(d)) };
  });

  const update = (nextY: number, nextM: number, nextD: number) => {
    const clampedD = Math.min(nextD, Jalali.monthDays(nextY, nextM));
    onChangeMs(Jalali.millis(nextY, nextM, clampedD, 12, 0));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-muted flex items-center gap-1">
          <Calendar size={12} />
          <span>{label}</span>
        </label>
        <span className="text-[10px] text-sky">{Jalali.longDate(valueMs)}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Select
          size="sm"
          value={j.d}
          onChange={(d) => update(j.y, j.m, Number(d))}
          options={days}
          aria-label="روز"
        />
        <Select
          size="sm"
          value={j.m}
          onChange={(m) => update(j.y, Number(m), j.d)}
          options={months}
          aria-label="ماه"
        />
        <Select
          size="sm"
          value={j.y}
          onChange={(y) => update(Number(y), j.m, j.d)}
          options={years}
          aria-label="سال"
        />
      </div>
    </div>
  );
}
