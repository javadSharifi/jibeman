import React, { useState, useEffect } from 'react';
import { AmountInput } from '../components/AmountInput';
import { Plus, X, Users, Receipt, UserPlus, CheckCircle2 } from 'lucide-react';
import { db, type SplitGroup, type SplitExpense, type SplitMember, type Person } from '../core/db';
import { Money } from '../core/money';
import { HeaderBar } from '../components/UI';

interface GroupWithTotal extends SplitGroup {
  total: number;
  memberCount: number;
}

export function Splits({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [groups, setGroups] = useState<GroupWithTotal[]>([]);
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupWithTotal | null>(null);
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);

  // Add Group
  const [newTitle, setNewTitle] = useState('');

  // Add Expense
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmountToman, setExpenseAmountToman] = useState('');

  const loadGroups = async () => {
    const [allGroups, allMembers, allExpenses] = await Promise.all([
      db.splitGroups.toArray(),
      db.splitMembers.toArray(),
      db.splitExpenses.toArray(),
    ]);

    const withTotals: GroupWithTotal[] = allGroups.map(g => {
      const gExpenses = allExpenses.filter(e => e.groupId === g.id && !e.settlement);
      const total = gExpenses.reduce((acc, e) => acc + e.amount, 0);
      const members = allMembers.filter(m => m.groupId === g.id);
      return {
        ...g,
        total,
        memberCount: Math.max(1, members.length),
      };
    });
    setGroups(withTotals);
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const openGroupDetails = async (g: GroupWithTotal) => {
    setActiveGroup(g);
    const exp = await db.splitExpenses.where('groupId').equals(g.id!).reverse().sortBy('at');
    setExpenses(exp);
  };

  const handleCreateGroup = async () => {
    if (!newTitle.trim()) return;
    const gId = await db.splitGroups.add({
      title: newTitle.trim(),
      closed: false,
      createdAt: Date.now(),
    });
    // add 'Me' as first member
    await db.splitMembers.add({
      groupId: gId,
      personId: null,
    });

    setIsAddGroupOpen(false);
    setNewTitle('');
    loadGroups();
  };

  const handleAddExpense = async () => {
    if (!activeGroup) return;
    const amount = Money.parseToman(expenseAmountToman);
    if (!expenseTitle.trim() || !amount) return;

    await db.splitExpenses.add({
      groupId: activeGroup.id!,
      title: expenseTitle.trim(),
      amount,
      payerId: 0,
      at: Date.now(),
      settlement: false,
    });

    setIsAddExpenseOpen(false);
    setExpenseTitle('');
    setExpenseAmountToman('');
    openGroupDetails(activeGroup);
    loadGroups();
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title={activeGroup ? activeGroup.title : 'محاسبه دنگ (هزینه‌های گروهی)'}
        onBack={activeGroup ? () => setActiveGroup(null) : onBack}
        action={
          !activeGroup ? (
            <button
              onClick={() => setIsAddGroupOpen(true)}
              className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
            >
              <Plus size={20} strokeWidth={2.8} />
            </button>
          ) : (
            <button
              onClick={() => setIsAddExpenseOpen(true)}
              className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
            >
              <Plus size={20} strokeWidth={2.8} />
            </button>
          )
        }
      />

      {!activeGroup ? (
        <div className="space-y-3 mt-4">
          {groups.map(g => (
            <div
              key={g.id}
              onClick={() => openGroupDetails(g)}
              className="p-4 rounded-[22px] bg-surface border border-line flex items-center justify-between cursor-pointer active:scale-98 transition-transform"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky/15 text-sky flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{g.title}</h3>
                  <div className="text-[11px] text-muted">
                    {g.memberCount} عضو
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-muted block">مجموع خرج‌ها:</span>
                <span className="text-sm font-black text-white dir-ltr">
                  {hidden ? '•••' : Money.toman(g.total)}
                  <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
                </span>
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="py-20 text-center text-muted text-xs">
              هیچ گروه دنگی وجود ندارد. با دکمه + یک گروه جدید برای سفر، مهمانی یا کار بسازید!
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          <div className="p-4 rounded-[22px] bg-gradient-to-br from-[#1E3F9E] to-surface border border-white/10 text-white">
            <span className="text-xs text-white/70 block">کل هزینه‌های گروه:</span>
            <div className="text-2xl font-black mt-1 dir-ltr">
              {hidden ? '•••' : Money.toman(activeGroup.total)} تومان
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-white block">خرج‌های ثبت‌شده در گروه:</span>
            {expenses.map(e => (
              <div key={e.id} className="p-3 rounded-2xl bg-surface border border-line flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-white block">{e.title}</span>
                  <span className="text-[10px] text-muted">پرداخت‌کننده: من</span>
                </div>
                <div className="font-bold text-white dir-ltr">
                  {Money.toman(e.amount)} تومان
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="py-8 text-center text-muted text-xs">
                هنوز خرجی در این گروه ثبت نشده است. با دکمه + خرج اول را ثبت کنید.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {isAddGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">ایجاد گروه دنگ جدید</h2>
              <button onClick={() => setIsAddGroupOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">نام گروه</label>
              <input
                type="text"
                placeholder="مثلاً: سفر شمال، کافه جمعه..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <button
              onClick={handleCreateGroup}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ایجاد گروه
            </button>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">ثبت خرج دونگی</h2>
              <button onClick={() => setIsAddExpenseOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">بابتِ چی؟ (عنوان)</label>
              <input
                type="text"
                placeholder="مثلاً: خرید گوشت، بلیط قطار..."
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label htmlFor="split-expense-amount" className="text-[11px] text-muted block mb-1">مبلغ کل خرج (تومان)</label>
              <AmountInput
                id="split-expense-amount"
                placeholder="۰"
                value={expenseAmountToman}
                onChange={setExpenseAmountToman}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <button
              onClick={handleAddExpense}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ثبت خرج
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
