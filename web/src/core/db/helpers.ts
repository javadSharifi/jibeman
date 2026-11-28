import Dexie from 'dexie';
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
        if (t.type === 'INCOME' || t.type === 'ADJUST' || t.type === 'DEBT' || t.type === 'INVESTMENT_IN') {
          balance += t.amount;
        } else if (t.type === 'EXPENSE' || t.type === 'TRANSFER' || t.type === 'INVESTMENT_OUT') {
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

export async function getPersonHoldTxnIds(): Promise<Set<number>> {
  const [commitments, payments] = await Promise.all([
    db.savingsCommitments.toArray(),
    db.savingsPayments.toArray(),
  ]);
  const holdCommitmentIds = new Set<number>();
  const txnIds = new Set<number>();

  for (const c of commitments) {
    if (c.kind === 'PERSON_HOLD') {
      if (c.id != null) holdCommitmentIds.add(c.id);
      if (c.txnId != null) txnIds.add(c.txnId);
    }
  }
  for (const p of payments) {
    if (holdCommitmentIds.has(p.commitmentId) && p.txnId != null) {
      txnIds.add(p.txnId);
    }
  }
  return txnIds;
}

export async function getActiveInvestmentLinkedTxnIds(): Promise<Set<number>> {
  const links = await db.cashLinks.where('status').equals('ACTIVE').toArray();
  const ids = new Set<number>();
  for (const link of links) {
    if (link.bankTxnId != null) ids.add(link.bankTxnId);
  }
  return ids;
}

export async function getMonthTotals(year: number, month: number): Promise<{ income: number; expense: number }> {
  const [start, end] = Jalali.monthRange(year, month);
  const [txns, personHoldTxnIds, investmentLinkedTxnIds] = await Promise.all([
    db.txns.where('occurredAt').between(start, end, true, false).toArray(),
    getPersonHoldTxnIds(),
    getActiveInvestmentLinkedTxnIds(),
  ]);
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.id != null && (personHoldTxnIds.has(t.id) || investmentLinkedTxnIds.has(t.id))) continue;
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

      const hasValidTxn = (i: Installment) => i.paidTxnId != null && existingPayments.has(i.paidTxnId);
      const txnPaidNs = new Set(existingInsts.filter(hasValidTxn).map(i => i.n));

      // Delete all installments not backed by an active payment transaction so
      // unmarking historical paid installments or updating dates/amounts persists.
      const editableIds = existingInsts.filter(i => !hasValidTxn(i)).flatMap(i => i.id == null ? [] : [i.id]);
      if (editableIds.length > 0) {
        await db.installments.bulkDelete(editableIds);
      }

      const toInsert: Omit<Installment, 'id'>[] = [];
      for (const item of newSchedule) {
        if (txnPaidNs.has(item.n)) continue;
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

export async function deleteLoan(loanId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.loans, db.installments, db.savingsCommitments, db.savingsPayments, db.outbox],
    async () => {
      await db.installments.where('loanId').equals(loanId).delete();
      const reserves = await db.savingsCommitments
        .filter(c => c.kind === 'LOAN_RESERVE' && c.loanId === loanId)
        .toArray();
      for (const r of reserves) {
        if (r.id != null) {
          await db.savingsPayments.where('commitmentId').equals(r.id).delete();
          await db.savingsCommitments.delete(r.id);
        }
      }
      await db.loans.delete(loanId);
    }
  );
}

export async function unmarkHistoricalInstallment(installmentId: number): Promise<void> {
  await db.installments.update(installmentId, { paidAt: undefined });
}

export async function payLoanInstallment(installmentId: number, accountId: number): Promise<void> {
  await db.transaction('rw', [db.loans, db.installments, db.accounts, db.txns, db.savingsCommitments, db.savingsPayments, db.outbox], async () => {
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

    if (account.isSavings) {
      const instJ = Jalali.of(installment.dueAt);
      const reserves = (await db.savingsCommitments.where('accountId').equals(accountId).toArray())
        .filter(c => c.kind === 'LOAN_RESERVE' && c.loanId === installment.loanId && (c.paidAmount || 0) < c.amount)
        .sort((a, b) => {
          const aExact = a.targetYear === instJ.y && a.targetMonth === instJ.m ? 0 : 1;
          const bExact = b.targetYear === instJ.y && b.targetMonth === instJ.m ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;
          return a.createdAt - b.createdAt;
        });

      let rem = installment.amount;
      for (const c of reserves) {
        if (rem <= 0) break;
        const available = c.amount - (c.paidAmount || 0);
        const consume = Math.min(rem, available);
        await db.savingsCommitments.update(c.id!, {
          paidAmount: (c.paidAmount || 0) + consume,
        });
        await db.savingsPayments.add({
          commitmentId: c.id!,
          amount: consume,
          at: now,
          txnId: paidTxnId,
        });
        rem -= consume;
      }
    }
  });
}

export async function deleteTxnWithInstallmentLink(txnId: number): Promise<void> {
  await db.transaction('rw', [db.installments, db.txns, db.savingsCommitments, db.savingsPayments, db.cashLinks, db.outbox], async () => {
    await db.installments.where('paidTxnId').equals(txnId).modify({ paidTxnId: undefined });

    // If a CashLink referenced this bank transaction, mark it NEEDS_RELINK so the ledger stays intact
    const linkedCashLinks = await db.cashLinks.where('bankTxnId').equals(txnId).toArray();
    for (const link of linkedCashLinks) {
      if (link.status === 'ACTIVE') {
        await db.cashLinks.update(link.id, {
          bankTxnId: undefined,
          status: 'NEEDS_RELINK',
          updatedAt: Date.now(),
        });
      }
    }

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

    // If it was a withdrawal or earmarked deposit transaction, delete the commitment and its payments
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

export function isWithdrawalCommitment(c: Pick<SavingsCommitment, 'kind'>): boolean {
  return !c.kind || c.kind === 'WITHDRAWAL';
}

export async function getSavingsCommitments(accountId: number): Promise<SavingsCommitmentWithRemaining[]> {
  const commitments = (await db.savingsCommitments.where('accountId').equals(accountId).reverse().sortBy('createdAt'))
    .filter(isWithdrawalCommitment);
  return commitments.map(c => ({
    ...c,
    remaining: Math.max(0, c.amount - (c.paidAmount || 0)),
  }));
}

export async function getSavingsReturnableBalance(accountId: number): Promise<number> {
  const commitments = (await db.savingsCommitments.where('accountId').equals(accountId).toArray())
    .filter(isWithdrawalCommitment);
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
      if (c && isWithdrawalCommitment(c)) {
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
      const open = all.filter(c => isWithdrawalCommitment(c) && (c.paidAmount || 0) < c.amount);
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

export interface LoanReserveTarget {
  loanId: number;
  loanTitle: string;
  lender?: string;
  targetYear: number;
  targetMonth: number;
  inCurrentMonth: boolean;
  installmentCount: number;
  dueAmount: number; // rial (unpaid installments in target month, or next unpaid)
  reservedAmount: number; // rial already reserved for this loan & target month
  neededAmount: number; // max(0, dueAmount - reservedAmount)
  nextDueAt: number;
}

export async function getLoanReserveTargets(year: number, month: number): Promise<LoanReserveTarget[]> {
  const [monthStart, monthEnd] = Jalali.monthRange(year, month);
  const [allLoans, allInsts, allCommitments, allAccs] = await Promise.all([
    db.loans.toArray(),
    db.installments.toArray(),
    db.savingsCommitments.toArray(),
    db.accounts.toArray(),
  ]);

  const activeSavingsIds = new Set(
    allAccs.filter(a => !a.archived && a.isSavings && a.id != null).map(a => a.id!)
  );
  const isInstPaid = (i: Installment) => i.paidTxnId != null || i.paidAt != null;

  const reservedFor = (loanId: number, y: number, m: number) =>
    allCommitments
      .filter(
        c =>
          c.kind === 'LOAN_RESERVE' &&
          activeSavingsIds.has(c.accountId) &&
          c.loanId === loanId &&
          c.targetYear === y &&
          c.targetMonth === m
      )
      .reduce((sum, c) => sum + Math.max(0, c.amount - (c.paidAmount || 0)), 0);

  const targets: LoanReserveTarget[] = [];

  for (const loan of allLoans) {
    if (loan.id == null) continue;
    const unpaid = allInsts
      .filter(i => i.loanId === loan.id && !isInstPaid(i))
      .sort((a, b) => a.dueAt - b.dueAt);
    if (unpaid.length === 0) continue;

    const thisMonthUnpaid = unpaid.filter(i => i.dueAt >= monthStart && i.dueAt < monthEnd);
    if (thisMonthUnpaid.length > 0) {
      const dueAmount = thisMonthUnpaid.reduce((sum, i) => sum + i.amount, 0);
      const reservedAmount = reservedFor(loan.id, year, month);
      targets.push({
        loanId: loan.id,
        loanTitle: loan.title,
        lender: loan.lender,
        targetYear: year,
        targetMonth: month,
        inCurrentMonth: true,
        installmentCount: thisMonthUnpaid.length,
        dueAmount,
        reservedAmount,
        neededAmount: Math.max(0, dueAmount - reservedAmount),
        nextDueAt: thisMonthUnpaid[0].dueAt,
      });
    } else {
      const next = unpaid[0];
      const nextJ = Jalali.of(next.dueAt);
      const sameMonthUnpaid = unpaid.filter(i => {
        const ij = Jalali.of(i.dueAt);
        return ij.y === nextJ.y && ij.m === nextJ.m;
      });
      const dueAmount = sameMonthUnpaid.reduce((sum, i) => sum + i.amount, 0);
      const reservedAmount = reservedFor(loan.id, nextJ.y, nextJ.m);
      targets.push({
        loanId: loan.id,
        loanTitle: loan.title,
        lender: loan.lender,
        targetYear: nextJ.y,
        targetMonth: nextJ.m,
        inCurrentMonth: false,
        installmentCount: sameMonthUnpaid.length,
        dueAmount,
        reservedAmount,
        neededAmount: Math.max(0, dueAmount - reservedAmount),
        nextDueAt: next.dueAt,
      });
    }
  }

  return targets.sort((a, b) => {
    if (a.inCurrentMonth !== b.inCurrentMonth) return a.inCurrentMonth ? -1 : 1;
    return a.nextDueAt - b.nextDueAt;
  });
}

export interface SavingsAccountEarmarks {
  loanReserves: SavingsCommitmentWithRemaining[];
  personHolds: SavingsCommitmentWithRemaining[];
  loanReservedTotal: number;
  personHoldTotal: number;
  totalEarmarked: number;
}

export async function getSavingsAccountEarmarks(accountId?: number): Promise<SavingsAccountEarmarks> {
  const rows = accountId != null
    ? await db.savingsCommitments.where('accountId').equals(accountId).reverse().sortBy('createdAt')
    : await db.savingsCommitments.reverse().sortBy('createdAt');

  const activeSavingsIds = accountId != null
    ? new Set([accountId])
    : new Set((await db.accounts.filter(a => !a.archived && Boolean(a.isSavings)).toArray()).map(a => a.id!));

  const loanReserves: SavingsCommitmentWithRemaining[] = [];
  const personHolds: SavingsCommitmentWithRemaining[] = [];

  for (const r of rows) {
    if (!activeSavingsIds.has(r.accountId)) continue;
    const remaining = Math.max(0, r.amount - (r.paidAmount || 0));
    if (r.kind === 'LOAN_RESERVE') {
      loanReserves.push({ ...r, remaining });
    } else if (r.kind === 'PERSON_HOLD') {
      personHolds.push({ ...r, remaining });
    }
  }

  const loanReservedTotal = loanReserves.reduce((s, r) => s + r.remaining, 0);
  const personHoldTotal = personHolds.reduce((s, r) => s + r.remaining, 0);

  return {
    loanReserves,
    personHolds,
    loanReservedTotal,
    personHoldTotal,
    totalEarmarked: loanReservedTotal + personHoldTotal,
  };
}

export type DepositPurpose = 'SAVINGS' | 'LOAN_RESERVE' | 'PERSON_HOLD';

export interface LoanAllocationInput {
  loanId: number;
  loanTitle: string;
  targetYear: number;
  targetMonth: number;
  amountRial: number;
}

export interface SavingsDepositAllocation {
  purpose: DepositPurpose;
  personName: string;
  personId?: number;
  note?: string;
  loanAllocations: LoanAllocationInput[];
}

export async function saveSavingsDepositAllocations(options: {
  accountId: number;
  txnId: number;
  amountRial: number;
  allocation: SavingsDepositAllocation;
  now?: number;
}): Promise<void> {
  const { accountId, txnId, amountRial, allocation } = options;
  const now = options.now ?? Date.now();
  if (allocation.purpose === 'SAVINGS' || amountRial <= 0) return;

  const write = async () => {
    if (allocation.purpose === 'PERSON_HOLD') {
      const cleanName = allocation.personName.trim();
      if (!cleanName) return;
      await db.savingsCommitments.add({
        accountId,
        txnId,
        amount: amountRial,
        paidAmount: 0,
        kind: 'PERSON_HOLD',
        personId: allocation.personId,
        personName: cleanName,
        note: allocation.note?.trim() || `امانت ${cleanName}`,
        createdAt: now,
      });
      return;
    }

    if (allocation.purpose === 'LOAN_RESERVE') {
      const validItems = allocation.loanAllocations.filter(item => item.amountRial > 0);
      if (validItems.length === 0) return;
      await db.savingsCommitments.bulkAdd(
        validItems.map(item => ({
          accountId,
          txnId,
          amount: item.amountRial,
          paidAmount: 0,
          kind: 'LOAN_RESERVE' as const,
          loanId: item.loanId,
          targetYear: item.targetYear,
          targetMonth: item.targetMonth,
          note: `ذخیره وام · ${item.loanTitle} (${Jalali.monthTitle(item.targetYear, item.targetMonth)})`,
          createdAt: now,
        }))
      );
    }
  };

  if (Dexie.currentTransaction) {
    await write();
  } else {
    await db.transaction('rw', [db.savingsCommitments, db.outbox], write);
  }
}

export async function releaseSavingsEarmark(options: {
  commitmentId: number;
  amountRial?: number;
  outgoingTxn?: {
    type: 'EXPENSE' | 'TRANSFER';
    toAccountId?: number;
    note?: string;
  };
}): Promise<void> {
  const { commitmentId, amountRial, outgoingTxn } = options;
  await db.transaction('rw', [db.savingsCommitments, db.savingsPayments, db.txns, db.outbox], async () => {
    const c = await db.savingsCommitments.get(commitmentId);
    if (!c) return;
    const available = Math.max(0, c.amount - (c.paidAmount || 0));
    if (available <= 0) return;
    const releaseAmt = amountRial != null ? Math.min(available, Math.max(0, amountRial)) : available;
    if (releaseAmt <= 0) return;

    const now = Date.now();
    let txnId: number | undefined;
    if (outgoingTxn) {
      const isPersonHoldWithdrawal = c.kind === 'PERSON_HOLD' && outgoingTxn.type === 'EXPENSE';
      txnId = await db.txns.add({
        type: isPersonHoldWithdrawal ? 'DEBT' : outgoingTxn.type,
        amount: isPersonHoldWithdrawal ? -releaseAmt : releaseAmt,
        accountId: c.accountId,
        toAccountId: outgoingTxn.type === 'TRANSFER' ? outgoingTxn.toAccountId : undefined,
        title: outgoingTxn.note || c.note || (c.kind === 'PERSON_HOLD' ? `بازگشت امانت ${c.personName || ''}`.trim() : 'برداشت ذخیره وام'),
        occurredAt: now,
        source: 'MANUAL',
        createdAt: now,
      });
    }

    await db.savingsCommitments.update(commitmentId, {
      paidAmount: (c.paidAmount || 0) + releaseAmt,
    });

    if (txnId != null) {
      await db.savingsPayments.add({
        commitmentId,
        amount: releaseAmt,
        at: now,
        txnId,
      });
    }
  });
}

export async function computeAccountBalanceInTx(
  accountId: number,
  initialBalance: number
): Promise<{ balance: number; hasTxns: boolean }> {
  const [fromTxns, toTxns] = await Promise.all([
    db.txns.where('accountId').equals(accountId).toArray(),
    db.txns.where('toAccountId').equals(accountId).toArray(),
  ]);
  let balance = initialBalance;
  for (const t of fromTxns) {
    if (t.type === 'INCOME' || t.type === 'ADJUST' || t.type === 'DEBT' || t.type === 'INVESTMENT_IN') {
      balance += t.amount;
    } else if (t.type === 'EXPENSE' || t.type === 'TRANSFER' || t.type === 'INVESTMENT_OUT') {
      balance -= t.amount;
    }
  }
  for (const t of toTxns) {
    if (t.type === 'TRANSFER') {
      balance += t.amount;
    }
  }
  return { balance, hasTxns: fromTxns.length > 0 || toTxns.length > 0 };
}

export async function syncAccountPersonHoldInTx(options: {
  accountId: number;
  targetHoldRial: number;
  personName?: string;
  personId?: number;
  now?: number;
}): Promise<void> {
  const { accountId, targetHoldRial, personName, personId } = options;
  const now = options.now ?? Date.now();
  const cleanName = personName?.trim() || '';
  const allRows = await db.savingsCommitments.where('accountId').equals(accountId).toArray();
  const activeHolds = allRows
    .filter(c => c.kind === 'PERSON_HOLD')
    .map(c => ({ ...c, remaining: Math.max(0, c.amount - (c.paidAmount || 0)) }))
    .filter(c => c.remaining > 0);

  const currentHold = activeHolds.reduce((s, c) => s + c.remaining, 0);

  if (targetHoldRial > currentHold) {
    const delta = targetHoldRial - currentHold;
    const match = activeHolds.find(
      c => c.txnId == null && (c.personName || '').trim() === cleanName
    );
    if (match?.id != null) {
      await db.savingsCommitments.update(match.id, {
        amount: match.amount + delta,
        personId: cleanName ? personId : undefined,
        personName: cleanName || undefined,
        note: cleanName ? `امانت ${cleanName}` : 'امانت موجودی کارت',
      });
    } else {
      await db.savingsCommitments.add({
        accountId,
        amount: delta,
        paidAmount: 0,
        kind: 'PERSON_HOLD',
        personId: cleanName ? personId : undefined,
        personName: cleanName || undefined,
        note: cleanName ? `امانت ${cleanName}` : 'امانت موجودی کارت',
        createdAt: now,
      });
    }
    return;
  }

  if (targetHoldRial < currentHold) {
    let reduceBy = currentHold - targetHoldRial;
    const prioritized = [...activeHolds].sort((a, b) => {
      const aCardLevel = a.txnId == null ? 0 : 1;
      const bCardLevel = b.txnId == null ? 0 : 1;
      if (aCardLevel !== bCardLevel) return aCardLevel - bCardLevel;
      return b.createdAt - a.createdAt;
    });

    for (const c of prioritized) {
      if (reduceBy <= 0 || c.id == null) break;
      const take = Math.min(reduceBy, c.remaining);
      if (c.txnId == null && (c.paidAmount || 0) === 0) {
        if (take >= c.amount) {
          await db.savingsCommitments.delete(c.id);
        } else {
          await db.savingsCommitments.update(c.id, { amount: c.amount - take });
        }
      } else {
        await db.savingsCommitments.update(c.id, {
          paidAmount: (c.paidAmount || 0) + take,
        });
      }
      reduceBy -= take;
    }
    return;
  }

  if (targetHoldRial > 0 && activeHolds.length === 1 && activeHolds[0].txnId == null && activeHolds[0].id != null) {
    const existing = activeHolds[0];
    if ((existing.personName || '').trim() !== cleanName) {
      await db.savingsCommitments.update(existing.id!, {
        personId: cleanName ? personId : undefined,
        personName: cleanName || undefined,
        note: cleanName ? `امانت ${cleanName}` : 'امانت موجودی کارت',
      });
    }
  }
}
