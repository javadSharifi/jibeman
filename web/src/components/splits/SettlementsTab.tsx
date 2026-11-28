import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Jalali } from '../../core/jalali';
import { Money } from '../../core/money';
import type {
  GroupFinancialSummary,
  SettlementTransfer,
  SplitMemberDomain,
  SplitSettlementDomain,
} from '../../core/splits';
import { reverseSettlement } from '../../core/splits/splitRepo';

interface SettlementsTabProps {
  isClosed: boolean;
  hidden: boolean;
  members: SplitMemberDomain[];
  settlements: SplitSettlementDomain[];
  summary: GroupFinancialSummary;
  onOpenRecordSettlement: (prefill?: SettlementTransfer) => void;
  onUpdated: () => void;
}

export function SettlementsTab({
  isClosed,
  hidden,
  members,
  settlements,
  summary,
  onOpenRecordSettlement,
  onUpdated,
}: SettlementsTabProps) {
  const [reverseTarget, setReverseTarget] = useState<SplitSettlementDomain | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const fmt = (rial: number) => (hidden ? Money.HIDDEN : Money.toman(rial));

  const handleConfirmReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    setError(null);
    try {
      await reverseSettlement(reverseTarget.id, reverseReason);
      setReverseTarget(null);
      setReverseReason('');
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'خطا در برگشت تسویه');
    } finally {
      setReversing(false);
    }
  };

  const { optimization } = summary;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px]">
          {error}
        </div>
      )}

      {/* Optimization Suggestions */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-white">پیشنهادهای تسویه</h3>
            <p className="text-[10px] text-muted mt-0.5">
              {optimization.mode === 'EXACT'
                ? 'بهینه‌سازی دقیق (حداقل تعداد تراکنش ممکن)'
                : 'پیشنهاد بهینه حریصانه (گروه بیش از ۱۴ عضو تصفیه‌نشده دارد)'}
            </p>
          </div>

          {!isClosed && members.length >= 2 && (
            <button
              type="button"
              onClick={() => onOpenRecordSettlement(undefined)}
              className="h-8 px-2.5 rounded-xl bg-surface2 border border-line text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
            >
              <Plus size={13} />
              <span>تسویه دستی</span>
            </button>
          )}
        </div>

        {summary.needsReviewCount > 0 && (
          <div className="p-3 rounded-2xl bg-warn/15 border border-warn/30 text-warn text-[11px] flex items-start gap-2 leading-relaxed">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {Money.fa(String(summary.needsReviewCount))} هزینه قدیمی نیازمند بررسی است و در محاسبه تسویه فعلی لحاظ نشده است.
            </span>
          </div>
        )}

        {optimization.transfers.length === 0 ? (
          <div className="p-4 rounded-[20px] bg-ok/10 border border-ok/25 text-ok text-xs font-bold flex items-center gap-2">
            <CheckCircle2 size={18} />
            <span>
              {summary.needsReviewCount > 0
                ? 'بر اساس هزینه‌های تاییدشده، همه اعضا با هم صاف هستند.'
                : 'همه اعضا با هم تسویه هستند.'}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {optimization.transfers.map((t) => {
              const fromName = nameOf.get(t.fromMemberId) ?? 'عضو';
              const toName = nameOf.get(t.toMemberId) ?? 'عضو';
              return (
                <div
                  key={`${t.fromMemberId}-${t.toMemberId}`}
                  className="p-3.5 rounded-[20px] bg-surface border border-line flex items-center justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white leading-relaxed">
                      {fromName} باید{' '}
                      <span className="text-lime dir-ltr inline-block">
                        {fmt(t.amount)}
                      </span>{' '}
                      تومان به {toName} بدهد.
                    </div>
                  </div>

                  {!isClosed && (
                    <button
                      type="button"
                      onClick={() => onOpenRecordSettlement(t)}
                      className="h-8 px-3 rounded-xl bg-lime/15 border border-lime/30 text-lime text-[11px] font-extrabold shrink-0 active:scale-95 transition-transform"
                    >
                      ثبت تسویه
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settlement History */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-white">تاریخچه تسویه‌ها</h3>
        {settlements.length === 0 ? (
          <div className="py-6 text-center text-muted text-xs bg-surface/50 rounded-2xl border border-line/60">
            هنوز تسویه‌ای در این گروه ثبت نشده است.
          </div>
        ) : (
          <div className="space-y-2">
            {settlements.map((s) => {
              const fromName = nameOf.get(s.fromMemberId) ?? 'عضو';
              const toName = nameOf.get(s.toMemberId) ?? 'عضو';
              const isReversed = s.status === 'REVERSED';

              return (
                <div
                  key={s.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                    isReversed
                      ? 'bg-surface/40 border-line/50 opacity-65'
                      : 'bg-surface border-line'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isReversed
                          ? 'bg-bad/10 text-bad'
                          : 'bg-ok/15 text-ok'
                      }`}
                    >
                      <ArrowRightLeft size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs font-bold ${
                            isReversed ? 'line-through text-muted' : 'text-white'
                          }`}
                        >
                          {fromName} ← {toName}
                        </span>
                        {isReversed && (
                          <span className="px-1.5 py-0.5 rounded-full bg-bad/15 text-bad text-[9px] font-bold">
                            برگشت‌خورده
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5 truncate">
                        {Jalali.longDate(s.settledAt)}
                        {s.note ? ` · ${s.note}` : ''}
                        {isReversed && s.reversalReason ? ` · علت: ${s.reversalReason}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-left">
                      <div
                        className={`text-xs font-extrabold dir-ltr ${
                          isReversed ? 'line-through text-muted' : 'text-white'
                        }`}
                      >
                        {fmt(s.amount)}
                      </div>
                      <div className="text-[9px] text-muted">تومان</div>
                    </div>

                    {!isClosed && !isReversed && (
                      <button
                        type="button"
                        onClick={() => {
                          setReverseTarget(s);
                          setReverseReason('');
                        }}
                        title="برگشت تسویه"
                        aria-label="برگشت تسویه"
                        className="w-7 h-7 rounded-lg bg-bad/10 hover:bg-bad/20 text-bad flex items-center justify-center"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reverse Confirmation Modal */}
      {reverseTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm"
          onClick={() => setReverseTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-sheet rounded-[24px] border border-line p-5 space-y-3.5 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-white">برگشت دادن تسویه</h3>
            <p className="text-xs text-muted leading-relaxed">
              تسویه {nameOf.get(reverseTarget.fromMemberId)} به{' '}
              {nameOf.get(reverseTarget.toMemberId)} به مبلغ{' '}
              {Money.toman(reverseTarget.amount)} تومان با حفظ سابقه، در وضعیت «برگشت‌خورده» قرار می‌گیرد و مانده اعضا اصلاح می‌شود.
            </p>
            <input
              type="text"
              placeholder="علت برگشت (اختیاری، مثلاً ثبت اشتباه)"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              maxLength={120}
              className="w-full h-10 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={reversing}
                onClick={handleConfirmReverse}
                className="flex-1 h-10 rounded-xl bg-bad text-white text-xs font-bold disabled:opacity-50"
              >
                {reversing ? 'در حال ثبت...' : 'تایید برگشت'}
              </button>
              <button
                type="button"
                onClick={() => setReverseTarget(null)}
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
