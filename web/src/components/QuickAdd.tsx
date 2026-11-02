import React, { useState, useEffect } from 'react';
import { X, Delete, ArrowLeftRight, Check } from 'lucide-react';
import { db, type Account, type Category } from '../core/db';
import { Money } from '../core/money';
import { CategoryIcon } from './UI';

interface QuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  onSuccess?: () => void;
}

export function QuickAdd({ isOpen, onClose, defaultType = 'EXPENSE', onSuccess }: QuickAddProps) {
  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>(defaultType);
  const [amountStr, setAmountStr] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selectedAccId, setSelectedAccId] = useState<number | null>(null);
  const [selectedToAccId, setSelectedToAccId] = useState<number | null>(null);
  const [title, setTitle] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      setAmountStr('');
      setTitle('');

      // Load data
      db.accounts.filter(a => !a.archived).sortBy('sortOrder').then(accs => {
        setAccounts(accs);
        if (accs.length > 0) {
          setSelectedAccId(accs[0].id!);
          if (accs.length > 1) setSelectedToAccId(accs[1].id!);
        }
      });
    }
  }, [isOpen, defaultType]);

  useEffect(() => {
    if (type !== 'TRANSFER') {
      db.categories.where('kind').equals(type).sortBy('sortOrder').then(cats => {
        setCategories(cats);
        if (cats.length > 0) setSelectedCatId(cats[0].id!);
      });
    }
  }, [type]);

  if (!isOpen) return null;

  const toman = parseInt(amountStr, 10) || 0;
  const rial = toman * 10;
  const words = toman > 0 ? `${Money.words(toman)} تومان` : '';

  const handleDigit = (d: string) => {
    if (amountStr.length >= 12) return;
    if (amountStr === '' && (d === '0' || d === '000')) return;
    setAmountStr(prev => prev + d);
  };

  const handleDelete = () => {
    setAmountStr(prev => prev.slice(0, -1));
  };

  const handleSave = async () => {
    if (rial <= 0 || !selectedAccId) return;

    if (type === 'TRANSFER') {
      if (!selectedToAccId || selectedAccId === selectedToAccId) {
        alert('لطفاً دو حساب متفاوت برای انتقال انتخاب کنید');
        return;
      }
      await db.txns.add({
        type: 'TRANSFER',
        amount: rial,
        accountId: selectedAccId,
        toAccountId: selectedToAccId,
        title: title || 'انتقال وجه',
        occurredAt: Date.now(),
        source: 'MANUAL',
        createdAt: Date.now(),
      });
    } else {
      await db.txns.add({
        type,
        amount: rial,
        accountId: selectedAccId,
        categoryId: selectedCatId || undefined,
        title: title || undefined,
        occurredAt: Date.now(),
        source: 'MANUAL',
        createdAt: Date.now(),
      });
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-sheet rounded-t-[32px] border-t border-white/10 p-4 pb-8 flex flex-col max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Handle bar & Close */}
        <div className="flex items-center justify-between pb-2">
          <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto" />
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented Type Switcher */}
        <div className="flex bg-surface rounded-2xl p-1 gap-1 mt-2">
          <button
            type="button"
            onClick={() => setType('EXPENSE')}
            className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
              type === 'EXPENSE' ? 'bg-lime text-onLime shadow' : 'text-t2 hover:text-white'
            }`}
          >
            هزینه
          </button>
          <button
            type="button"
            onClick={() => setType('INCOME')}
            className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
              type === 'INCOME' ? 'bg-lime text-onLime shadow' : 'text-t2 hover:text-white'
            }`}
          >
            درآمد
          </button>
          <button
            type="button"
            onClick={() => setType('TRANSFER')}
            className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
              type === 'TRANSFER' ? 'bg-lime text-onLime shadow' : 'text-t2 hover:text-white'
            }`}
          >
            انتقال
          </button>
        </div>

        {/* Large Amount Display */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="flex items-baseline gap-2 dir-ltr">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {amountStr ? Money.group(toman) : '۰'}
            </span>
            <span className="text-sm font-medium text-muted">تومان</span>
          </div>
          <div className="text-xs text-muted mt-1 h-5 text-center px-4 truncate">
            {words}
          </div>
        </div>

        {/* Account selection */}
        <div className="space-y-3 mb-3">
          {type === 'TRANSFER' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted block mb-1">از حساب</label>
                <select
                  value={selectedAccId || ''}
                  onChange={(e) => setSelectedAccId(Number(e.target.value))}
                  className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">به حساب</label>
                <select
                  value={selectedToAccId || ''}
                  onChange={(e) => setSelectedToAccId(Number(e.target.value))}
                  className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-muted block mb-1">حساب مبدا</label>
              <select
                value={selectedAccId || ''}
                onChange={(e) => setSelectedAccId(Number(e.target.value))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title / Description */}
          <div>
            <input
              type="text"
              placeholder="توضیح یا عنوان (اختیاری)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky placeholder:text-muted"
            />
          </div>
        </div>

        {/* Categories (for Expense/Income) */}
        {type !== 'TRANSFER' && (
          <div className="mb-3">
            <span className="text-[11px] text-muted block mb-2">دسته‌بندی</span>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {categories.map(cat => {
                const isSelected = selectedCatId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCatId(cat.id!)}
                    className={`flex flex-col items-center gap-1 min-w-[58px] p-1.5 rounded-2xl transition-all ${
                      isSelected ? 'bg-white/10 ring-2 ring-lime' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <CategoryIcon icon={cat.icon} colorIdx={cat.color} size={18} />
                    <span className="text-[10px] text-white truncate max-w-[54px]">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 my-2 dir-ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-12 rounded-2xl bg-surface hover:bg-surface2 active:bg-white/10 text-white font-bold text-lg flex items-center justify-center transition-colors"
            >
              {Money.fa(d)}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            className="h-12 rounded-2xl bg-surface hover:bg-surface2 active:bg-white/10 text-white flex items-center justify-center transition-colors"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Submit Button */}
        <button
          type="button"
          disabled={rial <= 0}
          onClick={handleSave}
          className="w-full h-13 mt-2 py-3 rounded-2xl bg-lime text-onLime font-extrabold text-sm flex items-center justify-center gap-2 shadow-fab active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          <Check size={20} strokeWidth={2.8} />
          <span>ثبت تراکنش</span>
        </button>
      </div>
    </div>
  );
}
