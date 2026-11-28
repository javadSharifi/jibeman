import React, { useEffect, useState } from 'react';
import { PiggyBank, Building2, UserCheck, Check, Sparkles } from 'lucide-react';
import { db, type Person } from '../core/db';
import {
  getLoanReserveTargets,
  type LoanReserveTarget,
  type SavingsDepositAllocation,
  type DepositPurpose,
  type LoanAllocationInput,
} from '../core/db/helpers';
import { revealRows } from '../core/db/protectedRows';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { AmountInput } from './AmountInput';

export function createDefaultSavingsAllocation(): SavingsDepositAllocation {
  return {
    purpose: 'SAVINGS',
    personName: '',
    loanAllocations: [],
  };
}

export function validateSavingsAllocation(
  allocation: SavingsDepositAllocation,
  totalAmountRial: number
): string | null {
  if (allocation.purpose === 'PERSON_HOLD') {
    if (!allocation.personName.trim()) {
      return 'لطفاً نام شخصی که این پول امانت اوست را وارد کنید.';
    }
    return null;
  }
  if (allocation.purpose === 'LOAN_RESERVE') {
    const sum = allocation.loanAllocations.reduce((s, x) => s + x.amountRial, 0);
    if (sum <= 0) {
      return 'لطفاً حداقل یک وام را انتخاب و مبلغ آن را مشخص کنید.';
    }
    if (sum > totalAmountRial) {
      return 'مجموع مبالغ تخصیص‌یافته به وام‌ها نمی‌تواند بیشتر از مبلغ واریزی باشد.';
    }
  }
  return null;
}

function distributeAmountAcrossTargets(
  amountRial: number,
  selectedIds: Set<number>,
  targets: LoanReserveTarget[]
): LoanAllocationInput[] {
  let rem = Math.max(0, amountRial);
  const selected = targets.filter(t => selectedIds.has(t.loanId));
  const result: LoanAllocationInput[] = [];

  for (const t of selected) {
    const alloc = rem > 0 ? Math.min(rem, t.neededAmount) : 0;
    rem -= alloc;
    result.push({
      loanId: t.loanId,
      loanTitle: t.loanTitle,
      targetYear: t.targetYear,
      targetMonth: t.targetMonth,
      amountRial: alloc,
    });
  }

  // If user selected only 1 loan and it had 0 neededAmount (already funded) but amountRial > 0,
  // still keep it at 0 unless they type manually, or if all selected had 0 neededAmount show 0.
  return result;
}

interface SavingsDepositBoxProps {
  amountRial: number;
  value: SavingsDepositAllocation;
  onChange: (next: SavingsDepositAllocation) => void;
}

export function SavingsDepositBox({ amountRial, value, onChange }: SavingsDepositBoxProps) {
  const nowJ = Jalali.of(Date.now());
  const [targets, setTargets] = useState<LoanReserveTarget[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [showOtherLoans, setShowOtherLoans] = useState(false);
  const [autoDistribute, setAutoDistribute] = useState(true);
  const [loanInputStrings, setLoanInputStrings] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      getLoanReserveTargets(nowJ.y, nowJ.m),
      db.persons.toArray().then(rows => revealRows('persons', rows)),
    ]).then(([loanTargets, loadedPersons]) => {
      if (!active) return;
      setTargets(loanTargets);
      setPersons(loadedPersons);
    });
    return () => {
      active = false;
    };
  }, [nowJ.y, nowJ.m]);

  // Re-distribute automatically when deposit amount changes and autoDistribute is active
  useEffect(() => {
    if (value.purpose !== 'LOAN_RESERVE' || !autoDistribute) return;
    if (value.loanAllocations.length === 0) return;

    const selectedIds = new Set(value.loanAllocations.map(a => a.loanId));
    const nextAlloc = distributeAmountAcrossTargets(amountRial, selectedIds, targets);
    const nextStrings: Record<number, string> = {};
    for (const item of nextAlloc) {
      nextStrings[item.loanId] = item.amountRial > 0 ? Money.tomanInput(item.amountRial) : '';
    }
    setLoanInputStrings(nextStrings);

    const changed =
      nextAlloc.length !== value.loanAllocations.length ||
      nextAlloc.some((item, idx) => item.amountRial !== value.loanAllocations[idx]?.amountRial);
    if (changed) {
      onChange({ ...value, loanAllocations: nextAlloc });
    }
  }, [amountRial, value.purpose, targets, autoDistribute]);

  const setPurpose = (purpose: DepositPurpose) => {
    if (purpose === 'LOAN_RESERVE') {
      setAutoDistribute(true);
      const monthPending = targets.filter(t => t.inCurrentMonth && t.neededAmount > 0);
      const initialList = monthPending.length > 0 ? monthPending : targets.filter(t => t.neededAmount > 0);
      const selectedIds = new Set(initialList.map(t => t.loanId));
      const nextAlloc = distributeAmountAcrossTargets(amountRial, selectedIds, targets);
      const nextStrings: Record<number, string> = {};
      for (const item of nextAlloc) {
        nextStrings[item.loanId] = item.amountRial > 0 ? Money.tomanInput(item.amountRial) : '';
      }
      setLoanInputStrings(nextStrings);
      onChange({ ...value, purpose, loanAllocations: nextAlloc });
      return;
    }
    onChange({ ...value, purpose });
  };

  const toggleLoanSelection = (target: LoanReserveTarget) => {
    const existing = value.loanAllocations.some(a => a.loanId === target.loanId);
    const selectedIds = new Set(value.loanAllocations.map(a => a.loanId));
    if (existing) selectedIds.delete(target.loanId);
    else selectedIds.add(target.loanId);

    setAutoDistribute(true);
    const nextAlloc = distributeAmountAcrossTargets(amountRial, selectedIds, targets);
    const nextStrings: Record<number, string> = {};
    for (const item of nextAlloc) {
      nextStrings[item.loanId] = item.amountRial > 0 ? Money.tomanInput(item.amountRial) : '';
    }
    setLoanInputStrings(nextStrings);
    onChange({ ...value, loanAllocations: nextAlloc });
  };

  const handleAutoDistributeAllMonth = () => {
    const monthTargets = targets.filter(t => t.inCurrentMonth && t.neededAmount > 0);
    const pool = monthTargets.length > 0 ? monthTargets : targets.filter(t => t.neededAmount > 0);
    const selectedIds = new Set(pool.map(t => t.loanId));
    setAutoDistribute(true);
    const nextAlloc = distributeAmountAcrossTargets(amountRial, selectedIds, targets);
    const nextStrings: Record<number, string> = {};
    for (const item of nextAlloc) {
      nextStrings[item.loanId] = item.amountRial > 0 ? Money.tomanInput(item.amountRial) : '';
    }
    setLoanInputStrings(nextStrings);
    onChange({ ...value, loanAllocations: nextAlloc });
  };

  const handleManualLoanAmount = (target: LoanReserveTarget, rawToman: string) => {
    setAutoDistribute(false);
    setLoanInputStrings(prev => ({ ...prev, [target.loanId]: rawToman }));
    const parsedRial = Money.parseToman(rawToman) ?? 0;
    const exists = value.loanAllocations.some(a => a.loanId === target.loanId);
    const nextAlloc = exists
      ? value.loanAllocations.map(a =>
          a.loanId === target.loanId ? { ...a, amountRial: parsedRial } : a
        )
      : [
          ...value.loanAllocations,
          {
            loanId: target.loanId,
            loanTitle: target.loanTitle,
            targetYear: target.targetYear,
            targetMonth: target.targetMonth,
            amountRial: parsedRial,
          },
        ];
    onChange({ ...value, loanAllocations: nextAlloc });
  };

  const thisMonthTargets = targets.filter(t => t.inCurrentMonth);
  const otherTargets = targets.filter(t => !t.inCurrentMonth);

  const monthTotalDue = thisMonthTargets.reduce((s, t) => s + t.dueAmount, 0);
  const monthAlreadyReserved = thisMonthTargets.reduce((s, t) => s + t.reservedAmount, 0);
  const addedToMonth = value.loanAllocations
    .filter(a => a.targetYear === nowJ.y && a.targetMonth === nowJ.m)
    .reduce((s, a) => s + a.amountRial, 0);
  const monthAfterReserved = monthAlreadyReserved + addedToMonth;
  const monthAfterPct = monthTotalDue > 0 ? Math.min(100, Math.round((monthAfterReserved / monthTotalDue) * 100)) : 0;

  const allocatedTotal = value.loanAllocations.reduce((s, a) => s + a.amountRial, 0);
  const overAllocated = allocatedTotal > amountRial;

  const renderLoanRow = (t: LoanReserveTarget) => {
    const alloc = value.loanAllocations.find(a => a.loanId === t.loanId);
    const isSelected = Boolean(alloc);
    const added = alloc?.amountRial ?? 0;
    const afterReserved = t.reservedAmount + added;
    const pctBefore = t.dueAmount > 0 ? Math.min(100, Math.round((t.reservedAmount / t.dueAmount) * 100)) : 0;
    const pctAfter = t.dueAmount > 0 ? Math.min(100, Math.round((afterReserved / t.dueAmount) * 100)) : 0;

    return (
      <div
        key={`${t.loanId}-${t.targetYear}-${t.targetMonth}`}
        className={`p-2.5 rounded-xl border transition-colors space-y-2 ${
          isSelected ? 'bg-sky/10 border-sky/40' : 'bg-sheet/60 border-line'
        }`}
      >
        <div
          onClick={() => toggleLoanSelection(t)}
          role="button"
          tabIndex={0}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-sky border-sky text-black' : 'border-muted/60'
              }`}
            >
              {isSelected && <Check size={12} strokeWidth={3} />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{t.loanTitle}</div>
              <div className="text-[10px] text-muted">
                {Jalali.monthTitle(t.targetYear, t.targetMonth)} · قسط: {Money.toman(t.dueAmount)} تومان
              </div>
            </div>
          </div>

          <div className="text-left shrink-0">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                pctAfter >= 100
                  ? 'bg-ok/20 text-ok'
                  : pctAfter > 0
                    ? 'bg-sky/20 text-sky'
                    : 'bg-white/10 text-muted'
              }`}
            >
              {Money.fa(String(isSelected ? pctAfter : pctBefore))}٪
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted px-0.5">
          <span>
            تأمین‌شده قبلی: {Money.toman(t.reservedAmount)} تومان
          </span>
          <span>
            نیاز باقیمانده: {Money.toman(t.neededAmount)} تومان
          </span>
        </div>

        {isSelected && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-sky font-semibold shrink-0">سهم این واریز (تومان):</span>
            <AmountInput
              placeholder="۰"
              value={loanInputStrings[t.loanId] ?? (added > 0 ? Money.tomanInput(added) : '')}
              onChange={(val) => handleManualLoanAmount(t, val)}
              className="w-full h-8 rounded-lg bg-sheet border border-line text-white text-xs px-2.5 dir-ltr focus:outline-none focus:border-sky"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 rounded-2xl bg-lime/10 border border-lime/25 space-y-2.5">
      <div className="flex items-center gap-2">
        <PiggyBank size={16} className="text-lime shrink-0" />
        <span className="text-xs font-bold text-white">این پول در کارت پس‌انداز بابت چیست؟</span>
      </div>

      {/* 3-option segmented buttons */}
      <div className="grid grid-cols-3 gap-1.5 bg-sheet/70 p-1 rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setPurpose('SAVINGS')}
          className={`py-2 px-1 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 transition-all ${
            value.purpose === 'SAVINGS' ? 'bg-lime text-onLime shadow-sm' : 'text-t2 hover:text-white'
          }`}
        >
          <PiggyBank size={13} />
          ادامه پس‌انداز
        </button>
        <button
          type="button"
          onClick={() => setPurpose('LOAN_RESERVE')}
          className={`py-2 px-1 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 transition-all ${
            value.purpose === 'LOAN_RESERVE' ? 'bg-sky text-black shadow-sm' : 'text-t2 hover:text-white'
          }`}
        >
          <Building2 size={13} />
          بابت وام‌ها
        </button>
        <button
          type="button"
          onClick={() => setPurpose('PERSON_HOLD')}
          className={`py-2 px-1 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 transition-all ${
            value.purpose === 'PERSON_HOLD' ? 'bg-warn text-black shadow-sm' : 'text-t2 hover:text-white'
          }`}
        >
          <UserCheck size={13} />
          امانت / مال کسی
        </button>
      </div>

      {value.purpose === 'SAVINGS' && (
        <p className="text-[10.5px] text-white/70">
          این مبلغ به‌عنوان پس‌انداز خالص شما ثبت می‌شود.
        </p>
      )}

      {value.purpose === 'PERSON_HOLD' && (
        <div className="space-y-2 pt-0.5">
          {persons.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {persons.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange({ ...value, personName: p.name, personId: p.id })}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border transition-colors ${
                    value.personName.trim() === p.name.trim()
                      ? 'bg-warn/20 border-warn text-warn'
                      : 'bg-sheet border-line text-t2 hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder="نام صاحب پول (مثلاً: علی رضایی)"
            value={value.personName}
            onChange={(e) => {
              const name = e.target.value;
              const matched = persons.find(p => p.name.trim() === name.trim());
              onChange({ ...value, personName: name, personId: matched?.id });
            }}
            className="w-full h-10 rounded-xl bg-sheet border border-line text-white text-xs px-3 focus:outline-none focus:border-warn placeholder:text-muted"
          />

          <p className="text-[10px] text-white/75 leading-relaxed">
            این مبلغ به موجودی کارت اضافه می‌شود ولی جزو «درآمد ماه» و «پس‌انداز خالص» شما محاسبه نمی‌شود.
          </p>
        </div>
      )}

      {value.purpose === 'LOAN_RESERVE' && (
        <div className="space-y-2.5 pt-0.5">
          {thisMonthTargets.length > 0 && (
            <div className="p-2.5 rounded-xl bg-sheet/80 border border-line space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">
                  وام‌های {Jalali.monthTitle(nowJ.y, nowJ.m)}:
                </span>
                <span className="font-bold text-white dir-ltr">
                  {Money.toman(monthAfterReserved)} / {Money.toman(monthTotalDue)} تومان
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    monthAfterPct >= 100 ? 'bg-ok' : 'bg-sky'
                  }`}
                  style={{ width: `${monthAfterPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className={monthAfterPct >= 100 ? 'text-ok font-bold' : 'text-sky'}>
                  {monthAfterPct >= 100
                    ? 'با این واریز، وام‌های این ماه ۱۰۰٪ تکمیل می‌شود ✓'
                    : `پیشرفت تأمین وام‌های این ماه: ${Money.fa(String(monthAfterPct))}٪`}
                </span>
              </div>
            </div>
          )}

          {targets.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-white/80 font-semibold">
                  انتخاب وام‌ها (تکی یا چندتایی):
                </span>
                <button
                  type="button"
                  onClick={handleAutoDistributeAllMonth}
                  className="px-2 py-1 rounded-lg bg-sky/15 hover:bg-sky/25 text-sky text-[10px] font-bold flex items-center gap-1"
                >
                  <Sparkles size={11} />
                  تقسیم خودکار بین وام‌های این ماه
                </button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto no-scrollbar pr-0.5">
                {thisMonthTargets.map(renderLoanRow)}

                {otherTargets.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowOtherLoans(v => !v)}
                      className="text-[10.5px] text-sky font-semibold py-1"
                    >
                      {showOtherLoans
                        ? 'بستن سایر وام‌های ماه‌های آینده ▲'
                        : `نمایش سایر وام‌های فعال (${Money.fa(String(otherTargets.length))}) ▼`}
                    </button>
                    {showOtherLoans && (
                      <div className="space-y-2 mt-1">
                        {otherTargets.map(renderLoanRow)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {amountRial > 0 && (
                <div className="text-[10.5px] pt-1 border-t border-white/10">
                  {overAllocated ? (
                    <div className="flex items-center justify-between gap-2 text-bad font-bold">
                      <span>
                        جمع تخصیص‌داده‌شده ({Money.toman(allocatedTotal)}) از مبلغ واریزی بیشتر است!
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoDistributeAllMonth}
                        className="underline shrink-0"
                      >
                        تنظیم خودکار
                      </button>
                    </div>
                  ) : allocatedTotal > 0 && allocatedTotal < amountRial ? (
                    <span className="text-lime">
                      باقی‌مانده ({Money.toman(amountRial - allocatedTotal)} تومان) به‌عنوان پس‌انداز آزاد در کارت ثبت می‌شود.
                    </span>
                  ) : allocatedTotal > 0 ? (
                    <span className="text-ok font-semibold">
                      کل مبلغ واریزی به وام‌های انتخاب‌شده اختصاص یافت.
                    </span>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <p className="text-[10.5px] text-muted">
              هیچ وام فعالی با قسط پرداخت‌نشده ثبت نشده است. ابتدا از بخش «بیشتر ← وام‌ها و اقساط» وام را ثبت کنید.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
