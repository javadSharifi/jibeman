import React, { useState } from 'react';
import { X, Table, Check, HelpCircle } from 'lucide-react';
import type { CompareItem, CompareCriterion, CompareCheck } from '../../core/db';
import { stateOf, noteOf, calculateItemStats } from '../../core/compareEngine';
import { Money } from '../../core/money';

interface MatrixModalProps {
  items: CompareItem[];
  criteria: CompareCriterion[];
  checks: CompareCheck[];
  budget?: number;
  onClose: () => void;
}

export function MatrixModal({
  items,
  criteria,
  checks,
  budget,
  onClose,
}: MatrixModalProps) {
  const [activeNote, setActiveNote] = useState<{ title: string; note: string } | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/85 backdrop-blur-md animate-fade-in p-2 sm:p-4">
      <div className="w-full max-w-2xl bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center">
              <Table size={16} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">ماتریس جامع مقایسه</h2>
              <span className="text-[11px] text-muted">
                جدول تقاطعی {Money.fa(String(items.length))} کالا و {Money.fa(String(criteria.length))} معیار
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="flex-1 overflow-auto p-3">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-2.5 font-bold text-muted bg-surface/90 sticky top-0 right-0 z-20 min-w-[140px] rounded-tr-xl">
                    معیارهای مقایسه
                  </th>
                  {items.map(item => (
                    <th
                      key={item.id}
                      className="p-2.5 font-bold text-center bg-surface/90 sticky top-0 z-10 min-w-[120px]"
                    >
                      <div className="text-white font-black truncate max-w-[110px] mx-auto">{item.name}</div>
                      <div className="text-[10px] text-lime font-medium mt-0.5">
                        {item.price ? `${Money.toman(item.price)} ت` : 'بدون قیمت'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-line/40">
                {criteria.map((criterion, idx) => (
                  <tr key={criterion.id} className={idx % 2 === 0 ? 'bg-white/[0.01]' : 'bg-transparent'}>
                    {/* Criterion Title Cell */}
                    <td className="p-2.5 sticky right-0 bg-sheet z-10 font-medium text-white/90 border-l border-line/50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="leading-tight">{criterion.title}</span>
                        {criterion.strict && (
                          <span className="text-[9px] font-black bg-danger/20 text-danger px-1 py-0.2 rounded">
                            خط قرمز
                          </span>
                        )}
                        {criterion.weight === 3 && (
                          <span className="text-[9px] font-bold text-amber-300">★۳</span>
                        )}
                      </div>
                    </td>

                    {/* Item Evaluation Cells */}
                    {items.map(item => {
                      const state = stateOf(item.id!, criterion.id!, checks);
                      const note = noteOf(item.id!, criterion.id!, checks);

                      return (
                        <td
                          key={item.id}
                          onClick={() => {
                            if (note) setActiveNote({ title: `${item.name} · ${criterion.title}`, note });
                          }}
                          className={`p-2 text-center transition-colors cursor-pointer ${
                            note ? 'hover:bg-white/5' : ''
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center">
                            {state === 'PASS' && (
                              <div className="w-7 h-7 rounded-lg bg-ok/15 text-ok border border-ok/30 flex items-center justify-center">
                                <Check size={14} strokeWidth={3} />
                              </div>
                            )}
                            {state === 'FAIL' && (
                              <div className="w-7 h-7 rounded-lg bg-danger/15 text-danger border border-danger/30 flex items-center justify-center">
                                <X size={14} strokeWidth={3} />
                              </div>
                            )}
                            {state === 'UNKNOWN' && (
                              <div className="w-7 h-7 rounded-lg bg-surface2 text-muted/60 flex items-center justify-center">
                                <HelpCircle size={14} />
                              </div>
                            )}
                            {note && (
                              <span className="text-[9px] text-sky mt-0.5 underline">یادداشت</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              {/* Summary Footer */}
              <tfoot>
                <tr className="border-t-2 border-line bg-surface/80 font-bold">
                  <td className="p-2.5 sticky right-0 bg-surface/90 z-10 text-white rounded-br-xl">
                    <div>درصد تطابق</div>
                    <div className="text-[10px] text-muted font-normal">(رعایت / رد / نامشخص)</div>
                  </td>
                  {items.map(item => {
                    const stats = calculateItemStats(item, criteria, checks, budget);
                    return (
                      <td key={item.id} className="p-2.5 text-center">
                        <div className="text-sm font-black text-lime">{Money.fa(String(stats.matchPercent))}٪</div>
                        <div className="text-[10px] text-muted mt-0.5 space-x-1 space-x-reverse">
                          <span className="text-ok">✓{Money.fa(String(stats.pass))}</span>
                          <span>·</span>
                          <span className="text-danger">✕{Money.fa(String(stats.fail))}</span>
                          <span>·</span>
                          <span className="text-muted">?{Money.fa(String(stats.unknown))}</span>
                        </div>
                        {stats.hasStrictFailure && (
                          <div className="text-[9px] font-bold text-danger mt-1">⚠️ رد خط قرمز</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Note Viewer Popover if clicked */}
        {activeNote && (
          <div className="p-3 bg-surface border-t border-line flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-muted block">{activeNote.title}</span>
              <span className="text-white font-bold">{activeNote.note}</span>
            </div>
            <button
              onClick={() => setActiveNote(null)}
              className="text-xs text-sky px-2 py-1 rounded bg-surface2"
            >
              بستن
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
