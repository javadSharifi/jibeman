import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  PieChart,
  Eye,
  EyeOff,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Wallet,
  ArrowUpLeft,
  Trash2,
  X,
} from 'lucide-react';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { getBankByCode } from '../core/banks';
import { deleteTxnWithInstallmentLink, type AccountWithBalance, type TxnWithDetails } from '../core/db/helpers';
import {
  getMonthlyReport,
  getPrevJalaliMonth,
  getNextJalaliMonth,
  formatSpendPercent,
  type CategorySpendItem,
  type MonthlyReportData,
} from '../core/monthlyReport';
import { CategoryIcon, HeaderBar } from '../components/UI';
import { BankLogoBadge } from '../components/BankCard';
import { TxnRow } from '../components/TxnRow';

interface MonthlyReportProps {
  hidden: boolean;
  onToggleHidden: () => void;
  initialAccountId?: number;
  onBack: () => void;
  onOpenTransactions?: (accountId?: number) => void;
}

function DonutChart({
  categories,
  totalExpense,
  activeKey,
  onSelectCategory,
  hidden,
}: {
  categories: CategorySpendItem[];
  totalExpense: number;
  activeKey: string | null;
  onSelectCategory: (key: string) => void;
  hidden: boolean;
}) {
  const size = 184;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = categories.length > 1 ? 3 : 0;

  const activeCategory = categories.find(c => c.key === activeKey);

  let cumulativeOffset = 0;
  const segments = categories.map(cat => {
    const rawLen = totalExpense > 0 ? (cat.totalAmount / totalExpense) * circumference : 0;
    const drawLen = rawLen <= 0 ? 0 : rawLen <= gap ? rawLen : rawLen - gap;
    const dashOffset = -cumulativeOffset;
    cumulativeOffset += rawLen;
    return { cat, drawLen, dashOffset };
  });

  return (
    <div className="relative flex items-center justify-center my-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 overflow-visible"
        role="img"
        aria-label="نمودار سهم دسته‌بندی هزینه‌های ماه"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />

        {segments.map(({ cat, drawLen, dashOffset }) => {
          const isSelected = activeKey === cat.key;
          const isDimmed = activeKey !== null && !isSelected;
          return (
            <circle
              key={cat.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={cat.colorHex}
              strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${drawLen} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              opacity={isDimmed ? 0.35 : 1}
              onClick={() => onSelectCategory(cat.key)}
              className="cursor-pointer transition-all duration-200"
            />
          );
        })}
      </svg>

      {/* Center Readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-7 pointer-events-none">
        {activeCategory ? (
          <>
            <span className="text-[11px] font-bold text-white truncate max-w-[116px]">
              {activeCategory.name}
            </span>
            <span
              className="text-lg font-black mt-0.5 dir-ltr"
              style={{ color: activeCategory.colorHex }}
            >
              {formatSpendPercent(activeCategory.percent)}
            </span>
            <span className="text-[11px] font-bold text-t2 dir-ltr mt-0.5">
              {hidden ? Money.HIDDEN : `${Money.short(activeCategory.totalAmount)} ت`}
            </span>
          </>
        ) : (
          <>
            <span className="text-[10.5px] text-muted font-medium">جمع هزینه ماه</span>
            <span className="text-lg font-black text-white mt-0.5 dir-ltr">
              {hidden ? Money.HIDDEN : Money.short(totalExpense)}
            </span>
            <span className="text-[10px] text-muted">تومان</span>
          </>
        )}
      </div>
    </div>
  );
}

export function MonthlyReport({
  hidden,
  onToggleHidden,
  initialAccountId,
  onBack,
  onOpenTransactions,
}: MonthlyReportProps) {
  const now = Date.now();
  const curJ = Jalali.of(now);

  const [year, setYear] = useState(curJ.y);
  const [month, setMonth] = useState(curJ.m);
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(initialAccountId);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<TxnWithDetails | null>(null);

  useEffect(() => {
    setSelectedAccountId(initialAccountId);
    setExpandedKey(null);
  }, [initialAccountId]);

  const data = useLiveQuery(
    () => getMonthlyReport(year, month, selectedAccountId),
    [year, month, selectedAccountId]
  );

  const accounts: AccountWithBalance[] = data?.accounts ?? [];
  const report: MonthlyReportData | undefined = data?.report;
  const activeAccount = selectedAccountId != null
    ? accounts.find(a => a.id === selectedAccountId)
    : undefined;

  const handlePrevMonth = () => {
    const prev = getPrevJalaliMonth(year, month);
    setYear(prev.year);
    setMonth(prev.month);
    setExpandedKey(null);
  };

  const handleNextMonth = () => {
    const next = getNextJalaliMonth(year, month);
    setYear(next.year);
    setMonth(next.month);
    setExpandedKey(null);
  };

  const handleToggleCategory = (key: string) => {
    setExpandedKey(prev => (prev === key ? null : key));
  };

  const handleDeleteTxn = async (id: number) => {
    if (confirm('آیا از حذف این تراکنش اطمینان دارید؟')) {
      await deleteTxnWithInstallmentLink(id);
      setSelectedTxn(null);
    }
  };

  const prevMonthName = Jalali.MONTHS[(getPrevJalaliMonth(year, month).month - 1)];

  return (
    <div className="flex flex-col pb-16 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="گزارش ماهانه هزینه‌ها"
        onBack={onBack}
        action={
          <button
            type="button"
            onClick={onToggleHidden}
            title={hidden ? 'نمایش مبالغ' : 'مخفی‌سازی مبالغ'}
            aria-label={hidden ? 'نمایش مبالغ' : 'مخفی‌سازی مبالغ'}
            className="w-10 h-10 rounded-2xl bg-surface border border-line flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
      />

      {/* Month Navigator */}
      <div className="flex items-center justify-between bg-surface border border-line rounded-2xl p-2 mt-1 mb-3">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="ماه قبل"
          className="w-9 h-9 rounded-xl hover:bg-white/5 flex items-center justify-center text-muted hover:text-white active:scale-95 transition-transform"
        >
          <ChevronRight size={20} />
        </button>
        <div className="text-sm font-extrabold text-white">
          {Jalali.monthTitle(year, month)}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="ماه بعد"
          className="w-9 h-9 rounded-xl hover:bg-white/5 flex items-center justify-center text-muted hover:text-white active:scale-95 transition-transform"
        >
          <ChevronLeft size={20} />
        </button>
      </div>

      {/* Card / Account Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 mb-3.5">
        <button
          type="button"
          onClick={() => {
            setSelectedAccountId(undefined);
            setExpandedKey(null);
          }}
          className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all active:scale-95 shrink-0 ${
            selectedAccountId == null
              ? 'bg-lime text-onLime shadow-sm'
              : 'bg-surface border border-line text-t2 hover:text-white'
          }`}
        >
          <PieChart size={14} />
          <span>همه کارت‌ها</span>
        </button>

        {accounts.map(acc => {
          const isSelected = selectedAccountId === acc.id;
          const bank = getBankByCode(acc.bankCode);
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => {
                setSelectedAccountId(acc.id);
                setExpandedKey(null);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition-all active:scale-95 shrink-0 ${
                isSelected
                  ? 'bg-lime text-onLime font-bold shadow-sm'
                  : 'bg-surface border border-line text-t2 hover:text-white'
              }`}
            >
              {acc.type === 'BANK' ? (
                <BankLogoBadge bank={bank} size={20} className="rounded-[7px]" />
              ) : (
                <Wallet size={14} className={isSelected ? 'text-onLime' : 'text-sky'} />
              )}
              <span className="truncate max-w-[120px]">{acc.name}</span>
              {acc.last4 && (
                <span className={`text-[10px] font-mono ${isSelected ? 'text-onLime/80' : 'text-muted'}`}>
                  *{Money.fa(acc.last4)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary Hero Card */}
      <div className="rounded-[26px] p-4 bg-gradient-to-br from-[#1C2758] via-surface to-surface border border-lineStrong shadow-card space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[11px] text-t2 font-medium block">
              {activeAccount
                ? `خرج‌شده از ${activeAccount.name}`
                : 'مجموع هزینه‌های همه کارت‌ها'}
            </span>
            <div className="flex items-baseline gap-1.5 mt-1 dir-ltr justify-end">
              <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {hidden ? Money.HIDDEN : Money.toman(report?.totalExpense ?? 0)}
              </span>
              <span className="text-xs text-muted font-normal">تومان</span>
            </div>
          </div>

          {report && report.deltaPercent !== null && (
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold shrink-0 ${
                report.deltaPercent > 0
                  ? 'bg-bad/15 text-bad'
                  : report.deltaPercent < 0
                  ? 'bg-ok/15 text-ok'
                  : 'bg-white/10 text-muted'
              }`}
            >
              {report.deltaPercent > 0 ? (
                <>
                  <TrendingUp size={13} />
                  <span>{Money.fa(String(Math.abs(report.deltaPercent)))}٪ بیشتر از {prevMonthName}</span>
                </>
              ) : report.deltaPercent < 0 ? (
                <>
                  <TrendingDown size={13} />
                  <span>{Money.fa(String(Math.abs(report.deltaPercent)))}٪ کمتر از {prevMonthName}</span>
                </>
              ) : (
                <span>برابر با {prevMonthName}</span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center">
          <div className="rounded-xl bg-black/20 px-2 py-2">
            <span className="text-[10px] text-muted block">تراکنش هزینه</span>
            <span className="text-xs font-extrabold text-white mt-0.5 block">
              {Money.fa(String(report?.expenseCount ?? 0))} مورد
            </span>
          </div>
          <div className="rounded-xl bg-black/20 px-2 py-2">
            <span className="text-[10px] text-muted block">میانگین روزانه</span>
            <span className="text-xs font-extrabold text-sky mt-0.5 block dir-ltr">
              {hidden ? '•••' : Money.short(report?.dailyAverage ?? 0)}
            </span>
          </div>
          <div className="rounded-xl bg-black/20 px-2 py-2">
            <span className="text-[10px] text-muted block">درآمد ماه</span>
            <span className="text-xs font-extrabold text-ok mt-0.5 block dir-ltr">
              {hidden ? '•••' : Money.short(report?.totalIncome ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Category Breakdown Section */}
      {report && report.categories.length > 0 ? (
        <>
          {/* Donut Visual Card */}
          <div className="mt-4 rounded-[24px] p-4 bg-surface border border-line flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-white">نمودار سهم دسته‌بندی‌ها</h2>
              <span className="text-[10.5px] text-muted">
                برای تمرکز روی دسته لمس کنید
              </span>
            </div>

            <DonutChart
              categories={report.categories}
              totalExpense={report.totalExpense}
              activeKey={expandedKey}
              onSelectCategory={handleToggleCategory}
              hidden={hidden}
            />

            {/* Compact legend chips */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {report.categories.slice(0, 6).map(cat => {
                const active = expandedKey === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => handleToggleCategory(cat.key)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] border transition-all active:scale-95 ${
                      active
                        ? 'bg-white/10 border-white/25 text-white font-bold'
                        : 'bg-white/[0.03] border-line text-t2 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.colorHex }}
                    />
                    <span>{cat.name}</span>
                    <span className="text-muted">{formatSpendPercent(cat.percent)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expandable Category List */}
          <div className="mt-5">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-sm font-bold text-white">چقدر و کجا مصرف شده؟</h2>
              <span className="text-[11px] text-muted">
                {Money.fa(String(report.categories.length))} دسته‌بندی
              </span>
            </div>

            <div className="bg-surface border border-line rounded-[24px] overflow-hidden divide-y divide-line">
              {report.categories.map(cat => {
                const isExpanded = expandedKey === cat.key;
                return (
                  <div key={cat.key}>
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.key)}
                      aria-expanded={isExpanded}
                      className="w-full p-3.5 text-right flex flex-col gap-2.5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-center gap-3 w-full">
                        <CategoryIcon icon={cat.icon} colorIdx={cat.colorIdx} size={19} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13.5px] font-bold text-white truncate">
                              {cat.name}
                            </span>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                              style={{
                                backgroundColor: `${cat.colorHex}20`,
                                color: cat.colorHex,
                              }}
                            >
                              {formatSpendPercent(cat.percent)}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted block mt-0.5">
                            {Money.fa(String(cat.count))} تراکنش
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-left dir-ltr">
                            <div className="text-[13.5px] font-extrabold text-white">
                              {hidden ? Money.HIDDEN : Money.toman(cat.totalAmount)}
                            </div>
                            <div className="text-[10px] text-muted">تومان</div>
                          </div>
                          <ChevronDown
                            size={16}
                            className={`text-muted transition-transform duration-200 ${
                              isExpanded ? 'rotate-180 text-lime' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {/* Proportional share bar */}
                      <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(2, Math.min(100, cat.percent))}%`,
                            backgroundColor: cat.colorHex,
                          }}
                        />
                      </div>
                    </button>

                    {/* Expanded Category Transactions */}
                    {isExpanded && (
                      <div className="bg-bg/55 border-t border-line/70 px-3.5 py-1 animate-fade-in">
                        {cat.txns.map(txn => (
                          <TxnRow
                            key={txn.id}
                            txn={txn}
                            hidden={hidden}
                            onClick={() => setSelectedTxn(txn)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-Card Share Section (only in All Cards view) */}
          {selectedAccountId == null && report.accountShares.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-sm font-bold text-white">سهم هر کارت از هزینه‌های ماه</h2>
                <span className="text-[11px] text-muted">برای مشاهده جزئیات کارت لمس کنید</span>
              </div>

              <div className="bg-surface border border-line rounded-[24px] overflow-hidden divide-y divide-line">
                {report.accountShares.map(share => {
                  const bank = getBankByCode(share.bankCode);
                  return (
                    <button
                      key={share.accountId}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(share.accountId);
                        setExpandedKey(null);
                      }}
                      className="w-full p-3.5 text-right flex flex-col gap-2 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 w-full">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {share.type === 'BANK' ? (
                            <BankLogoBadge bank={bank} size={34} />
                          ) : (
                            <div className="w-[34px] h-[34px] rounded-[11px] bg-surface2 flex items-center justify-center text-sky shrink-0">
                              <CreditCard size={17} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">{share.name}</span>
                              {share.last4 && (
                                <span className="text-[10px] text-muted font-mono">*{Money.fa(share.last4)}</span>
                              )}
                            </div>
                            <span className="text-[10.5px] text-muted">
                              {Money.fa(String(share.count))} تراکنش · {formatSpendPercent(share.percent)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="text-left dir-ltr">
                            <span className="text-xs font-extrabold text-white">
                              {hidden ? Money.HIDDEN : Money.toman(share.totalAmount)}
                            </span>
                            <span className="text-[10px] text-muted mr-1">تومان</span>
                          </div>
                          <ChevronLeft size={15} className="text-muted" />
                        </div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-lime"
                          style={{ width: `${Math.max(2, Math.min(100, share.percent))}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 rounded-[24px] bg-surface border border-line p-8 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-sky/10 text-sky flex items-center justify-center mx-auto">
            <PieChart size={24} />
          </div>
          <div className="text-sm font-bold text-white">
            در {Jalali.monthTitle(year, month)} هزینه‌ای ثبت نشده است
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {activeAccount
              ? `برای کارت «${activeAccount.name}» در این ماه تراکنش هزینه‌ای وجود ندارد.`
              : 'پس از ثبت هزینه‌ها یا چسباندن پیامک بانکی، گزارش دسته‌بندی‌شده این‌جا نمایش داده می‌شود.'}
          </p>
        </div>
      )}

      {/* Footer Quick Jump to Transactions */}
      {onOpenTransactions && (
        <button
          type="button"
          onClick={() => onOpenTransactions(selectedAccountId)}
          className="mt-5 h-11 rounded-2xl bg-surface border border-line hover:border-lineStrong text-xs font-bold text-sky flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
        >
          <ArrowUpLeft size={15} />
          <span>
            {activeAccount
              ? `مشاهده گردش حساب ${activeAccount.name}`
              : 'مشاهده همه تراکنش‌ها'}
          </span>
        </button>
      )}

      {/* Transaction Details & Delete Dialog */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-bold text-white">جزئیات تراکنش</h3>
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-center py-2">
              <div className="text-2xl font-black text-white dir-ltr">
                {hidden ? Money.HIDDEN : `${Money.toman(selectedTxn.amount)} تومان`}
              </div>
              {!hidden && (
                <div className="text-xs text-muted mt-1">
                  {Money.amountWords(selectedTxn.amount)}
                </div>
              )}
            </div>

            <div className="bg-surface rounded-2xl p-3 text-xs space-y-2 text-white/90">
              <div className="flex justify-between">
                <span className="text-muted">عنوان:</span>
                <span className="font-semibold">{selectedTxn.title || 'بدون عنوان'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">حساب:</span>
                <span>{selectedTxn.accountName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">دسته‌بندی:</span>
                <span>{selectedTxn.categoryName || 'بدون دسته'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">تاریخ و زمان:</span>
                <span>{Jalali.longDate(selectedTxn.occurredAt)} · {Jalali.time(selectedTxn.occurredAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">منبع ثبت:</span>
                <span>{selectedTxn.source === 'SMS' ? 'پیامک بانکی' : 'دستی'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDeleteTxn(selectedTxn.id!)}
              className="w-full h-11 rounded-xl bg-bad/15 text-bad hover:bg-bad/20 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 size={16} />
              حذف این تراکنش
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
