import {
  db,
  type SplitAuditLog,
  type SplitExpense,
  type SplitGroup,
  type SplitMember,
  type SplitSettlement,
  type SplitShare,
} from '../db';
import { calculateGroupSummary } from './balances';
import { computeExpenseShares } from './splitting';
import type {
  ExpenseDraftInput,
  GroupFinancialSummary,
  SettlementDraftInput,
  SplitExpenseDomain,
  SplitGroupDomain,
  SplitMemberDomain,
  SplitSettlementDomain,
  SplitShareDomain,
} from './types';
import {
  SplitValidationError,
  validateExpenseDraft,
  validateSettlementDraft,
} from './validation';

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `stl-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function toGroupDomain(g: SplitGroup): SplitGroupDomain {
  const status = g.status ?? (g.closed ? 'CLOSED' : 'OPEN');
  return {
    id: g.id!,
    title: g.title,
    description: g.description,
    eventDate: g.eventDate ?? g.createdAt,
    status,
    closedAt: g.closedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt ?? g.createdAt,
  };
}

function toMemberDomain(m: SplitMember, groupCreatedAt = 0): SplitMemberDomain {
  const role = m.role ?? (m.personId == null ? 'SELF' : 'MEMBER');
  return {
    id: m.id!,
    groupId: m.groupId,
    personId: m.personId,
    displayName: m.displayName ?? (role === 'SELF' ? 'من' : 'عضو'),
    role,
    status: m.status ?? 'ACTIVE',
    joinedAt: m.joinedAt ?? groupCreatedAt,
    archivedAt: m.archivedAt,
    updatedAt: m.updatedAt ?? m.joinedAt ?? groupCreatedAt,
  };
}

function toExpenseDomain(e: SplitExpense): SplitExpenseDomain {
  return {
    id: e.id!,
    groupId: e.groupId,
    title: e.title,
    amount: e.amount,
    payerId: e.payerId,
    splitMethod: e.splitMethod ?? 'EQUAL',
    occurredAt: e.at,
    note: e.note,
    integrityStatus: e.integrityStatus ?? 'VALID',
    reviewReasons: e.reviewReasons,
    isDeleted: e.isDeleted ?? false,
    deletedAt: e.deletedAt,
    legacyPayerId: e.legacyPayerId,
    createdAt: e.createdAt ?? e.at,
    updatedAt: e.updatedAt ?? e.at,
  };
}

function toShareDomain(s: SplitShare, groupId: number): SplitShareDomain {
  return {
    id: s.id!,
    expenseId: s.expenseId,
    groupId: s.groupId ?? groupId,
    memberId: s.memberId,
    amount: s.amount,
    updatedAt: s.updatedAt ?? 0,
  };
}

function toSettlementDomain(s: SplitSettlement): SplitSettlementDomain {
  return {
    id: s.id!,
    groupId: s.groupId,
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    amount: s.amount,
    status: s.status,
    idempotencyKey: s.idempotencyKey,
    settledAt: s.settledAt,
    note: s.note,
    createdAt: s.createdAt,
    reversedAt: s.reversedAt,
    reversalReason: s.reversalReason,
    updatedAt: s.updatedAt,
  };
}

export interface GroupListItem {
  group: SplitGroupDomain;
  activeMemberCount: number;
  totalMemberCount: number;
  summary: GroupFinancialSummary;
}

export interface GroupDetailsData {
  group: SplitGroupDomain;
  members: SplitMemberDomain[];
  expenses: SplitExpenseDomain[];
  shares: SplitShareDomain[];
  settlements: SplitSettlementDomain[];
  auditLogs: SplitAuditLog[];
  summary: GroupFinancialSummary;
}

export interface CreateGroupInput {
  title: string;
  description?: string;
  eventDate?: number;
  contacts?: Array<{ personId: number; displayName: string }>;
  customMemberNames?: string[];
}

export async function createGroup(input: CreateGroupInput): Promise<number> {
  const cleanTitle = input.title.trim().slice(0, 80);
  if (!cleanTitle) {
    throw new SplitValidationError('EMPTY_GROUP_TITLE', 'نام گروه الزامی است.');
  }

  const now = Date.now();
  const eventDate = input.eventDate ?? now;
  const cleanDesc = input.description?.trim() || undefined;

  return db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitAuditLogs],
    async () => {
      const groupId = await db.splitGroups.add({
        title: cleanTitle,
        description: cleanDesc,
        eventDate,
        status: 'OPEN',
        closed: false,
        createdAt: now,
        updatedAt: now,
      });

      await db.splitMembers.add({
        groupId,
        personId: null,
        displayName: 'من',
        role: 'SELF',
        status: 'ACTIVE',
        joinedAt: now,
        updatedAt: now,
      });

      const seenPersonIds = new Set<number>();
      for (const c of input.contacts ?? []) {
        if (seenPersonIds.has(c.personId)) continue;
        seenPersonIds.add(c.personId);
        const name = c.displayName.trim().slice(0, 60);
        if (!name) continue;
        await db.splitMembers.add({
          groupId,
          personId: c.personId,
          displayName: name,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: now,
          updatedAt: now,
        });
      }

      const seenNames = new Set<string>(['من']);
      for (const rawName of input.customMemberNames ?? []) {
        const name = rawName.trim().slice(0, 60);
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        await db.splitMembers.add({
          groupId,
          personId: null,
          displayName: name,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: now,
          updatedAt: now,
        });
      }

      await db.splitAuditLogs.add({
        groupId,
        entityType: 'GROUP',
        entityId: groupId,
        action: 'CREATE',
        summary: `گروه «${cleanTitle}» ساخته شد`,
        at: now,
      });

      return groupId;
    },
  );
}

export async function updateGroup(
  groupId: number,
  input: { title: string; description?: string; eventDate: number },
): Promise<void> {
  const cleanTitle = input.title.trim().slice(0, 80);
  if (!cleanTitle) {
    throw new SplitValidationError('EMPTY_GROUP_TITLE', 'نام گروه الزامی است.');
  }
  const cleanDesc = input.description?.trim() || undefined;
  const now = Date.now();

  await db.transaction('rw', [db.splitGroups, db.splitAuditLogs], async () => {
    const group = await db.splitGroups.get(groupId);
    if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');

    await db.splitGroups.update(groupId, {
      title: cleanTitle,
      description: cleanDesc,
      eventDate: input.eventDate,
      updatedAt: now,
    });

    await db.splitAuditLogs.add({
      groupId,
      entityType: 'GROUP',
      entityId: groupId,
      action: 'UPDATE',
      summary: `مشخصات گروه «${cleanTitle}» ویرایش شد`,
      at: now,
    });
  });
}

export async function closeGroup(groupId: number): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.splitGroups, db.splitAuditLogs], async () => {
    const group = await db.splitGroups.get(groupId);
    if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
    if (group.closed || group.status === 'CLOSED') return;

    await db.splitGroups.update(groupId, {
      status: 'CLOSED',
      closed: true,
      closedAt: now,
      updatedAt: now,
    });

    await db.splitAuditLogs.add({
      groupId,
      entityType: 'GROUP',
      entityId: groupId,
      action: 'CLOSE',
      summary: `گروه «${group.title}» بسته شد`,
      at: now,
    });
  });
}

export async function reopenGroup(groupId: number): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.splitGroups, db.splitAuditLogs], async () => {
    const group = await db.splitGroups.get(groupId);
    if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
    if (!group.closed && group.status !== 'CLOSED') return;

    await db.splitGroups.update(groupId, {
      status: 'OPEN',
      closed: false,
      closedAt: undefined,
      updatedAt: now,
    });

    await db.splitAuditLogs.add({
      groupId,
      entityType: 'GROUP',
      entityId: groupId,
      action: 'REOPEN',
      summary: `گروه «${group.title}» دوباره باز شد`,
      at: now,
    });
  });
}

export async function addMemberToGroup(
  groupId: number,
  input: { personId?: number | null; displayName: string },
): Promise<number> {
  const cleanName = input.displayName.trim().slice(0, 60);
  if (!cleanName) {
    throw new SplitValidationError('EMPTY_MEMBER_NAME', 'نام عضو نمی‌تواند خالی باشد.');
  }
  const now = Date.now();

  return db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitAuditLogs],
    async () => {
      const group = await db.splitGroups.get(groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const existingMembers = await db.splitMembers.where('groupId').equals(groupId).toArray();

      if (input.personId != null) {
        const match = existingMembers.find((m) => m.personId === input.personId);
        if (match && (match.status ?? 'ACTIVE') === 'ACTIVE') {
          throw new SplitValidationError('DUPLICATE_MEMBER', 'این مخاطب در حال حاضر عضو گروه است.');
        }
        if (match && match.id != null) {
          await db.splitMembers.update(match.id, {
            status: 'ACTIVE',
            archivedAt: undefined,
            displayName: cleanName,
            updatedAt: now,
          });
          await db.splitAuditLogs.add({
            groupId,
            entityType: 'MEMBER',
            entityId: match.id,
            action: 'RESTORE',
            summary: `عضویت «${cleanName}» در گروه فعال شد`,
            at: now,
          });
          return match.id;
        }
      } else {
        const dupName = existingMembers.find(
          (m) =>
            (m.status ?? 'ACTIVE') === 'ACTIVE' &&
            (m.displayName ?? '').trim().toLowerCase() === cleanName.toLowerCase(),
        );
        if (dupName) {
          throw new SplitValidationError('DUPLICATE_MEMBER', 'عضوی با این نام در گروه وجود دارد.');
        }
      }

      const memberId = await db.splitMembers.add({
        groupId,
        personId: input.personId ?? null,
        displayName: cleanName,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: now,
        updatedAt: now,
      });

      await db.splitAuditLogs.add({
        groupId,
        entityType: 'MEMBER',
        entityId: memberId,
        action: 'CREATE',
        summary: `«${cleanName}» به گروه اضافه شد`,
        at: now,
      });

      return memberId;
    },
  );
}

export async function archiveMember(groupId: number, memberId: number): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitExpenses, db.splitShares, db.splitSettlements, db.splitAuditLogs],
    async () => {
      const group = await db.splitGroups.get(groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const members = await db.splitMembers.where('groupId').equals(groupId).toArray();
      const target = members.find((m) => m.id === memberId);
      if (!target) throw new SplitValidationError('MEMBER_NOT_FOUND', 'عضو پیدا نشد.');
      if ((target.role ?? (target.personId == null ? 'SELF' : 'MEMBER')) === 'SELF') {
        throw new SplitValidationError('CANNOT_ARCHIVE_SELF', 'خودتان را نمی‌توانید از گروه خارج کنید.');
      }
      if ((target.status ?? 'ACTIVE') === 'ARCHIVED') return;

      const [expenses, settlements] = await Promise.all([
        db.splitExpenses.where('groupId').equals(groupId).toArray(),
        db.splitSettlements.where('groupId').equals(groupId).toArray(),
      ]);
      const expenseIds = expenses.map((e) => e.id!).filter((id) => id != null);
      const shares = expenseIds.length
        ? await db.splitShares.where('expenseId').anyOf(expenseIds).toArray()
        : [];

      const domainGroup = toGroupDomain(group);
      const summary = calculateGroupSummary({
        members: members.map((m) => toMemberDomain(m, domainGroup.createdAt)),
        expenses: expenses.map(toExpenseDomain),
        shares: shares.map((s) => toShareDomain(s, groupId)),
        settlements: settlements.map(toSettlementDomain),
      });

      const memberBal = summary.balanceByMemberId.get(memberId);
      if (memberBal && memberBal.netBalance !== 0) {
        throw new SplitValidationError(
          'MEMBER_HAS_BALANCE',
          'امکان بایگانی عضو با مانده تسویه‌نشده وجود ندارد. ابتدا مانده این عضو را تسویه کنید.',
        );
      }

      const referencedInNeedsReview = expenses.some(
        (e) =>
          !e.isDeleted &&
          e.integrityStatus === 'NEEDS_REVIEW' &&
          (e.payerId === memberId || shares.some((s) => s.expenseId === e.id && s.memberId === memberId)),
      );
      if (referencedInNeedsReview) {
        throw new SplitValidationError(
          'MEMBER_IN_UNRESOLVED_EXPENSE',
          'این عضو در یک هزینه نیازمند بررسی حضور دارد. ابتدا آن هزینه را بررسی کنید.',
        );
      }

      await db.splitMembers.update(memberId, {
        status: 'ARCHIVED',
        archivedAt: now,
        updatedAt: now,
      });

      await db.splitAuditLogs.add({
        groupId,
        entityType: 'MEMBER',
        entityId: memberId,
        action: 'ARCHIVE',
        summary: `«${target.displayName ?? 'عضو'}» بایگانی شد`,
        at: now,
      });
    },
  );
}

export async function restoreMember(groupId: number, memberId: number): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.splitGroups, db.splitMembers, db.splitAuditLogs], async () => {
    const group = await db.splitGroups.get(groupId);
    if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
    if (group.closed || group.status === 'CLOSED') {
      throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
    }

    const member = await db.splitMembers.get(memberId);
    if (!member || member.groupId !== groupId) {
      throw new SplitValidationError('MEMBER_NOT_FOUND', 'عضو پیدا نشد.');
    }
    if ((member.status ?? 'ACTIVE') === 'ACTIVE') return;

    await db.splitMembers.update(memberId, {
      status: 'ACTIVE',
      archivedAt: undefined,
      updatedAt: now,
    });

    await db.splitAuditLogs.add({
      groupId,
      entityType: 'MEMBER',
      entityId: memberId,
      action: 'RESTORE',
      summary: `«${member.displayName ?? 'عضو'}» به حالت فعال بازگردانده شد`,
      at: now,
    });
  });
}

export async function addExpense(groupId: number, draft: ExpenseDraftInput): Promise<number> {
  const now = Date.now();

  return db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitExpenses, db.splitShares, db.splitAuditLogs],
    async () => {
      const group = await db.splitGroups.get(groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const members = await db.splitMembers.where('groupId').equals(groupId).toArray();
      const activeIds = new Set(
        members
          .filter((m) => (m.status ?? 'ACTIVE') === 'ACTIVE' && m.id != null)
          .map((m) => m.id!),
      );

      validateExpenseDraft(draft, activeIds);
      const computedShares = computeExpenseShares(
        draft.amountRial,
        draft.splitMethod,
        draft.beneficiaryIds,
        draft.customSharesByMemberId,
      );

      const cleanTitle = draft.title.trim().slice(0, 80);
      const cleanNote = draft.note?.trim() || undefined;

      const expenseId = await db.splitExpenses.add({
        groupId,
        title: cleanTitle,
        amount: draft.amountRial,
        payerId: draft.payerId,
        at: draft.occurredAt,
        settlement: false,
        splitMethod: draft.splitMethod,
        note: cleanNote,
        integrityStatus: 'VALID',
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });

      await db.splitShares.bulkAdd(
        computedShares.map((s) => ({
          expenseId,
          groupId,
          memberId: s.memberId,
          amount: s.amount,
          updatedAt: now,
        })),
      );

      await db.splitAuditLogs.add({
        groupId,
        entityType: 'EXPENSE',
        entityId: expenseId,
        action: 'CREATE',
        summary: `هزینه «${cleanTitle}» به مبلغ ${draft.amountRial} ریال ثبت شد`,
        at: now,
      });

      return expenseId;
    },
  );
}

export async function updateExpense(expenseId: number, draft: ExpenseDraftInput): Promise<void> {
  const now = Date.now();

  await db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitExpenses, db.splitShares, db.splitAuditLogs],
    async () => {
      const existing = await db.splitExpenses.get(expenseId);
      if (!existing || existing.isDeleted) {
        throw new SplitValidationError('EXPENSE_NOT_FOUND', 'هزینه پیدا نشد.');
      }

      const group = await db.splitGroups.get(existing.groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const members = await db.splitMembers.where('groupId').equals(existing.groupId).toArray();
      const existingShares = await db.splitShares.where('expenseId').equals(expenseId).toArray();

      // Allow active members plus members already attached to this historical expense.
      const allowedIds = new Set<number>(
        members
          .filter((m) => (m.status ?? 'ACTIVE') === 'ACTIVE' && m.id != null)
          .map((m) => m.id!),
      );
      if (members.some((m) => m.id === existing.payerId)) allowedIds.add(existing.payerId);
      for (const s of existingShares) {
        if (members.some((m) => m.id === s.memberId)) allowedIds.add(s.memberId);
      }

      validateExpenseDraft(draft, allowedIds);
      const computedShares = computeExpenseShares(
        draft.amountRial,
        draft.splitMethod,
        draft.beneficiaryIds,
        draft.customSharesByMemberId,
      );

      const cleanTitle = draft.title.trim().slice(0, 80);
      const cleanNote = draft.note?.trim() || undefined;
      const wasNeedsReview = existing.integrityStatus === 'NEEDS_REVIEW';

      const snapshotJson = JSON.stringify({
        title: existing.title,
        amount: existing.amount,
        payerId: existing.payerId,
        splitMethod: existing.splitMethod,
        integrityStatus: existing.integrityStatus,
        shares: existingShares.map((s) => ({ memberId: s.memberId, amount: s.amount })),
      });

      await db.splitShares.where('expenseId').equals(expenseId).delete();
      await db.splitShares.bulkAdd(
        computedShares.map((s) => ({
          expenseId,
          groupId: existing.groupId,
          memberId: s.memberId,
          amount: s.amount,
          updatedAt: now,
        })),
      );

      await db.splitExpenses.update(expenseId, {
        title: cleanTitle,
        amount: draft.amountRial,
        payerId: draft.payerId,
        at: draft.occurredAt,
        settlement: false,
        splitMethod: draft.splitMethod,
        note: cleanNote,
        integrityStatus: 'VALID',
        reviewReasons: undefined,
        updatedAt: now,
      });

      await db.splitAuditLogs.add({
        groupId: existing.groupId,
        entityType: 'EXPENSE',
        entityId: expenseId,
        action: wasNeedsReview ? 'RESOLVE_REVIEW' : 'UPDATE',
        summary: wasNeedsReview
          ? `رکورد ناقص «${cleanTitle}» تکمیل و تایید شد`
          : `هزینه «${cleanTitle}» ویرایش شد`,
        snapshotJson,
        at: now,
      });
    },
  );
}

export async function deleteExpense(expenseId: number): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.splitGroups, db.splitExpenses, db.splitShares, db.splitAuditLogs],
    async () => {
      const existing = await db.splitExpenses.get(expenseId);
      if (!existing || existing.isDeleted) {
        throw new SplitValidationError('EXPENSE_NOT_FOUND', 'هزینه پیدا نشد.');
      }

      const group = await db.splitGroups.get(existing.groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const existingShares = await db.splitShares.where('expenseId').equals(expenseId).toArray();

      await db.splitExpenses.update(expenseId, {
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
      });

      await db.splitAuditLogs.add({
        groupId: existing.groupId,
        entityType: 'EXPENSE',
        entityId: expenseId,
        action: 'DELETE',
        summary: `هزینه «${existing.title}» حذف شد`,
        snapshotJson: JSON.stringify({
          title: existing.title,
          amount: existing.amount,
          payerId: existing.payerId,
          shares: existingShares.map((s) => ({ memberId: s.memberId, amount: s.amount })),
        }),
        at: now,
      });
    },
  );
}

export async function recordSettlement(
  groupId: number,
  draft: SettlementDraftInput,
): Promise<{ settlement: SplitSettlementDomain; deduplicated: boolean }> {
  const now = Date.now();

  return db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitSettlements, db.splitAuditLogs],
    async () => {
      const existingByKey = await db.splitSettlements
        .where('[groupId+idempotencyKey]')
        .equals([groupId, draft.idempotencyKey])
        .first();

      if (existingByKey) {
        return { settlement: toSettlementDomain(existingByKey), deduplicated: true };
      }

      const group = await db.splitGroups.get(groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const members = await db.splitMembers.where('groupId').equals(groupId).toArray();
      const memberIds = new Set(members.map((m) => m.id!).filter((id) => id != null));
      validateSettlementDraft(draft, memberIds);

      const cleanNote = draft.note?.trim() || undefined;
      const newRecord: Omit<SplitSettlement, 'id'> = {
        groupId,
        fromMemberId: draft.fromMemberId,
        toMemberId: draft.toMemberId,
        amount: draft.amountRial,
        status: 'ACTIVE',
        idempotencyKey: draft.idempotencyKey,
        settledAt: draft.settledAt,
        note: cleanNote,
        createdAt: now,
        updatedAt: now,
      };

      const settlementId = await db.splitSettlements.add(newRecord);
      const created = { ...newRecord, id: settlementId };

      const fromName = members.find((m) => m.id === draft.fromMemberId)?.displayName ?? 'عضو';
      const toName = members.find((m) => m.id === draft.toMemberId)?.displayName ?? 'عضو';

      await db.splitAuditLogs.add({
        groupId,
        entityType: 'SETTLEMENT',
        entityId: settlementId,
        action: 'CREATE',
        summary: `تسویه ${fromName} به ${toName} ثبت شد`,
        at: now,
      });

      return { settlement: toSettlementDomain(created), deduplicated: false };
    },
  );
}

export async function reverseSettlement(settlementId: number, reason?: string): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.splitGroups, db.splitMembers, db.splitSettlements, db.splitAuditLogs],
    async () => {
      const existing = await db.splitSettlements.get(settlementId);
      if (!existing) throw new SplitValidationError('SETTLEMENT_NOT_FOUND', 'تسویه پیدا نشد.');
      if (existing.status === 'REVERSED') return;

      const group = await db.splitGroups.get(existing.groupId);
      if (!group) throw new SplitValidationError('GROUP_NOT_FOUND', 'گروه پیدا نشد.');
      if (group.closed || group.status === 'CLOSED') {
        throw new SplitValidationError('GROUP_CLOSED', 'گروه بسته است؛ ابتدا آن را بازگشایی کنید.');
      }

      const cleanReason = reason?.trim() || undefined;
      await db.splitSettlements.update(settlementId, {
        status: 'REVERSED',
        reversedAt: now,
        reversalReason: cleanReason,
        updatedAt: now,
      });

      const members = await db.splitMembers.where('groupId').equals(existing.groupId).toArray();
      const fromName = members.find((m) => m.id === existing.fromMemberId)?.displayName ?? 'عضو';
      const toName = members.find((m) => m.id === existing.toMemberId)?.displayName ?? 'عضو';

      await db.splitAuditLogs.add({
        groupId: existing.groupId,
        entityType: 'SETTLEMENT',
        entityId: settlementId,
        action: 'REVERSE',
        summary: `تسویه ${fromName} به ${toName} برگشت داده شد`,
        snapshotJson: JSON.stringify({ amount: existing.amount, reason: cleanReason }),
        at: now,
      });
    },
  );
}

export async function loadGroupDetails(groupId: number): Promise<GroupDetailsData | null> {
  const group = await db.splitGroups.get(groupId);
  if (!group) return null;

  const [rawMembers, rawExpenses, rawSettlements, rawAuditLogs] = await Promise.all([
    db.splitMembers.where('groupId').equals(groupId).toArray(),
    db.splitExpenses.where('groupId').equals(groupId).toArray(),
    db.splitSettlements.where('groupId').equals(groupId).toArray(),
    db.splitAuditLogs.where('groupId').equals(groupId).reverse().sortBy('at'),
  ]);

  const expenseIds = rawExpenses.map((e) => e.id!).filter((id) => id != null);
  const rawShares = expenseIds.length
    ? await db.splitShares.where('expenseId').anyOf(expenseIds).toArray()
    : [];

  const groupDomain = toGroupDomain(group);
  const members = rawMembers
    .map((m) => toMemberDomain(m, groupDomain.createdAt))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'SELF' ? -1 : 1;
      return a.id - b.id;
    });
  const expenses = rawExpenses
    .map(toExpenseDomain)
    .sort((a, b) => b.occurredAt - a.occurredAt || b.id - a.id);
  const shares = rawShares.map((s) => toShareDomain(s, groupId));
  const settlements = rawSettlements
    .map(toSettlementDomain)
    .sort((a, b) => b.settledAt - a.settledAt || b.id - a.id);

  const summary = calculateGroupSummary({ members, expenses, shares, settlements });

  return {
    group: groupDomain,
    members,
    expenses,
    shares,
    settlements,
    auditLogs: rawAuditLogs,
    summary,
  };
}

export async function listGroupsWithSummaries(): Promise<GroupListItem[]> {
  const [groups, allMembers, allExpenses, allShares, allSettlements] = await Promise.all([
    db.splitGroups.toArray(),
    db.splitMembers.toArray(),
    db.splitExpenses.toArray(),
    db.splitShares.toArray(),
    db.splitSettlements.toArray(),
  ]);

  const items: GroupListItem[] = groups.map((g) => {
    const gId = g.id!;
    const groupDomain = toGroupDomain(g);
    const members = allMembers
      .filter((m) => m.groupId === gId)
      .map((m) => toMemberDomain(m, groupDomain.createdAt));
    const expenses = allExpenses.filter((e) => e.groupId === gId).map(toExpenseDomain);
    const expenseIdSet = new Set(expenses.map((e) => e.id));
    const shares = allShares
      .filter((s) => s.groupId === gId || expenseIdSet.has(s.expenseId))
      .map((s) => toShareDomain(s, gId));
    const settlements = allSettlements.filter((s) => s.groupId === gId).map(toSettlementDomain);

    const summary = calculateGroupSummary({ members, expenses, shares, settlements });
    const activeMemberCount = members.filter((m) => m.status === 'ACTIVE').length;

    return {
      group: groupDomain,
      activeMemberCount: Math.max(1, activeMemberCount),
      totalMemberCount: Math.max(1, members.length),
      summary,
    };
  });

  return items.sort((a, b) => {
    if (a.group.status !== b.group.status) {
      return a.group.status === 'OPEN' ? -1 : 1;
    }
    return b.group.eventDate - a.group.eventDate || b.group.id - a.group.id;
  });
}
