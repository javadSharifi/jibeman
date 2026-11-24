import React, { useState, useEffect } from 'react';
import { X, Award, CheckCircle2, Target, CreditCard } from 'lucide-react';
import { db, type CompareSession, type CompareItem, type Account, type Category } from '../../core/db';
import { Money } from '../../core/money';

interface DecideModalProps {
  session: CompareSession;
  item: CompareItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function DecideModal({
  session,
  item,
  onClose,
  onSuccess,
}: DecideModalProps) {
  const [decisionNote, setDecisionNote] = useState(session.decisionNote || '');
  const [actionType, setActionType] = useState<'NONE' | 'TXN' | 'GOAL'>('NONE');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      db.accounts.where('archived').equals(0).toArray(),
      db.categories.where('kind').equals('EXPENSE').toArray(),
    ]).then(([accs, cats]) => {
      setAccounts(accs);
      if (accs.length > 0) setSelectedAccountId(accs[0].id!);
      setCategories(cats);
      // Try to find a shopping-related category
      const shoppingCat = cats.find(c => c.name.includes('خرید') || c.name.includes('کالا'));
      if (shoppingCat) setSelectedCategoryId(shoppingCat.id!);
      else if (cats.length > 0) setSelectedCategoryId(cats[0].id!);
    });
  }, []);

  const handleConfirmDecision = async () => {
    setIsSubmitting(true);
    try {
      // 1. Mark session as decided
      await db.compareSessions.update(session.id!, {
        status: 'DECIDED',
        chosenItemId: item.id!,
        decisionNote: decisionNote.trim() || undefined,
        decidedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 2. Perform optional financial action
      if (actionType === 'TXN' && item.price && selectedAccountId) {
        await db.txns.add({
          type: 'EXPENSE',
          amount: item.price,
          accountId: selectedAccountId,
          categoryId: selectedCategoryId || undefined,
          title: `خرید ${item.name}`,
          note: decisionNote.trim() || `انتخاب شده در مقایسه «${session.title}»`,
          occurredAt: Date.now(),
          source: 'MANUAL',
          createdAt: Date.now(),
        });
      } else if (actionType === 'GOAL' && item.price) {
        await db.goals.add({
          title: `خرید ${item.name}`,
          target: item.price,
          icon: 'Target',
          color: 4,
          closed: false,
          createdAt: Date.now(),
        });
      }

      onSuccess();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-4">
      <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-lime/20 text-lime flex items-center justify-center">
              <Award size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">انتخاب گزینه نهایی</h2>
              <span className="text-[11px] text-muted">ثبت تصمیم و نتیجه مقایسه</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Winner Item Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-lime/10 to-surface border border-lime/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center font-bold shrink-0">
              <Award size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-lime block">کالای برگزیده شما:</span>
              <h3 className="text-sm font-black text-white truncate">{item.name}</h3>
              {item.price && (
                <div className="text-xs font-bold text-white/90 mt-0.5">
                  {Money.toman(item.price)} تومان
                </div>
              )}
            </div>
          </div>

          {/* Decision Reason / Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white flex items-center gap-1">
              📝 دلیل انتخاب شما:
            </label>
            <textarea
              rows={2}
              value={decisionNote}
              onChange={e => setDecisionNote(e.target.value)}
              placeholder="مثلاً: بهترین ترکیب قیمت و کیفیت دوربین را داشت و گارانتی معتبرتر بود..."
              className="w-full bg-surface2 border border-line rounded-xl p-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
            />
          </div>

          {/* Jibeman Direct Financial Actions */}
          <div className="space-y-2 pt-1 border-t border-line/50">
            <label className="text-xs font-bold text-white block">یکپارچگی با جیب من:</label>

            {/* Option 1: Just decide */}
            <div
              onClick={() => setActionType('NONE')}
              className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                actionType === 'NONE'
                  ? 'bg-white/10 border-white/40 ring-1 ring-white/20'
                  : 'bg-surface border-line'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                actionType === 'NONE' ? 'border-lime bg-lime text-onLime' : 'border-muted'
              }`}>
                {actionType === 'NONE' && <CheckCircle2 size={12} />}
              </div>
              <div className="text-xs font-medium text-white/90">
                فقط ثبت به عنوان برنده (بدون عملیات مالی)
              </div>
            </div>

            {/* Option 2: Record expense */}
            {item.price && item.price > 0 && (
              <div
                onClick={() => setActionType('TXN')}
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  actionType === 'TXN'
                    ? 'bg-ok/10 border-ok/40 ring-1 ring-ok/30'
                    : 'bg-surface border-line'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  actionType === 'TXN' ? 'border-ok bg-ok text-black' : 'border-muted'
                }`}>
                  {actionType === 'TXN' && <CheckCircle2 size={12} />}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CreditCard size={13} className="text-ok" />
                    خریداری شد (ثبت تراکنش هزینه در حساب بانکی)
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    کسر مبلغ {Money.toman(item.price)} تومان از موجودی کارت
                  </div>
                </div>
              </div>
            )}

            {/* Sub-form if TXN is chosen */}
            {actionType === 'TXN' && (
              <div className="p-3 bg-surface2 rounded-xl border border-line space-y-2 text-xs">
                <div>
                  <label className="text-[10px] text-muted block mb-1">پرداخت از حساب / کارت:</label>
                  <select
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(Number(e.target.value))}
                    className="w-full h-9 rounded-lg bg-surface border border-line text-xs text-white px-2 focus:outline-none"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-muted block mb-1">دسته‌بندی هزینه:</label>
                  <select
                    value={selectedCategoryId}
                    onChange={e => setSelectedCategoryId(Number(e.target.value))}
                    className="w-full h-9 rounded-lg bg-surface border border-line text-xs text-white px-2 focus:outline-none"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Option 3: Add to savings goals */}
            {item.price && item.price > 0 && (
              <div
                onClick={() => setActionType('GOAL')}
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  actionType === 'GOAL'
                    ? 'bg-sky/10 border-sky/40 ring-1 ring-sky/30'
                    : 'bg-surface border-line'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  actionType === 'GOAL' ? 'border-sky bg-sky text-black' : 'border-muted'
                }`}>
                  {actionType === 'GOAL' && <CheckCircle2 size={12} />}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Target size={13} className="text-sky" />
                    قصد خرید دارم (افزودن به اهداف پس‌انداز)
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    ایجاد قلک پس‌انداز با مبلغ هدف {Money.toman(item.price)} تومان
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-line bg-surface/50">
          <button
            disabled={isSubmitting}
            onClick={handleConfirmDecision}
            className="w-full h-12 rounded-2xl bg-lime text-onLime font-extrabold text-sm shadow-fab active:scale-98 transition-transform disabled:opacity-50"
          >
            {isSubmitting ? 'در حال ثبت...' : 'تایید و ثبت نهایی تصمیم'}
          </button>
        </div>
      </div>
    </div>
  );
}
