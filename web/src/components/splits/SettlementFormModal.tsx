import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Money } from '../../core/money';
import type { SplitMemberDomain, SplitSettlementDomain } from '../../core/splits';
import { generateIdempotencyKey, recordSettlement } from '../../core/splits/splitRepo';
import { AmountInput } from '../AmountInput';
import { Select } from '../Select';
import { JalaliDatePicker } from './JalaliDatePicker';

interface SettlementFormModalProps {
  isOpen: boolean;
  groupId: number;
  members: SplitMemberDomain[];
  activeSettlements: SplitSettlementDomain[];
  initialFromMemberId?: number;
  initialToMemberId?: number;
  initialAmountRial?: number;
  onClose: () => void;
  onSaved: () => void;
}

export function SettlementFormModal({
  isOpen,
  groupId,
  members,
  activeSettlements,
  initialFromMemberId,
  initialToMemberId,
  initialAmountRial,
  onClose,
  onSaved,
}: SettlementFormModalProps) {
  const [fromMemberId, setFromMemberId] = useState<number>(0);
  const [toMemberId, setToMemberId] = useState<number>(0);
  const [amountToman, setAmountToman] = useState('');
  const [settledAt, setSettledAt] = useState(() => Date.now());
  const [note, setNote] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setDuplicateConfirmed(false);
    setIdempotencyKey(generateIdempotencyKey());
    setSettledAt(Date.now());
    setNote('');

    const fallbackFrom = initialFromMemberId ?? members[0]?.id ?? 0;
    const fallbackTo =
      initialToMemberId ??
      members.find((m) => m.id !== fallbackFrom)?.id ??
      members[0]?.id ??
      0;

    setFromMemberId(fallbackFrom);
    setToMemberId(fallbackTo);
    setAmountToman(
      initialAmountRial && initialAmountRial > 0 ? Money.tomanInput(initialAmountRial) : '',
    );
  }, [isOpen, initialFromMemberId, initialToMemberId, initialAmountRial, members]);

  if (!isOpen) return null;

  const parsedAmount = Money.parseToman(amountToman);
  const hasFractionalError =
    parsedAmount !== null && parsedAmount > 0 && parsedAmount % 10 !== 0;
  const validAmountRial =
    parsedAmount !== null && parsedAmount > 0 && parsedAmount % 10 === 0 ? parsedAmount : null;

  const remainingAfter =
    initialAmountRial != null && validAmountRial != null
      ? Math.max(0, initialAmountRial - validAmountRial)
      : null;

  const hasRecentSimilar =
    validAmountRial != null &&
    activeSettlements.some(
      (s) =>
        s.fromMemberId === fromMemberId &&
        s.toMemberId === toMemberId &&
        s.amount === validAmountRial &&
        Date.now() - s.createdAt < 60_000,
    );

  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.displayName + (m.status === 'ARCHIVED' ? ' (بایگانی)' : ''),
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fromMemberId === toMemberId) {
      setError('پرداخت‌کننده و دریافت‌کننده نمی‌توانند یکسان باشند.');
      return;
    }
    if (hasFractionalError) {
      setError('مبلغ تسویه باید به تومان کامل باشد.');
      return;
    }
    if (validAmountRial == null) {
      setError('مبلغ تسویه باید بیشتر از صفر باشد.');
      return;
    }
    if (hasRecentSimilar && !duplicateConfirmed) {
      setDuplicateConfirmed(true);
      return;
    }

    setSaving(true);
    try {
      // Keep the same `idempotencyKey` if user retries after an error.
      await recordSettlement(groupId, {
        fromMemberId,
        toMemberId,
        amountRial: validAmountRial,
        settledAt,
        idempotencyKey,
        note: note.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'خطا در ثبت تسویه');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 animate-modal-in"
      >
        <div className="flex items-center justify-between border-b border-line pb-2.5">
          <h2 className="text-sm font-bold text-white">ثبت تسویه حساب</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted block mb-1">پرداخت‌کننده (بدهکار)</label>
            <Select
              size="sm"
              value={fromMemberId}
              onChange={(v) => setFromMemberId(Number(v))}
              options={memberOptions}
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">دریافت‌کننده (طلبکار)</label>
            <Select
              size="sm"
              value={toMemberId}
              onChange={(v) => setToMemberId(Number(v))}
              options={memberOptions}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="split-stl-amount" className="text-[11px] text-muted">
              مبلغ پرداختی (تومان)
            </label>
            {initialAmountRial != null && initialAmountRial > 0 && (
              <button
                type="button"
                onClick={() => setAmountToman(Money.tomanInput(initialAmountRial))}
                className="text-[10px] text-sky font-bold hover:underline"
              >
                تسویه کامل ({Money.toman(initialAmountRial)})
              </button>
            )}
          </div>
          <AmountInput
            id="split-stl-amount"
            placeholder="۰"
            value={amountToman}
            onChange={(val) => {
              setAmountToman(val);
              setDuplicateConfirmed(false);
            }}
            className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
          {hasFractionalError && (
            <p className="mt-1 text-[11px] text-bad">مبلغ باید به تومان کامل وارد شود.</p>
          )}
          {remainingAfter !== null && validAmountRial != null && (
            <p className="mt-1 text-[11px] text-t2">
              {remainingAfter === 0
                ? 'نوع تسویه: تسویه کامل بدهی پیشنهادی'
                : `تسویه جزئی · باقی‌مانده: ${Money.toman(remainingAfter)} تومان`}
            </p>
          )}
        </div>

        <JalaliDatePicker
          label="تاریخ تسویه"
          valueMs={settledAt}
          onChangeMs={setSettledAt}
        />

        <div>
          <label className="text-[11px] text-muted block mb-1">یادداشت (اختیاری)</label>
          <input
            type="text"
            placeholder="مثلاً: کارت‌به‌کارت، نقدی"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            className="w-full h-10 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
        </div>

        {hasRecentSimilar && duplicateConfirmed && (
          <div className="p-2.5 rounded-xl bg-warn/15 border border-warn/30 text-warn text-[11px] flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              تسویه مشابهی در یک دقیقه اخیر ثبت شده است. برای ثبت مجدد دوباره روی دکمه تایید بزنید.
            </span>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || validAmountRial == null || fromMemberId === toMemberId}
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab disabled:opacity-45"
        >
          <CheckCircle2 size={16} />
          <span>
            {saving
              ? 'در حال ثبت...'
              : hasRecentSimilar && duplicateConfirmed
                ? 'تایید ثبت مجدد تسویه'
                : 'ثبت تسویه'}
          </span>
        </button>
      </form>
    </div>
  );
}
