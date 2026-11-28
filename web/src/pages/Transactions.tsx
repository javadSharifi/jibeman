import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, ChevronRight, ChevronLeft, Trash2, X } from 'lucide-react';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import {
  deleteTxnWithInstallmentLink,
  getActiveInvestmentLinkedTxnIds,
  getPersonHoldTxnIds,
  getTxnsWithDetails,
  type TxnWithDetails,
} from '../core/db/helpers';
import { TxnRow } from '../components/TxnRow';

interface TransactionsProps {
  hidden: boolean;
  initialAccountId?: number;
}

export function Transactions({ hidden, initialAccountId }: TransactionsProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [selectedTxn, setSelectedTxn] = useState<TxnWithDetails | null>(null);

  const now = Date.now();
  const curJ = Jalali.of(now);
  const [year, setYear] = useState(curJ.y);
  const [month, setMonth] = useState(curJ.m);

  const { txns, personHoldTxnIds, investmentLinkedTxnIds } = useLiveQuery(
    async () => {
      const [from, to] = Jalali.monthRange(year, month);
      const [data, holdIds, invLinkedIds] = await Promise.all([
        getTxnsWithDetails({
          from,
          to,
          accountId: initialAccountId,
          type: filterType && filterType !== 'INVESTMENT' ? filterType : undefined,
          search: search || undefined,
        }),
        getPersonHoldTxnIds(),
        getActiveInvestmentLinkedTxnIds(),
      ]);
      const filteredData =
        filterType === 'INVESTMENT'
          ? data.filter(
              t =>
                t.type === 'INVESTMENT_OUT' ||
                t.type === 'INVESTMENT_IN' ||
                (t.id != null && invLinkedIds.has(t.id))
            )
          : data;
      return {
        txns: filteredData,
        personHoldTxnIds: holdIds,
        investmentLinkedTxnIds: invLinkedIds,
      };
    },
    [year, month, filterType, search, initialAccountId],
    {
      txns: [] as TxnWithDetails[],
      personHoldTxnIds: new Set<number>(),
      investmentLinkedTxnIds: new Set<number>(),
    }
  );

  const prevMonth = () => {
    if (month === 1) {
      setYear(y => y - 1);
      setMonth(12);
    } else {
      setMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(y => y + 1);
      setMonth(1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('آیا از حذف این تراکنش اطمینان دارید؟')) {
      await deleteTxnWithInstallmentLink(id);
      setSelectedTxn(null);
    }
  };

  // Group transactions by day
  const grouped: { [dayKey: string]: { label: string; items: TxnWithDetails[]; net: number } } = {};
  for (const t of txns) {
    const dayStart = Jalali.dayStart(t.occurredAt);
    const dayKey = String(dayStart);
    if (!grouped[dayKey]) {
      grouped[dayKey] = {
        label: Jalali.dayLabel(t.occurredAt),
        items: [],
        net: 0,
      };
    }
    grouped[dayKey].items.push(t);
    const isTrustHold = t.id != null && personHoldTxnIds.has(t.id);
    const isInvestmentLinked = t.id != null && investmentLinkedTxnIds.has(t.id);
    if (!isTrustHold && !isInvestmentLinked) {
      if (t.type === 'INCOME') grouped[dayKey].net += t.amount;
      else if (t.type === 'EXPENSE') grouped[dayKey].net -= t.amount;
    }
  }

  return (
    <div className="flex flex-col pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Month Navigator Header */}
      <div className="flex items-center justify-between bg-surface border border-line rounded-2xl p-2 mb-3">
        <button
          onClick={prevMonth}
          className="w-9 h-9 rounded-xl hover:bg-white/5 flex items-center justify-center text-muted hover:text-white"
        >
          <ChevronRight size={20} />
        </button>
        <div className="text-sm font-extrabold text-white">
          {Jalali.monthTitle(year, month)}
        </div>
        <button
          onClick={nextMonth}
          className="w-9 h-9 rounded-xl hover:bg-white/5 flex items-center justify-center text-muted hover:text-white"
        >
          <ChevronLeft size={20} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="جستجو در تراکنش‌ها..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 pr-10 pl-4 rounded-xl bg-surface border border-line text-white text-xs placeholder:text-muted focus:outline-none focus:border-sky"
        />
        <Search size={16} className="absolute right-3.5 top-3.5 text-muted pointer-events-none" />
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
        {[
          { label: 'همه', val: '' },
          { label: 'هزینه‌ها', val: 'EXPENSE' },
          { label: 'درآمدها', val: 'INCOME' },
          { label: 'سرمایه‌گذاری', val: 'INVESTMENT' },
          { label: 'انتقال‌ها', val: 'TRANSFER' },
          { label: 'امانت و بدهی', val: 'DEBT' },
        ].map(chip => (
          <button
            key={chip.val}
            onClick={() => setFilterType(chip.val)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filterType === chip.val
                ? 'bg-lime text-onLime font-bold shadow'
                : 'bg-surface border border-line text-t2 hover:text-white'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Grouped Txn List */}
      <div className="space-y-4">
        {Object.keys(grouped).length > 0 ? (
          Object.entries(grouped).map(([dayKey, group]) => {
            return (
              <div key={dayKey}>
                <div className="flex items-center justify-between text-[11px] text-muted px-2 mb-1.5">
                  <span>{group.label}</span>
                  <span className={`dir-ltr font-semibold ${group.net >= 0 ? 'text-ok' : 'text-muted'}`}>
                    {hidden ? '•••' : `${Money.toman(group.net, true)} تومان`}
                  </span>
                </div>

                <div className="bg-surface border border-line rounded-[22px] px-3.5 py-1 shadow-sm">
                  {group.items.map(t => (
                    <TxnRow
                      key={t.id}
                      txn={t}
                      hidden={hidden}
                      isTrustHold={t.id != null && personHoldTxnIds.has(t.id)}
                      isInvestmentLinked={t.id != null && investmentLinkedTxnIds.has(t.id)}
                      onClick={() => setSelectedTxn(t)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center text-muted text-xs">
            هیچ تراکنشی در این بازه یافت نشد.
          </div>
        )}
      </div>

      {/* Detail & Delete Dialog */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-bold text-white">جزئیات تراکنش</h3>
              <button
                onClick={() => setSelectedTxn(null)}
                className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-center py-2">
              <div className="text-2xl font-black text-white dir-ltr">
                {Money.toman(Math.abs(selectedTxn.amount))} تومان
              </div>
              <div className="text-xs text-muted mt-1">
                {Money.amountWords(Math.abs(selectedTxn.amount))}
              </div>
            </div>

            <div className="bg-surface rounded-2xl p-3 text-xs space-y-2 text-white/90">
              <div className="flex justify-between">
                <span className="text-muted">عنوان:</span>
                <span className="font-semibold">{selectedTxn.title || 'بدون عنوان'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">نوع:</span>
                <span>
                  {selectedTxn.type === 'INVESTMENT_OUT'
                    ? 'خرید سرمایه‌ای (خروج نقد بدون اثر بر هزینهٔ روزمره)'
                    : selectedTxn.type === 'INVESTMENT_IN'
                    ? 'فروش سرمایه‌ای (ورود نقد بدون اثر بر درآمد روزمره)'
                    : selectedTxn.id != null && investmentLinkedTxnIds.has(selectedTxn.id)
                    ? 'متصل به دفتر سرمایه‌گذاری (خارج از هزینه/درآمد روزمره)'
                    : selectedTxn.type === 'ADJUST'
                    ? 'تعدیل موجودی (بدون اثر بر درآمد و هزینه)'
                    : selectedTxn.type === 'DEBT' || (selectedTxn.id != null && personHoldTxnIds.has(selectedTxn.id))
                    ? (selectedTxn.amount < 0 ? 'بازگشت امانت / پرداخت بدهی' : 'امانت / بدهی (بدون اثر بر درآمد و هزینه)')
                    : selectedTxn.type === 'INCOME'
                      ? 'درآمد'
                      : selectedTxn.type === 'TRANSFER'
                        ? 'انتقال وجه'
                        : 'هزینه'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">حساب:</span>
                <span>{selectedTxn.accountName}</span>
              </div>
              {selectedTxn.categoryName && selectedTxn.type !== 'DEBT' && !(selectedTxn.id != null && personHoldTxnIds.has(selectedTxn.id)) && (
                <div className="flex justify-between">
                  <span className="text-muted">دسته‌بندی:</span>
                  <span>{selectedTxn.categoryName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">تاریخ و زمان:</span>
                <span>{Jalali.shortDateTime(selectedTxn.occurredAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">منبع ثبت:</span>
                <span>{selectedTxn.source === 'SMS' ? 'پیامک بانکی' : 'دستی'}</span>
              </div>
            </div>

            <button
              onClick={() => handleDelete(selectedTxn.id!)}
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
