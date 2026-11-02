import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ClipboardPaste, ArrowDownLeft, ArrowUpRight, ChevronLeft, Plus } from 'lucide-react';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { getAccountsWithBalances, getTxnsWithDetails, getMonthTotals, type AccountWithBalance, type TxnWithDetails } from '../core/db/helpers';
import { BankCard } from '../components/BankCard';
import { TxnRow } from '../components/TxnRow';
import { ActionPill } from '../components/UI';

interface HomeProps {
  hidden: boolean;
  onToggleHidden: () => void;
  onOpenQuickAdd: (type?: 'EXPENSE' | 'INCOME') => void;
  onOpenSmartPaste: () => void;
  onNavigateTab: (tab: number) => void;
  onOpenAccountDetail: (id: number) => void;
}

export function Home({
  hidden,
  onToggleHidden,
  onOpenQuickAdd,
  onOpenSmartPaste,
  onNavigateTab,
  onOpenAccountDetail,
}: HomeProps) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [recentTxns, setRecentTxns] = useState<TxnWithDetails[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0 });

  const now = Date.now();
  const currentJ = Jalali.of(now);

  const loadData = async () => {
    const [accs, txs, tots] = await Promise.all([
      getAccountsWithBalances(),
      getTxnsWithDetails({ limit: 5 }),
      getMonthTotals(currentJ.y, currentJ.m),
    ]);
    setAccounts(accs);
    setRecentTxns(txs);
    setTotals(tots);
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalBalanceRial = accounts.reduce((acc, a) => acc + a.balance, 0);
  const totalBalanceToman = Math.floor(totalBalanceRial / 10);
  const netMonthToman = Math.floor((totals.income - totals.expense) / 10);

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

        {/* Total Balance */}
        <div className="mt-6">
          <span className="text-xs text-white/70 font-medium">موجودی کل دارایی</span>
          <div className="flex items-baseline gap-2 mt-0.5 dir-ltr justify-end">
            <span className="text-[34px] sm:text-[38px] font-black text-white tracking-tight">
              {hidden ? Money.HIDDEN : Money.group(totalBalanceToman)}
            </span>
            <span className="text-sm font-normal text-white/60">تومان</span>
          </div>

          {/* Monthly Net Chip */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
              netMonthToman >= 0 ? 'bg-lime/20 text-lime' : 'bg-bad/20 text-bad'
            }`}>
              {netMonthToman >= 0 ? '+' : ''}
              {hidden ? '•••' : Money.group(netMonthToman)} تومان
              <span className="text-[10px] font-normal opacity-80">(خالص این ماه)</span>
            </span>
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
            {hidden ? Money.HIDDEN : Money.group(Math.floor(totals.income / 10))}
            <span className="text-[10px] text-white/70 font-normal mr-1">تومان</span>
          </div>
          <div className="text-[10px] text-white/70 mt-1">{Jalali.monthTitle(currentJ.y, currentJ.m)}</div>
        </div>

        <div className="rounded-[20px] p-3.5 bg-surface border border-line text-white shadow-sm">
          <div className="text-xs text-muted font-medium">هزینه‌های این ماه</div>
          <div className="text-xl font-black mt-2 dir-ltr text-right text-warn">
            {hidden ? Money.HIDDEN : Money.group(Math.floor(totals.expense / 10))}
            <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
          </div>
          <div className="text-[10px] text-muted mt-1">{Jalali.monthTitle(currentJ.y, currentJ.m)}</div>
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
