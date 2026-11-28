import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Scale, Users, X } from 'lucide-react';
import { Money } from '../../core/money';
import {
  computeEqualShares,
  type SplitExpenseDomain,
  type SplitMemberDomain,
  type SplitMethod,
  type SplitShareDomain,
} from '../../core/splits';
import { addExpense, updateExpense } from '../../core/splits/splitRepo';
import { AmountInput } from '../AmountInput';
import { JalaliDatePicker } from './JalaliDatePicker';

interface ExpenseFormModalProps {
  isOpen: boolean;
  groupId: number;
  members: SplitMemberDomain[];
  hasActiveSettlements: boolean;
  editingExpense?: SplitExpenseDomain | null;
  editingShares?: SplitShareDomain[];
  onClose: () => void;
  onSaved: () => void;
}

export function ExpenseFormModal({
  isOpen,
  groupId,
  members,
  hasActiveSettlements,
  editingExpense = null,
  editingShares = [],
  onClose,
  onSaved,
}: ExpenseFormModalProps) {
  const activeMembers = useMemo(
    () => members.filter((m) => m.status === 'ACTIVE'),
    [members],
  );
  const selfMember = useMemo(
    () => activeMembers.find((m) => m.role === 'SELF') ?? activeMembers[0] ?? members[0],
    [activeMembers, members],
  );

  // When editing a historical/review expense, also include members already attached to it.
  const selectableMembers = useMemo(() => {
    if (!editingExpense) return activeMembers;
    const attachedIds = new Set<number>([
      editingExpense.payerId,
      ...editingShares.map((s) => s.memberId),
    ]);
    return members.filter((m) => m.status === 'ACTIVE' || attachedIds.has(m.id));
  }, [activeMembers, editingExpense, editingShares, members]);

  const [title, setTitle] = useState('');
  const [amountToman, setAmountToman] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => Date.now());
  const [note, setNote] = useState('');
  const [payerId, setPayerId] = useState<number>(0);
  const [beneficiaryIds, setBeneficiaryIds] = useState<number[]>([]);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('EQUAL');
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (editingExpense) {
      setTitle(editingExpense.title);
      setAmountToman(Money.tomanInput(editingExpense.amount));
      setOccurredAt(editingExpense.occurredAt);
      setNote(editingExpense.note ?? '');

      const validMemberSet = new Set(selectableMembers.map((m) => m.id));
      const initialPayer = validMemberSet.has(editingExpense.payerId)
        ? editingExpense.payerId
        : (selfMember?.id ?? selectableMembers[0]?.id ?? 0);
      setPayerId(initialPayer);

      if (editingShares.length > 0) {
        const benIds = editingShares
          .map((s) => s.memberId)
          .filter((id) => validMemberSet.has(id));
        setBeneficiaryIds(
          benIds.length > 0 ? benIds : activeMembers.map((m) => m.id),
        );
        const map: Record<number, string> = {};
        for (const s of editingShares) {
          map[s.memberId] = Money.tomanInput(s.amount);
        }
        setCustomInputs(map);
      } else {
        // Legacy NEEDS_REVIEW with 0 shares: user must confirm beneficiaries/shares explicitly
        setBeneficiaryIds(activeMembers.map((m) => m.id));
        setCustomInputs({});
      }

      setSplitMethod(
        editingExpense.integrityStatus === 'NEEDS_REVIEW'
          ? 'EQUAL'
          : editingExpense.splitMethod,
      );
    } else {
      setTitle('');
      setAmountToman('');
      setOccurredAt(Date.now());
      setNote('');
      setPayerId(selfMember?.id ?? activeMembers[0]?.id ?? 0);
      setBeneficiaryIds(activeMembers.map((m) => m.id));
      setSplitMethod('EQUAL');
      setCustomInputs({});
    }
  }, [isOpen, editingExpense, editingShares, activeMembers, selectableMembers, selfMember]);

  const parsedAmount = Money.parseToman(amountToman);
  const hasInvalidFractionalToman =
    parsedAmount !== null && parsedAmount > 0 && parsedAmount % 10 !== 0;
  const validAmountRial =
    parsedAmount !== null && parsedAmount > 0 && parsedAmount % 10 === 0 ? parsedAmount : null;

  const equalPreview = useMemo(() => {
    if (splitMethod !== 'EQUAL' || validAmountRial == null || beneficiaryIds.length === 0) {
      return [];
    }
    try {
      return computeEqualShares(validAmountRial, beneficiaryIds);
    } catch {
      return [];
    }
  }, [splitMethod, validAmountRial, beneficiaryIds]);

  const customState = useMemo(() => {
    if (splitMethod !== 'CUSTOM') return null;
    const sharesMap: Record<number, number> = {};
    let allocated = 0;
    let hasInvalidField = false;
    let positiveCount = 0;

    for (const id of beneficiaryIds) {
      const raw = (customInputs[id] ?? '').trim();
      if (raw === '') {
        sharesMap[id] = 0;
        continue;
      }
      const val = Money.parseToman(raw);
      if (val === null || val < 0 || val % 10 !== 0) {
        hasInvalidField = true;
      } else {
        sharesMap[id] = val;
        allocated += val;
        if (val > 0) positiveCount++;
      }
    }

    const target = validAmountRial ?? 0;
    const remaining = target - allocated;
    const isExact =
      validAmountRial != null &&
      !hasInvalidField &&
      positiveCount > 0 &&
      remaining === 0;

    return { sharesMap, allocated, remaining, hasInvalidField, isExact };
  }, [splitMethod, beneficiaryIds, customInputs, validAmountRial]);

  if (!isOpen) return null;

  const toggleBeneficiary = (id: number) => {
    setBeneficiaryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllBeneficiaries = () => {
    setBeneficiaryIds(selectableMembers.map((m) => m.id));
  };

  const switchToCustom = () => {
    // Prefill custom inputs with current equal shares as a starting point if empty
    if (validAmountRial != null && beneficiaryIds.length > 0 && Object.keys(customInputs).length === 0) {
      try {
        const eq = computeEqualShares(validAmountRial, beneficiaryIds);
        const next: Record<number, string> = {};
        for (const s of eq) {
          next[s.memberId] = Money.tomanInput(s.amount);
        }
        setCustomInputs(next);
      } catch {
        // ignore
      }
    }
    setSplitMethod('CUSTOM');
  };

  const memberNameById = new Map(members.map((m) => [m.id, m.displayName]));

  const canSubmit =
    !saving &&
    title.trim().length > 0 &&
    validAmountRial != null &&
    payerId > 0 &&
    beneficiaryIds.length > 0 &&
    (splitMethod === 'EQUAL' || Boolean(customState?.isExact));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('عنوان هزینه را وارد کنید.');
      return;
    }
    if (hasInvalidFractionalToman) {
      setError('مبلغ باید عدد صحیح به تومان باشد (حداقل دقت ۱۰ ریال).');
      return;
    }
    if (validAmountRial == null) {
      setError('مبلغ معتبر بزرگ‌تر از صفر وارد کنید.');
      return;
    }
    if (beneficiaryIds.length === 0) {
      setError('حداقل یک نفر باید در هزینه سهیم باشد.');
      return;
    }
    if (splitMethod === 'CUSTOM' && !customState?.isExact) {
      setError('مجموع سهم‌های دلخواه باید دقیقاً برابر مبلغ کل باشد.');
      return;
    }

    setSaving(true);
    try {
      const draft = {
        title: title.trim(),
        amountRial: validAmountRial,
        payerId,
        splitMethod,
        beneficiaryIds,
        customSharesByMemberId:
          splitMethod === 'CUSTOM' ? customState?.sharesMap : undefined,
        occurredAt,
        note: note.trim() || undefined,
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, draft);
      } else {
        await addExpense(groupId, draft);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'خطا در ثبت هزینه');
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
          <h2 className="text-sm font-bold text-white">
            {editingExpense
              ? editingExpense.integrityStatus === 'NEEDS_REVIEW'
                ? 'تکمیل و بررسی هزینه قدیمی'
                : 'ویرایش هزینه'
              : 'ثبت هزینه جدید'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted"
          >
            <X size={16} />
          </button>
        </div>

        {editingExpense && hasActiveSettlements && (
          <div className="p-2.5 rounded-xl bg-warn/15 border border-warn/30 text-warn text-[11px] flex items-start gap-2 leading-relaxed">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              در این گروه تسویه ثبت شده است. با ویرایش این هزینه، مانده اعضا و پیشنهادهای تسویه دوباره محاسبه می‌شوند.
            </span>
          </div>
        )}

        {editingExpense?.integrityStatus === 'NEEDS_REVIEW' && (
          <div className="p-2.5 rounded-xl bg-sky/15 border border-sky/30 text-sky text-[11px] leading-relaxed">
            اطلاعات پرداخت‌کننده یا سهم این هزینه قدیمی ناقص بود. لطفاً پرداخت‌کننده و سهیم‌شدگان را تایید کنید.
          </div>
        )}

        <div>
          <label className="text-[11px] text-muted block mb-1">عنوان هزینه</label>
          <input
            type="text"
            placeholder="مثلاً: شام رستوران، خرید سوپرمارکت، بنزین"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
        </div>

        <div>
          <label htmlFor="split-exp-amount" className="text-[11px] text-muted block mb-1">
            مبلغ کل (تومان)
          </label>
          <AmountInput
            id="split-exp-amount"
            placeholder="۰"
            value={amountToman}
            onChange={setAmountToman}
            className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
          {hasInvalidFractionalToman && (
            <p className="mt-1 text-[11px] text-bad">
              اعشار تومانی (ریال) پشتیبانی نمی‌شود؛ مبلغ را به تومان کامل وارد کنید.
            </p>
          )}
        </div>

        <JalaliDatePicker
          label="تاریخ هزینه"
          valueMs={occurredAt}
          onChangeMs={setOccurredAt}
        />

        {/* Payer Selection */}
        <div>
          <label className="text-[11px] text-muted block mb-1.5">چه کسی پرداخت کرد؟</label>
          <div className="flex flex-wrap gap-1.5">
            {selectableMembers.map((m) => {
              const selected = payerId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPayerId(m.id)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                    selected
                      ? 'bg-lime text-onLime border-lime font-bold'
                      : 'bg-surface border-line text-t2 hover:border-lineStrong'
                  }`}
                >
                  {m.displayName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Beneficiaries Selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-muted flex items-center gap-1">
              <Users size={12} />
              <span>بین چه کسانی تقسیم شود؟</span>
            </label>
            <button
              type="button"
              onClick={selectAllBeneficiaries}
              className="text-[10px] text-sky font-bold hover:underline"
            >
              انتخاب همه
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectableMembers.map((m) => {
              const selected = beneficiaryIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleBeneficiary(m.id)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-1 transition-colors ${
                    selected
                      ? 'bg-sky/20 border-sky text-sky'
                      : 'bg-surface border-line text-muted hover:border-lineStrong'
                  }`}
                >
                  {selected && <Check size={12} />}
                  <span>{m.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Split Method Switcher */}
        <div>
          <label className="text-[11px] text-muted flex items-center gap-1 mb-1.5">
            <Scale size={12} />
            <span>روش تقسیم</span>
          </label>
          <div className="grid grid-cols-2 bg-surface rounded-xl p-1 border border-line gap-1">
            <button
              type="button"
              onClick={() => setSplitMethod('EQUAL')}
              className={`h-9 rounded-lg text-xs font-bold transition-colors ${
                splitMethod === 'EQUAL' ? 'bg-primaryStrong text-white' : 'text-t2'
              }`}
            >
              مساوی
            </button>
            <button
              type="button"
              onClick={switchToCustom}
              className={`h-9 rounded-lg text-xs font-bold transition-colors ${
                splitMethod === 'CUSTOM' ? 'bg-primaryStrong text-white' : 'text-t2'
              }`}
            >
              مبلغ دلخواه
            </button>
          </div>
        </div>

        {/* Live Share Preview or Custom Share Inputs */}
        {splitMethod === 'EQUAL' && equalPreview.length > 0 && (
          <div className="p-3 rounded-2xl bg-surface border border-line space-y-1.5">
            <div className="text-[11px] font-bold text-t2">پیش‌نمایش سهم هر نفر</div>
            <div className="space-y-1">
              {equalPreview.map((s) => (
                <div key={s.memberId} className="flex items-center justify-between text-xs">
                  <span className="text-white/90">{memberNameById.get(s.memberId)}</span>
                  <span className="font-bold text-white dir-ltr">
                    {Money.toman(s.amount)}{' '}
                    <span className="text-[10px] text-muted font-normal">تومان</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {splitMethod === 'CUSTOM' && beneficiaryIds.length > 0 && (
          <div className="p-3 rounded-2xl bg-surface border border-line space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-t2">سهم هر عضو (تومان)</span>
              {validAmountRial != null && customState && (
                <span
                  className={`font-bold dir-ltr ${
                    customState.remaining === 0
                      ? 'text-ok'
                      : customState.remaining > 0
                        ? 'text-warn'
                        : 'text-bad'
                  }`}
                >
                  {customState.remaining === 0
                    ? 'تراز شد ✓'
                    : customState.remaining > 0
                      ? `باقی‌مانده: ${Money.toman(customState.remaining)} تومان`
                      : `مازاد: ${Money.toman(Math.abs(customState.remaining))} تومان`}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {beneficiaryIds.map((id) => (
                <div key={id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white truncate flex-1">
                    {memberNameById.get(id)}
                  </span>
                  <div className="w-36">
                    <AmountInput
                      placeholder="۰"
                      value={customInputs[id] ?? ''}
                      onChange={(val) =>
                        setCustomInputs((prev) => ({ ...prev, [id]: val }))
                      }
                      wordsClassName="hidden"
                      className="w-full h-9 rounded-lg bg-surface2 border border-line text-white text-xs px-2.5 focus:outline-none focus:border-sky"
                    />
                  </div>
                </div>
              ))}
            </div>

            {customState?.hasInvalidField && (
              <p className="text-[10px] text-bad">
                سهم‌ها باید عدد صحیح غیرمنفی به تومان باشند.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="text-[11px] text-muted block mb-1">یادداشت (اختیاری)</label>
          <input
            type="text"
            placeholder="توضیح تکمیلی..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={160}
            className="w-full h-10 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab disabled:opacity-45"
        >
          {saving
            ? 'در حال ثبت...'
            : editingExpense
              ? 'ذخیره تغییرات هزینه'
              : 'ثبت هزینه'}
        </button>
      </form>
    </div>
  );
}
