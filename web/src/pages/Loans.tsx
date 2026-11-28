import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Building2, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { LoanForm, LoanAccountSelect } from '../components/LoanForm';
import { db, type Loan, type Installment } from '../core/db';
import {
  deleteLoan,
  deleteTxnWithInstallmentLink,
  payLoanInstallment,
  unmarkHistoricalInstallment,
} from '../core/db/helpers';
import { Money } from '../core/money';
import { Jalali } from '../core/jalali';
import { HeaderBar } from '../components/UI';

interface LoanWithStats extends Loan {
  paid: Installment[];
  unpaid: Installment[];
  nextInstallment?: Installment;
  overdueCount: number;
  remainingAmount: number;
}

export function Loans({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan>();
  const [loanToDelete, setLoanToDelete] = useState<LoanWithStats | null>(null);

  const [paying, setPaying] = useState<Installment>();
  const [undoing, setUndoing] = useState<Installment>();
  const [paymentAccountId, setPaymentAccountId] = useState<number>();
  const [saving, setSaving] = useState(false);

  const nowJ = Jalali.of(Date.now());
  const [curMonthStart, curMonthEnd] = Jalali.monthRange(nowJ.y, nowJ.m);

  const { loans, accounts } = useLiveQuery(async () => {
    const [allLoans, allInsts, allAccs] = await Promise.all([
      db.loans.toArray(),
      db.installments.toArray(),
      db.accounts.filter(a => !a.archived).toArray(),
    ]);
    const paymentIds = allInsts.flatMap(i => (i.paidTxnId == null ? [] : [i.paidTxnId]));
    const payments = await db.txns.bulkGet(paymentIds);
    const existingPayments = new Set(payments.flatMap(txn => (txn?.id == null ? [] : [txn.id])));

    const todayStart = Jalali.dayStart(Date.now());

    const withStats: LoanWithStats[] = allLoans.map(l => {
      const insts = allInsts.filter(i => i.loanId === l.id);
      const isPaid = (i: Installment) =>
        (i.paidTxnId != null && existingPayments.has(i.paidTxnId)) || i.paidAt != null;

      const paid = insts.filter(isPaid).sort((a, b) => a.n - b.n);
      const unpaid = insts.filter(i => !isPaid(i)).sort((a, b) => a.dueAt - b.dueAt);
      const overdueCount = unpaid.filter(i => i.dueAt < todayStart).length;
      const remainingAmount = unpaid.reduce((sum, i) => sum + i.amount, 0);

      return {
        ...l,
        paid,
        unpaid,
        nextInstallment: unpaid[0],
        overdueCount,
        remainingAmount,
      };
    });
    return { loans: withStats, accounts: allAccs };
  }, [], { loans: [], accounts: [] });

  const openAddLoan = () => {
    setEditingLoan(undefined);
    setIsModalOpen(true);
  };

  const openEditLoan = (loan: Loan) => {
    setEditingLoan(loan);
    setIsModalOpen(true);
  };

  const openPayment = (loan: LoanWithStats) => {
    const available = (id?: number) => id != null && accounts.some(account => account.id === id);
    setPaymentAccountId([loan.accountId, loan.receiveAccountId].find(available));
    setPaying(loan.nextInstallment);
  };

  const submitPayment = async () => {
    setSaving(true);
    try {
      if (paying?.id != null && paymentAccountId != null) {
        await payLoanInstallment(paying.id, paymentAccountId);
        setPaying(undefined);
      } else if (undoing?.id != null) {
        if (undoing.paidTxnId != null) {
          await deleteTxnWithInstallmentLink(undoing.paidTxnId);
        } else if (undoing.paidAt != null) {
          await unmarkHistoricalInstallment(undoing.id);
        }
        setUndoing(undefined);
      }
    } catch {
      alert('تغییر وضعیت پرداخت انجام نشد. حساب را بررسی کنید و دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLoan = async () => {
    if (!loanToDelete?.id) return;
    setSaving(true);
    try {
      await deleteLoan(loanToDelete.id);
      setLoanToDelete(null);
      if (editingLoan?.id === loanToDelete.id) {
        setIsModalOpen(false);
        setEditingLoan(undefined);
      }
    } catch {
      alert('حذف وام انجام نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  const payment = paying ?? undoing;

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="وام‌ها و اقساط"
        onBack={onBack}
        action={
          <button
            onClick={openAddLoan}
            aria-label="افزودن وام"
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
          >
            <Plus size={20} strokeWidth={2.8} />
          </button>
        }
      />

      <div className="space-y-4 mt-4">
        {loans.map(loan => {
          const pct = loan.count > 0 ? Math.round((loan.paid.length / loan.count) * 100) : 0;
          const currentMonthPaid = loan.paid.find(i => i.dueAt >= curMonthStart && i.dueAt < curMonthEnd);
          const isNextThisMonth = Boolean(
            loan.nextInstallment &&
            loan.nextInstallment.dueAt >= curMonthStart &&
            loan.nextInstallment.dueAt < curMonthEnd
          );
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
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white">
                    {loan.paid.length} از {loan.count} قسط
                  </span>
                  <button
                    onClick={() => openEditLoan(loan)}
                    aria-label="ویرایش وام"
                    className="w-8 h-8 rounded-xl bg-white/5 border border-line flex items-center justify-center text-muted hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setLoanToDelete(loan)}
                    aria-label="حذف وام"
                    className="w-8 h-8 rounded-xl bg-bad/10 border border-bad/25 flex items-center justify-center text-bad hover:bg-bad/20"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-muted block">مانده کل:</span>
                  <span className="font-bold text-white">
                    {hidden ? '•••' : `${Money.toman(loan.remainingAmount)} تومان`}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">وضعیت معوق:</span>
                  <span className={`font-bold ${loan.overdueCount > 0 ? 'text-bad' : 'text-ok'}`}>
                    {loan.overdueCount > 0 ? `${Money.fa(String(loan.overdueCount))} قسط معوق` : 'به‌موقع'}
                  </span>
                </div>
              </div>

              {/* Current month paid quick undo */}
              {currentMonthPaid && (
                <div className="p-2.5 rounded-2xl bg-ok/10 border border-ok/25 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-white font-semibold">
                    قسط این ماه (قسط {Money.fa(String(currentMonthPaid.n))}) پرداخت‌شده ثبت شده
                  </div>
                  <button
                    type="button"
                    onClick={() => setUndoing(currentMonthPaid)}
                    className="h-7 px-2.5 rounded-lg bg-warn/20 border border-warn/30 text-warn text-[10.5px] font-bold shrink-0 active:scale-95"
                  >
                    هنوز نداده‌ام
                  </button>
                </div>
              )}

              {/* Next installment info */}
              {loan.nextInstallment ? (
                <div className="pt-2 border-t border-line flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted block">
                      {isNextThisMonth ? 'قسط این ماه' : 'سررسید قسط بعدی'} ({Money.fa(String(loan.nextInstallment.n))}) · {Jalali.shortDateTime(loan.nextInstallment.dueAt).split('·')[0]}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {hidden ? '•••' : `${Money.toman(loan.nextInstallment.amount)} تومان`}
                    </span>
                  </div>
                  <button
                    onClick={() => openPayment(loan)}
                    className="h-9 px-3 rounded-xl bg-lime text-onLime font-bold text-xs flex items-center gap-1 active:scale-95"
                  >
                    <CheckCircle2 size={14} />
                    ثبت پرداخت
                  </button>
                </div>
              ) : (
                <div className="pt-2 border-t border-line text-center text-ok text-xs font-bold">
                  تمام اقساط این وام تسویه شده است! 🎉
                </div>
              )}

              {/* Paid installments dropdown */}
              {loan.paid.length > 0 && (
                <details className="text-xs text-muted pt-1">
                  <summary className="cursor-pointer py-1 font-semibold text-sky">
                    اقساط پرداخت‌شده ({loan.paid.length})
                  </summary>
                  <div className="divide-y divide-line/40 max-h-40 overflow-y-auto no-scrollbar pt-1">
                    {loan.paid.map(i => (
                      <div key={i.id} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="text-white font-medium block">
                            قسط {Money.fa(String(i.n))} · {Money.toman(i.amount)} تومان
                          </span>
                          <span className="text-[10px] text-muted">
                            {i.paidTxnId != null ? 'پرداخت شده با تراکنش' : 'ثبت شده از سابقه قبلی'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUndoing(i)}
                          className="text-[11px] text-bad bg-bad/10 px-2 py-1 rounded-lg"
                        >
                          لغو پرداخت
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
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

      {/* Add / Edit Loan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="loan-form-title"
            className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 id="loan-form-title" className="text-sm font-bold text-white">
                {editingLoan ? `ویرایش وام · ${editingLoan.title}` : 'ثبت وام'}
              </h2>
              <button
                disabled={saving}
                aria-label="بستن"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted"
              >
                <X size={16} />
              </button>
            </div>

            <LoanForm
              editingLoan={editingLoan}
              accounts={accounts}
              onSavingChange={setSaving}
              onDelete={
                editingLoan
                  ? () => {
                      const target = loans.find(l => l.id === editingLoan.id);
                      setIsModalOpen(false);
                      if (target) setLoanToDelete(target);
                    }
                  : undefined
              }
              onSaved={() => {
                setIsModalOpen(false);
                setEditingLoan(undefined);
              }}
            />
          </div>
        </div>
      )}

      {/* Payment / Undo Modal */}
      {payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="loan-payment-title"
            className="w-full max-w-md rounded-[28px] border border-line bg-sheet p-5 space-y-4"
          >
            <h2 id="loan-payment-title" className="text-sm font-bold text-white">
              {paying ? 'پرداخت' : 'لغو پرداخت'} قسط {Money.fa(String(payment.n))}
            </h2>
            <p className="text-lg font-bold text-white">{Money.toman(payment.amount)} تومان</p>

            {paying ? (
              <LoanAccountSelect
                accounts={accounts}
                label="برداشت از حساب"
                emptyLabel="انتخاب حساب"
                value={paymentAccountId}
                onChange={setPaymentAccountId}
              />
            ) : (
              <p className="text-xs text-muted">
                {payment.paidTxnId != null
                  ? 'تراکنش حذف می‌شود و مبلغ به حسابی که از آن پرداخت کردی برمی‌گردد.'
                  : 'این قسط به عنوان پرداخت‌نشده علامت‌گذاری می‌شود و تغییری در حساب‌ها ایجاد نمی‌شود.'}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={saving || (!!paying && !accounts.some(a => a.id === paymentAccountId))}
                onClick={submitPayment}
                className="rounded-xl bg-lime px-4 py-3 text-xs font-bold text-onLime disabled:opacity-50"
              >
                {paying ? 'ثبت پرداخت' : 'لغو پرداخت'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPaying(undefined);
                  setUndoing(undefined);
                }}
                className="rounded-xl bg-surface px-4 py-3 text-xs text-white"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Loan Confirmation Modal */}
      {loanToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-loan-title"
            className="w-full max-w-sm rounded-[24px] bg-sheet border border-line p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 text-bad">
              <div className="w-9 h-9 rounded-xl bg-bad/15 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <h2 id="delete-loan-title" className="text-sm font-bold text-white">
                حذف وام «{loanToDelete.title}»
              </h2>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              با حذف این وام، جدول اقساط و مبالغ ذخیره‌شده برای آن در کارت‌های پس‌انداز پاک می‌شوند. تراکنش‌های ثبت‌شده قبلی در تاریخچه باقی می‌مانند.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={handleDeleteLoan}
                className="flex-1 h-10 rounded-xl bg-bad hover:bg-bad/90 text-white text-xs font-bold transition-colors active:scale-95 shadow-sm disabled:opacity-50"
              >
                حذف قطعی
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setLoanToDelete(null)}
                className="flex-1 h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-white text-xs font-semibold transition-colors active:scale-95"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
