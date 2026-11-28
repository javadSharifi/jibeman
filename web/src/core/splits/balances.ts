import { optimizeSettlements } from './optimizer';
import type {
  GroupFinancialSummary,
  MemberBalance,
  SplitExpenseDomain,
  SplitMemberDomain,
  SplitSettlementDomain,
  SplitShareDomain,
} from './types';
import { SplitValidationError, assertSafeInteger } from './validation';

export interface GroupLedgerInput {
  members: readonly SplitMemberDomain[];
  expenses: readonly SplitExpenseDomain[];
  shares: readonly SplitShareDomain[];
  settlements: readonly SplitSettlementDomain[];
}

export function calculateGroupSummary(input: GroupLedgerInput): GroupFinancialSummary {
  const memberIds = [...input.members].map((m) => m.id).sort((a, b) => a - b);
  const memberSet = new Set(memberIds);

  const paidByMember = new Map<number, number>();
  const shareByMember = new Map<number, number>();
  const settledOutByMember = new Map<number, number>();
  const settledInByMember = new Map<number, number>();

  for (const id of memberIds) {
    paidByMember.set(id, 0);
    shareByMember.set(id, 0);
    settledOutByMember.set(id, 0);
    settledInByMember.set(id, 0);
  }

  const sharesByExpense = new Map<number, SplitShareDomain[]>();
  for (const s of input.shares) {
    const arr = sharesByExpense.get(s.expenseId) ?? [];
    arr.push(s);
    sharesByExpense.set(s.expenseId, arr);
  }

  let totalExpenses = 0;
  let validExpenseCount = 0;
  let needsReviewCount = 0;
  let needsReviewAmount = 0;

  for (const exp of input.expenses) {
    if (exp.isDeleted) continue;

    assertSafeInteger(exp.amount, 'مبلغ هزینه');
    if (exp.integrityStatus !== 'VALID') {
      needsReviewCount++;
      needsReviewAmount += exp.amount;
      continue;
    }

    if (!memberSet.has(exp.payerId)) {
      needsReviewCount++;
      needsReviewAmount += exp.amount;
      continue;
    }

    const expShares = sharesByExpense.get(exp.id) ?? [];
    const shareSum = expShares.reduce((acc, s) => acc + s.amount, 0);
    const allSharesValid =
      expShares.length > 0 &&
      shareSum === exp.amount &&
      expShares.every((s) => s.amount >= 0 && memberSet.has(s.memberId));

    if (!allSharesValid) {
      needsReviewCount++;
      needsReviewAmount += exp.amount;
      continue;
    }

    validExpenseCount++;
    totalExpenses += exp.amount;
    paidByMember.set(exp.payerId, (paidByMember.get(exp.payerId) ?? 0) + exp.amount);

    for (const s of expShares) {
      shareByMember.set(s.memberId, (shareByMember.get(s.memberId) ?? 0) + s.amount);
    }
  }

  let totalActiveSettlements = 0;
  for (const stl of input.settlements) {
    if (stl.status !== 'ACTIVE') continue;
    assertSafeInteger(stl.amount, 'مبلغ تسویه');
    if (!memberSet.has(stl.fromMemberId) || !memberSet.has(stl.toMemberId)) {
      throw new SplitValidationError('ORPHAN_SETTLEMENT', 'تسویه به عضو نامعتبر اشاره دارد.');
    }
    if (stl.fromMemberId === stl.toMemberId || stl.amount <= 0) {
      throw new SplitValidationError('INVALID_SETTLEMENT', 'رکورد تسویه نامعتبر است.');
    }

    totalActiveSettlements += stl.amount;
    settledOutByMember.set(
      stl.fromMemberId,
      (settledOutByMember.get(stl.fromMemberId) ?? 0) + stl.amount,
    );
    settledInByMember.set(
      stl.toMemberId,
      (settledInByMember.get(stl.toMemberId) ?? 0) + stl.amount,
    );
  }

  const balances: MemberBalance[] = [];
  const balanceByMemberId = new Map<number, MemberBalance>();
  let netSum = 0;
  let totalOutstandingDebt = 0;

  for (const memberId of memberIds) {
    const totalPaid = paidByMember.get(memberId) ?? 0;
    const totalShare = shareByMember.get(memberId) ?? 0;
    const settlementsOut = settledOutByMember.get(memberId) ?? 0;
    const settlementsIn = settledInByMember.get(memberId) ?? 0;
    const netBalance = totalPaid - totalShare + settlementsOut - settlementsIn;

    netSum += netBalance;
    if (netBalance > 0) totalOutstandingDebt += netBalance;

    const status = netBalance > 0 ? 'CREDITOR' : netBalance < 0 ? 'DEBTOR' : 'SETTLED';
    const row: MemberBalance = {
      memberId,
      totalPaid,
      totalShare,
      settlementsOut,
      settlementsIn,
      netBalance,
      status,
    };
    balances.push(row);
    balanceByMemberId.set(memberId, row);
  }

  if (netSum !== 0) {
    throw new SplitValidationError('ZERO_SUM_INVARIANT', 'مجموع مانده اعضای گروه برابر صفر نشد.');
  }

  const optimization = optimizeSettlements(
    balances.map((b) => ({ memberId: b.memberId, netBalance: b.netBalance })),
  );

  return {
    totalExpenses,
    validExpenseCount,
    needsReviewCount,
    needsReviewAmount,
    totalActiveSettlements,
    totalOutstandingDebt,
    isSettled: totalOutstandingDebt === 0 && needsReviewCount === 0,
    balances,
    balanceByMemberId,
    optimization,
  };
}
