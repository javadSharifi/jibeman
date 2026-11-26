import React, { useState, useEffect } from 'react';
import { X, Delete, ArrowLeftRight, Check, ShieldAlert } from 'lucide-react';
import { db, type Account, type Category } from '../core/db';
import {
  getSavingsAccountEarmarks,
  saveSavingsDepositAllocations,
  type SavingsCommitmentWithRemaining,
  type SavingsDepositAllocation,
} from '../core/db/helpers';
import { Money } from '../core/money';
import { AmountInput } from './AmountInput';
import { Select } from './Select';
import { CategoryIcon } from './UI';
import { ImpulseBrakeModal } from './impulse/ImpulseBrakeModal';
import {
  SavingsDepositBox,
  createDefaultSavingsAllocation,
  validateSavingsAllocation,
} from './SavingsDepositBox';

interface QuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  onSuccess?: () => void;
}

export function QuickAdd({ isOpen, onClose, defaultType = 'EXPENSE', onSuccess }: QuickAddProps) {
  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>(defaultType);
  const [amountStr, setAmountStr] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selectedAccId, setSelectedAccId] = useState<number | null>(null);
  const [selectedToAccId, setSelectedToAccId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [returnCommitment, setReturnCommitment] = useState(true);
  const [savingsAllocation, setSavingsAllocation] = useState<SavingsDepositAllocation>(createDefaultSavingsAllocation);
  const [openEarmarks, setOpenEarmarks] = useState<SavingsCommitmentWithRemaining[]>([]);
  const [releaseEarmarkId, setReleaseEarmarkId] = useState<number | undefined>();

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isImpulseModalOpen, setIsImpulseModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      setAmountStr('');
      setTitle('');
      setReturnCommitment(true);
      setSavingsAllocation(createDefaultSavingsAllocation());
      setReleaseEarmarkId(undefined);

      // Load data
      db.accounts.filter(a => !a.archived).sortBy('sortOrder').then(accs => {
        setAccounts(accs);
        if (accs.length > 0) {
          setSelectedAccId(accs[0].id!);
          if (accs.length > 1) setSelectedToAccId(accs[1].id!);
        }
      });
    }
  }, [isOpen, defaultType]);

  useEffect(() => {
    if (type !== 'TRANSFER') {
      db.categories.where('kind').equals(type).sortBy('sortOrder').then(cats => {
        setCategories(cats);
        if (cats.length > 0) setSelectedCatId(cats[0].id!);
      });
    }
  }, [type]);

  const rial = Money.parseToman(amountStr) ?? 0;
  const selectedAcc = accounts.find(a => a.id === selectedAccId);
  const targetAcc = accounts.find(a => a.id === selectedToAccId);
  const isWithdrawalFromSavings = Boolean(selectedAcc?.isSavings && (type === 'EXPENSE' || (type === 'TRANSFER' && !targetAcc?.isSavings)));
  const isDepositToSavings = Boolean(
    (type === 'INCOME' && selectedAcc?.isSavings) ||
    (type === 'TRANSFER' && targetAcc?.isSavings && selectedAccId !== selectedToAccId)
  );
  const depositTargetAccId = type === 'TRANSFER' ? selectedToAccId : selectedAccId;

  useEffect(() => {
    if (!isOpen || !isWithdrawalFromSavings || !selectedAccId) {
      setOpenEarmarks([]);
      setReleaseEarmarkId(undefined);
      return;
    }
    getSavingsAccountEarmarks(selectedAccId).then(res => {
      const active = [...res.loanReserves, ...res.personHolds].filter(e => e.remaining > 0);
      setOpenEarmarks(active);
      setReleaseEarmarkId(undefined);
    });
  }, [isOpen, isWithdrawalFromSavings, selectedAccId]);

  if (!isOpen) return null;

  const handleDigit = (d: string) => {
    setAmountStr(prev => {
      if (!prev && (d === '0' || d === '000')) return prev;
      return Money.normalizeAmountInput(prev + d, 12) ?? prev;
    });
  };

  const handleDelete = () => {
    setAmountStr(prev => prev.slice(0, -1));
  };

  const handleSave = async () => {
    if (rial <= 0 || !selectedAccId) return;

    if (isDepositToSavings) {
      const err = validateSavingsAllocation(savingsAllocation, rial);
      if (err) {
        alert(err);
        return;
      }
    }

    let txnId: number;
    if (type === 'TRANSFER') {
      if (!selectedToAccId || selectedAccId === selectedToAccId) {
        alert('لطفاً دو حساب متفاوت برای انتقال انتخاب کنید');
        return;
      }
      txnId = await db.txns.add({
        type: 'TRANSFER',
        amount: rial,
        accountId: selectedAccId,
        toAccountId: selectedToAccId,
        title: title || 'انتقال وجه',
        occurredAt: Date.now(),
        source: 'MANUAL',
        createdAt: Date.now(),
      });
    } else {
      txnId = await db.txns.add({
        type,
        amount: rial,
        accountId: selectedAccId,
        categoryId: selectedCatId || undefined,
        title: title || undefined,
        occurredAt: Date.now(),
        source: 'MANUAL',
        createdAt: Date.now(),
      });
    }

    if (isWithdrawalFromSavings && releaseEarmarkId) {
      const earmarked = openEarmarks.find(e => e.id === releaseEarmarkId);
      if (earmarked) {
        const settleAmt = Math.min(rial, earmarked.remaining);
        await db.savingsCommitments.update(releaseEarmarkId, {
          paidAmount: (earmarked.paidAmount || 0) + settleAmt,
        });
        await db.savingsPayments.add({
          commitmentId: releaseEarmarkId,
          amount: settleAmt,
          at: Date.now(),
          txnId,
        });
      }
    } else if (isWithdrawalFromSavings && returnCommitment) {
      await db.savingsCommitments.add({
        accountId: selectedAccId,
        txnId,
        amount: rial,
        paidAmount: 0,
        kind: 'WITHDRAWAL',
        note: title || (type === 'TRANSFER' ? 'انتقال از پس‌انداز' : 'برداشت از پس‌انداز'),
        createdAt: Date.now(),
      });
    }

    if (isDepositToSavings && depositTargetAccId) {
      await saveSavingsDepositAllocations({
        accountId: depositTargetAccId,
        txnId,
        amountRial: rial,
        allocation: {
          ...savingsAllocation,
          note: title.trim() || undefined,
        },
      });
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center safe-sheet bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-sheet rounded-t-[32px] border-t border-white/10 p-4 flex flex-col max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Handle bar & Close */}
        <div className="flex items-center justify-between pb-2">
          <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto" />
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented Type Switcher */}
        <div className="flex bg-surface rounded-2xl p-1 gap-1 mt-2">
          <button
            type="button"
            onClick={() => setType('EXPENSE')}
            className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
              type === 'EXPENSE' ? 'bg-lime text-onLime shadow' : 'text-t2 hover:text-white'
            }`}
          >
            هزینه
          </button>
          <button
            type="button"
            onClick={() => setType('INCOME')}
            className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
              type === 'INCOME' ? 'bg-lime text-onLime shadow' : 'text-t2 hover:text-white'
            }`}
          >
            درآمد
          </button>
          <button
            type="button"
            onClick={() => setType('TRANSFER')}
            className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
              type === 'TRANSFER' ? 'bg-lime text-onLime shadow' : 'text-t2 hover:text-white'
            }`}
          >
            انتقال
          </button>
        </div>

        {/* Large Amount Display */}
        <div className="flex flex-col items-center justify-center py-4">
          <label htmlFor="quick-add-amount" className="text-xs font-medium text-muted">مبلغ (تومان)</label>
          <AmountInput id="quick-add-amount" placeholder="۰" value={amountStr} onChange={setAmountStr}
            maxDigits={12}
            className="w-full min-w-0 bg-transparent text-center text-3xl sm:text-4xl font-extrabold text-white tracking-tight rounded-xl focus-visible:outline focus-visible:outline-1 focus-visible:outline-lime"
            wordsClassName="mt-1 px-4 text-center text-xs text-muted" />
        </div>

        {/* Account selection */}
        <div className="space-y-3 mb-3">
          {type === 'TRANSFER' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted block mb-1">از حساب</label>
                <Select
                  value={selectedAccId || undefined}
                  onChange={(val) => setSelectedAccId(Number(val))}
                  options={accounts
                    .filter((a): a is Account & { id: number } => a.id != null)
                    .map(a => ({ value: a.id, label: a.name }))}
                  placeholder="انتخاب حساب"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">به حساب</label>
                <Select
                  value={selectedToAccId || undefined}
                  onChange={(val) => setSelectedToAccId(Number(val))}
                  options={accounts
                    .filter((a): a is Account & { id: number } => a.id != null)
                    .map(a => ({ value: a.id, label: a.name }))}
                  placeholder="انتخاب حساب"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-muted block mb-1">حساب مبدا</label>
              <Select
                value={selectedAccId || undefined}
                onChange={(val) => setSelectedAccId(Number(val))}
                options={accounts
                  .filter((a): a is Account & { id: number } => a.id != null)
                  .map(a => ({ value: a.id, label: a.name }))}
                placeholder="انتخاب حساب"
              />
            </div>
          )}

          {/* Title / Description */}
          <div>
            <input
              type="text"
              placeholder="توضیح یا عنوان (اختیاری)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky placeholder:text-muted"
            />
          </div>

          {/* Savings Deposit Purpose / Loan & Person Earmarking */}
          {isDepositToSavings && (
            <SavingsDepositBox
              amountRial={rial}
              value={savingsAllocation}
              onChange={setSavingsAllocation}
            />
          )}

          {/* Savings Return Commitment / Earmark Release */}
          {isWithdrawalFromSavings && (
            <div className="space-y-2">
              {openEarmarks.length > 0 && (
                <div className="p-2.5 rounded-xl bg-sky/10 border border-sky/25 space-y-1.5 text-xs">
                  <span className="font-bold text-white block text-[11px]">
                    برداشت از محل وام/امانت؟ (اختیاری)
                  </span>
                  <Select
                    size="sm"
                    value={releaseEarmarkId ?? 0}
                    onChange={(val) => {
                      const id = Number(val);
                      setReleaseEarmarkId(id === 0 ? undefined : id);
                      if (id !== 0) setReturnCommitment(false);
                    }}
                    options={[
                      { value: 0, label: 'برداشت عادی از پس‌انداز' },
                      ...openEarmarks
                        .filter((e): e is SavingsCommitmentWithRemaining & { id: number } => e.id != null)
                        .map(e => ({
                          value: e.id,
                          label: e.note || (e.kind === 'PERSON_HOLD' ? `امانت ${e.personName}` : 'ذخیره وام'),
                          sublabel: `${Money.toman(e.remaining)} تومان`,
                        })),
                    ]}
                  />
                </div>
              )}

              {!releaseEarmarkId && (
                <div
                  onClick={() => setReturnCommitment(prev => !prev)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-lime/10 border border-lime/25 cursor-pointer text-xs select-none"
                >
                  <input
                    type="checkbox"
                    checked={returnCommitment}
                    onChange={e => setReturnCommitment(e.target.checked)}
                    className="accent-lime w-4 h-4 rounded cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex-1">
                    <span className="font-bold text-white">این مبلغ را به پس‌انداز برمی‌گردانم</span>
                    <span className="text-[10px] text-white/60 block mt-0.5">ثبت تعهد بازگشت (طلب از خود) جهت بازگرداندن در آینده</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categories (for Expense/Income) */}
        {type !== 'TRANSFER' && (
          <div className="mb-3">
            <span className="text-[11px] text-muted block mb-1 px-0.5">دسته‌بندی</span>
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1.5 px-1 -mx-1">
              {categories.map(cat => {
                const isSelected = selectedCatId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCatId(cat.id!)}
                    className={`flex flex-col items-center gap-1 min-w-[58px] p-1.5 rounded-2xl border transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-lime/15 border-lime shadow-[0_0_12px_rgba(232,252,180,0.15)] text-white'
                        : 'border-transparent bg-transparent opacity-70 hover:opacity-100 hover:bg-white/5'
                    }`}
                  >
                    <CategoryIcon icon={cat.icon} colorIdx={cat.color} size={18} />
                    <span className="text-[10px] text-white truncate max-w-[54px] font-medium">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 my-2 dir-ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-12 rounded-2xl bg-surface hover:bg-surface2 active:bg-white/10 text-white font-bold text-lg flex items-center justify-center transition-colors"
            >
              {Money.fa(d)}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            className="h-12 rounded-2xl bg-surface hover:bg-surface2 active:bg-white/10 text-white flex items-center justify-center transition-colors"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Mindful Shopping Mode Option (Impulse Purchase Brake) */}
        {type === 'EXPENSE' && (
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 my-2">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-white block">حالت خرید آگاهانه</span>
                <span className="text-[10px] text-muted block">ترمز خرید هیجانی و قانون خروج از فروشگاه</span>
              </div>
            </div>
            <button
              type="button"
              disabled={rial <= 0}
              onClick={() => setIsImpulseModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black active:scale-95 transition-all disabled:opacity-40"
            >
              فعال‌سازی ترمز
            </button>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          disabled={rial <= 0}
          onClick={handleSave}
          className="w-full h-13 mt-1 py-3 rounded-2xl bg-lime text-onLime font-extrabold text-sm flex items-center justify-center gap-2 shadow-fab active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          <Check size={20} strokeWidth={2.8} />
          <span>ثبت تراکنش عادی</span>
        </button>

        {/* Impulse Brake Modal */}
        <ImpulseBrakeModal
          isOpen={isImpulseModalOpen}
          onClose={() => setIsImpulseModalOpen(false)}
          initialData={{
            itemTitle: title.trim() || 'خرید کالا',
            amountRial: rial,
            accountId: selectedAccId || undefined,
            categoryId: selectedCatId || undefined,
          }}
          onSuccess={(outcome) => {
            setIsImpulseModalOpen(false);
            onClose();
            if (onSuccess) onSuccess();
          }}
        />
      </div>
    </div>
  );
}
