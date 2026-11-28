import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AmountInput } from '../components/AmountInput';
import { DebtForm } from '../components/DebtForm';
import { Plus, X, HandCoins, ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { db, type Debt, type Account } from '../core/db';
import { Money } from '../core/money';
import { Jalali } from '../core/jalali';
import { HeaderBar } from '../components/UI';
import { Select } from '../components/Select';

interface DebtWithRemaining extends Debt {
  remaining: number;
  paid: number;
}

export function Debts({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [direction, setDirection] = useState<'OWED_TO_ME' | 'I_OWE'>('OWED_TO_ME');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtWithRemaining | null>(null);
  const [deleteTargetDebt, setDeleteTargetDebt] = useState<DebtWithRemaining | null>(null);
  const [payTargetDebt, setPayTargetDebt] = useState<DebtWithRemaining | null>(null);

  // Payment modal states
  const [payAmountToman, setPayAmountToman] = useState('');
  const [selectedAccId, setSelectedAccId] = useState<number | undefined>();

  const { debts, accounts } = useLiveQuery(
    async () => {
      const [allDebts, allPayments, allAccs] = await Promise.all([
        db.debts.where('direction').equals(direction).toArray(),
        db.debtPayments.toArray(),
        db.accounts.filter(a => !a.archived).toArray(),
      ]);

      const withRem: DebtWithRemaining[] = allDebts
        .map(d => {
          const pmts = allPayments.filter(p => p.debtId === d.id);
          const paid = pmts.reduce((acc, p) => acc + p.amount, 0);
          return {
            ...d,
            paid,
            remaining: Math.max(0, d.amount - paid),
          };
        })
        .sort((a, b) => {
          const aDone = a.remaining === 0 ? 1 : 0;
          const bDone = b.remaining === 0 ? 1 : 0;
          if (aDone !== bDone) return aDone - bDone;
          if (a.dueAt != null && b.dueAt != null) return a.dueAt - b.dueAt;
          if (a.dueAt != null) return -1;
          if (b.dueAt != null) return 1;
          return b.createdAt - a.createdAt;
        });

      return { debts: withRem, accounts: allAccs };
    },
    [direction],
    { debts: [] as DebtWithRemaining[], accounts: [] as Account[] }
  );

  const openAddModal = () => {
    setEditingDebt(null);
    setIsFormOpen(true);
  };

  const openEditModal = (d: DebtWithRemaining) => {
    setEditingDebt(d);
    setIsFormOpen(true);
  };

  const handleDeleteDebt = async (debt: DebtWithRemaining) => {
    if (debt.id == null) return;
    await db.transaction('rw', [db.debts, db.debtPayments, db.outbox], async () => {
      await db.debtPayments.where('debtId').equals(debt.id!).delete();
      await db.debts.delete(debt.id!);
    });
    setDeleteTargetDebt(null);
  };

  const handleAddPayment = async () => {
    if (!payTargetDebt) return;
    const rial = Money.parseToman(payAmountToman);
    if (!rial || rial > payTargetDebt.remaining) {
      alert('مبلغ پرداخت باید بیشتر از صفر و حداکثر برابر با مانده باشد.');
      return;
    }
    const accId = selectedAccId ?? accounts[0]?.id;
    const incoming = payTargetDebt.direction === 'OWED_TO_ME';

    await db.transaction('rw', [db.txns, db.debtPayments, db.outbox], async () => {
      let txnId: number | undefined;
      if (accId) {
        txnId = await db.txns.add({
          type: 'DEBT',
          amount: incoming ? rial : -rial,
          accountId: accId,
          title: incoming ? `وصول طلب از ${payTargetDebt.person}` : `پرداخت بدهی به ${payTargetDebt.person}`,
          occurredAt: Date.now(),
          source: 'MANUAL',
          createdAt: Date.now(),
        });
      }

      await db.debtPayments.add({
        debtId: payTargetDebt.id!,
        amount: rial,
        at: Date.now(),
        txnId,
      });
    });

    setPayTargetDebt(null);
    setPayAmountToman('');
  };

  const todayStart = Jalali.dayStart(Date.now());

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="بدهی و طلب"
        onBack={onBack}
        action={
          <button
            onClick={openAddModal}
            aria-label="افزودن بدهی یا طلب"
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
          >
            <Plus size={20} strokeWidth={2.8} />
          </button>
        }
      />

      {/* Direction Segment Switcher */}
      <div className="flex bg-surface rounded-2xl p-1 gap-1 my-3">
        <button
          onClick={() => setDirection('OWED_TO_ME')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            direction === 'OWED_TO_ME' ? 'bg-lime text-onLime shadow' : 'text-t2'
          }`}
        >
          <ArrowDownLeft size={16} />
          طلب‌های من (بستانکار)
        </button>
        <button
          onClick={() => setDirection('I_OWE')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            direction === 'I_OWE' ? 'bg-lime text-onLime shadow' : 'text-t2'
          }`}
        >
          <ArrowUpRight size={16} />
          بدهی‌های من (بدهکار)
        </button>
      </div>

      {/* Debts list */}
      <div className="space-y-3 mt-2">
        {debts.map(d => {
          const isDone = d.remaining === 0;
          const isOverdue = !isDone && d.dueAt != null && Jalali.dayStart(d.dueAt) < todayStart;
          return (
            <div key={d.id} className="p-4 rounded-[22px] bg-surface border border-line space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center ${
                    direction === 'OWED_TO_ME' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'
                  }`}>
                    <HandCoins size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{d.person}</h3>
                    <div className={`text-[11px] mt-0.5 ${
                      isDone ? 'text-ok' : isOverdue ? 'text-bad font-semibold' : 'text-muted'
                    }`}>
                      {isDone
                        ? 'تسویه شده ✓'
                        : d.dueAt != null
                          ? `سررسید: ${Jalali.longDate(d.dueAt)}${isOverdue ? ' (سررسید گذشته)' : ''}`
                          : 'بدون سررسید'}
                    </div>
                    {d.note && (
                      <div className="text-[11px] text-t2 mt-0.5 truncate">{d.note}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <div className="text-sm font-black text-white dir-ltr">
                    {hidden ? '•••' : Money.toman(d.remaining)}
                    <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
                  </div>
                  {!isDone && d.remaining < d.amount && (
                    <div className="text-[10px] text-muted dir-ltr">
                      از {hidden ? '•••' : Money.toman(d.amount)} تومان
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line/50">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(d)}
                    aria-label="ویرایش"
                    className="h-8 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-line text-muted hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Pencil size={13} />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetDebt(d)}
                    aria-label="حذف"
                    className="h-8 px-2.5 rounded-xl bg-bad/10 hover:bg-bad/20 border border-bad/20 text-bad text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={13} />
                    حذف
                  </button>
                </div>

                {!isDone ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPayTargetDebt(d);
                      setPayAmountToman(Money.tomanInput(d.remaining));
                      if (!selectedAccId && accounts[0]?.id) setSelectedAccId(accounts[0].id);
                    }}
                    className="h-8 px-3 rounded-xl bg-sky/15 hover:bg-sky/25 text-sky text-[11px] font-bold transition-colors"
                  >
                    {direction === 'OWED_TO_ME' ? 'ثبت دریافت' : 'ثبت تسویه'}
                  </button>
                ) : (
                  <span className="text-[11px] text-ok font-bold">تسویه کامل ✓</span>
                )}
              </div>
            </div>
          );
        })}

        {debts.length === 0 && (
          <div className="py-20 text-center text-muted text-xs">
            موردی در این دسته ثبت نشده است.
          </div>
        )}
      </div>

      {/* Add / Edit Debt Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="debt-form-title"
            className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 id="debt-form-title" className="text-sm font-bold text-white">
                {editingDebt
                  ? 'ویرایش بدهی / طلب'
                  : direction === 'OWED_TO_ME'
                    ? 'ثبت طلب جدید'
                    : 'ثبت بدهی جدید'}
              </h2>
              <button
                type="button"
                aria-label="بستن"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingDebt(null);
                }}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted"
              >
                <X size={16} />
              </button>
            </div>

            <DebtForm
              editingDebt={editingDebt}
              initialDirection={direction}
              paidAmountRial={editingDebt?.paid ?? 0}
              onSaved={() => {
                setIsFormOpen(false);
                setEditingDebt(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Delete Debt Confirmation Modal */}
      {deleteTargetDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-debt-title"
            className="w-full max-w-sm rounded-[24px] bg-sheet border border-line p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 text-bad">
              <div className="w-9 h-9 rounded-xl bg-bad/15 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <h2 id="delete-debt-title" className="text-sm font-bold text-white">
                حذف {deleteTargetDebt.direction === 'OWED_TO_ME' ? 'طلب' : 'بدهی'} «{deleteTargetDebt.person}»
              </h2>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              این {deleteTargetDebt.direction === 'OWED_TO_ME' ? 'طلب' : 'بدهی'} و سابقه پرداخت‌های ثبت‌شده برای آن حذف می‌شود؛ تراکنش‌های ثبت‌شده در حساب‌ها سر جایشان می‌مانند.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleDeleteDebt(deleteTargetDebt)}
                className="flex-1 h-10 rounded-xl bg-bad hover:bg-bad/90 text-white text-xs font-bold transition-colors active:scale-95 shadow-sm"
              >
                حذف قطعی
              </button>
              <button
                type="button"
                onClick={() => setDeleteTargetDebt(null)}
                className="flex-1 h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-white text-xs font-semibold transition-colors active:scale-95"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay / Settle Modal */}
      {payTargetDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">
                {payTargetDebt.direction === 'OWED_TO_ME' ? 'دریافت طلب از' : 'پرداخت بدهی به'} {payTargetDebt.person}
              </h2>
              <button onClick={() => setPayTargetDebt(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label htmlFor="debt-payment-amount" className="text-[11px] text-muted block mb-1">مبلغ پرداختی (تومان)</label>
              <AmountInput
                id="debt-payment-amount"
                value={payAmountToman}
                onChange={setPayAmountToman}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">حساب مرتبط</label>
              <Select
                value={selectedAccId ?? accounts[0]?.id}
                onChange={(val) => setSelectedAccId(Number(val))}
                options={accounts
                  .filter((a): a is Account & { id: number } => a.id != null)
                  .map(a => ({
                    value: a.id,
                    label: a.name,
                  }))}
                placeholder="انتخاب حساب"
              />
            </div>

            <button
              onClick={handleAddPayment}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ثبت پرداخت
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
