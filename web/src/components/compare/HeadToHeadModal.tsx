import React, { useState } from 'react';
import { X, Trophy, Check, HelpCircle, ArrowLeftRight, Minus } from 'lucide-react';
import type { CompareItem, CompareCriterion, CompareCheck } from '../../core/db';
import { compareTwoItems } from '../../core/compareEngine';
import { Money } from '../../core/money';

interface HeadToHeadModalProps {
  items: CompareItem[];
  criteria: CompareCriterion[];
  checks: CompareCheck[];
  initialItemIdA?: number;
  initialItemIdB?: number;
  budget?: number;
  onClose: () => void;
}

export function HeadToHeadModal({
  items,
  criteria,
  checks,
  initialItemIdA,
  initialItemIdB,
  budget,
  onClose,
}: HeadToHeadModalProps) {
  const [selectedIdA, setSelectedIdA] = useState<number>(() => {
    if (initialItemIdA && items.some(i => i.id === initialItemIdA)) return initialItemIdA;
    return items[0]?.id || 0;
  });

  const [selectedIdB, setSelectedIdB] = useState<number>(() => {
    if (initialItemIdB && items.some(i => i.id === initialItemIdB)) return initialItemIdB;
    return items[1]?.id || items[0]?.id || 0;
  });

  const [onlyDiff, setOnlyDiff] = useState(false);

  const itemA = items.find(i => i.id === selectedIdA);
  const itemB = items.find(i => i.id === selectedIdB);

  if (!itemA || !itemB || items.length < 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md p-4">
        <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line p-5 text-center space-y-4">
          <p className="text-xs text-muted">برای مقایسه رو در رو، حداقل باید دو کالا در این جلسه ثبت شده باشد.</p>
          <button onClick={onClose} className="w-full h-11 rounded-xl bg-lime text-onLime font-bold text-xs">
            متوجه شدم
          </button>
        </div>
      </div>
    );
  }

  const comparison = compareTwoItems(itemA, itemB, criteria, checks, onlyDiff, budget);

  const renderStateBadge = (state: 'PASS' | 'FAIL' | 'UNKNOWN') => {
    if (state === 'PASS') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold text-ok bg-ok/15 px-2 py-0.5 rounded-md">
          <Check size={12} strokeWidth={3} />
          رعایت
        </span>
      );
    }
    if (state === 'FAIL') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/15 px-2 py-0.5 rounded-md">
          <X size={12} strokeWidth={3} />
          رد
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted bg-white/5 px-2 py-0.5 rounded-md">
        <HelpCircle size={12} />
        نامشخص
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-3">
      <div className="w-full max-w-md bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 text-sky flex items-center justify-center">
              <ArrowLeftRight size={16} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">مقایسه دو کالا (رو در رو)</h2>
              <span className="text-[11px] text-muted">بررسی نقطه به نقطه معیارها</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Selection Selectors */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-surface border-b border-line">
          <div>
            <label className="text-[10px] text-muted mb-1 block">گزینه اول (الف)</label>
            <select
              value={selectedIdA}
              onChange={e => setSelectedIdA(Number(e.target.value))}
              className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs font-bold text-white px-2.5 focus:outline-none focus:border-lime"
            >
              {items.map(i => (
                <option key={i.id} value={i.id} disabled={i.id === selectedIdB}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-muted mb-1 block">گزینه دوم (ب)</label>
            <select
              value={selectedIdB}
              onChange={e => setSelectedIdB(Number(e.target.value))}
              className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs font-bold text-white px-2.5 focus:outline-none focus:border-lime"
            >
              {items.map(i => (
                <option key={i.id} value={i.id} disabled={i.id === selectedIdA}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Comparison VS Scoreboard */}
        <div className="p-3 bg-gradient-to-b from-surface/80 to-transparent border-b border-line/60">
          <div className="grid grid-cols-2 gap-3">
            {/* Card A */}
            <div
              className={`p-3 rounded-2xl border transition-all ${
                comparison.overallWinner === 'A'
                  ? 'bg-ok/10 border-ok/40 ring-1 ring-ok/30'
                  : 'bg-surface border-line'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted">گزینه الف</span>
                {comparison.overallWinner === 'A' && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-ok bg-ok/20 px-1.5 py-0.5 rounded-full">
                    <Trophy size={10} />
                    برتر
                  </span>
                )}
              </div>
              <h3 className="text-xs font-black text-white truncate">{itemA.name}</h3>
              <div className="text-xs font-bold text-lime mt-1">
                {itemA.price ? `${Money.toman(itemA.price)} تومان` : 'قیمت نامشخص'}
              </div>

              <div className="mt-2.5 pt-2 border-t border-line/50 flex items-center justify-between text-[11px]">
                <span className="text-muted">تطابق:</span>
                <span className="font-bold text-white">{Money.fa(String(comparison.statsA.matchPercent))}٪</span>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-0.5">
                <span className="text-muted">برتری‌ها:</span>
                <span className="font-black text-ok">{Money.fa(String(comparison.winsA))} معیار</span>
              </div>
            </div>

            {/* Card B */}
            <div
              className={`p-3 rounded-2xl border transition-all ${
                comparison.overallWinner === 'B'
                  ? 'bg-ok/10 border-ok/40 ring-1 ring-ok/30'
                  : 'bg-surface border-line'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted">گزینه ب</span>
                {comparison.overallWinner === 'B' && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-ok bg-ok/20 px-1.5 py-0.5 rounded-full">
                    <Trophy size={10} />
                    برتر
                  </span>
                )}
              </div>
              <h3 className="text-xs font-black text-white truncate">{itemB.name}</h3>
              <div className="text-xs font-bold text-lime mt-1">
                {itemB.price ? `${Money.toman(itemB.price)} تومان` : 'قیمت نامشخص'}
              </div>

              <div className="mt-2.5 pt-2 border-t border-line/50 flex items-center justify-between text-[11px]">
                <span className="text-muted">تطابق:</span>
                <span className="font-bold text-white">{Money.fa(String(comparison.statsB.matchPercent))}٪</span>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-0.5">
                <span className="text-muted">برتری‌ها:</span>
                <span className="font-black text-ok">{Money.fa(String(comparison.winsB))} معیار</span>
              </div>
            </div>
          </div>

          {/* Price difference banner if both prices exist */}
          {comparison.priceDiff !== undefined && comparison.priceDiff !== 0 && (
            <div className="mt-2 text-center text-[11px] text-muted bg-white/[0.03] p-1.5 rounded-xl border border-white/5">
              💡 {comparison.priceDiff > 0 ? (
                <span>
                  «<strong>{itemB.name}</strong>» به اندازه{' '}
                  <strong className="text-ok">{Money.toman(comparison.priceDiff)} تومان</strong> ارزان‌تر است.
                </span>
              ) : (
                <span>
                  «<strong>{itemA.name}</strong>» به اندازه{' '}
                  <strong className="text-ok">{Money.toman(Math.abs(comparison.priceDiff))} تومان</strong> ارزان‌تر است.
                </span>
              )}
            </div>
          )}

          {/* Filter toggle */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-line/40">
            <span className="text-xs text-white/80 font-medium">فقط نمایش تفاوت‌ها ({Money.fa(String(comparison.diffs.length))})</span>
            <button
              onClick={() => setOnlyDiff(prev => !prev)}
              className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                onlyDiff ? 'bg-lime text-onLime' : 'bg-surface2 text-muted border border-line'
              }`}
            >
              {onlyDiff ? 'روشن' : 'خاموش'}
            </button>
          </div>
        </div>

        {/* Differences List */}
        <div className="p-3 flex-1 overflow-y-auto space-y-2">
          {comparison.diffs.length === 0 ? (
            <div className="py-8 text-center text-muted text-xs">
              {onlyDiff ? 'هیچ تفاوتی بین این دو کالا در معیارهای بررسی‌شده یافت نشد.' : 'معیاری برای نمایش وجود ندارد.'}
            </div>
          ) : (
            comparison.diffs.map(({ criterion, stateA, stateB, winner }) => (
              <div
                key={criterion.id}
                className="p-3 rounded-2xl bg-surface border border-line/80 space-y-2 hover:border-line transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {criterion.title}
                    {criterion.strict && (
                      <span className="text-[9px] font-black bg-danger/20 text-danger px-1.5 py-0.2 rounded">
                        خط قرمز
                      </span>
                    )}
                  </span>

                  {winner !== 'TIE' ? (
                    <span className="text-[10px] font-bold text-ok bg-ok/10 px-2 py-0.5 rounded-md">
                      برتری: {winner === 'A' ? itemA.name : itemB.name}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted flex items-center gap-0.5">
                      <Minus size={10} />
                      برابر
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div
                    className={`p-2 rounded-xl flex items-center justify-between ${
                      winner === 'A' ? 'bg-ok/10 border border-ok/20' : 'bg-surface2'
                    }`}
                  >
                    <span className="text-[11px] text-muted truncate max-w-[80px]">{itemA.name}</span>
                    {renderStateBadge(stateA)}
                  </div>

                  <div
                    className={`p-2 rounded-xl flex items-center justify-between ${
                      winner === 'B' ? 'bg-ok/10 border border-ok/20' : 'bg-surface2'
                    }`}
                  >
                    <span className="text-[11px] text-muted truncate max-w-[80px]">{itemB.name}</span>
                    {renderStateBadge(stateB)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
