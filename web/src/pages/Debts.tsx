import React, { useState, useEffect } from 'react';
import { AmountInput } from '../components/AmountInput';
import { Plus, X, HandCoins, Check, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { db, type Debt, type DebtPayment, type Account } from '../core/db';
import { Money } from '../core/money';
import { Jalali } from '../core/jalali';
import { HeaderBar } from '../components/UI';
import { Select } from '../components/Select';

interface DebtWithRemaining extends Debt {
  remaining: number;
}

export function Debts({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [direction, setDirection] = useState<'OWED_TO_ME' | 'I_OWE'>('OWED_TO_ME');
  const [debts, setDebts] = useState<DebtWithRemaining[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [payTargetDebt, setPayTargetDebt] = useState<DebtWithRemaining | null>(null);

  // Form states
  const [person, setPerson] = useState('');
  const [amountToman, setAmountToman] = useState('');
  const [note, setNote] = useState('');
  const [payAmountToman, setPayAmountToman] = useState('');
  const [selectedAccId, setSelectedAccId] = useState<number | undefined>();

  const loadDebts = async () => {
    const [allDebts, allPayments, allAccs] = await Promise.all([
      db.debts.where('direction').equals(direction).toArray(),
      db.debtPayments.toArray(),
      db.accounts.filter(a => !a.archived).toArray(),
    ]);
    setAccounts(allAccs);
    if (allAccs.length > 0 && !selectedAccId) setSelectedAccId(allAccs[0].id);

    const withRem: DebtWithRemaining[] = allDebts.map(d => {
      const pmts = allPayments.filter(p => p.debtId === d.id);
      const paid = pmts.reduce((acc, p) => acc + p.amount, 0);
      return {
        ...d,
        remaining: Math.max(0, d.amount - paid),
      };
    });
    setDebts(withRem);
  };

  useEffect(() => {
    loadDebts();
  }, [direction]);

  const handleSaveDebt = async () => {
    const amt = Money.parseToman(amountToman);
    if (!person.trim() || !amt) {
      alert('لطفاً نام شخص و مبلغ را وارد کنید');
      return;
    }

    await db.debts.add({
      direction,
      person: person.trim(),
      amount: amt,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    });

    setIsAddOpen(false);
    setPerson('');
    setAmountToman('');
    setNote('');
    loadDebts();
  };

  const handleAddPayment = async () => {
    if (!payTargetDebt) return;
    const rial = Money.parseToman(payAmountToman);
    if (!rial || rial > payTargetDebt.remaining) {
      alert('مبلغ پرداخت باید بیشتر از صفر و حداکثر برابر با مانده باشد.');
      return;
    }
    const incoming = payTargetDebt.direction === 'OWED_TO_ME';

    let txnId: number | undefined;
    if (selectedAccId) {
      txnId = await db.txns.add({
        type: 'DEBT',
        amount: incoming ? rial : -rial,
        accountId: selectedAccId,
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

    setPayTargetDebt(null);
    setPayAmountToman('');
    loadDebts();
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="بدهی و طلب"
        onBack={onBack}
        action={
          <button
            onClick={() => setIsAddOpen(true)}
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
          return (
            <div key={d.id} className="p-4 rounded-[22px] bg-surface border border-line flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  direction === 'OWED_TO_ME' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'
                }`}>
                  <HandCoins size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{d.person}</h3>
                  <div className="text-[11px] text-muted">
                    {d.note || Jalali.shortDateTime(d.createdAt)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="text-sm font-black text-white dir-ltr">
                  {hidden ? '•••' : Money.toman(d.remaining)}
                  <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
                </div>

                {!isDone ? (
                  <button
                    onClick={() => {
                      setPayTargetDebt(d);
                      setPayAmountToman(Money.tomanInput(d.remaining));
                    }}
                    className="text-[10.5px] text-sky font-bold hover:underline mt-1"
                  >
                    {direction === 'OWED_TO_ME' ? 'ثبت دریافت' : 'ثبت تسویه'}
                  </button>
                ) : (
                  <span className="text-[10px] text-ok font-bold mt-1">تسویه شده ✓</span>
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

      {/* Add Debt Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">
                {direction === 'OWED_TO_ME' ? 'ثبت طلب جدید' : 'ثبت بدهی جدید'}
              </h2>
              <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">طرف حساب (شخص / شرکت)</label>
              <input
                type="text"
                placeholder="مثلاً: علی رضایی"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label htmlFor="debt-amount" className="text-[11px] text-muted block mb-1">مبلغ (تومان)</label>
              <AmountInput
                id="debt-amount"
                placeholder="۰"
                value={amountToman}
                onChange={setAmountToman}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">یادداشت (اختیاری)</label>
              <input
                type="text"
                placeholder="دلیل قرض یا سررسید..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <button
              onClick={handleSaveDebt}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ثبت و ذخیره
            </button>
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
                value={selectedAccId || undefined}
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
