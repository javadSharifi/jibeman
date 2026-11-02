import React, { useState, useEffect } from 'react';
import { Plus, X, Building2, CheckCircle2, Calendar, AlertCircle } from 'lucide-react';
import { db, type Loan, type Installment, type Account } from '../core/db';
import { createLoanWithSchedule } from '../core/db/helpers';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { HeaderBar } from '../components/UI';

interface LoanWithStats extends Loan {
  paidCount: number;
  nextInstallment?: Installment;
}

export function Loans({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [loans, setLoans] = useState<LoanWithStats[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [lender, setLender] = useState('');
  const [principalToman, setPrincipalToman] = useState('');
  const [installmentToman, setInstallmentToman] = useState('');
  const [count, setCount] = useState('12');
  const [firstDueJalali, setFirstDueJalali] = useState('1405/09/01');
  const [receiveAccId, setReceiveAccId] = useState<number | undefined>();

  const loadLoans = async () => {
    const [allLoans, allInsts, allAccs] = await Promise.all([
      db.loans.toArray(),
      db.installments.toArray(),
      db.accounts.filter(a => !a.archived).toArray(),
    ]);
    setAccounts(allAccs);
    if (allAccs.length > 0 && !receiveAccId) setReceiveAccId(allAccs[0].id);

    const withStats: LoanWithStats[] = allLoans.map(l => {
      const insts = allInsts.filter(i => i.loanId === l.id);
      const paid = insts.filter(i => i.paidTxnId);
      const unpaid = insts.filter(i => !i.paidTxnId).sort((a, b) => a.dueAt - b.dueAt);
      return {
        ...l,
        paidCount: paid.length,
        nextInstallment: unpaid[0],
      };
    });
    setLoans(withStats);
  };

  useEffect(() => {
    loadLoans();
  }, []);

  const handleSaveLoan = async () => {
    const pT = parseInt(principalToman, 10);
    const iT = parseInt(installmentToman, 10);
    const c = parseInt(count, 10);
    if (!title || !pT || !iT || !c) {
      alert('لطفاً همه فیلدهای الزامی را پر کنید');
      return;
    }

    const now = Date.now();
    await createLoanWithSchedule(
      {
        title: title.trim(),
        lender: lender.trim() || undefined,
        principal: pT * 10,
        installment: iT * 10,
        count: c,
        firstDueAt: now + 30 * 24 * 3600 * 1000,
      },
      receiveAccId
    );

    setIsAddOpen(false);
    setTitle('');
    setLender('');
    setPrincipalToman('');
    setInstallmentToman('');
    loadLoans();
  };

  const handlePayInstallment = async (inst: Installment, loanTitle: string) => {
    if (accounts.length === 0) {
      alert('ابتدا باید یک حساب بانکی داشته باشید');
      return;
    }
    const accId = accounts[0].id!;
    const txnId = await db.txns.add({
      type: 'EXPENSE',
      amount: inst.amount,
      accountId: accId,
      title: `قسط ${inst.n} وام · ${loanTitle}`,
      occurredAt: Date.now(),
      source: 'MANUAL',
      createdAt: Date.now(),
    });
    await db.installments.update(inst.id!, { paidTxnId: txnId });
    loadLoans();
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="وام‌ها و اقساط"
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

      <div className="space-y-4 mt-4">
        {loans.map(loan => {
          const pct = Math.round((loan.paidCount / loan.count) * 100);
          return (
            <div key={loan.id} className="p-4 rounded-[24px] bg-surface border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-sky/15 text-sky flex items-center justify-center">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{loan.title}</h3>
                    <div className="text-[11px] text-muted">{loan.lender || 'بانک / صندوق'}</div>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white">
                  {loan.paidCount} از {loan.count} قسط
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted">
                  <span>پیشرفت بازپرداخت</span>
                  <span>{pct}٪</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-lime to-primary rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Next installment info */}
              {loan.nextInstallment ? (
                <div className="pt-2 border-t border-line flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted block">سررسید قسط بعدی ({loan.nextInstallment.n})</span>
                    <span className="text-xs font-bold text-white">
                      {hidden ? '•••' : `${Money.group(Math.floor(loan.nextInstallment.amount / 10))} تومان`}
                    </span>
                  </div>
                  <button
                    onClick={() => handlePayInstallment(loan.nextInstallment!, loan.title)}
                    className="h-9 px-3 rounded-xl bg-lime text-onLime font-bold text-xs flex items-center gap-1 active:scale-95"
                  >
                    <CheckCircle2 size={14} />
                    ثبت پرداخت قسط
                  </button>
                </div>
              ) : (
                <div className="pt-2 border-t border-line text-center text-ok text-xs font-bold">
                  تمام اقساط این وام پرداخت شده است! 🎉
                </div>
              )}
            </div>
          );
        })}

        {loans.length === 0 && (
          <div className="py-20 text-center text-muted text-xs">
            هیچ وامی ثبت نشده است. با دکمه + یک وام جدید اضافه کنید.
          </div>
        )}
      </div>

      {/* Add Loan Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-white">ثبت وام جدید</h2>
              <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">عنوان وام</label>
              <input
                type="text"
                placeholder="مثلاً: وام ازدواج، وام رسالت..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">نام بانک یا وام‌دهنده</label>
              <input
                type="text"
                placeholder="مثلاً: بانک ملت"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted block mb-1">مبلغ کل وام (تومان)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="مثلاً: 50,000,000"
                  value={principalToman}
                  onChange={(e) => setPrincipalToman(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">مبلغ هر قسط (تومان)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="مثلاً: 2,500,000"
                  value={installmentToman}
                  onChange={(e) => setInstallmentToman(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">تعداد کل اقساط (ماه)</label>
              <input
                type="number"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">واریز به حساب</label>
              <select
                value={receiveAccId || ''}
                onChange={(e) => setReceiveAccId(Number(e.target.value))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSaveLoan}
              className="w-full h-12 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab active:scale-95 transition-transform"
            >
              ثبت وام و ساخت جدول اقساط
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
