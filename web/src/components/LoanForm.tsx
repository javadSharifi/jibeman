import React, { useEffect, useState } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { db, type Account, type Loan } from '../core/db';
import {
  createLoanWithSchedule,
  updateLoanWithSchedule,
  generateSchedule,
  type ScheduleItemInput,
} from '../core/db/helpers';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { AmountInput } from './AmountInput';
import { Select } from './Select';

interface FormScheduleItem {
  n: number;
  dueAt: number;
  amount: number; // rial
  isPaid: boolean;
  paidAt?: number;
  hasTxn?: boolean;
}

export function LoanAccountSelect({
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

interface LoanFormProps {
  editingLoan?: Loan;
  accounts: Account[];
  initialPrincipalToman?: string;
  onSaved: () => void;
  onDelete?: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function LoanForm({
  editingLoan,
  accounts,
  initialPrincipalToman = '',
  onSaved,
  onDelete,
  onSavingChange,
}: LoanFormProps) {
  const nowJ = Jalali.of(Date.now());
  const nextMonthDefault = nowJ.m === 12 ? 1 : nowJ.m + 1;
  const nextYearDefault = nowJ.m === 12 ? nowJ.y + 1 : nowJ.y;

  const [loanMode, setLoanMode] = useState<'NEW' | 'ACTIVE'>('NEW');
  const [title, setTitle] = useState('');
  const [lender, setLender] = useState('');
  const [principalToman, setPrincipalToman] = useState(initialPrincipalToman);
  const [installmentToman, setInstallmentToman] = useState('');
  const [count, setCount] = useState('12');
  const [paidCountInput, setPaidCountInput] = useState('0');
  const [receiveAccId, setReceiveAccId] = useState<number | undefined>();
  const [defaultPayAccId, setDefaultPayAccId] = useState<number | undefined>();
  const [recordDeposit, setRecordDeposit] = useState(false);

  const [startYear, setStartYear] = useState(nextYearDefault);
  const [startMonth, setStartMonth] = useState(nextMonthDefault);
  const [startDay, setStartDay] = useState(Math.min(nowJ.d, 28));
  const [dateTarget, setDateTarget] = useState<'FIRST' | 'NEXT'>('FIRST');

  const [scheduleItems, setScheduleItems] = useState<FormScheduleItem[]>([]);
  const [showScheduleList, setShowScheduleList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedLoanId, setLoadedLoanId] = useState<number | undefined>();

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    let active = true;
    if (editingLoan) {
      setTitle(editingLoan.title);
      setLender(editingLoan.lender || '');
      setPrincipalToman(Money.tomanInput(editingLoan.principal));
      setInstallmentToman(Money.tomanInput(editingLoan.installment));
      setCount(String(editingLoan.count));
      setReceiveAccId(editingLoan.receiveAccountId);
      setDefaultPayAccId(editingLoan.accountId);
      setRecordDeposit(false);
      setDateTarget('FIRST');

      const j = Jalali.of(editingLoan.firstDueAt);
      setStartYear(j.y);
      setStartMonth(j.m);
      setStartDay(j.d);

      db.installments.where('loanId').equals(editingLoan.id!).toArray().then(async existingInsts => {
        if (!active) return;
        existingInsts.sort((a, b) => a.n - b.n);
        const paymentIds = existingInsts.flatMap(i => (i.paidTxnId == null ? [] : [i.paidTxnId]));
        const payments = await db.txns.bulkGet(paymentIds);
        if (!active) return;
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
        setLoadedLoanId(editingLoan.id);
      });
    } else {
      setLoadedLoanId(undefined);
      setLoanMode('NEW');
      setTitle('');
      setLender('');
      setPrincipalToman(initialPrincipalToman);
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
    }

    return () => {
      active = false;
    };
  }, [editingLoan, initialPrincipalToman]);

  const calculateFirstDueMillis = (): number => {
    let y = startYear;
    let m = startMonth;
    const d = startDay;

    if (dateTarget === 'NEXT') {
      const pCount = Math.max(0, parseInt(Money.ascii(paidCountInput), 10) || 0);
      const totalMonths = y * 12 + (m - 1) - pCount;
      y = Math.floor(totalMonths / 12);
      m = (totalMonths % 12) + 1;
    }
    const maxD = Jalali.monthDays(y, m);
    return Jalali.millis(y, m, Math.min(d, maxD));
  };

  useEffect(() => {
    if (editingLoan && loadedLoanId !== editingLoan.id) return;
    const installmentRial = Money.parseToman(installmentToman) || 0;
    const n = parseInt(Money.ascii(count), 10) || 0;
    if (n < 1 || n > 600) return;

    const firstDueAt = calculateFirstDueMillis();
    const defaultSchedule = generateSchedule(firstDueAt, n, installmentRial);

    setScheduleItems(prev => {
      if (!editingLoan && prev.length === 0) {
        const paidN = loanMode === 'ACTIVE' ? Math.min(n, Math.max(0, parseInt(Money.ascii(paidCountInput), 10) || 0)) : 0;
        return defaultSchedule.map(item => {
          const isPaid = item.n <= paidN;
          return {
            n: item.n,
            dueAt: item.dueAt,
            amount: item.amount,
            isPaid,
            paidAt: isPaid ? item.dueAt : undefined,
          };
        });
      }

      const prevMap = new Map<number, FormScheduleItem>();
      prev.forEach(p => prevMap.set(p.n, p));

      return defaultSchedule.map(item => {
        const existing = prevMap.get(item.n);
        if (existing?.hasTxn) return existing;
        if (existing) {
          return {
            ...item,
            isPaid: existing.isPaid,
            paidAt: existing.isPaid ? (existing.paidAt || item.dueAt) : undefined,
          };
        }
        return {
          n: item.n,
          dueAt: item.dueAt,
          amount: item.amount,
          isPaid: false,
        };
      });
    });
  }, [
    editingLoan,
    loadedLoanId,
    loanMode,
    count,
    installmentToman,
    startYear,
    startMonth,
    startDay,
    dateTarget,
    paidCountInput,
  ]);

  const handleQuickPaidCountChange = (val: string) => {
    const clean = Money.ascii(val);
    if (!/^\d*$/.test(clean)) return;
    setPaidCountInput(clean);
    const pCount = parseInt(clean, 10) || 0;

    setScheduleItems(prev =>
      prev.map(item => {
        if (item.hasTxn) return item;
        const isPaid = item.n <= pCount;
        return {
          ...item,
          isPaid,
          paidAt: isPaid ? (item.paidAt || item.dueAt) : undefined,
        };
      })
    );
  };

  const setInstallmentPaidState = (n: number, nextPaid: boolean) => {
    setScheduleItems(prev =>
      prev.map(item => {
        if (item.n !== n) return item;
        if (item.hasTxn && !nextPaid) {
          alert('این قسط با تراکنش بانکی ثبت شده است و برای لغو آن باید از بخش اقساط پرداخت‌شده در صفحه وام اقدام کنید.');
          return item;
        }
        return {
          ...item,
          isPaid: nextPaid,
          paidAt: nextPaid ? (item.paidAt || item.dueAt) : undefined,
        };
      })
    );
  };

  const toggleInstallmentPaid = (n: number) => {
    const target = scheduleItems.find(item => item.n === n);
    if (!target) return;
    setInstallmentPaidState(n, !target.isPaid);
  };

  const updateInstallmentAmount = (n: number, toman: string) => {
    const rial = Money.parseToman(toman) || 0;
    setScheduleItems(prev =>
      prev.map(item => (item.n === n ? { ...item, amount: rial } : item))
    );
  };

  const todayStart = Jalali.dayStart(Date.now());
  const [curMonthStart, curMonthEnd] = Jalali.monthRange(nowJ.y, nowJ.m);
  const currentMonthItem = scheduleItems.find(i => i.dueAt >= curMonthStart && i.dueAt < curMonthEnd);
  const totalRepayment = scheduleItems.reduce((sum, i) => sum + i.amount, 0);
  const paidItems = scheduleItems.filter(i => i.isPaid);
  const unpaidItems = scheduleItems.filter(i => !i.isPaid);
  const paidCount = paidItems.length;
  const paidAmount = paidItems.reduce((sum, i) => sum + i.amount, 0);
  const remainingCount = unpaidItems.length;
  const remainingAmount = unpaidItems.reduce((sum, i) => sum + i.amount, 0);
  const overdueCount = unpaidItems.filter(i => i.dueAt < todayStart).length;
  const nextDue = [...unpaidItems].sort((a, b) => a.dueAt - b.dueAt)[0];

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
          loanMode === 'NEW' && recordDeposit ? receiveAccId : undefined,
          customInstallments
        );
      } else {
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

      onSaved();
    } catch {
      alert('ذخیرهٔ وام انجام نشد. لطفاً اطلاعات را بررسی و دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Mode selector (Fresh loan vs Already Active loan) - only for new loans */}
      {!editingLoan && (
        <div className="grid grid-cols-2 p-1 bg-surface rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => {
              setLoanMode('NEW');
              setPaidCountInput('0');
              setScheduleItems(prev => prev.map(item => ({ ...item, isPaid: false, paidAt: undefined })));
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
              const nextPaid = paidCountInput === '0' ? '1' : paidCountInput;
              if (paidCountInput === '0') setPaidCountInput('1');
              const pCount = parseInt(Money.ascii(nextPaid), 10) || 0;
              setScheduleItems(prev =>
                prev.map(item => {
                  const isPaid = item.n <= pCount;
                  return { ...item, isPaid, paidAt: isPaid ? (item.paidAt || item.dueAt) : undefined };
                })
              );
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
          <label htmlFor="loan-title-input" className="text-[11px] text-muted block mb-1">عنوان وام</label>
          <input
            id="loan-title-input"
            type="text"
            placeholder="مثلاً: وام ازدواج، رسالت، مسکن..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
        </div>

        <div>
          <label htmlFor="loan-lender-input" className="text-[11px] text-muted block mb-1">نام بانک یا وام‌دهنده</label>
          <input
            id="loan-lender-input"
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

          {!editingLoan && loanMode === 'ACTIVE' && (
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

        {/* Current Month Quick Status Toggle */}
        {currentMonthItem && (
          <div className="p-3 rounded-2xl bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-white">
                وضعیت قسط این ماه (قسط {Money.fa(String(currentMonthItem.n))})
              </span>
              <span className="text-muted">
                {Jalali.shortDateTime(currentMonthItem.dueAt).split('·')[0]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 bg-sheet p-1 rounded-xl border border-line">
              <button
                type="button"
                onClick={() => setInstallmentPaidState(currentMonthItem.n, false)}
                className={`py-2 rounded-lg text-[11px] font-bold transition-all ${
                  !currentMonthItem.isPaid
                    ? 'bg-warn text-black shadow-sm'
                    : 'text-muted hover:text-white'
                }`}
              >
                هنوز نداده‌ام
              </button>
              <button
                type="button"
                onClick={() => setInstallmentPaidState(currentMonthItem.n, true)}
                className={`py-2 rounded-lg text-[11px] font-bold transition-all ${
                  currentMonthItem.isPaid
                    ? 'bg-ok text-black shadow-sm'
                    : 'text-muted hover:text-white'
                }`}
              >
                پرداخت شده
              </button>
            </div>
          </div>
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

        {/* Collapsible schedule items table */}
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
        type="button"
        disabled={saving}
        onClick={handleSaveLoan}
        className="w-full h-12 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab active:scale-95 transition-transform disabled:opacity-50"
      >
        {editingLoan ? 'ذخیره تغییرات وام' : 'ثبت وام و برنامه اقساط'}
      </button>

      {editingLoan && onDelete && (
        <button
          type="button"
          disabled={saving}
          onClick={onDelete}
          className="w-full h-11 rounded-xl bg-bad/10 border border-bad/25 text-bad font-bold text-xs flex items-center justify-center hover:bg-bad/15 active:scale-95 transition-all disabled:opacity-50"
        >
          حذف این وام
        </button>
      )}
    </div>
  );
}
