import { db, type Account, type Txn, type Category, type Card, type Loan, type Installment } from './index';
import { Jalali } from '../jalali';

export interface AccountWithBalance extends Account {
  balance: number;
  last4?: string;
}

export interface TxnWithDetails extends Txn {
  accountName: string;
  toAccountName?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: number;
}

export async function getAccountsWithBalances(): Promise<AccountWithBalance[]> {
  const accounts = await db.accounts.filter(a => !a.archived).sortBy('sortOrder');
  const cards = await db.cards.toArray();
  const txns = await db.txns.toArray();

  const cardMap = new Map<number, string>();
  for (const c of cards) {
    if (!cardMap.has(c.accountId)) cardMap.set(c.accountId, c.last4);
  }

  return accounts.map(a => {
    let balance = a.initialBalance;
    for (const t of txns) {
      if (t.accountId === a.id) {
        if (t.type === 'INCOME' || t.type === 'ADJUST' || t.type === 'DEBT') {
          balance += t.amount;
        } else if (t.type === 'EXPENSE' || t.type === 'TRANSFER') {
          balance -= t.amount;
        }
      }
      if (t.toAccountId === a.id && t.type === 'TRANSFER') {
        balance += t.amount;
      }
    }
    return {
      ...a,
      balance,
      last4: cardMap.get(a.id!),
    };
  });
}

export async function getTxnsWithDetails(options?: {
  from?: number;
  to?: number;
  accountId?: number;
  type?: string;
  limit?: number;
  search?: string;
}): Promise<TxnWithDetails[]> {
  const [txns, accounts, categories] = await Promise.all([
    db.txns.orderBy('occurredAt').reverse().toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
  ]);

  const accMap = new Map(accounts.map(a => [a.id!, a.name]));
  const catMap = new Map(categories.map(c => [c.id!, c]));

  let filtered = txns;
  if (options?.from !== undefined) {
    filtered = filtered.filter(t => t.occurredAt >= options.from!);
  }
  if (options?.to !== undefined) {
    filtered = filtered.filter(t => t.occurredAt < options.to!);
  }
  if (options?.accountId) {
    filtered = filtered.filter(t => t.accountId === options.accountId || t.toAccountId === options.accountId);
  }
  if (options?.type) {
    filtered = filtered.filter(t => t.type === options.type);
  }
  if (options?.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(t =>
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.note && t.note.toLowerCase().includes(q))
    );
  }
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.map(t => {
    const cat = t.categoryId ? catMap.get(t.categoryId) : undefined;
    return {
      ...t,
      accountName: accMap.get(t.accountId) || 'حساب نامشخص',
      toAccountName: t.toAccountId ? accMap.get(t.toAccountId) : undefined,
      categoryName: cat?.name,
      categoryIcon: cat?.icon,
      categoryColor: cat?.color,
    };
  });
}

export async function getMonthTotals(year: number, month: number): Promise<{ income: number; expense: number }> {
  const [start, end] = Jalali.monthRange(year, month);
  const txns = await db.txns.where('occurredAt').between(start, end, true, false).toArray();
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'INCOME') income += t.amount;
    else if (t.type === 'EXPENSE') expense += t.amount;
  }
  return { income, expense };
}

export async function createLoanWithSchedule(
  loan: Omit<Loan, 'id' | 'createdAt'>,
  receivedIntoAccountId?: number
): Promise<number> {
  const loanId = await db.loans.add({
    ...loan,
    createdAt: Date.now(),
  });

  const installments: Omit<Installment, 'id'>[] = [];
  const startJ = Jalali.of(loan.firstDueAt);

  for (let i = 0; i < loan.count; i++) {
    let m = startJ.m + i;
    let y = startJ.y;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    const dueAt = Jalali.millis(y, m, Math.min(startJ.d, 28));
    installments.push({
      loanId,
      n: i + 1,
      dueAt,
      amount: loan.installment,
    });
  }
  await db.installments.bulkAdd(installments);

  if (receivedIntoAccountId) {
    await db.txns.add({
      type: 'DEBT',
      amount: loan.principal,
      accountId: receivedIntoAccountId,
      title: `دریافت وام · ${loan.title}`,
      occurredAt: Date.now(),
      source: 'MANUAL',
      createdAt: Date.now(),
    });
  }

  return loanId;
}
