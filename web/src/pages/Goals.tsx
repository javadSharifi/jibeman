import React, { useState, useEffect } from 'react';
import { Plus, X, Target, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { db, type Goal, type GoalEntry } from '../core/db';
import { Money } from '../core/money';
import { HeaderBar } from '../components/UI';

interface GoalWithSaved extends Goal {
  saved: number;
}

export function Goals({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [goals, setGoals] = useState<GoalWithSaved[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [entryTargetGoal, setEntryTargetGoal] = useState<GoalWithSaved | null>(null);

  // Add Goal Form
  const [title, setTitle] = useState('');
  const [targetToman, setTargetToman] = useState('');

  // Entry Form
  const [entryAmountToman, setEntryAmountToman] = useState('');
  const [isDeposit, setIsDeposit] = useState(true);

  const loadGoals = async () => {
    const [allGoals, allEntries] = await Promise.all([
      db.goals.toArray(),
      db.goalEntries.toArray(),
    ]);

    const withSaved: GoalWithSaved[] = allGoals.map(g => {
      const entries = allEntries.filter(e => e.goalId === g.id);
      const saved = entries.reduce((acc, e) => acc + e.amount, 0);
      return {
        ...g,
        saved: Math.max(0, saved),
      };
    });
    setGoals(withSaved);
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleSaveGoal = async () => {
    const tT = parseInt(targetToman, 10);
    if (!title.trim() || !tT) {
      alert('لطفاً عنوان و مبلغ هدف را وارد کنید');
      return;
    }

    await db.goals.add({
      title: title.trim(),
      target: tT * 10,
      icon: 'Target',
      color: 4,
      closed: false,
      createdAt: Date.now(),
    });

    setIsAddOpen(false);
    setTitle('');
    setTargetToman('');
    loadGoals();
  };

  const handleAddEntry = async () => {
    if (!entryTargetGoal) return;
    const aT = parseInt(entryAmountToman, 10);
    if (!aT) return;

    const rial = aT * 10;
    await db.goalEntries.add({
      goalId: entryTargetGoal.id!,
      amount: isDeposit ? rial : -rial,
      at: Date.now(),
    });

    setEntryTargetGoal(null);
    setEntryAmountToman('');
    loadGoals();
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="اهداف پس‌انداز"
        onBack={onBack}
        action={
          <button
            onClick={() => setIsAddOpen(true)}
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
          >
            <Plus size={20} strokeWidth={2.8} />
          </button>
        }
      />

      <div className="space-y-4 mt-4">
        {goals.map(g => {
          const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
          const savedToman = Math.floor(g.saved / 10);
          const targetTomanVal = Math.floor(g.target / 10);

          return (
            <div key={g.id} className="p-4 rounded-[24px] bg-surface border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-lime/15 text-lime flex items-center justify-center">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{g.title}</h3>
                    <div className="text-[11px] text-muted">
                      هدف: {hidden ? '•••' : `${Money.group(targetTomanVal)} تومان`}
                    </div>
                  </div>
                </div>

                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primaryStrong text-white">
                  {pct}٪
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-lime to-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <div>
                  <span className="text-muted block text-[10px]">موجودی پس‌انداز شده:</span>
                  <span className="font-extrabold text-white">
                    {hidden ? '•••' : `${Money.group(savedToman)} تومان`}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setEntryTargetGoal(g);
                    setIsDeposit(true);
                  }}
                  className="h-8 px-3 rounded-xl bg-surface2 hover:bg-white/10 text-white font-bold text-xs flex items-center gap-1 border border-line"
                >
                  واریز / برداشت
                </button>
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="py-20 text-center text-muted text-xs">
            هیچ هدف پس‌اندازی ثبت نشده است. با دکمه + یک قلک یا هدف مالی جدید بسازید!
          </div>
        )}
      </div>

      {/* Add Goal Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">هدف پس‌انداز جدید</h2>
              <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">عنوان هدف</label>
              <input
                type="text"
                placeholder="مثلاً: خرید لپ‌تاپ، سفر، خودرو..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">مبلغ هدف (تومان)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="۰"
                value={targetToman}
                onChange={(e) => setTargetToman(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <button
              onClick={handleSaveGoal}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ایجاد هدف
            </button>
          </div>
        </div>
      )}

      {/* Deposit / Withdraw Modal */}
      {entryTargetGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">تغییر موجودی {entryTargetGoal.title}</h2>
              <button onClick={() => setEntryTargetGoal(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsDeposit(true)}
                className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  isDeposit ? 'bg-lime text-onLime shadow' : 'bg-surface text-muted'
                }`}
              >
                <ArrowDownLeft size={16} />
                افزودن به پس‌انداز
              </button>
              <button
                type="button"
                onClick={() => setIsDeposit(false)}
                className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  !isDeposit ? 'bg-lime text-onLime shadow' : 'bg-surface text-muted'
                }`}
              >
                <ArrowUpRight size={16} />
                برداشت از پس‌انداز
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">مبلغ (تومان)</label>
              <input
                type="text"
                inputMode="numeric"
                value={entryAmountToman}
                onChange={(e) => setEntryAmountToman(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <button
              onClick={handleAddEntry}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ثبت تغییر
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
