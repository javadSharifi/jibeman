import React, { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { db, type Debt } from '../core/db';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { AmountInput } from './AmountInput';
import { Select } from './Select';

interface DebtFormProps {
  editingDebt?: Debt | null;
  initialDirection?: 'OWED_TO_ME' | 'I_OWE';
  initialAmountToman?: string;
  paidAmountRial?: number;
  onSaved: () => void;
}

export function DebtForm({
  editingDebt = null,
  initialDirection = 'I_OWE',
  initialAmountToman = '',
  paidAmountRial = 0,
  onSaved,
}: DebtFormProps) {
  const nowJ = Jalali.of(Date.now());
  const [formDirection, setFormDirection] = useState<'OWED_TO_ME' | 'I_OWE'>(initialDirection);
  const [person, setPerson] = useState('');
  const [amountToman, setAmountToman] = useState(initialAmountToman);
  const [note, setNote] = useState('');
  const [hasDueDate, setHasDueDate] = useState(true);
  const [dueYear, setDueYear] = useState(nowJ.y);
  const [dueMonth, setDueMonth] = useState(nowJ.m);
  const [dueDay, setDueDay] = useState(nowJ.d);
  const [saving, setSaving] = useState(false);

  const applyDateFromMillis = (ms: number) => {
    const j = Jalali.of(ms);
    setDueYear(j.y);
    setDueMonth(j.m);
    setDueDay(j.d);
    setHasDueDate(true);
  };

  useEffect(() => {
    if (editingDebt) {
      setFormDirection(editingDebt.direction);
      setPerson(editingDebt.person);
      setAmountToman(Money.tomanInput(editingDebt.amount));
      setNote(editingDebt.note || '');
      if (editingDebt.dueAt != null) {
        applyDateFromMillis(editingDebt.dueAt);
      } else {
        const cur = Jalali.of(Date.now());
        setDueYear(cur.y);
        setDueMonth(cur.m);
        setDueDay(cur.d);
        setHasDueDate(false);
      }
    } else {
      setFormDirection(initialDirection);
      setPerson('');
      setAmountToman(initialAmountToman);
      setNote('');
      applyDateFromMillis(Date.now());
    }
  }, [editingDebt, initialDirection, initialAmountToman]);

  const getComputedDueMillis = (): number | undefined => {
    if (!hasDueDate) return undefined;
    const safeYear = Number.isFinite(dueYear) && dueYear >= 1300 && dueYear <= 1500 ? dueYear : nowJ.y;
    const safeMonth = Math.max(1, Math.min(12, dueMonth || nowJ.m));
    const maxD = Jalali.monthDays(safeYear, safeMonth);
    const safeDay = Math.max(1, Math.min(maxD, dueDay || 1));
    return Jalali.millis(safeYear, safeMonth, safeDay);
  };

  const handleSave = async () => {
    const amt = Money.parseToman(amountToman);
    if (!person.trim() || !amt || amt <= 0) {
      alert('لطفاً نام شخص و مبلغ را وارد کنید');
      return;
    }

    if (editingDebt && amt < paidAmountRial) {
      alert(`مبلغ کل نمی‌تواند کمتر از مبلغ پرداخت‌شده قبلی (${Money.toman(paidAmountRial)} تومان) باشد.`);
      return;
    }

    setSaving(true);
    try {
      const dueAt = getComputedDueMillis();
      if (editingDebt?.id != null) {
        await db.debts.update(editingDebt.id, {
          direction: formDirection,
          person: person.trim(),
          amount: amt,
          dueAt,
          note: note.trim() || undefined,
        });
      } else {
        await db.debts.add({
          direction: formDirection,
          person: person.trim(),
          amount: amt,
          dueAt,
          note: note.trim() || undefined,
          createdAt: Date.now(),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const computedDueAt = getComputedDueMillis();

  return (
    <div className="space-y-3.5">
      {/* Direction selector */}
      <div className="grid grid-cols-2 p-1 bg-surface rounded-xl border border-line gap-1">
        <button
          type="button"
          onClick={() => setFormDirection('OWED_TO_ME')}
          className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
            formDirection === 'OWED_TO_ME' ? 'bg-lime text-onLime shadow-sm' : 'text-muted'
          }`}
        >
          طلب دارم (بستانکار)
        </button>
        <button
          type="button"
          onClick={() => setFormDirection('I_OWE')}
          className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
            formDirection === 'I_OWE' ? 'bg-lime text-onLime shadow-sm' : 'text-muted'
          }`}
        >
          بدهکارم (بدهی به دیگران)
        </button>
      </div>

      <div>
        <label htmlFor="debt-person-input" className="text-[11px] text-muted block mb-1">
          طرف حساب (شخص / شرکت)
        </label>
        <input
          id="debt-person-input"
          type="text"
          placeholder="مثلاً: علی رضایی"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
        />
      </div>

      <div>
        <label htmlFor="debt-amount" className="text-[11px] text-muted block mb-1">
          مبلغ کل (تومان)
        </label>
        <AmountInput
          id="debt-amount"
          placeholder="۰"
          value={amountToman}
          onChange={setAmountToman}
          className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
        />
      </div>

      {/* Jalali Due Date Section */}
      <div className="p-3 rounded-2xl bg-surface border border-line space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted font-bold flex items-center gap-1.5">
            <Calendar size={13} className="text-sky" />
            تاریخ سررسید (این بدهی برای کی است)
          </span>
          <button
            type="button"
            onClick={() => setHasDueDate(v => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
              hasDueDate
                ? 'bg-sky/15 border-sky/40 text-sky'
                : 'bg-white/5 border-line text-muted'
            }`}
          >
            {hasDueDate ? 'دارای سررسید' : 'بدون سررسید'}
          </button>
        </div>

        {hasDueDate ? (
          <>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => applyDateFromMillis(Date.now())}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-t2"
              >
                امروز
              </button>
              <button
                type="button"
                onClick={() => applyDateFromMillis(Jalali.addDays(Date.now(), 7))}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-t2"
              >
                ۷ روز آینده
              </button>
              <button
                type="button"
                onClick={() => {
                  const cur = Jalali.of(Date.now());
                  const lastDay = Jalali.monthDays(cur.y, cur.m);
                  applyDateFromMillis(Jalali.millis(cur.y, cur.m, lastDay));
                }}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-t2"
              >
                پایان این ماه
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label htmlFor="debt-due-day" className="text-[10px] text-muted block mb-1">روز</label>
                <input
                  id="debt-due-day"
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={e => setDueDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                  className="w-full h-9 rounded-lg bg-sheet border border-line text-white text-center text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1">ماه</label>
                <Select
                  size="sm"
                  value={dueMonth}
                  onChange={val => setDueMonth(Number(val))}
                  options={Jalali.MONTHS.map((m, idx) => ({ value: idx + 1, label: m }))}
                  align="center"
                />
              </div>
              <div>
                <label htmlFor="debt-due-year" className="text-[10px] text-muted block mb-1">سال</label>
                <input
                  id="debt-due-year"
                  type="number"
                  value={dueYear}
                  onChange={e => setDueYear(parseInt(e.target.value, 10) || nowJ.y)}
                  className="w-full h-9 rounded-lg bg-sheet border border-line text-white text-center text-xs"
                />
              </div>
            </div>

            {computedDueAt != null && (
              <div className="text-[10.5px] text-sky font-medium text-center pt-0.5">
                {Jalali.longDate(computedDueAt)}
              </div>
            )}
          </>
        ) : (
          <p className="text-[10.5px] text-muted">
            بدون تاریخ سررسید، این مورد در تعهدات ماهانه صفحه خانه محاسبه نمی‌شود.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="debt-note-input" className="text-[11px] text-muted block mb-1">
          یادداشت (اختیاری)
        </label>
        <input
          id="debt-note-input"
          type="text"
          placeholder="دلیل قرض یا توضیح..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
        />
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {editingDebt
          ? 'ذخیره تغییرات'
          : formDirection === 'OWED_TO_ME'
            ? 'ثبت طلب'
            : 'ثبت بدهی'}
      </button>
    </div>
  );
}
