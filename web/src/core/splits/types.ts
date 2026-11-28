export type SplitMethod = 'EQUAL' | 'CUSTOM';

export type SplitGroupStatus = 'OPEN' | 'CLOSED';

export type SplitMemberRole = 'SELF' | 'MEMBER';

export type SplitMemberStatus = 'ACTIVE' | 'ARCHIVED';

export type ExpenseIntegrityStatus = 'VALID' | 'NEEDS_REVIEW';

export type SplitSettlementStatus = 'ACTIVE' | 'REVERSED';

export type SplitAuditEntityType = 'GROUP' | 'MEMBER' | 'EXPENSE' | 'SETTLEMENT';

export type SplitAuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'REVERSE'
  | 'CLOSE'
  | 'REOPEN'
  | 'RESOLVE_REVIEW';

export interface SplitGroupDomain {
  id: number;
  title: string;
  description?: string;
  eventDate: number;
  status: SplitGroupStatus;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SplitMemberDomain {
  id: number;
  groupId: number;
  personId?: number | null;
  displayName: string;
  role: SplitMemberRole;
  status: SplitMemberStatus;
  joinedAt: number;
  archivedAt?: number;
  updatedAt: number;
}

export interface SplitExpenseDomain {
  id: number;
  groupId: number;
  title: string;
  amount: number; // integer Rials, multiple of 10
  payerId: number;
  splitMethod: SplitMethod;
  occurredAt: number;
  note?: string;
  integrityStatus: ExpenseIntegrityStatus;
  reviewReasons?: string[];
  isDeleted: boolean;
  deletedAt?: number;
  legacyPayerId?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SplitShareDomain {
  id: number;
  expenseId: number;
  groupId: number;
  memberId: number;
  amount: number; // integer Rials, multiple of 10
  updatedAt: number;
}

export interface SplitSettlementDomain {
  id: number;
  groupId: number;
  fromMemberId: number;
  toMemberId: number;
  amount: number; // integer Rials, multiple of 10
  status: SplitSettlementStatus;
  idempotencyKey: string;
  settledAt: number;
  note?: string;
  createdAt: number;
  reversedAt?: number;
  reversalReason?: string;
  updatedAt: number;
}

export type MemberBalanceStatus = 'CREDITOR' | 'DEBTOR' | 'SETTLED';

export interface MemberBalance {
  memberId: number;
  totalPaid: number;
  totalShare: number;
  settlementsOut: number;
  settlementsIn: number;
  netBalance: number;
  status: MemberBalanceStatus;
}

export interface SettlementTransfer {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
}

export interface SettlementOptimizationResult {
  mode: 'EXACT' | 'GREEDY';
  isGuaranteedMinimum: boolean;
  nonZeroMemberCount: number;
  transfers: SettlementTransfer[];
}

export interface GroupFinancialSummary {
  totalExpenses: number;
  validExpenseCount: number;
  needsReviewCount: number;
  needsReviewAmount: number;
  totalActiveSettlements: number;
  totalOutstandingDebt: number;
  isSettled: boolean;
  balances: MemberBalance[];
  balanceByMemberId: Map<number, MemberBalance>;
  optimization: SettlementOptimizationResult;
}

export interface ExpenseDraftInput {
  title: string;
  amountRial: number;
  payerId: number;
  splitMethod: SplitMethod;
  beneficiaryIds: number[];
  customSharesByMemberId?: Record<number, number>;
  occurredAt: number;
  note?: string;
}

export interface SettlementDraftInput {
  fromMemberId: number;
  toMemberId: number;
  amountRial: number;
  settledAt: number;
  idempotencyKey: string;
  note?: string;
}
