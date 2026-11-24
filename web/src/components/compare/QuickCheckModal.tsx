import React, { useState, useEffect } from 'react';
import { Check, X, HelpCircle, ChevronRight, ChevronLeft, Award, Sparkles, MessageSquare } from 'lucide-react';
import { db, type CompareItem, type CompareCriterion, type CompareCheck } from '../../core/db';
import { type CheckState, stateOf, noteOf } from '../../core/compareEngine';
import { Money } from '../../core/money';

interface QuickCheckModalProps {
  item: CompareItem;
  criteria: CompareCriterion[];
  checks: CompareCheck[];
  onClose: () => void;
  onRefresh: () => void;
}

export function QuickCheckModal({
  item,
  criteria,
  checks,
  onClose,
  onRefresh,
}: QuickCheckModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [note, setNote] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Jump to first unanswered criterion initially
  useEffect(() => {
    const firstUnanswered = criteria.findIndex(c => stateOf(item.id!, c.id!, checks) === 'UNKNOWN');
    if (firstUnanswered >= 0) {
      setCurrentIndex(firstUnanswered);
    }
  }, []);

  const currentCriterion = criteria[currentIndex];

  // Update note input when criterion changes
  useEffect(() => {
    if (currentCriterion) {
      const existingNote = noteOf(item.id!, currentCriterion.id!, checks) || '';
      setNote(existingNote);
      setIsNoteOpen(!!existingNote);
    }
  }, [currentIndex, currentCriterion]);

  const handleAnswer = async (state: CheckState) => {
    if (!currentCriterion || isSaving) return;
    setIsSaving(true);

    try {
      const existing = checks.find(c => c.itemId === item.id! && c.criterionId === currentCriterion.id!);

      if (existing) {
        await db.compareChecks.update(existing.id!, {
          state,
          note: note.trim() || undefined,
          updatedAt: Date.now(),
        });
      } else {
        await db.compareChecks.add({
          sessionId: item.sessionId,
          itemId: item.id!,
          criterionId: currentCriterion.id!,
          state,
          note: note.trim() || undefined,
          updatedAt: Date.now(),
        });
      }

      onRefresh();

      // Go to next criterion or finish
      if (currentIndex < criteria.length) {
        setCurrentIndex(prev => prev + 1);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isCompleted = currentIndex >= criteria.length;
  const progressPercent = criteria.length > 0 ? Math.round((currentIndex / criteria.length) * 100) : 100;
  const currentState = currentCriterion ? stateOf(item.id!, currentCriterion.id!, checks) : 'UNKNOWN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-4">
      <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-lime bg-lime/10 px-2 py-0.5 rounded-full">
                بررسی سریع کالا
              </span>
              <span className="text-xs text-muted">
                {Money.fa(String(Math.min(currentIndex + 1, criteria.length)))} از {Money.fa(String(criteria.length))}
              </span>
            </div>
            <h2 className="text-sm font-black text-white mt-1 truncate max-w-[230px]">{item.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface2 h-1.5 overflow-hidden">
          <div
            className="bg-lime h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 flex flex-col justify-between">
          {!isCompleted && currentCriterion ? (
            <>
              {/* Criterion Card */}
              <div className="p-4 rounded-2xl bg-surface border border-line/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {currentCriterion.strict && (
                      <span className="text-[10px] font-black bg-danger/20 text-danger border border-danger/30 px-2 py-0.5 rounded-md">
                        ⚠️ خط قرمز (الزامی)
                      </span>
                    )}
                    {currentCriterion.weight === 3 ? (
                      <span className="text-[10px] font-bold bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-md">
                        ★ بسیار مهم
                      </span>
                    ) : currentCriterion.weight === 0.5 ? (
                      <span className="text-[10px] font-medium bg-white/5 text-muted px-2 py-0.5 rounded-md">
                        امتیاز جانبی
                      </span>
                    ) : null}
                  </div>
                  {currentState !== 'UNKNOWN' && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      currentState === 'PASS' ? 'bg-ok/20 text-ok' : 'bg-danger/20 text-danger'
                    }`}>
                      {currentState === 'PASS' ? 'قبلاً تایید شده' : 'قبلاً رد شده'}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-white leading-snug">{currentCriterion.title}</h3>

                {currentCriterion.why && (
                  <p className="text-xs text-muted leading-relaxed bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                    💡 <span className="font-semibold text-white/80">دلیل اهمیت:</span> {currentCriterion.why}
                  </p>
                )}
              </div>

              {/* Optional Note Field */}
              <div>
                {isNoteOpen ? (
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted flex items-center gap-1">
                      <MessageSquare size={12} />
                      یادداشت بررسی برای این کالا:
                    </label>
                    <textarea
                      rows={2}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="مثلاً: در بررسی حضوری دوربین در نور کم عالی بود..."
                      className="w-full bg-surface2 border border-line rounded-xl p-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setIsNoteOpen(true)}
                    className="text-[11px] text-sky hover:underline flex items-center gap-1"
                  >
                    <MessageSquare size={12} />
                    + افزودن یادداشت به این ارزیابی
                  </button>
                )}
              </div>

              {/* Big Touch Buttons for In-store 1-handed evaluation */}
              <div className="space-y-2 pt-2">
                <button
                  disabled={isSaving}
                  onClick={() => handleAnswer('PASS')}
                  className={`w-full h-14 rounded-2xl flex items-center justify-between px-5 font-bold text-sm transition-transform active:scale-98 shadow-md ${
                    currentState === 'PASS'
                      ? 'bg-ok text-black ring-2 ring-ok/50'
                      : 'bg-ok/15 text-ok hover:bg-ok/25 border border-ok/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-ok text-black flex items-center justify-center">
                      <Check size={20} strokeWidth={3} />
                    </div>
                    <span>رعایت شده (پاس)</span>
                  </div>
                  <span className="text-[11px] opacity-80">دارای این ویژگی</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={() => handleAnswer('FAIL')}
                  className={`w-full h-14 rounded-2xl flex items-center justify-between px-5 font-bold text-sm transition-transform active:scale-98 shadow-md ${
                    currentState === 'FAIL'
                      ? 'bg-danger text-white ring-2 ring-danger/50'
                      : 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-danger text-white flex items-center justify-center">
                      <X size={20} strokeWidth={3} />
                    </div>
                    <span>نقض شده (رد)</span>
                  </div>
                  <span className="text-[11px] opacity-80">فاقد این معیار</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={() => handleAnswer('UNKNOWN')}
                  className="w-full h-11 rounded-xl bg-surface hover:bg-surface2 border border-line text-muted hover:text-white flex items-center justify-center gap-2 text-xs font-medium active:scale-98"
                >
                  <HelpCircle size={15} />
                  <span>نامشخص / بعداً بررسی شود</span>
                </button>
              </div>

              {/* Navigation Back / Next */}
              <div className="flex items-center justify-between pt-2 border-t border-line/50 text-xs">
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  className="text-muted hover:text-white disabled:opacity-30 flex items-center gap-1"
                >
                  <ChevronRight size={16} />
                  معیار قبلی
                </button>
                <button
                  onClick={() => setCurrentIndex(i => i + 1)}
                  className="text-muted hover:text-white flex items-center gap-1"
                >
                  رد کردن
                  <ChevronLeft size={16} />
                </button>
              </div>
            </>
          ) : (
            /* Completed Screen */
            <div className="py-8 text-center space-y-4 animate-scale-in">
              <div className="w-16 h-16 rounded-3xl bg-lime/20 text-lime border border-lime/30 flex items-center justify-center mx-auto shadow-fab">
                <Sparkles size={32} />
              </div>

              <div>
                <h3 className="text-lg font-black text-white">بررسی تمام شد!</h3>
                <p className="text-xs text-muted mt-1 max-w-[240px] mx-auto">
                  تمام معیارهای تعیین شده برای کالای «{item.name}» با موفقیت بررسی و ثبت شد.
                </p>
              </div>

              <div className="p-3 bg-surface rounded-2xl border border-line text-xs space-y-1">
                <div className="text-white font-bold">امتیاز و وضعیت جدید در جدول به‌روزرسانی شد.</div>
                <div className="text-muted text-[11px]">می‌توانید به صفحه مقایسه بازگردید یا کالای دیگری را بررسی کنید.</div>
              </div>

              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl bg-lime text-onLime font-extrabold text-sm shadow-fab active:scale-98 transition-transform"
              >
                بازگشت به مقایسه
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
