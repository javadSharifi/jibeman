import { db, type Account, type Txn, type Category, type Card, type Loan, type Installment, type SavingsCommitment, type SavingsPayment } from './index';
import { Jalali } from '../jalali';
import { revealRows } from './protectedRows';

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
  const cards = await revealRows('cards', await db.cards.toArray());
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

export interface ScheduleItemInput {
  n: number;
  dueAt: number;
  amount: number;
  paidAt?: number;
}

export function generateSchedule(
  firstDueAt: number,
  count: number,
  defaultAmount: number
): ScheduleItemInput[] {
  const startJ = Jalali.of(firstDueAt);
  const items: ScheduleItemInput[] = [];

  for (let i = 0; i < count; i++) {
    const totalMonths = (startJ.m - 1) + i;
    const y = startJ.y + Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    const maxD = Jalali.monthDays(y, m);
    const dueAt = Jalali.millis(y, m, Math.min(startJ.d, maxD));
    items.push({
      n: i + 1,
      dueAt,
      amount: defaultAmount,
    });
  }
  return items;
}

export async function createLoanWithSchedule(
  loan: Omit<Loan, 'id' | 'createdAt'>,
  receivedIntoAccountId?: number,
  customInstallments?: ScheduleItemInput[]
): Promise<number> {
  return db.transaction('rw', [db.loans, db.installments, db.accounts, db.txns, db.outbox], async () => {
    if (receivedIntoAccountId != null) {
      const account = await db.accounts.get(receivedIntoAccountId);
      if (!account || account.archived) throw new Error('Receiving account unavailable');
    }
    return insertLoanWithSchedule(loan, receivedIntoAccountId, customInstallments);
  });
}

async function insertLoanWithSchedule(
  loan: Omit<Loan, 'id' | 'createdAt'>,
  receivedIntoAccountId?: number,
  customInstallments?: ScheduleItemInput[]
): Promise<number> {
  const loanId = await db.loans.add({
    ...loan,
    createdAt: Date.now(),
  });

  const schedule = customInstallments && customInstallments.length > 0
    ? customInstallments
    : generateSchedule(loan.firstDueAt, loan.count, loan.installment);

  const installments: Omit<Installment, 'id'>[] = schedule.map(item => ({
    loanId,
    n: item.n,
    dueAt: item.dueAt,
    amount: item.amount,
    paidAt: item.paidAt,
  }));
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

export async function updateLoanWithSchedule(
  loanId: number,
  loanUpdate: Partial<Omit<Loan, 'id' | 'createdAt'>>,
  newSchedule?: ScheduleItemInput[]
): Promise<void> {
  return db.transaction('rw', [db.loans, db.installments, db.txns, db.outbox], async () => {
    const existingLoan = await db.loans.get(loanId);
    if (!existingLoan) throw new Error('Loan not found');
    await db.loans.update(loanId, loanUpdate);

    if (newSchedule && newSchedule.length > 0) {
      const existingInsts = await db.installments.where('loanId').equals(loanId).toArray();
      const paymentIds = existingInsts.flatMap(i => i.paidTxnId == null ? [] : [i.paidTxnId]);
      const payments = await db.txns.bulkGet(paymentIds);
      const existingPayments = new Set(payments.flatMap(txn => txn?.id == null ? [] : [txn.id]));

      const isPaid = (i: Installment) => (i.paidTxnId != null && existingPayments.has(i.paidTxnId)) || i.paidAt != null;
      const paidInsts = existingInsts.filter(isPaid);
      const paidNs = new Set(paidInsts.map(i => i.n));

      // Delete only unpaid installments
      const unpaidIds = existingInsts.filter(i => !isPaid(i)).flatMap(i => i.id == null ? [] : [i.id]);
      if (unpaidIds.length > 0) {
        await db.installments.bulkDelete(unpaidIds);
      }

      // Insert new installments for ns not in paidNs
      const toInsert: Omit<Installment, 'id'>[] = [];
      for (const item of newSchedule) {
        if (paidNs.has(item.n)) continue;
        toInsert.push({
          loanId,
          n: item.n,
          dueAt: item.dueAt,
          amount: item.amount,
          paidAt: item.paidAt,
        });
      }
      if (toInsert.length > 0) {
        await db.installments.bulkAdd(toInsert);
      }
    }
  });
}

export async function unmarkHistoricalInstallment(installmentId: number): Promise<void> {
  await db.installments.update(installmentId, { paidAt: undefined });
}

export async function payLoanInstallment(installmentId: number, accountId: number): Promise<void> {
  await db.transaction('rw', [db.loans, db.installments, db.accounts, db.txns, db.outbox], async () => {
    const installment = await db.installments.get(installmentId);
    if (!installment) throw new Error('Installment unavailable');
    if (installment.paidTxnId != null && await db.txns.get(installment.paidTxnId)) return;

    const loan = await db.loans.get(installment.loanId);
    const account = await db.accounts.get(accountId);
    if (!loan || !account || account.archived) throw new Error('Loan or payment account unavailable');

    const now = Date.now();
    const paidTxnId = await db.txns.add({
      type: 'EXPENSE',
      amount: installment.amount,
      accountId,
      title: `قسط ${installment.n} وام · ${loan.title}`,
      occurredAt: now,
      source: 'MANUAL',
      createdAt: now,
    });
    await db.installments.update(installmentId, { paidTxnId });
  });
}

export async function deleteTxnWithInstallmentLink(txnId: number): Promise<void> {
  await db.transaction('rw', [db.installments, db.txns, db.savingsCommitments, db.savingsPayments, db.outbox], async () => {
    await db.installments.where('paidTxnId').equals(txnId).modify({ paidTxnId: undefined });

    // If it was a return repayment transaction, rollback paidAmount on the commitments
    const payments = await db.savingsPayments.where('txnId').equals(txnId).toArray();
    for (const p of payments) {
      const commit = await db.savingsCommitments.get(p.commitmentId);
      if (commit) {
        await db.savingsCommitments.update(p.commitmentId, {
          paidAmount: Math.max(0, (commit.paidAmount || 0) - p.amount),
        });
      }
      await db.savingsPayments.delete(p.id!);
    }

    // If it was a withdrawal transaction, delete the commitment and its payments
    const commitments = await db.savingsCommitments.where('txnId').equals(txnId).toArray();
    for (const c of commitments) {
      await db.savingsPayments.where('commitmentId').equals(c.id!).delete();
      await db.savingsCommitments.delete(c.id!);
    }

    await db.txns.delete(txnId);
  });
}

export interface SavingsCommitmentWithRemaining extends SavingsCommitment {
  remaining: number;
}

export async function getSavingsCommitments(accountId: number): Promise<SavingsCommitmentWithRemaining[]> {
  const commitments = await db.savingsCommitments.where('accountId').equals(accountId).reverse().sortBy('createdAt');
  return commitments.map(c => ({
    ...c,
    remaining: Math.max(0, c.amount - (c.paidAmount || 0)),
  }));
}

export async function getSavingsReturnableBalance(accountId: number): Promise<number> {
  const commitments = await db.savingsCommitments.where('accountId').equals(accountId).toArray();
  return commitments.reduce((acc, c) => acc + Math.max(0, c.amount - (c.paidAmount || 0)), 0);
}

export async function returnToSavings(options: {
  savingsAccountId: number;
  sourceAccountId: number;
  amount: number; // rial
  commitmentId?: number;
  note?: string;
}): Promise<number> {
  const { savingsAccountId, sourceAccountId, amount, commitmentId, note } = options;
  let txnId = 0;
  await db.transaction('rw', [db.txns, db.savingsCommitments, db.savingsPayments, db.outbox], async () => {
    const now = Date.now();
    txnId = await db.txns.add({
      type: 'TRANSFER',
      amount,
      accountId: sourceAccountId,
      toAccountId: savingsAccountId,
      title: note || 'بازگرداندن به پس‌انداز',
      occurredAt: now,
      source: 'MANUAL',
      createdAt: now,
    });

    if (commitmentId) {
      const c = await db.savingsCommitments.get(commitmentId);
      if (c) {
        await db.savingsCommitments.update(commitmentId, {
          paidAmount: (c.paidAmount || 0) + amount,
        });
        await db.savingsPayments.add({
          commitmentId,
          amount,
          at: now,
          txnId,
        });
      }
    } else {
      let rem = amount;
      const all = await db.savingsCommitments.where('accountId').equals(savingsAccountId).sortBy('createdAt');
      const open = all.filter(c => (c.paidAmount || 0) < c.amount);
      for (const c of open) {
        if (rem <= 0) break;
        const needed = c.amount - (c.paidAmount || 0);
        const pay = Math.min(rem, needed);
        await db.savingsCommitments.update(c.id!, {
          paidAmount: (c.paidAmount || 0) + pay,
        });
        await db.savingsPayments.add({
          commitmentId: c.id!,
          amount: pay,
          at: now,
          txnId,
        });
        rem -= pay;
      }
    }
  });
  return txnId;
}
