import React, { useState, useEffect } from 'react';
import { AmountInput } from '../components/AmountInput';
import { Select } from '../components/Select';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Building2, CheckCircle2, Pencil, Calendar, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { db, type Loan, type Installment, type Account } from '../core/db';
import {
  createLoanWithSchedule,
  updateLoanWithSchedule,
  deleteTxnWithInstallmentLink,
  payLoanInstallment,
  unmarkHistoricalInstallment,
  generateSchedule,
  type ScheduleItemInput,
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

interface FormScheduleItem {
  n: number;
  dueAt: number;
  amount: number; // rial
  isPaid: boolean;
  paidAt?: number;
  hasTxn?: boolean;
}

function LoanAccountSelect({
  accounts,
  label,
  emptyLabel,
  value,
  onChange,
}: {
  accounts: Account[];
  label: string;
  emptyLabel: string;
  value?: number;
  onChange: (id: number | undefined) => void;
}) {
  const options = [
    { value: 0, label: emptyLabel },
    ...accounts
      .filter((a): a is Account & { id: number } => a.id != null)
      .map(a => ({
        value: a.id,
        label: a.name,
      })),
  ];

  return (
    <div className="block text-[11px] text-muted">
      <span className="block mb-1">{label}</span>
      <Select
        value={accounts.some(a => a.id === value) ? value : 0}
        onChange={val => onChange(val === 0 ? undefined : Number(val))}
        options={options}
        placeholder={emptyLabel}
      />
    </div>
  );
}

export function Loans({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan>();
  const [loanMode, setLoanMode] = useState<'NEW' | 'ACTIVE'>('NEW');

  const [paying, setPaying] = useState<Installment>();
  const [undoing, setUndoing] = useState<Installment>();
  const [paymentAccountId, setPaymentAccountId] = useState<number>();
  const [saving, setSaving] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [lender, setLender] = useState('');
  const [principalToman, setPrincipalToman] = useState('');
  const [installmentToman, setInstallmentToman] = useState('');
  const [count, setCount] = useState('12');
  const [paidCountInput, setPaidCountInput] = useState('0');
  const [receiveAccId, setReceiveAccId] = useState<number | undefined>();
  const [defaultPayAccId, setDefaultPayAccId] = useState<number>();
  const [recordDeposit, setRecordDeposit] = useState(false);

  // Jalali date states for form
  const nowJ = Jalali.of(Date.now());
  const [startYear, setStartYear] = useState(nowJ.y);
  const [startMonth, setStartMonth] = useState(nowJ.m === 12 ? 1 : nowJ.m + 1);
  const [startDay, setStartDay] = useState(Math.min(nowJ.d, 28));
  const [dateTarget, setDateTarget] = useState<'FIRST' | 'NEXT'>('FIRST');

  // Schedule items for form preview and editing
  const [scheduleItems, setScheduleItems] = useState<FormScheduleItem[]>([]);
  const [showScheduleList, setShowScheduleList] = useState(false);

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

  // Open Add/Edit Modal
  const openAddLoan = () => {
    setEditingLoan(undefined);
    setLoanMode('NEW');
    setTitle('');
    setLender('');
    setPrincipalToman('');
    setInstallmentToman('');
    setCount('12');
    setPaidCountInput('0');
    setReceiveAccId(undefined);
    setDefaultPayAccId(undefined);
    setRecordDeposit(false);
    setDateTarget('FIRST');

    const cur = Jalali.of(Date.now());
    const nextM = cur.m === 12 ? 1 : cur.m + 1;
    const nextY = cur.m === 12 ? cur.y + 1 : cur.y;
    setStartYear(nextY);
    setStartMonth(nextM);
    setStartDay(Math.min(cur.d, 28));

    setShowScheduleList(false);
    setIsModalOpen(true);
  };

  const openEditLoan = async (loan: Loan) => {
    setEditingLoan(loan);
    setTitle(loan.title);
    setLender(loan.lender || '');
    setPrincipalToman(Money.tomanInput(loan.principal));
    setInstallmentToman(Money.tomanInput(loan.installment));
    setCount(String(loan.count));
    setReceiveAccId(loan.receiveAccountId);
    setDefaultPayAccId(loan.accountId);
    setRecordDeposit(false);
    setDateTarget('FIRST');

    const j = Jalali.of(loan.firstDueAt);
    setStartYear(j.y);
    setStartMonth(j.m);
    setStartDay(j.d);

    // Fetch existing installments to populate schedule
    const existingInsts = await db.installments.where('loanId').equals(loan.id!).toArray();
    existingInsts.sort((a, b) => a.n - b.n);

    const paymentIds = existingInsts.flatMap(i => (i.paidTxnId == null ? [] : [i.paidTxnId]));
    const payments = await db.txns.bulkGet(paymentIds);
    const existingPayments = new Set(payments.flatMap(txn => (txn?.id == null ? [] : [txn.id])));

    const items: FormScheduleItem[] = existingInsts.map(i => {
      const hasTxn = i.paidTxnId != null && existingPayments.has(i.paidTxnId);
      const isPaid = hasTxn || i.paidAt != null;
      return {
        n: i.n,
        dueAt: i.dueAt,
        amount: i.amount,
        isPaid,
        paidAt: i.paidAt,
        hasTxn,
      };
    });

    setScheduleItems(items);
    setPaidCountInput(String(items.filter(i => i.isPaid).length));
    setShowScheduleList(false);
    setIsModalOpen(true);
  };

  // Re-generate schedule items whenever form parameters change (for new loans or when altering count/amount/date)
  const calculateFirstDueMillis = (): number => {
    let y = startYear;
    let m = startMonth;
    let d = startDay;

    if (dateTarget === 'NEXT') {
      const pCount = Math.max(0, parseInt(Money.ascii(paidCountInput), 10) || 0);
      // Next installment is pCount + 1, so first installment was pCount months ago
      let totalMonths = y * 12 + (m - 1) - pCount;
      y = Math.floor(totalMonths / 12);
      m = (totalMonths % 12) + 1;
    }
    const maxD = Jalali.monthDays(y, m);
    return Jalali.millis(y, m, Math.min(d, maxD));
  };

  // Rebuild schedule whenever inputs change
  useEffect(() => {
    if (!isModalOpen) return;

    const installmentRial = Money.parseToman(installmentToman) || 0;
    const n = parseInt(Money.ascii(count), 10) || 0;
    if (n < 1 || n > 600) return;

    const firstDueAt = calculateFirstDueMillis();
    const defaultSchedule = generateSchedule(firstDueAt, n, installmentRial);

    if (!editingLoan) {
      // Adding new loan
      const paidN = loanMode === 'ACTIVE' ? Math.min(n, Math.max(0, parseInt(Money.ascii(paidCountInput), 10) || 0)) : 0;
      setScheduleItems(
        defaultSchedule.map(item => {
          const isPaid = item.n <= paidN;
          return {
            n: item.n,
            dueAt: item.dueAt,
            amount: item.amount,
            isPaid,
            paidAt: isPaid ? item.dueAt : undefined,
          };
        })
      );
    } else {
      // Editing existing loan: keep already paid installments intact, update unpaid ones
      setScheduleItems(prev => {
        const prevPaidMap = new Map<number, FormScheduleItem>();
        prev.filter(p => p.isPaid).forEach(p => prevPaidMap.set(p.n, p));

        return defaultSchedule.map(item => {
          const existingPaid = prevPaidMap.get(item.n);
          if (existingPaid) {
            return existingPaid;
          }
          return {
            n: item.n,
            dueAt: item.dueAt,
            amount: item.amount,
            isPaid: false,
          };
        });
      });
    }
  }, [
    isModalOpen,
    editingLoan,
    loanMode,
    count,
    installmentToman,
    startYear,
    startMonth,
    startDay,
    dateTarget,
    paidCountInput,
  ]);

  // Handle quick paid count change
  const handleQuickPaidCountChange = (val: string) => {
    const clean = Money.ascii(val);
    if (!/^\d*$/.test(clean)) return;
    setPaidCountInput(clean);
    const pCount = parseInt(clean, 10) || 0;

    setScheduleItems(prev =>
      prev.map(item => {
        if (item.hasTxn) return item; // protected
        const isPaid = item.n <= pCount;
        return {
          ...item,
          isPaid,
          paidAt: isPaid ? (item.paidAt || item.dueAt) : undefined,
        };
      })
    );
  };

  // Toggle individual installment paid status
  const toggleInstallmentPaid = (n: number) => {
    setScheduleItems(prev =>
      prev.map(item => {
        if (item.n !== n) return item;
        if (item.hasTxn) {
          alert('این قسط با تراکنش بانکی ثبت شده است و برای لغو آن باید از بخش اقساط پرداخت‌شده اقدام کنید.');
          return item;
        }
        const nextPaid = !item.isPaid;
        return {
          ...item,
          isPaid: nextPaid,
          paidAt: nextPaid ? (item.paidAt || item.dueAt) : undefined,
        };
      })
    );
  };

  // Update specific installment amount in schedule
  const updateInstallmentAmount = (n: number, toman: string) => {
    const rial = Money.parseToman(toman) || 0;
    setScheduleItems(prev =>
      prev.map(item => (item.n === n ? { ...item, amount: rial } : item))
    );
  };

  // Summary calculations for preview
  const todayStart = Jalali.dayStart(Date.now());
  const totalRepayment = scheduleItems.reduce((sum, i) => sum + i.amount, 0);
  const paidItems = scheduleItems.filter(i => i.isPaid);
  const unpaidItems = scheduleItems.filter(i => !i.isPaid);
  const paidCount = paidItems.length;
  const paidAmount = paidItems.reduce((sum, i) => sum + i.amount, 0);
  const remainingCount = unpaidItems.length;
  const remainingAmount = unpaidItems.reduce((sum, i) => sum + i.amount, 0);
  const overdueCount = unpaidItems.filter(i => i.dueAt < todayStart).length;
  const sortedUnpaid = [...unpaidItems].sort((a, b) => a.dueAt - b.dueAt);
  const nextDue = sortedUnpaid[0];

  const handleSaveLoan = async () => {
    const principal = Money.parseToman(principalToman) || 0;
    const installment = Money.parseToman(installmentToman) || 0;
    const installmentCount = parseInt(Money.ascii(count), 10) || 0;

    if (!title.trim()) {
      alert('عنوان وام را وارد کنید.');
      return;
    }
    if (installmentCount < 1 || installmentCount > 600) {
      alert('تعداد اقساط باید بین ۱ تا ۶۰۰ باشد.');
      return;
    }
    if (installment <= 0) {
      alert('مبلغ هر قسط را مشخص کنید.');
      return;
    }

    setSaving(true);
    try {
      const firstDueAt = calculateFirstDueMillis();
      const customInstallments: ScheduleItemInput[] = scheduleItems.map(item => ({
        n: item.n,
        dueAt: item.dueAt,
        amount: item.amount,
        paidAt: item.isPaid ? (item.paidAt || item.dueAt) : undefined,
      }));

      if (!editingLoan) {
        // Create new loan
        await createLoanWithSchedule(
          {
            title: title.trim(),
            lender: lender.trim() || undefined,
            principal,
            installment,
            count: installmentCount,
            firstDueAt,
            receiveAccountId: receiveAccId,
            accountId: defaultPayAccId,
          },
          // Only deposit if user explicitly selected fresh loan AND checked the box
          loanMode === 'NEW' && recordDeposit ? receiveAccId : undefined,
          customInstallments
        );
      } else {
        // Update existing loan
        await updateLoanWithSchedule(
          editingLoan.id!,
          {
            title: title.trim(),
            lender: lender.trim() || undefined,
            principal,
            installment,
            count: installmentCount,
            firstDueAt,
            receiveAccountId: receiveAccId,
            accountId: defaultPayAccId,
          },
          customInstallments
        );
      }

      setIsModalOpen(false);
      setEditingLoan(undefined);
    } catch {
      alert('ذخیرهٔ وام انجام نشد. لطفاً اطلاعات را بررسی و دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
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
                <div className="flex items-center gap-2">
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

              {/* Next installment info */}
              {loan.nextInstallment ? (
                <div className="pt-2 border-t border-line flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted block">
                      سررسید قسط بعدی ({Money.fa(String(loan.nextInstallment.n))}) · {Jalali.shortDateTime(loan.nextInstallment.dueAt).split('·')[0]}
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

            {/* Mode selector (Fresh loan vs Already Active loan) - only for new loans */}
            {!editingLoan && (
              <div className="grid grid-cols-2 p-1 bg-surface rounded-2xl border border-line">
                <button
                  type="button"
                  onClick={() => {
                    setLoanMode('NEW');
                    setPaidCountInput('0');
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all ${
                    loanMode === 'NEW' ? 'bg-lime text-onLime shadow-sm' : 'text-muted'
                  }`}
                >
                  وام تازه
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoanMode('ACTIVE');
                    setRecordDeposit(false);
                    if (paidCountInput === '0') setPaidCountInput('1');
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all ${
                    loanMode === 'ACTIVE' ? 'bg-lime text-onLime shadow-sm' : 'text-muted'
                  }`}
                >
                  در حال بازپرداخت (قبلی)
                </button>
              </div>
            )}

            {/* Basic inputs */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted block mb-1">عنوان وام</label>
                <input
                  type="text"
                  placeholder="مثلاً: وام ازدواج، رسالت، مسکن..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
                />
              </div>

              <div>
                <label className="text-[11px] text-muted block mb-1">نام بانک یا وام‌دهنده</label>
                <input
                  type="text"
                  placeholder="مثلاً: بانک ملت"
                  value={lender}
                  onChange={e => setLender(e.target.value)}
                  className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="loan-principal" className="text-[11px] text-muted block mb-1">
                    اصل وام (تومان) {loanMode === 'ACTIVE' && <span className="text-[10px] text-muted/70">(اختیاری)</span>}
                  </label>
                  <AmountInput
                    id="loan-principal"
                    placeholder="مثلاً: 50,000,000"
                    value={principalToman}
                    onChange={setPrincipalToman}
                    className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
                  />
                </div>
                <div>
                  <label htmlFor="loan-installment" className="text-[11px] text-muted block mb-1">
                    مبلغ هر قسط (تومان)
                  </label>
                  <AmountInput
                    id="loan-installment"
                    placeholder="مثلاً: 2,500,000"
                    value={installmentToman}
                    onChange={setInstallmentToman}
                    className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="loan-count" className="text-[11px] text-muted block mb-1">
                    تعداد کل اقساط (ماه)
                  </label>
                  <input
                    id="loan-count"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={count}
                    onChange={e => {
                      const digits = Money.ascii(e.target.value);
                      if (/^\d*$/.test(digits)) setCount(digits);
                    }}
                    className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
                  />
                </div>

                {(!editingLoan && loanMode === 'ACTIVE') && (
                  <div>
                    <label htmlFor="loan-paid-count" className="text-[11px] text-muted block mb-1">
                      اقساط پرداخت‌شده قبلی
                    </label>
                    <input
                      id="loan-paid-count"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="مثلاً: 8"
                      value={paidCountInput}
                      onChange={e => handleQuickPaidCountChange(e.target.value)}
                      className="w-full h-11 rounded-xl bg-surface border border-sky/40 text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
                    />
                  </div>
                )}
              </div>

              {/* Date setup */}
              <div className="p-3 rounded-2xl bg-surface border border-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted font-bold flex items-center gap-1.5">
                    <Calendar size={13} className="text-sky" />
                    تاریخ مبنای اقساط
                  </span>
                  {loanMode === 'ACTIVE' && (
                    <div className="flex gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setDateTarget('FIRST')}
                        className={`px-2 py-0.5 rounded-lg ${
                          dateTarget === 'FIRST' ? 'bg-sky text-black font-bold' : 'text-muted'
                        }`}
                      >
                        سررسید قسط ۱
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateTarget('NEXT')}
                        className={`px-2 py-0.5 rounded-lg ${
                          dateTarget === 'NEXT' ? 'bg-sky text-black font-bold' : 'text-muted'
                        }`}
                      >
                        سررسید قسط بعدی
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-muted block mb-1">روز</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={startDay}
                      onChange={e => setStartDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                      className="w-full h-9 rounded-lg bg-sheet border border-line text-white text-center text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-1">ماه</label>
                    <Select
                      size="sm"
                      value={startMonth}
                      onChange={val => setStartMonth(Number(val))}
                      options={Jalali.MONTHS.map((m, idx) => ({ value: idx + 1, label: m }))}
                      align="center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-1">سال</label>
                    <input
                      type="number"
                      value={startYear}
                      onChange={e => setStartYear(parseInt(e.target.value, 10) || nowJ.y)}
                      className="w-full h-9 rounded-lg bg-sheet border border-line text-white text-center text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Accounts */}
              <LoanAccountSelect
                accounts={accounts}
                label="حساب دریافت وام"
                emptyLabel="تعیین نشده"
                value={receiveAccId}
                onChange={id => {
                  setReceiveAccId(id);
                  if (!id) setRecordDeposit(false);
                }}
              />
              <LoanAccountSelect
                accounts={accounts}
                label="حساب پیش‌فرض پرداخت اقساط"
                emptyLabel="حساب دریافت وام در صورت دسترسی"
                value={defaultPayAccId}
                onChange={setDefaultPayAccId}
              />

              {/* Option to record deposit ONLY for fresh new loans */}
              {!editingLoan && loanMode === 'NEW' && receiveAccId != null && (
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={recordDeposit}
                    onChange={e => setRecordDeposit(e.target.checked)}
                    className="rounded border-line"
                  />
                  واریز مبلغ اصل وام به این حساب ثبت شود (به موجودی اضافه گردد)
                </label>
              )}

              {/* Live Preview Summary Card */}
              {scheduleItems.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-line space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-white border-b border-line/40 pb-1.5">
                    <span>پیش‌نمایش وضعیت بازپرداخت</span>
                    <span className="text-[11px] text-sky">
                      {remainingCount} قسط مانده از {scheduleItems.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted block">مجموع بازپرداخت:</span>
                      <span className="font-bold text-white">{Money.toman(totalRepayment)} تومان</span>
                    </div>
                    <div>
                      <span className="text-muted block">مانده بازپرداخت:</span>
                      <span className="font-bold text-sky">{Money.toman(remainingAmount)} تومان</span>
                    </div>
                    <div>
                      <span className="text-muted block">پرداخت‌شده ({paidCount} قسط):</span>
                      <span className="font-bold text-ok">{Money.toman(paidAmount)} تومان</span>
                    </div>
                    <div>
                      <span className="text-muted block">اقساط معوق:</span>
                      <span className={`font-bold ${overdueCount > 0 ? 'text-bad' : 'text-muted'}`}>
                        {overdueCount > 0 ? `${Money.fa(String(overdueCount))} قسط معوق` : 'ندارد'}
                      </span>
                    </div>
                  </div>

                  {nextDue && (
                    <div className="pt-1.5 border-t border-line/40 text-[11px] flex justify-between items-center">
                      <span className="text-muted">سررسید قسط بعدی ({Money.fa(String(nextDue.n))}):</span>
                      <span className="font-bold text-white">
                        {Jalali.shortDateTime(nextDue.dueAt).split('·')[0]}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Collapsible schedule items table to inspect or customize individual installments */}
              {scheduleItems.length > 0 && (
                <div className="border border-line rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowScheduleList(prev => !prev)}
                    className="w-full px-3 py-2.5 bg-surface flex items-center justify-between text-xs text-muted hover:text-white"
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <Clock size={14} className="text-sky" />
                      مشاهده و تنظیم دستی جدول اقساط ({scheduleItems.length})
                    </span>
                    {showScheduleList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {showScheduleList && (
                    <div className="p-2 space-y-1.5 max-h-56 overflow-y-auto no-scrollbar bg-sheet">
                      <p className="text-[10px] text-muted pb-1">
                        می‌توانی وضعیت هر قسط را دستی تغییر دهی یا مبلغ را اصلاح کنی:
                      </p>
                      {scheduleItems.map(item => {
                        const isOverdue = !item.isPaid && item.dueAt < todayStart;
                        return (
                          <div
                            key={item.n}
                            className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                              item.isPaid
                                ? 'bg-ok/10 border-ok/30'
                                : isOverdue
                                ? 'bg-bad/10 border-bad/30'
                                : 'bg-surface border-line'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleInstallmentPaid(item.n)}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  item.isPaid
                                    ? 'bg-ok text-black'
                                    : isOverdue
                                    ? 'bg-bad/20 text-bad border border-bad/40'
                                    : 'bg-white/10 text-muted border border-line'
                                }`}
                              >
                                {item.isPaid ? '✓' : item.n}
                              </button>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1">
                                  <span>قسط {Money.fa(String(item.n))}</span>
                                  {item.isPaid ? (
                                    <span className="text-[9px] text-ok px-1 py-0.2 rounded bg-ok/20">
                                      پرداخت‌شده
                                    </span>
                                  ) : isOverdue ? (
                                    <span className="text-[9px] text-bad px-1 py-0.2 rounded bg-bad/20">
                                      معوق
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] text-muted">
                                  {Jalali.shortDateTime(item.dueAt).split('·')[0]}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <AmountInput
                                value={Money.tomanInput(item.amount)}
                                onChange={t => updateInstallmentAmount(item.n, t)}
                                disabled={item.hasTxn}
                                className="w-24 h-7 text-[11px] rounded-lg bg-surface border border-line text-white text-center px-1"
                              />
                              <span className="text-[10px] text-muted">تومان</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              disabled={saving}
              onClick={handleSaveLoan}
              className="w-full h-12 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab active:scale-95 transition-transform disabled:opacity-50"
            >
              {editingLoan ? 'ذخیره تغییرات وام' : 'ثبت وام و برنامه اقساط'}
            </button>
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
    </div>
  );
}
