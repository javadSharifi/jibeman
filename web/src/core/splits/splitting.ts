import type { SplitMethod } from './types';
import {
  RIAL_PRECISION,
  SplitValidationError,
  assertSafeInteger,
  assertValidNonNegativeRial10,
  assertValidPositiveRial10,
} from './validation';

export interface ComputedShare {
  memberId: number;
  amount: number;
}

/**
 * Splits `amountRial` equally across `memberIds` at 10-Rial (1-Toman) precision.
 * Uses Largest Remainder allocation with deterministic tie-breaking by ascending `memberId`.
 */
export function computeEqualShares(
  amountRial: number,
  memberIds: readonly number[],
): ComputedShare[] {
  assertValidPositiveRial10(amountRial, 'مبلغ هزینه');
  if (memberIds.length === 0) {
    throw new SplitValidationError('NO_BENEFICIARIES', 'حداقل یک عضو برای تقسیم مساوی لازم است.');
  }

  const sortedIds = [...memberIds].sort((a, b) => a - b);
  for (let i = 0; i < sortedIds.length; i++) {
    assertSafeInteger(sortedIds[i], 'شناسه عضو');
    if (i > 0 && sortedIds[i] === sortedIds[i - 1]) {
      throw new SplitValidationError('DUPLICATE_BENEFICIARY', 'شناسه عضو تکراری در تقسیم مساوی مجاز نیست.');
    }
  }

  const count = sortedIds.length;
  const totalTomans = amountRial / RIAL_PRECISION;
  const baseTomans = Math.floor(totalTomans / count);
  const remainderTomans = totalTomans % count;

  const shares = sortedIds.map((memberId, index) => ({
    memberId,
    amount: (baseTomans + (index < remainderTomans ? 1 : 0)) * RIAL_PRECISION,
  }));

  const sum = shares.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== amountRial) {
    throw new SplitValidationError('SHARE_SUM_INVARIANT', 'خطای محاسبه: مجموع سهم‌ها با مبلغ کل برابر نیست.');
  }
  return shares;
}

/**
 * Validates and normalizes custom exact shares without ever adjusting user inputs.
 */
export function computeCustomShares(
  amountRial: number,
  memberIds: readonly number[],
  customSharesByMemberId: Readonly<Record<number, number>>,
): ComputedShare[] {
  assertValidPositiveRial10(amountRial, 'مبلغ هزینه');
  if (memberIds.length === 0) {
    throw new SplitValidationError('NO_BENEFICIARIES', 'حداقل یک عضو برای تقسیم دلخواه لازم است.');
  }

  const sortedIds = [...memberIds].sort((a, b) => a - b);
  for (let i = 0; i < sortedIds.length; i++) {
    assertSafeInteger(sortedIds[i], 'شناسه عضو');
    if (i > 0 && sortedIds[i] === sortedIds[i - 1]) {
      throw new SplitValidationError('DUPLICATE_BENEFICIARY', 'شناسه عضو تکراری مجاز نیست.');
    }
  }

  let total = 0;
  let positiveCount = 0;
  const shares: ComputedShare[] = [];

  for (const memberId of sortedIds) {
    const share = customSharesByMemberId[memberId];
    if (share === undefined) {
      throw new SplitValidationError('MISSING_CUSTOM_SHARE', 'سهم همه اعضای انتخاب‌شده باید مشخص شود.');
    }
    assertValidNonNegativeRial10(share, 'سهم عضو');
    if (share > 0) positiveCount++;
    total += share;
    assertSafeInteger(total, 'جمع سهم‌ها');
    shares.push({ memberId, amount: share });
  }

  if (positiveCount === 0) {
    throw new SplitValidationError('ALL_ZERO_SHARES', 'حداقل سهم یک عضو باید بیشتر از صفر باشد.');
  }
  if (total !== amountRial) {
    throw new SplitValidationError(
      'CUSTOM_SPLIT_MISMATCH',
      'مجموع سهم‌های دلخواه باید دقیقاً برابر با مبلغ کل هزینه باشد.',
    );
  }

  return shares;
}

export function computeExpenseShares(
  amountRial: number,
  splitMethod: SplitMethod,
  memberIds: readonly number[],
  customSharesByMemberId?: Readonly<Record<number, number>>,
): ComputedShare[] {
  if (splitMethod === 'EQUAL') {
    return computeEqualShares(amountRial, memberIds);
  }
  if (splitMethod === 'CUSTOM') {
    return computeCustomShares(amountRial, memberIds, customSharesByMemberId ?? {});
  }
  throw new SplitValidationError('UNSUPPORTED_SPLIT_METHOD', 'روش تقسیم پشتیبانی نمی‌شود.');
}
