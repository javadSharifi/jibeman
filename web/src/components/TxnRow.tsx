import React from 'react';
import { CategoryIcon } from './UI';
import { Money } from '../core/money';
import { Jalali } from '../core/jalali';
import type { TxnWithDetails } from '../core/db/helpers';

interface TxnRowProps {
  txn: TxnWithDetails;
  hidden?: boolean;
  isTrustHold?: boolean;
  isInvestmentLinked?: boolean;
  onClick?: () => void;
}

export function TxnRow({ txn, hidden = false, isTrustHold = false, isInvestmentLinked = false, onClick }: TxnRowProps) {
  const isInvestmentOut = txn.type === 'INVESTMENT_OUT';
  const isInvestmentIn = txn.type === 'INVESTMENT_IN';
  const isInvestment = isInvestmentOut || isInvestmentIn || isInvestmentLinked;
  const isIncome = txn.type === 'INCOME' && !isTrustHold;
  const isTransfer = txn.type === 'TRANSFER';
  const isAdjust = txn.type === 'ADJUST';
  const isDebt = (txn.type === 'DEBT' || isTrustHold) && !isInvestmentOut && !isInvestmentIn;
  const isPositiveDebt = isDebt && (txn.type === 'INCOME' || txn.amount > 0);
  const isPositiveAdjust = isAdjust && txn.amount >= 0;

  const amountColor = isInvestmentIn || isIncome || isPositiveAdjust
    ? 'text-ok'
    : isInvestmentOut || isInvestmentLinked
    ? 'text-amber-300'
    : isTransfer
    ? 'text-sky'
    : isDebt
    ? (isPositiveDebt ? 'text-ok' : 'text-warn')
    : isAdjust
    ? 'text-bad'
    : 'text-white';

  const sign = isInvestmentIn || isIncome || isPositiveDebt || isPositiveAdjust ? '+' : isTransfer ? '' : '−';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="flex items-center gap-3 py-3 border-b border-line last:border-b-0 cursor-pointer active:bg-white/5 transition-colors px-1"
    >
      <CategoryIcon
        icon={txn.categoryIcon}
        colorIdx={txn.categoryColor ?? 10}
        size={20}
      />

      <div className="flex-1 min-w-0 text-right">
        <div className="text-[14px] font-semibold text-white truncate">
          {txn.title || txn.categoryName || (isInvestmentOut ? 'خرید سرمایه‌ای' : isInvestmentIn ? 'فروش سرمایه‌ای' : isTransfer ? 'انتقال وجه' : isAdjust ? 'تعدیل موجودی' : isDebt ? 'امانت / بدهی' : 'تراکنش')}
        </div>
        <div className="text-[11px] text-muted flex items-center gap-1.5 mt-0.5 truncate">
          {isInvestment ? (
            <span className="text-amber-300/90">سرمایه‌گذاری</span>
          ) : isAdjust ? (
            <span className="text-sky/90">تعدیل موجودی</span>
          ) : isDebt ? (
            <span className="text-warn/90">امانت / بدهی</span>
          ) : (
            txn.categoryName && <span>{txn.categoryName}</span>
          )}
          {(isInvestment || isAdjust || isDebt || txn.categoryName) && <span>·</span>}
          <span>{txn.accountName}</span>
          {txn.toAccountName && <span>← {txn.toAccountName}</span>}
          <span>·</span>
          <span>{Jalali.time(txn.occurredAt)}</span>
        </div>
      </div>

      <div className="flex flex-col items-end shrink-0">
        <div className={`text-[14px] font-bold ${amountColor} dir-ltr`}>
          {hidden ? (
            Money.HIDDEN
          ) : (
            <>
              {sign}
              {Money.toman(Math.abs(txn.amount))}
              <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
            </>
          )}
        </div>

        {txn.source === 'SMS' ? (
          <span className="text-[9.5px] px-1.5 py-0.5 rounded-[6px] mt-1 bg-lime/15 text-lime font-medium">
            پیامک
          </span>
        ) : (
          <span className="text-[9.5px] px-1.5 py-0.5 rounded-[6px] mt-1 bg-white/5 text-muted">
            دستی
          </span>
        )}
      </div>
    </div>
  );
}
