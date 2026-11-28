import React, { useState } from 'react';
import { Check, Copy, Lock, Unlock } from 'lucide-react';
import type { SplitAuditLog } from '../../core/db';
import { Jalali } from '../../core/jalali';
import { Money } from '../../core/money';
import type {
  GroupFinancialSummary,
  SplitGroupDomain,
  SplitMemberDomain,
} from '../../core/splits';
import { closeGroup, reopenGroup } from '../../core/splits/splitRepo';

interface SummaryTabProps {
  group: SplitGroupDomain;
  hidden: boolean;
  members: SplitMemberDomain[];
  summary: GroupFinancialSummary;
  auditLogs: SplitAuditLog[];
  onUpdated: () => void;
}

export function SummaryTab({
  group,
  hidden,
  members,
  summary,
  auditLogs,
  onUpdated,
}: SummaryTabProps) {
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const isClosed = group.status === 'CLOSED';
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const fmt = (rial: number) => (hidden ? Money.HIDDEN : Money.toman(rial));

  const handleCopySummary = async () => {
    const lines: string[] = [
      `گزارش گروه «${group.title}» (${Jalali.longDate(group.eventDate)})`,
      `جمع هزینه‌ها: ${Money.toman(summary.totalExpenses)} تومان (${Money.fa(String(summary.validExpenseCount))} هزینه)`,
      '',
      'وضعیت اعضا:',
    ];
    for (const m of members) {
      const b = summary.balanceByMemberId.get(m.id);
      if (!b) continue;
      const statusText =
        b.netBalance > 0
          ? `طلبکار ${Money.toman(b.netBalance)} تومان`
          : b.netBalance < 0
            ? `بدهکار ${Money.toman(Math.abs(b.netBalance))} تومان`
            : 'تسویه';
      lines.push(
        `- ${m.displayName}: پرداخت ${Money.toman(b.totalPaid)} | سهم ${Money.toman(b.totalShare)} | ${statusText}`,
      );
    }

    if (summary.optimization.transfers.length > 0) {
      lines.push('', 'پیشنهاد تسویه:');
      for (const t of summary.optimization.transfers) {
        lines.push(
          `- ${nameOf.get(t.fromMemberId)} ← ${nameOf.get(t.toMemberId)}: ${Money.toman(t.amount)} تومان`,
        );
      }
    } else {
      lines.push('', 'وضعیت: همه اعضا تسویه هستند.');
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleToggleClose = async () => {
    setBusy(true);
    try {
      if (isClosed) {
        await reopenGroup(group.id);
      } else {
        await closeGroup(group.id);
      }
      setConfirmClose(false);
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top KPI Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3.5 rounded-[20px] bg-surface border border-line">
          <div className="text-[10px] text-muted">جمع کل هزینه‌ها</div>
          <div className="text-sm font-black text-white dir-ltr mt-1">
            {fmt(summary.totalExpenses)}{' '}
            <span className="text-[10px] text-muted font-normal">تومان</span>
          </div>
          <div className="text-[10px] text-t2 mt-1">
            {Money.fa(String(summary.validExpenseCount))} هزینه تاییدشده
          </div>
        </div>

        <div className="p-3.5 rounded-[20px] bg-surface border border-line">
          <div className="text-[10px] text-muted">مانده تسویه‌نشده</div>
          <div
            className={`text-sm font-black dir-ltr mt-1 ${
              summary.isSettled ? 'text-ok' : 'text-warn'
            }`}
          >
            {summary.isSettled ? '۰' : fmt(summary.totalOutstandingDebt)}{' '}
            <span className="text-[10px] text-muted font-normal">تومان</span>
          </div>
          <div className="text-[10px] text-t2 mt-1">
            تسویه ثبت‌شده: {fmt(summary.totalActiveSettlements)}
          </div>
        </div>
      </div>

      {/* Member Breakdown */}
      <div className="p-3.5 rounded-[22px] bg-surface border border-line space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white">تراز مالی هر عضو</h3>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              summary.isSettled
                ? 'bg-ok/15 text-ok'
                : 'bg-warn/15 text-warn'
            }`}
          >
            {summary.isSettled ? 'تسویه کامل' : 'در جریان'}
          </span>
        </div>

        <div className="divide-y divide-line">
          {members.map((m) => {
            const b = summary.balanceByMemberId.get(m.id);
            if (!b) return null;
            return (
              <div key={m.id} className="py-2.5 first:pt-1 last:pb-1 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{m.displayName}</span>
                  <span
                    className={`font-extrabold dir-ltr ${
                      b.netBalance > 0
                        ? 'text-ok'
                        : b.netBalance < 0
                          ? 'text-warn'
                          : 'text-muted'
                    }`}
                  >
                    {b.netBalance === 0
                      ? 'تسویه'
                      : `${fmt(b.netBalance)} تومان`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                  <span>پرداخت هزینه: {fmt(b.totalPaid)}</span>
                  <span>سهم: {fmt(b.totalShare)}</span>
                  {b.settlementsOut > 0 && <span>تسویه پرداختی: {fmt(b.settlementsOut)}</span>}
                  {b.settlementsIn > 0 && <span>تسویه دریافتی: {fmt(b.settlementsIn)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleCopySummary}
          className="h-11 rounded-2xl bg-surface border border-line hover:border-sky text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
          <span>{copied ? 'کپی شد' : 'کپی گزارش متنی'}</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (isClosed) {
              handleToggleClose();
            } else {
              setConfirmClose(true);
            }
          }}
          className={`h-11 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
            isClosed
              ? 'bg-sky/15 border-sky/30 text-sky'
              : 'bg-surface2 border-line text-white hover:border-lineStrong'
          }`}
        >
          {isClosed ? <Unlock size={15} /> : <Lock size={15} />}
          <span>{isClosed ? 'بازگشایی گروه' : 'بستن گروه'}</span>
        </button>
      </div>

      {/* Recent Audit Trail */}
      {auditLogs.length > 0 && (
        <div className="p-3.5 rounded-[22px] bg-surface/70 border border-line/70 space-y-2">
          <h3 className="text-xs font-bold text-t2">تاریخچه تغییرات</h3>
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {auditLogs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-2 text-[10px] text-muted"
              >
                <span className="text-white/80 leading-relaxed">{log.summary}</span>
                <span className="shrink-0">{Jalali.shortDateTime(log.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Close Confirmation Modal */}
      {confirmClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm"
          onClick={() => setConfirmClose(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-sheet rounded-[24px] border border-line p-5 space-y-3.5 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-white">بستن گروه «{group.title}»</h3>
            <p className="text-xs text-muted leading-relaxed">
              {summary.isSettled
                ? 'همه اعضای این گروه تسویه هستند. با بستن گروه، امکان ثبت یا تغییر هزینه قفل می‌شود (سابقه و اعداد دست نمی‌خورند).'
                : `هنوز ${Money.toman(summary.totalOutstandingDebt)} تومان مانده تسویه‌نشده در گروه وجود دارد. بستن گروه اعداد را تغییر نمی‌دهد و هر زمان بخواهید می‌توانید گروه را بازگشایی کنید.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleToggleClose}
                className="flex-1 h-10 rounded-xl bg-lime text-onLime text-xs font-extrabold"
              >
                {busy ? 'در حال بستن...' : 'تایید بستن گروه'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
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
