import React from 'react';
import { CategoryIcon } from './UI';
import { Money } from '../core/money';
import { Jalali } from '../core/jalali';
import type { TxnWithDetails } from '../core/db/helpers';

interface TxnRowProps {
  txn: TxnWithDetails;
  hidden?: boolean;
  onClick?: () => void;
}

export function TxnRow({ txn, hidden = false, onClick }: TxnRowProps) {
  const isIncome = txn.type === 'INCOME';
  const isTransfer = txn.type === 'TRANSFER';
  const isDebt = txn.type === 'DEBT';

  const amountColor = isIncome
    ? 'text-ok'
    : isTransfer
    ? 'text-sky'
    : isDebt
    ? (txn.amount > 0 ? 'text-ok' : 'text-warn')
    : 'text-white';

  const sign = isIncome || (isDebt && txn.amount > 0) ? '+' : isTransfer ? '' : '−';

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
          {txn.title || txn.categoryName || (isTransfer ? 'انتقال وجه' : 'تراکنش')}
        </div>
        <div className="text-[11px] text-muted flex items-center gap-1.5 mt-0.5 truncate">
          {txn.categoryName && <span>{txn.categoryName}</span>}
          {txn.categoryName && <span>·</span>}
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
