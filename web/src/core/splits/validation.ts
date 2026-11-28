import type { ExpenseDraftInput, SettlementDraftInput } from './types';

export const RIAL_PRECISION = 10; // 1 Toman = 10 Rials

export class SplitValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SplitValidationError';
  }
}

export function assertSafeInteger(value: number, fieldName: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new SplitValidationError('INVALID_INTEGER', `${fieldName} باید عدد صحیح معتبر باشد.`);
  }
}

export function assertValidPositiveRial10(amountRial: number, fieldName = 'مبلغ'): void {
  assertSafeInteger(amountRial, fieldName);
  if (amountRial <= 0) {
    throw new SplitValidationError('NON_POSITIVE_AMOUNT', `${fieldName} باید بیشتر از صفر باشد.`);
  }
  if (amountRial % RIAL_PRECISION !== 0) {
    throw new SplitValidationError(
      'INVALID_PRECISION',
      `${fieldName} باید ضریب صحیحی از تومان (۱۰ ریال) باشد.`,
    );
  }
}

export function assertValidNonNegativeRial10(amountRial: number, fieldName = 'مبلغ'): void {
  assertSafeInteger(amountRial, fieldName);
  if (amountRial < 0) {
    throw new SplitValidationError('NEGATIVE_AMOUNT', `${fieldName} نمی‌تواند منفی باشد.`);
  }
  if (amountRial % RIAL_PRECISION !== 0) {
    throw new SplitValidationError(
      'INVALID_PRECISION',
      `${fieldName} باید ضریب صحیحی از تومان (۱۰ ریال) باشد.`,
    );
  }
}

export function normalizeUniqueMemberIds(memberIds: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of memberIds) {
    assertSafeInteger(id, 'شناسه عضو');
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function validateExpenseDraft(
  input: ExpenseDraftInput,
  validMemberIds: ReadonlySet<number>,
): void {
  if (!input.title || !input.title.trim()) {
    throw new SplitValidationError('EMPTY_TITLE', 'عنوان هزینه الزامی است.');
  }
  assertValidPositiveRial10(input.amountRial, 'مبلغ هزینه');
  assertSafeInteger(input.occurredAt, 'تاریخ هزینه');

  if (!validMemberIds.has(input.payerId)) {
    throw new SplitValidationError('INVALID_PAYER', 'پرداخت‌کننده انتخاب‌شده در گروه معتبر نیست.');
  }

  if (input.beneficiaryIds.length === 0) {
    throw new SplitValidationError('NO_BENEFICIARIES', 'حداقل یک عضو باید در هزینه سهیم باشد.');
  }

  const seen = new Set<number>();
  for (const id of input.beneficiaryIds) {
    assertSafeInteger(id, 'شناسه عضو');
    if (seen.has(id)) {
      throw new SplitValidationError('DUPLICATE_BENEFICIARY', 'عضو تکراری در لیست سهیم‌شدگان وجود دارد.');
    }
    if (!validMemberIds.has(id)) {
      throw new SplitValidationError('INVALID_BENEFICIARY', 'عضو انتخاب‌شده در گروه معتبر نیست.');
    }
    seen.add(id);
  }

  if (input.splitMethod === 'CUSTOM') {
    const shares = input.customSharesByMemberId ?? {};
    let total = 0;
    let positiveCount = 0;

    for (const id of seen) {
      const share = shares[id];
      if (share === undefined) {
        throw new SplitValidationError('MISSING_CUSTOM_SHARE', 'سهم همه اعضای انتخاب‌شده باید مشخص شود.');
      }
      assertValidNonNegativeRial10(share, 'سهم عضو');
      if (share > 0) positiveCount++;
      total += share;
      assertSafeInteger(total, 'جمع سهم‌ها');
    }

    if (positiveCount === 0) {
      throw new SplitValidationError('ALL_ZERO_SHARES', 'حداقل سهم یک عضو باید بیشتر از صفر باشد.');
    }
    if (total !== input.amountRial) {
      throw new SplitValidationError(
        'CUSTOM_SPLIT_MISMATCH',
        'مجموع سهم‌های دلخواه باید دقیقاً برابر با مبلغ کل هزینه باشد.',
      );
    }
  } else if (input.splitMethod !== 'EQUAL') {
    throw new SplitValidationError('UNSUPPORTED_SPLIT_METHOD', 'روش تقسیم پشتیبانی نمی‌شود.');
  }
}

export function validateSettlementDraft(
  input: SettlementDraftInput,
  validMemberIds: ReadonlySet<number>,
): void {
  if (!input.idempotencyKey || !input.idempotencyKey.trim()) {
    throw new SplitValidationError('MISSING_IDEMPOTENCY_KEY', 'کلید یکتای عملیات تسویه الزامی است.');
  }
  assertValidPositiveRial10(input.amountRial, 'مبلغ تسویه');
  assertSafeInteger(input.settledAt, 'تاریخ تسویه');

  if (!validMemberIds.has(input.fromMemberId) || !validMemberIds.has(input.toMemberId)) {
    throw new SplitValidationError('INVALID_SETTLEMENT_MEMBER', 'اعضای تسویه در گروه معتبر نیستند.');
  }
  if (input.fromMemberId === input.toMemberId) {
    throw new SplitValidationError('SELF_SETTLEMENT', 'پرداخت‌کننده و دریافت‌کننده تسویه نمی‌توانند یکسان باشند.');
  }
}
