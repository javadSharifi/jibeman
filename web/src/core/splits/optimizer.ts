import type { SettlementOptimizationResult, SettlementTransfer } from './types';
import { SplitValidationError, assertSafeInteger } from './validation';

export const EXACT_OPTIMIZATION_LIMIT = 14;

export interface MemberNetInput {
  memberId: number;
  netBalance: number;
}

function greedySettleSubset(entries: readonly MemberNetInput[]): SettlementTransfer[] {
  const creditors = entries
    .filter((e) => e.netBalance > 0)
    .map((e) => ({ memberId: e.memberId, amount: e.netBalance }))
    .sort((a, b) => b.amount - a.amount || a.memberId - b.memberId);

  const debtors = entries
    .filter((e) => e.netBalance < 0)
    .map((e) => ({ memberId: e.memberId, amount: -e.netBalance }))
    .sort((a, b) => b.amount - a.amount || a.memberId - b.memberId);

  const transfers: SettlementTransfer[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    // Re-sort deterministically so the largest current debtor always pays the largest current creditor.
    debtors.sort((a, b) => b.amount - a.amount || a.memberId - b.memberId);
    creditors.sort((a, b) => b.amount - a.amount || a.memberId - b.memberId);

    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);

    transfers.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }

  return transfers;
}

/**
 * Exact minimum-transfer solver for up to 14 non-zero-balance members.
 *
 * Minimizing transfers is equivalent to partitioning the non-zero balances
 * into the maximum number of disjoint zero-sum subsets (each subset of size k
 * resolves in k - 1 transfers, yielding n - maxSubsets total transfers).
 */
function exactOptimize(nonZeroSorted: readonly MemberNetInput[]): SettlementTransfer[] {
  const n = nonZeroSorted.length;
  const totalMasks = 1 << n;
  const maskSum = new Int32Array(totalMasks); // fallback to Float64Array for >2B Rials
  const maskSums = new Array<number>(totalMasks).fill(0);

  for (let mask = 1; mask < totalMasks; mask++) {
    const lsb = mask & -mask;
    const bitIndex = Math.clz32(lsb) ^ 31;
    maskSums[mask] = maskSums[mask ^ lsb] + nonZeroSorted[bitIndex].netBalance;
  }
  void maskSum;

  const dp = new Int16Array(totalMasks);
  const firstSubset = new Int32Array(totalMasks);
  const minimalByLowestBit: number[][] = Array.from({ length: n }, () => []);

  for (let mask = 1; mask < totalMasks; mask++) {
    if (maskSums[mask] !== 0) continue;

    const lsb = mask & -mask;
    const lowestBit = Math.clz32(lsb) ^ 31;
    const candidates = minimalByLowestBit[lowestBit];

    let bestCount = 1;
    let bestSub = mask;

    for (let idx = 0; idx < candidates.length; idx++) {
      const sub = candidates[idx];
      if ((sub & mask) !== sub) continue;
      const rest = mask ^ sub;
      const restCount = dp[rest];
      if (restCount > 0 && 1 + restCount > bestCount) {
        bestCount = 1 + restCount;
        bestSub = sub;
      }
    }

    dp[mask] = bestCount;
    firstSubset[mask] = bestSub;

    // A zero-sum mask that cannot be split into smaller zero-sum subsets is minimal.
    if (bestCount === 1) {
      candidates.push(mask);
    }
  }

  const subsets: MemberNetInput[][] = [];
  let remainingMask = totalMasks - 1;
  while (remainingMask !== 0) {
    const sub = firstSubset[remainingMask];
    if (sub === 0) {
      throw new SplitValidationError('OPTIMIZER_STATE_ERROR', 'خطا در تفکیک زیرمجموعه‌های تسویه.');
    }
    const subsetEntries: MemberNetInput[] = [];
    for (let i = 0; i < n; i++) {
      if ((sub & (1 << i)) !== 0) {
        subsetEntries.push(nonZeroSorted[i]);
      }
    }
    subsets.push(subsetEntries);
    remainingMask ^= sub;
  }

  const transfers: SettlementTransfer[] = [];
  for (const subset of subsets) {
    transfers.push(...greedySettleSubset(subset));
  }

  transfers.sort(
    (a, b) =>
      b.amount - a.amount ||
      a.fromMemberId - b.fromMemberId ||
      a.toMemberId - b.toMemberId,
  );
  return transfers;
}

/**
 * Near-optimal deterministic fallback for groups with more than 14 non-zero members.
 * Performs exact 1-to-1 pair cancellations first, then greedy largest-to-largest matching.
 */
function greedyOptimizeFallback(nonZeroSorted: readonly MemberNetInput[]): SettlementTransfer[] {
  const remaining = new Map<number, number>();
  for (const entry of nonZeroSorted) {
    remaining.set(entry.memberId, entry.netBalance);
  }

  const transfers: SettlementTransfer[] = [];

  // Stage 1: Exact 1-to-1 opposite pairs (deterministic by largest amount, then memberId ASC).
  const creditors = nonZeroSorted
    .filter((e) => e.netBalance > 0)
    .sort((a, b) => b.netBalance - a.netBalance || a.memberId - b.memberId);
  const debtors = nonZeroSorted
    .filter((e) => e.netBalance < 0)
    .sort((a, b) => a.netBalance - b.netBalance || a.memberId - b.memberId);

  for (const c of creditors) {
    if ((remaining.get(c.memberId) ?? 0) <= 0) continue;
    for (const d of debtors) {
      if ((remaining.get(d.memberId) ?? 0) >= 0) continue;
      if (c.netBalance === -d.netBalance) {
        transfers.push({
          fromMemberId: d.memberId,
          toMemberId: c.memberId,
          amount: c.netBalance,
        });
        remaining.set(c.memberId, 0);
        remaining.set(d.memberId, 0);
        break;
      }
    }
  }

  // Stage 2: Greedy min-cash-flow on remaining non-zero balances.
  const leftover: MemberNetInput[] = [];
  for (const [memberId, netBalance] of remaining) {
    if (netBalance !== 0) leftover.push({ memberId, netBalance });
  }
  leftover.sort((a, b) => a.memberId - b.memberId);
  transfers.push(...greedySettleSubset(leftover));

  transfers.sort(
    (a, b) =>
      b.amount - a.amount ||
      a.fromMemberId - b.fromMemberId ||
      a.toMemberId - b.toMemberId,
  );
  return transfers;
}

export function verifyTransfersZeroOut(
  balances: readonly MemberNetInput[],
  transfers: readonly SettlementTransfer[],
): void {
  const map = new Map<number, number>();
  for (const b of balances) {
    map.set(b.memberId, b.netBalance);
  }
  for (const t of transfers) {
    if (t.amount <= 0 || t.fromMemberId === t.toMemberId) {
      throw new SplitValidationError('INVALID_TRANSFER', 'تراکنش تسویه نامعتبر تولید شد.');
    }
    map.set(t.fromMemberId, (map.get(t.fromMemberId) ?? 0) + t.amount);
    map.set(t.toMemberId, (map.get(t.toMemberId) ?? 0) - t.amount);
  }
  for (const [, val] of map) {
    if (val !== 0) {
      throw new SplitValidationError('TRANSFER_IMBALANCE', 'اجرای تسویه‌ها مانده‌ها را صفر نمی‌کند.');
    }
  }
}

export function optimizeSettlements(
  balances: readonly MemberNetInput[],
): SettlementOptimizationResult {
  let sum = 0;
  const nonZero: MemberNetInput[] = [];

  for (const b of balances) {
    assertSafeInteger(b.memberId, 'شناسه عضو');
    assertSafeInteger(b.netBalance, 'مانده عضو');
    sum += b.netBalance;
    if (b.netBalance !== 0) {
      nonZero.push({ memberId: b.memberId, netBalance: b.netBalance });
    }
  }

  if (sum !== 0) {
    throw new SplitValidationError('ZERO_SUM_VIOLATION', 'مجموع مانده اعضای گروه صفر نیست.');
  }

  nonZero.sort((a, b) => a.memberId - b.memberId);

  if (nonZero.length === 0) {
    return {
      mode: 'EXACT',
      isGuaranteedMinimum: true,
      nonZeroMemberCount: 0,
      transfers: [],
    };
  }

  if (nonZero.length <= EXACT_OPTIMIZATION_LIMIT) {
    const transfers = exactOptimize(nonZero);
    verifyTransfersZeroOut(nonZero, transfers);
    return {
      mode: 'EXACT',
      isGuaranteedMinimum: true,
      nonZeroMemberCount: nonZero.length,
      transfers,
    };
  }

  const transfers = greedyOptimizeFallback(nonZero);
  verifyTransfersZeroOut(nonZero, transfers);
  return {
    mode: 'GREEDY',
    isGuaranteedMinimum: false,
    nonZeroMemberCount: nonZero.length,
    transfers,
  };
}
