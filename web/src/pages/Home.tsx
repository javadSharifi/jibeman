import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Eye,
  EyeOff,
  ClipboardPaste,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  Plus,
  PiggyBank,
  CalendarClock,
  Building2,
  HandCoins,
  CheckCircle2,
  X,
  ArrowRight,
  AlertCircle,
  Scale,
  ShieldAlert,
  PieChart,
} from 'lucide-react';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { db } from '../core/db';
import {
  getAccountsWithBalances,
  getTxnsWithDetails,
  getMonthTotals,
  getSavingsAccountEarmarks,
  getLoanReserveTargets,
  type AccountWithBalance,
  type TxnWithDetails,
} from '../core/db/helpers';
import { BankCard } from '../components/BankCard';
import { TxnRow } from '../components/TxnRow';
import { ActionPill } from '../components/UI';

interface MonthObligations {
  loanTotal: number;
  loanReservedTotal: number;
  loanCoveragePct: number;
  debtTotal: number;
  total: number;
  loans: {
    loanId: number;
    loanTitle: string;
    installmentN: number;
    amount: number;
    dueAt: number;
    loanReservedForMonth: number;
    loanDueForMonth: number;
  }[];
  debts: {
    id: number;
    person: string;
    amount: number;
    remaining: number;
    dueAt: number;
  }[];
}

interface HomeProps {
  hidden: boolean;
  onToggleHidden: () => void;
  onOpenQuickAdd: (type?: 'EXPENSE' | 'INCOME') => void;
  onOpenSmartPaste: () => void;
  onNavigateTab: (tab: number) => void;
  onOpenAccountDetail: (id: number) => void;
  onOpenMonthlyReport: (accountId?: number) => void;
  onNavigateSubRoute?: (route: string) => void;
}

export function Home({
  hidden,
  onToggleHidden,
  onOpenQuickAdd,
  onOpenSmartPaste,
  onNavigateTab,
  onOpenAccountDetail,
  onOpenMonthlyReport,
  onNavigateSubRoute,
}: HomeProps) {
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const now = Date.now();
  const currentJ = Jalali.of(now);

  const { accounts, recentTxns, totals, obligations, savingsEarmarkedRial, savingsPersonHoldRial, savingsLoanReservedRial } = useLiveQuery(
    async () => {
      const [monthStart, monthEnd] = Jalali.monthRange(currentJ.y, currentJ.m);

      const [accs, txs, tots, allLoans, allInsts, allDebts, allPmts, earmarks, loanTargets] = await Promise.all([
        getAccountsWithBalances(),
        getTxnsWithDetails({ limit: 5 }),
        getMonthTotals(currentJ.y, currentJ.m),
        db.loans.toArray(),
        db.installments.toArray(),
        db.debts.toArray(),
        db.debtPayments.toArray(),
        getSavingsAccountEarmarks(),
        getLoanReserveTargets(currentJ.y, currentJ.m),
      ]);

      const loansMap = new Map(allLoans.map((l) => [l.id, l.title]));
      const monthLoanTargetMap = new Map(
        loanTargets.filter(t => t.inCurrentMonth).map(t => [t.loanId, t])
      );
      const isInstPaid = (i: { paidTxnId?: number; paidAt?: number }) => i.paidTxnId != null || i.paidAt != null;

      // 1. Unpaid installments due in current Jalali month
      const monthInstallments = allInsts
        .filter((i) => !isInstPaid(i) && i.dueAt >= monthStart && i.dueAt < monthEnd)
        .sort((a, b) => a.dueAt - b.dueAt)
        .map((i) => {
          const target = monthLoanTargetMap.get(i.loanId);
          return {
            loanId: i.loanId,
            loanTitle: loansMap.get(i.loanId) || 'وام',
            installmentN: i.n,
            amount: i.amount,
            dueAt: i.dueAt,
            loanReservedForMonth: target?.reservedAmount ?? 0,
            loanDueForMonth: target?.dueAmount ?? i.amount,
          };
        });

      const loanTotal = monthInstallments.reduce((sum, i) => sum + i.amount, 0);
      const loanReservedTotal = Array.from(monthLoanTargetMap.values()).reduce(
        (sum, t) => sum + Math.min(t.dueAmount, t.reservedAmount),
        0
      );
      const loanCoveragePct = loanTotal > 0 ? Math.min(100, Math.round((loanReservedTotal / loanTotal) * 100)) : 0;

      // 2. Debts (I_OWE) with dueAt in current Jalali month
      const monthDebts = allDebts
        .filter(
          (d) =>
            d.direction === 'I_OWE' &&
            d.dueAt != null &&
            d.dueAt >= monthStart &&
            d.dueAt < monthEnd
        )
        .map((d) => {
          const paid = allPmts
            .filter((p) => p.debtId === d.id)
            .reduce((sum, p) => sum + p.amount, 0);
          const remaining = Math.max(0, d.amount - paid);
          return {
            id: d.id!,
            person: d.person,
            amount: d.amount,
            remaining,
            dueAt: d.dueAt!,
          };
        })
        .filter((d) => d.remaining > 0)
        .sort((a, b) => a.dueAt - b.dueAt);

      const debtTotal = monthDebts.reduce((sum, d) => sum + d.remaining, 0);

      return {
        accounts: accs,
        recentTxns: txs,
        totals: tots,
        savingsEarmarkedRial: earmarks.totalEarmarked,
        savingsPersonHoldRial: earmarks.personHoldTotal,
        savingsLoanReservedRial: earmarks.loanReservedTotal,
        obligations: {
          loanTotal,
          loanReservedTotal,
          loanCoveragePct,
          debtTotal,
          total: loanTotal + debtTotal,
          loans: monthInstallments,
          debts: monthDebts,
        } satisfies MonthObligations,
      };
    },
    [currentJ.y, currentJ.m],
    {
      accounts: [] as AccountWithBalance[],
      recentTxns: [] as TxnWithDetails[],
      totals: { income: 0, expense: 0 },
      savingsEarmarkedRial: 0,
      savingsPersonHoldRial: 0,
      savingsLoanReservedRial: 0,
      obligations: {
        loanTotal: 0,
        loanReservedTotal: 0,
        loanCoveragePct: 0,
        debtTotal: 0,
        total: 0,
        loans: [],
        debts: [],
      } as MonthObligations,
    }
  );

  const spendableBalanceRial = accounts.filter(a => !a.isSavings).reduce((acc, a) => acc + a.balance, 0);
  const savingsBalanceRial = accounts.filter(a => a.isSavings).reduce((acc, a) => acc + a.balance, 0);
  const netSavingsRial = savingsBalanceRial - savingsEarmarkedRial;
  const netMonth = totals.income - totals.expense;

  return (
    <div className="flex flex-col pb-28">
      {/* 1. Hero Header */}
      <div className="hero-gradient px-4 pt-6 pb-6 rounded-b-[36px] shadow-sm">
        {/* Top Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-lime text-onLime font-black text-base flex items-center justify-center shadow-fab">
              ج
            </div>
            <div>
              <div className="text-sm font-bold text-white">سلام، خوش آمدید</div>
              <div className="text-[11px] text-white/70">{Jalali.dayLabel(now)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenMonthlyReport()}
              title="گزارش ماهانه هزینه‌ها"
              aria-label="گزارش ماهانه هزینه‌ها"
              className="w-10 h-10 rounded-[14px] bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              <PieChart size={18} />
            </button>

            <button
              onClick={onOpenSmartPaste}
              title="چسباندن پیامک بانکی"
              className="w-10 h-10 rounded-[14px] bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              <ClipboardPaste size={18} className="text-lime" />
            </button>

            <button
              onClick={onToggleHidden}
              title={hidden ? 'نمایش مبالغ' : 'مخفی‌سازی مبالغ'}
              className="w-10 h-10 rounded-[14px] bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Spendable Everyday Balance */}
        <div className="mt-6">
          <span className="text-xs text-white/70 font-medium">موجودی قابل خرج روزمره</span>
          <div className="flex items-baseline gap-2 mt-0.5 dir-ltr justify-end">
            <span className="text-[34px] sm:text-[38px] font-black text-white tracking-tight">
              {hidden ? Money.HIDDEN : Money.toman(spendableBalanceRial)}
            </span>
            <span className="text-sm font-normal text-white/60">تومان</span>
          </div>

          {/* Monthly Net Chip */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
              netMonth >= 0 ? 'bg-lime/20 text-lime' : 'bg-bad/20 text-bad'
            }`}>
              {hidden ? '•••' : Money.toman(netMonth, true)} تومان
              <span className="text-[10px] font-normal opacity-80">(خالص این ماه)</span>
            </span>
          </div>
        </div>

        {/* Total Savings Row */}
        <div
          onClick={() => onNavigateTab(2)}
          role="button"
          tabIndex={0}
          className="mt-3.5 bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-2xl px-4 py-2.5 border border-white/10 flex items-center justify-between cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-lime/20 flex items-center justify-center text-lime shrink-0">
              <PiggyBank size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">کل پس‌انداز خالص</div>
              <div className="text-[10px] text-white/60 truncate">
                {savingsEarmarkedRial > 0
                  ? [
                      `کل کارت‌ها: ${hidden ? '•••' : Money.toman(savingsBalanceRial)}`,
                      savingsPersonHoldRial > 0 ? `مال مردم: ${hidden ? '•••' : Money.toman(savingsPersonHoldRial)}` : null,
                      savingsLoanReservedRial > 0 ? `وام: ${hidden ? '•••' : Money.toman(savingsLoanReservedRial)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'تفکیک‌شده از موجودی قابل‌خرج'}
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-1 dir-ltr shrink-0">
            <span className="text-base font-extrabold text-lime tracking-tight">
              {hidden ? Money.HIDDEN : Money.toman(netSavingsRial)}
            </span>
            <span className="text-[10px] text-white/70">تومان</span>
          </div>
        </div>

        {/* Action Pills */}
        <div className="flex gap-2.5 mt-5">
          <ActionPill
            title="ثبت هزینه"
            onClick={() => onOpenQuickAdd('EXPENSE')}
            icon={ArrowUpRight}
          />
          <ActionPill
            title="ثبت درآمد"
            onClick={() => onOpenQuickAdd('INCOME')}
            icon={ArrowDownLeft}
          />
        </div>
      </div>

      {/* 2. Bank Cards Carousel */}
      <div className="mt-5">
        <div className="flex items-center justify-between px-4 mb-2.5">
          <span className="text-sm font-bold text-white">کارت‌ها و حساب‌ها</span>
          <button
            onClick={() => onNavigateTab(2)}
            className="text-xs text-sky font-semibold flex items-center gap-0.5"
          >
            همه حساب‌ها
            <ChevronLeft size={16} />
          </button>
        </div>

        <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar pb-1">
          {accounts.map(acc => (
            <BankCard
              key={acc.id}
              account={acc}
              hidden={hidden}
              onClick={() => onOpenAccountDetail(acc.id!)}
            />
          ))}

          {/* Add Account Card */}
          <button
            onClick={() => onNavigateTab(2)}
            className="w-[110px] h-[134px] rounded-[20px] p-3 flex flex-col items-center justify-center gap-2 shrink-0 border border-dashed border-white/20 bg-surface/40 hover:bg-surface text-muted hover:text-white transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
              <Plus size={20} />
            </div>
            <span className="text-[11px] font-medium text-center">افزودن حساب</span>
          </button>
        </div>
      </div>

      {/* 3. Monthly Stat Tiles */}
      <div className="grid grid-cols-2 gap-2.5 px-4 mt-5">
        <div className="rounded-[20px] p-3.5 bg-gradient-to-br from-[#3B7DF0] to-[#2A62D4] text-white border border-white/15 shadow-sm">
          <div className="text-xs text-white/80 font-medium">درآمد این ماه</div>
          <div className="text-xl font-black mt-2 dir-ltr text-right">
            {hidden ? Money.HIDDEN : Money.toman(totals.income)}
            <span className="text-[10px] text-white/70 font-normal mr-1">تومان</span>
          </div>
          <div className="text-[10px] text-white/70 mt-1">{Jalali.monthTitle(currentJ.y, currentJ.m)}</div>
        </div>

        <div
          onClick={() => setIsDetailModalOpen(true)}
          role="button"
          tabIndex={0}
          className="rounded-[20px] p-3.5 bg-surface border border-line hover:border-lineStrong text-white shadow-sm cursor-pointer transition-all active:scale-[0.99] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">هزینه‌های این ماه</span>
              {obligations.total > 0 && (
                <span className="w-2 h-2 rounded-full bg-warn animate-pulse" title="دارای تعهد اقساط و بدهی" />
              )}
            </div>
            <div className="text-xl font-black mt-2 dir-ltr text-right text-warn">
              {hidden ? Money.HIDDEN : Money.toman(totals.expense)}
              <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-line/40">
            {obligations.total > 0 ? (
              <div className="text-[10px] text-warn/90 font-medium flex items-center justify-between">
                <span>کنارگذاشتنی وام و بدهی:</span>
                <span className="font-bold dir-ltr">{hidden ? '•••' : Money.toman(obligations.total)}</span>
              </div>
            ) : (
              <div className="text-[10px] text-muted">{Jalali.monthTitle(currentJ.y, currentJ.m)}</div>
            )}
          </div>
        </div>
      </div>

      {/* 3.1 Monthly Commitments (Loans & Debts to set aside) */}
      <div className="px-4 mt-5">
        <div className="rounded-[24px] p-4 bg-surface border border-line shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-warn/15 text-warn flex items-center justify-center">
                <CalendarClock size={18} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">تعهدات این برج (وام و بدهی)</h3>
                <p className="text-[10px] text-muted">
                  مبلغی که باید برای سررسیدهای {Jalali.monthTitle(currentJ.y, currentJ.m)} کنار بگذارید
                </p>
              </div>
            </div>

            <div className="text-left dir-ltr">
              <div className="text-base font-black text-warn">
                {hidden ? Money.HIDDEN : Money.toman(obligations.total)}
                <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
              </div>
            </div>
          </div>

          {/* Breakdown cards */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* Loans summary */}
            <div
              onClick={() => (onNavigateSubRoute ? onNavigateSubRoute('loans') : onNavigateTab(3))}
              role="button"
              tabIndex={0}
              className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-line/60 cursor-pointer transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1.5 text-white/90 font-medium">
                  <Building2 size={13} className="text-sky" />
                  اقساط وام
                </span>
                <span className="text-[10px] text-sky font-bold">
                  {Money.fa(String(obligations.loans.length))} قسط
                </span>
              </div>
              <div className="text-xs font-extrabold text-white dir-ltr text-right">
                {hidden ? Money.HIDDEN : Money.toman(obligations.loanTotal)}{' '}
                <span className="text-[9px] text-muted font-normal">تومان</span>
              </div>
              {obligations.loanTotal > 0 && obligations.loanReservedTotal > 0 && (
                <div className="space-y-1 pt-0.5">
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${obligations.loanCoveragePct >= 100 ? 'bg-ok' : 'bg-sky'}`}
                      style={{ width: `${obligations.loanCoveragePct}%` }}
                    />
                  </div>
                  <div className={`text-[9.5px] font-bold ${obligations.loanCoveragePct >= 100 ? 'text-ok' : 'text-sky'}`}>
                    {obligations.loanCoveragePct >= 100
                      ? '۱۰۰٪ در پس‌انداز آماده ✓'
                      : `${Money.fa(String(obligations.loanCoveragePct))}٪ تأمین‌شده (${hidden ? '•••' : Money.toman(obligations.loanReservedTotal)})`}
                  </div>
                </div>
              )}
            </div>

            {/* Debts summary */}
            <div
              onClick={() => (onNavigateSubRoute ? onNavigateSubRoute('debts') : onNavigateTab(3))}
              role="button"
              tabIndex={0}
              className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-line/60 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                <span className="flex items-center gap-1.5 text-white/90 font-medium">
                  <HandCoins size={13} className="text-warn" />
                  بدهی به دیگران
                </span>
                <span className="text-[10px] text-warn font-bold">
                  {Money.fa(String(obligations.debts.length))} مورد
                </span>
              </div>
              <div className="text-xs font-extrabold text-white dir-ltr text-right">
                {hidden ? Money.HIDDEN : Money.toman(obligations.debtTotal)}{' '}
                <span className="text-[9px] text-muted font-normal">تومان</span>
              </div>
            </div>
          </div>

          {/* List of upcoming items this month */}
          {obligations.loans.length > 0 || obligations.debts.length > 0 ? (
            <div className="space-y-1.5 pt-1 border-t border-line/40">
              {obligations.loans.map((item) => {
                const loanPct = item.loanDueForMonth > 0
                  ? Math.min(100, Math.round((item.loanReservedForMonth / item.loanDueForMonth) * 100))
                  : 0;
                return (
                  <div
                    key={`loan-${item.loanId}-${item.installmentN}`}
                    onClick={() => (onNavigateSubRoute ? onNavigateSubRoute('loans') : onNavigateTab(3))}
                    className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${loanPct >= 100 ? 'bg-ok' : 'bg-sky'}`} />
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">
                          {item.loanTitle} · قسط {Money.fa(String(item.installmentN))}
                        </div>
                        <div className="text-[10px] text-muted flex items-center gap-1.5 flex-wrap">
                          <span>سررسید: {Jalali.longDate(item.dueAt)}</span>
                          {item.loanReservedForMonth > 0 && (
                            <span className={loanPct >= 100 ? 'text-ok font-bold' : 'text-sky font-semibold'}>
                              · {loanPct >= 100 ? 'ذخیره‌شده ۱۰۰٪ ✓' : `ذخیره ${Money.fa(String(loanPct))}٪`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-left dir-ltr font-bold text-white shrink-0">
                      {hidden ? '•••' : Money.toman(item.amount)}{' '}
                      <span className="text-[9px] text-muted font-normal">تومان</span>
                    </div>
                  </div>
                );
              })}

              {obligations.debts.map((item) => (
                <div
                  key={`debt-${item.id}`}
                  onClick={() => (onNavigateSubRoute ? onNavigateSubRoute('debts') : onNavigateTab(3))}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-warn" />
                    <div>
                      <div className="text-white font-medium">بدهی به {item.person}</div>
                      <div className="text-[10px] text-muted">سررسید: {Jalali.longDate(item.dueAt)}</div>
                    </div>
                  </div>
                  <div className="text-left dir-ltr font-bold text-white">
                    {hidden ? '•••' : Money.toman(item.remaining)}{' '}
                    <span className="text-[9px] text-muted font-normal">تومان</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-2 text-xs text-ok/90 flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} className="text-ok" />
              <span>همه اقساط و بدهی‌های این برج تسویه شده‌اند یا تعهدی ندارید.</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal for Monthly Expenses & Obligations */}
      {isDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-analysis-title"
            className="w-full max-w-md rounded-[28px] border border-line bg-sheet p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line/40 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-warn/15 text-warn flex items-center justify-center">
                  <CalendarClock size={18} />
                </div>
                <div>
                  <h2 id="expense-analysis-title" className="text-sm font-bold text-white">
                    تحلیل هزینه‌ها و تعهدات ماه
                  </h2>
                  <p className="text-[10px] text-muted">{Jalali.monthTitle(currentJ.y, currentJ.m)}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Total Required Card */}
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-line space-y-2">
              <div className="text-xs text-muted">مجموع هزینه‌های قطعی و تعهدات این برج:</div>
              <div className="text-2xl font-black text-white dir-ltr text-right">
                {hidden ? Money.HIDDEN : Money.toman(totals.expense + obligations.total)}{' '}
                <span className="text-xs text-muted font-normal">تومان</span>
              </div>
              <p className="text-[10px] text-muted/80 leading-relaxed">
                شامل هزینه‌های ثبت‌شده تا امروز به‌علاوه اقساط وام‌ها و بدهی‌های پیش‌رو که باید تا پایان این برج تسویه شوند.
              </p>
            </div>

            {/* Breakdown sections */}
            <div className="space-y-2 text-xs">
              {/* 1. Recorded everyday expenses */}
              <div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">هزینه‌های ثبت‌شده روزمره</div>
                  <div className="text-[10px] text-muted">تراکنش‌های هزینه انجام‌شده در این ماه</div>
                </div>
                <div className="font-bold text-white dir-ltr">
                  {hidden ? '•••' : Money.toman(totals.expense)} تومان
                </div>
              </div>

              {/* 2. Unpaid loan installments */}
              <div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between">
                <div>
                  <div className="font-bold text-sky flex items-center gap-1.5">
                    <Building2 size={14} />
                    اقساط وام‌های این برج
                  </div>
                  <div className="text-[10px] text-muted">
                    {Money.fa(String(obligations.loans.length))} قسط پرداخت‌نشده با سررسید این ماه
                  </div>
                </div>
                <div className="font-bold text-sky dir-ltr">
                  {hidden ? '•••' : Money.toman(obligations.loanTotal)} تومان
                </div>
              </div>

              {/* 3. Debts due this month */}
              <div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between">
                <div>
                  <div className="font-bold text-warn flex items-center gap-1.5">
                    <HandCoins size={14} />
                    بدهی‌های سررسید این برج
                  </div>
                  <div className="text-[10px] text-muted">
                    {Money.fa(String(obligations.debts.length))} مورد بدهی به دیگران در این ماه
                  </div>
                </div>
                <div className="font-bold text-warn dir-ltr">
                  {hidden ? '•••' : Money.toman(obligations.debtTotal)} تومان
                </div>
              </div>
            </div>

            {/* Navigation buttons to monthly report, loans and debts */}
            <div className="space-y-2 pt-2 border-t border-line/40">
              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  onOpenMonthlyReport();
                }}
                className="w-full h-10 rounded-xl bg-lime text-onLime text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-transform shadow-fab"
              >
                <PieChart size={15} />
                گزارش دسته‌بندی هزینه‌های ماه
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    if (onNavigateSubRoute) onNavigateSubRoute('loans');
                    else onNavigateTab(3);
                  }}
                  className="h-10 rounded-xl bg-surface2 border border-line text-xs font-bold text-sky flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Building2 size={14} />
                  مدیریت و پرداخت وام‌ها
                </button>
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    if (onNavigateSubRoute) onNavigateSubRoute('debts');
                    else onNavigateTab(3);
                  }}
                  className="h-10 rounded-xl bg-surface2 border border-line text-xs font-bold text-warn flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <HandCoins size={14} />
                  مدیریت بدهی‌ها
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shopping Compare & Impulse Brake Assistant Banners */}
      <div className="mt-4 px-4 space-y-2">
        <div
          onClick={() => (onNavigateSubRoute ? onNavigateSubRoute('impulse') : onNavigateTab(3))}
          role="button"
          tabIndex={0}
          className="p-3.5 rounded-[22px] bg-gradient-to-r from-amber-950/40 via-surface to-surface border border-amber-500/20 hover:border-amber-400/40 cursor-pointer active:scale-98 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white block">ترمز خرید هیجانی (خرید آگاهانه)</span>
                <span className="text-[9px] font-black bg-amber-400 text-black px-1.5 py-0.2 rounded-full">
                  جدید
                </span>
              </div>
              <p className="text-[10px] text-muted mt-0.5">
                قانون خروج از فروشگاه، تایمر تفکر و جلوگیری از خریدهای احساسی
              </p>
            </div>
          </div>
          <ChevronLeft size={16} className="text-muted" />
        </div>

        <div
          onClick={() => (onNavigateSubRoute ? onNavigateSubRoute('compare') : onNavigateTab(3))}
          role="button"
          tabIndex={0}
          className="p-3.5 rounded-[22px] bg-gradient-to-r from-emerald-950/40 via-surface to-surface border border-emerald-500/20 hover:border-emerald-500/40 cursor-pointer active:scale-98 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
              <Scale size={20} />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">دستیار مقایسه و انتخاب خرید</span>
              <p className="text-[10px] text-muted mt-0.5">
                مقایسه دقیق گزینه‌ها، بررسی خط قرمزها و تحلیل ارزش خرید
              </p>
            </div>
          </div>
          <ChevronLeft size={16} className="text-muted" />
        </div>
      </div>

      {/* 4. Recent Transactions */}
      <div className="mt-6 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-white">آخرین تراکنش‌ها</span>
          <button
            onClick={() => onNavigateTab(1)}
            className="text-xs text-sky font-semibold flex items-center gap-0.5"
          >
            مشاهده همه
            <ChevronLeft size={16} />
          </button>
        </div>

        <div className="bg-surface border border-line rounded-[22px] px-3.5 py-1 shadow-sm">
          {recentTxns.length > 0 ? (
            recentTxns.map(t => (
              <TxnRow key={t.id} txn={t} hidden={hidden} />
            ))
          ) : (
            <div className="py-8 text-center text-muted text-xs">
              هنوز تراکنشی ثبت نشده است. با دکمه + اولی را ثبت کنید!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
