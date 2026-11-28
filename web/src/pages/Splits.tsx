import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import type {
  SettlementTransfer,
  SplitExpenseDomain,
  SplitShareDomain,
} from '../core/splits';
import {
  deleteExpense,
  listGroupsWithSummaries,
  loadGroupDetails,
  reopenGroup,
  type GroupDetailsData,
  type GroupListItem,
} from '../core/splits/splitRepo';
import { ExpenseFormModal } from '../components/splits/ExpenseFormModal';
import { GroupFormModal } from '../components/splits/GroupFormModal';
import { MembersTab } from '../components/splits/MembersTab';
import { SettlementFormModal } from '../components/splits/SettlementFormModal';
import { SettlementsTab } from '../components/splits/SettlementsTab';
import { SummaryTab } from '../components/splits/SummaryTab';
import { HeaderBar, LimeButton } from '../components/UI';

type GroupFilter = 'ALL' | 'OPEN' | 'CLOSED';
type DashboardTab = 'EXPENSES' | 'MEMBERS' | 'SETTLEMENTS' | 'SUMMARY';

export function Splits({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL');
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [details, setDetails] = useState<GroupDetailsData | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('EXPENSES');

  // Modals
  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SplitExpenseDomain | null>(null);
  const [deleteTargetExpense, setDeleteTargetExpense] = useState<SplitExpenseDomain | null>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementPrefill, setSettlementPrefill] = useState<SettlementTransfer | undefined>();

  const refreshList = useCallback(async () => {
    const items = await listGroupsWithSummaries();
    setGroups(items);
  }, []);

  const refreshDetails = useCallback(async (id: number) => {
    const data = await loadGroupDetails(id);
    setDetails(data);
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (activeGroupId != null) {
      refreshDetails(activeGroupId);
    } else {
      setDetails(null);
    }
  }, [activeGroupId, refreshDetails]);

  const handleDataChanged = async () => {
    await refreshList();
    if (activeGroupId != null) {
      await refreshDetails(activeGroupId);
    }
  };

  const fmt = (rial: number) => (hidden ? Money.HIDDEN : Money.toman(rial));

  const filteredGroups = useMemo(() => {
    if (groupFilter === 'ALL') return groups;
    return groups.filter((item) => item.group.status === groupFilter);
  }, [groups, groupFilter]);

  const activeExpenses = useMemo(
    () => (details ? details.expenses.filter((e) => !e.isDeleted) : []),
    [details],
  );

  const sharesByExpenseId = useMemo(() => {
    const map = new Map<number, SplitShareDomain[]>();
    if (!details) return map;
    for (const s of details.shares) {
      const list = map.get(s.expenseId) ?? [];
      list.push(s);
      map.set(s.expenseId, list);
    }
    return map;
  }, [details]);

  const activeSettlements = useMemo(
    () => (details ? details.settlements.filter((s) => s.status === 'ACTIVE') : []),
    [details],
  );

  const handleDeleteExpense = async () => {
    if (!deleteTargetExpense) return;
    await deleteExpense(deleteTargetExpense.id);
    setDeleteTargetExpense(null);
    await handleDataChanged();
  };

  // ==================== SCREEN C: GROUP DASHBOARD ====================
  if (activeGroupId != null && details) {
    const { group, members, summary, settlements, auditLogs } = details;
    const isClosed = group.status === 'CLOSED';
    const memberNameById = new Map(members.map((m) => [m.id, m.displayName]));
    const selfMember = members.find((m) => m.role === 'SELF');
    const selfBal = selfMember ? summary.balanceByMemberId.get(selfMember.id) : undefined;

    return (
      <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
        <HeaderBar
          title={group.title}
          onBack={() => setActiveGroupId(null)}
          action={
            <button
              type="button"
              onClick={() => {
                setEditingGroup(true);
                setIsGroupFormOpen(true);
              }}
              aria-label="ویرایش گروه"
              className="w-10 h-10 rounded-2xl bg-surface border border-line flex items-center justify-center text-white"
            >
              <Pencil size={17} />
            </button>
          }
        />

        <div className="space-y-3.5 mt-2">
          {/* Hero Summary Card */}
          <div className="p-4 rounded-[24px] glass-highlight border border-white/15 text-white space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-white/75 flex items-center gap-1.5">
                  <span>{Jalali.longDate(group.eventDate)}</span>
                  <span>·</span>
                  <span>{Money.fa(String(members.filter((m) => m.status === 'ACTIVE').length))} عضو</span>
                </div>
                {group.description && (
                  <p className="text-[11px] text-white/80 mt-0.5 truncate">{group.description}</p>
                )}
              </div>

              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  isClosed
                    ? 'bg-black/30 text-white/80'
                    : summary.isSettled
                      ? 'bg-ok/20 text-ok'
                      : 'bg-warn/20 text-warn'
                }`}
              >
                {isClosed ? 'بسته شده' : summary.isSettled ? 'تسویه کامل' : 'در جریان'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-white/75 block">کل هزینه‌های گروه</span>
              <div className="text-2xl font-black mt-0.5 dir-ltr">
                {fmt(summary.totalExpenses)}{' '}
                <span className="text-xs font-medium text-white/60">تومان</span>
              </div>
              {summary.totalOutstandingDebt > 0 && (
                <div className="text-[11px] text-lime mt-0.5">
                  مانده تسویه‌نشده: <span className="dir-ltr font-bold">{fmt(summary.totalOutstandingDebt)}</span> تومان
                </div>
              )}
            </div>

            {selfBal && (
              <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-white/15 text-center">
                <div>
                  <div className="text-[10px] text-white/70">پرداختی من</div>
                  <div className="text-xs font-bold dir-ltr mt-0.5">{fmt(selfBal.totalPaid)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/70">سهم من</div>
                  <div className="text-xs font-bold dir-ltr mt-0.5">{fmt(selfBal.totalShare)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/70">مانده من</div>
                  <div
                    className={`text-xs font-black dir-ltr mt-0.5 ${
                      selfBal.netBalance > 0
                        ? 'text-ok'
                        : selfBal.netBalance < 0
                          ? 'text-warn'
                          : 'text-white'
                    }`}
                  >
                    {selfBal.netBalance === 0 ? '۰ (صاف)' : fmt(selfBal.netBalance)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Needs Review Legacy Alert */}
          {summary.needsReviewCount > 0 && (
            <div className="p-3 rounded-2xl bg-warn/15 border border-warn/30 text-warn text-[11px] flex items-start gap-2 leading-relaxed">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                {Money.fa(String(summary.needsReviewCount))} هزینه قدیمی با جمع{' '}
                {fmt(summary.needsReviewAmount)} تومان اطلاعات ناقص دارد و تا زمان تکمیل در محاسبه تسویه لحاظ نمی‌شود.
              </span>
            </div>
          )}

          {/* Primary Action or Closed Notice */}
          {!isClosed ? (
            <LimeButton
              icon={Plus}
              className="w-full"
              onClick={() => {
                setEditingExpense(null);
                setIsExpenseFormOpen(true);
              }}
            >
              ثبت هزینه جدید
            </LimeButton>
          ) : (
            <div className="p-3 rounded-2xl bg-surface border border-line flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-t2">
                <Lock size={15} className="text-muted shrink-0" />
                <span>این گروه بسته شده و فقط خواندنی است.</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await reopenGroup(group.id);
                  await handleDataChanged();
                }}
                className="h-8 px-3 rounded-xl bg-sky/15 text-sky text-[11px] font-bold flex items-center gap-1 shrink-0"
              >
                <Unlock size={13} />
                <span>بازگشایی</span>
              </button>
            </div>
          )}

          {/* 4-Tab Navigation */}
          <div className="grid grid-cols-4 bg-surface rounded-2xl p-1 border border-line gap-1">
            {(
              [
                { id: 'EXPENSES', label: 'هزینه‌ها', icon: Receipt },
                { id: 'MEMBERS', label: 'اعضا', icon: Users },
                { id: 'SETTLEMENTS', label: 'تسویه', icon: ArrowRightLeft },
                { id: 'SUMMARY', label: 'گزارش', icon: FileSpreadsheet },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                    active ? 'bg-primaryStrong text-white' : 'text-t2 hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          {activeTab === 'EXPENSES' && (
            <div className="space-y-2.5">
              {activeExpenses.length === 0 ? (
                <div className="py-10 text-center text-muted text-xs bg-surface/50 rounded-[22px] border border-line/60">
                  هنوز هزینه‌ای در این گروه ثبت نشده است.
                </div>
              ) : (
                activeExpenses.map((exp) => {
                  const expShares = sharesByExpenseId.get(exp.id) ?? [];
                  const payerName = memberNameById.get(exp.payerId) ?? 'نامشخص';
                  const myShare = selfMember
                    ? expShares.find((s) => s.memberId === selfMember.id)?.amount ?? 0
                    : 0;
                  const needsReview = exp.integrityStatus === 'NEEDS_REVIEW';

                  return (
                    <div
                      key={exp.id}
                      className={`p-3.5 rounded-[20px] border space-y-2 ${
                        needsReview
                          ? 'bg-warn/10 border-warn/35'
                          : 'bg-surface border-line'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">
                              {exp.title}
                            </span>
                            {needsReview ? (
                              <span className="px-1.5 py-0.5 rounded-full bg-warn/20 text-warn text-[9px] font-bold">
                                نیاز به بررسی
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-full bg-white/5 text-muted text-[9px]">
                                {exp.splitMethod === 'EQUAL' ? 'مساوی' : 'دلخواه'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted mt-0.5">
                            {needsReview
                              ? `سهم یا پرداخت‌کننده نامشخص · ${Jalali.longDate(exp.occurredAt)}`
                              : `پرداخت: ${payerName} · ${Money.fa(String(expShares.length))} نفر · ${Jalali.longDate(exp.occurredAt)}`}
                          </div>
                          {exp.note && (
                            <div className="text-[10px] text-t2 mt-0.5 truncate">{exp.note}</div>
                          )}
                        </div>

                        <div className="text-left shrink-0">
                          <div className="text-xs font-black text-white dir-ltr">
                            {fmt(exp.amount)}
                            <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
                          </div>
                          {!needsReview && selfMember && (
                            <div className="text-[10px] text-sky dir-ltr mt-0.5">
                              سهم من: {fmt(myShare)}
                            </div>
                          )}
                        </div>
                      </div>

                      {!isClosed && (
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-line/50">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExpense(exp);
                              setIsExpenseFormOpen(true);
                            }}
                            className="h-7 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-t2 text-[10px] font-bold flex items-center gap-1"
                          >
                            <Pencil size={12} />
                            <span>{needsReview ? 'تکمیل و بررسی' : 'ویرایش'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetExpense(exp)}
                            className="h-7 px-2.5 rounded-lg bg-bad/10 hover:bg-bad/20 text-bad text-[10px] font-bold flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            <span>حذف</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'MEMBERS' && (
            <MembersTab
              groupId={group.id}
              isClosed={isClosed}
              hidden={hidden}
              members={members}
              summary={summary}
              onUpdated={handleDataChanged}
            />
          )}

          {activeTab === 'SETTLEMENTS' && (
            <SettlementsTab
              isClosed={isClosed}
              hidden={hidden}
              members={members}
              settlements={settlements}
              summary={summary}
              onOpenRecordSettlement={(prefill) => {
                setSettlementPrefill(prefill);
                setIsSettlementModalOpen(true);
              }}
              onUpdated={handleDataChanged}
            />
          )}

          {activeTab === 'SUMMARY' && (
            <SummaryTab
              group={group}
              hidden={hidden}
              members={members}
              summary={summary}
              auditLogs={auditLogs}
              onUpdated={handleDataChanged}
            />
          )}
        </div>

        {/* Modals inside Group Dashboard */}
        <GroupFormModal
          isOpen={isGroupFormOpen}
          editingGroup={editingGroup ? group : null}
          onClose={() => {
            setIsGroupFormOpen(false);
            setEditingGroup(false);
          }}
          onSaved={handleDataChanged}
        />

        <ExpenseFormModal
          isOpen={isExpenseFormOpen}
          groupId={group.id}
          members={members}
          hasActiveSettlements={activeSettlements.length > 0}
          editingExpense={editingExpense}
          editingShares={editingExpense ? (sharesByExpenseId.get(editingExpense.id) ?? []) : []}
          onClose={() => {
            setIsExpenseFormOpen(false);
            setEditingExpense(null);
          }}
          onSaved={handleDataChanged}
        />

        <SettlementFormModal
          isOpen={isSettlementModalOpen}
          groupId={group.id}
          members={members}
          activeSettlements={activeSettlements}
          initialFromMemberId={settlementPrefill?.fromMemberId}
          initialToMemberId={settlementPrefill?.toMemberId}
          initialAmountRial={settlementPrefill?.amount}
          onClose={() => {
            setIsSettlementModalOpen(false);
            setSettlementPrefill(undefined);
          }}
          onSaved={handleDataChanged}
        />

        {/* Delete Expense Confirmation */}
        {deleteTargetExpense && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm"
            onClick={() => setDeleteTargetExpense(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-sheet rounded-[24px] border border-line p-5 space-y-3.5 shadow-2xl"
            >
              <h3 className="text-sm font-bold text-white">
                حذف هزینه «{deleteTargetExpense.title}»
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                {activeSettlements.length > 0
                  ? 'توجه: در این گروه تسویه ثبت شده است. با حذف این هزینه، مانده اعضا بر اساس هزینه‌های باقی‌مانده و تسویه‌های ثبت‌شده دوباره محاسبه می‌شود.'
                  : 'این هزینه از محاسبه گروه حذف می‌شود و تغییر آن در تاریخچه ثبت می‌گردد.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteExpense}
                  className="flex-1 h-10 rounded-xl bg-bad text-white text-xs font-bold"
                >
                  حذف هزینه
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTargetExpense(null)}
                  className="flex-1 h-10 rounded-xl bg-surface border border-line text-white text-xs font-semibold"
                >
                  انصراف
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== SCREEN A: GROUPS LIST ====================
  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="محاسبه دونگ"
        onBack={onBack}
        action={
          <button
            type="button"
            onClick={() => {
              setEditingGroup(false);
              setIsGroupFormOpen(true);
            }}
            aria-label="گروه جدید"
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
          >
            <Plus size={20} strokeWidth={2.8} />
          </button>
        }
      />

      {groups.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          {(
            [
              { id: 'ALL', label: 'همه' },
              { id: 'OPEN', label: 'باز' },
              { id: 'CLOSED', label: 'بسته شده' },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setGroupFilter(chip.id)}
              className={`h-8 px-3.5 rounded-full text-xs font-bold border transition-colors ${
                groupFilter === chip.id
                  ? 'bg-lime text-onLime border-lime'
                  : 'bg-surface border-line text-t2'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3 mt-3.5">
        {filteredGroups.map(({ group, activeMemberCount, summary }) => {
          const isClosed = group.status === 'CLOSED';
          const hasDebt = summary.totalOutstandingDebt > 0;
          const hasReview = summary.needsReviewCount > 0;

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                setActiveTab('EXPENSES');
                setActiveGroupId(group.id);
              }}
              className="w-full text-right p-4 rounded-[22px] bg-surface hover:bg-surface2 border border-line flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    isClosed
                      ? 'bg-white/5 text-muted'
                      : 'bg-sky/15 text-sky'
                  }`}
                >
                  <Users size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white truncate">{group.title}</h3>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                        isClosed
                          ? 'bg-white/10 text-muted'
                          : 'bg-sky/15 text-sky'
                      }`}
                    >
                      {isClosed ? 'بسته' : 'باز'}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {Jalali.longDate(group.eventDate)} · {Money.fa(String(activeMemberCount))} عضو
                  </div>
                </div>
              </div>

              <div className="text-left shrink-0">
                <div className="text-xs font-black text-white dir-ltr">
                  {fmt(summary.totalExpenses)}{' '}
                  <span className="text-[10px] text-muted font-normal">تومان</span>
                </div>
                <div className="mt-1 flex items-center justify-end gap-1">
                  {hasReview ? (
                    <span className="text-[10px] font-bold text-warn flex items-center gap-0.5">
                      <AlertTriangle size={11} />
                      نیاز به بررسی
                    </span>
                  ) : hasDebt ? (
                    <span className="text-[10px] font-bold text-warn">
                      مانده: <span className="dir-ltr">{fmt(summary.totalOutstandingDebt)}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-ok flex items-center gap-0.5">
                      <CheckCircle2 size={11} />
                      تسویه
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {groups.length === 0 && (
          <div className="py-16 px-4 text-center space-y-4 bg-surface/50 rounded-[24px] border border-line/60">
            <div className="w-12 h-12 rounded-2xl bg-sky/15 text-sky flex items-center justify-center mx-auto">
              <Users size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">هنوز گروه دنگی نساخته‌اید</h3>
              <p className="text-xs text-muted leading-relaxed">
                برای سفر، کافه، رستوران یا خانه مشترک یک گروه بسازید تا سهم هر نفر و تسویه‌ها خودکار محاسبه شود.
              </p>
            </div>
            <LimeButton
              icon={Plus}
              className="mx-auto"
              onClick={() => {
                setEditingGroup(false);
                setIsGroupFormOpen(true);
              }}
            >
              ساخت اولین گروه
            </LimeButton>
          </div>
        )}

        {groups.length > 0 && filteredGroups.length === 0 && (
          <div className="py-12 text-center text-xs text-muted">
            گروهی در این وضعیت وجود ندارد.
          </div>
        )}
      </div>

      <GroupFormModal
        isOpen={isGroupFormOpen}
        editingGroup={null}
        onClose={() => setIsGroupFormOpen(false)}
        onSaved={(newGroupId) => {
          refreshList();
          setActiveTab('EXPENSES');
          setActiveGroupId(newGroupId);
        }}
      />
    </div>
  );
}
