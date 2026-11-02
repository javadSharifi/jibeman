import React, { useState, useEffect } from 'react';
import { Plus, X, CreditCard, Wallet, Trash2, Check, Edit2 } from 'lucide-react';
import { db, type Account } from '../core/db';
import { getAccountsWithBalances, type AccountWithBalance } from '../core/db/helpers';
import { Banks, findBankByCardPrefix } from '../core/banks';
import { BankKit, CardPalettes } from '../core/bankKit';
import { BankCard } from '../components/BankCard';
import { Money } from '../core/money';

interface AccountsProps {
  hidden: boolean;
  onSelectAccount?: (id: number) => void;
}

export function Accounts({ hidden, onSelectAccount }: AccountsProps) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithBalance | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<'BANK' | 'CASH' | 'WALLET'>('BANK');
  const [bankCode, setBankCode] = useState('blu');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv2, setCardCvv2] = useState('');
  const [iban, setIban] = useState('');
  const [cardColor, setCardColor] = useState<string | null>(null);
  const [initialBalanceStr, setInitialBalanceStr] = useState('');

  const loadAccounts = async () => {
    const list = await getAccountsWithBalances();
    setAccounts(list);
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleOpenAdd = () => {
    setEditingAccount(null);
    resetForm();
    setIsAddOpen(true);
  };

  const handleOpenEdit = (acc: AccountWithBalance) => {
    setEditingAccount(acc);
    setName(acc.name);
    setType(acc.type);
    setBankCode(acc.bankCode || 'blu');
    setCardNumber(acc.cardNumber || '');
    setCardExpiry(acc.cardExpiry || '');
    setCardCvv2(acc.cardCvv2 || '');
    setIban(acc.iban || '');
    setCardColor(acc.cardColor || null);
    setInitialBalanceStr(acc.initialBalance ? Math.floor(acc.initialBalance / 10).toString() : '');
    setIsAddOpen(true);
  };

  const handleCardNumberChange = (raw: string) => {
    const digits = BankKit.cleanDigits(raw).slice(0, 16);
    setCardNumber(digits);
    if (digits.length >= 6) {
      const detected = findBankByCardPrefix(digits);
      if (detected) {
        setBankCode(detected.code);
        if (!name || name.startsWith('حساب')) setName(`حساب ${detected.name}`);
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('لطفاً نام حساب را وارد کنید');
      return;
    }
    const initToman = parseInt(initialBalanceStr, 10) || 0;
    const initialBalance = initToman * 10;

    if (editingAccount) {
      await db.accounts.update(editingAccount.id!, {
        name: name.trim(),
        type,
        bankCode: type === 'BANK' ? bankCode : undefined,
        cardNumber: cardNumber || undefined,
        cardExpiry: cardExpiry || undefined,
        cardCvv2: cardCvv2 || undefined,
        iban: iban ? BankKit.cleanDigits(iban) : undefined,
        cardColor: cardColor || undefined,
        initialBalance,
      });

      if (cardNumber.length >= 4) {
        const last4 = cardNumber.slice(-4);
        const existingCard = await db.cards.where('accountId').equals(editingAccount.id!).first();
        if (existingCard) {
          await db.cards.update(existingCard.id!, { last4 });
        } else {
          await db.cards.add({ accountId: editingAccount.id!, last4 });
        }
      }

      setIsAddOpen(false);
      setEditingAccount(null);
      resetForm();
      loadAccounts();
      return;
    }

    const accId = await db.accounts.add({
      name: name.trim(),
      type,
      bankCode: type === 'BANK' ? bankCode : undefined,
      cardNumber: cardNumber || undefined,
      cardExpiry: cardExpiry || undefined,
      cardCvv2: cardCvv2 || undefined,
      iban: iban ? BankKit.cleanDigits(iban) : undefined,
      cardColor: cardColor || undefined,
      initialBalance,
      style: 0,
      archived: false,
      sortOrder: accounts.length,
    });

    if (cardNumber.length >= 4) {
      await db.cards.add({
        accountId: accId,
        last4: cardNumber.slice(-4),
      });
    }

    setIsAddOpen(false);
    resetForm();
    loadAccounts();
  };

  const resetForm = () => {
    setName('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv2('');
    setIban('');
    setCardColor(null);
    setInitialBalanceStr('');
  };

  const handleDelete = async (id: number) => {
    if (confirm('با حذف حساب، تراکنش‌های مربوط به آن نیز پاک خواهند شد. ادامه می‌دهید؟')) {
      await db.accounts.delete(id);
      await db.cards.where('accountId').equals(id).delete();
      await db.txns.where('accountId').equals(id).delete();
      loadAccounts();
    }
  };

  return (
    <div className="flex flex-col pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-black text-white">حساب‌ها و کارت‌ها</h1>
          <span className="text-xs text-muted">مدیریت کارت‌های شتابی، حساب‌های بانکی و کیف پول</span>
        </div>
        <button
          onClick={handleOpenAdd}
          className="h-10 px-3.5 rounded-2xl bg-lime text-onLime font-bold text-xs flex items-center gap-1.5 shadow-fab active:scale-95 transition-transform"
        >
          <Plus size={16} strokeWidth={2.8} />
          کارت جدید
        </button>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {accounts.map(acc => (
          <div key={acc.id} className="rounded-[28px] bg-surface/50 border border-white/5 p-2">
            <BankCard
              account={acc}
              hidden={hidden}
              variant="large"
              onEdit={() => handleOpenEdit(acc)}
              onClick={() => onSelectAccount && onSelectAccount(acc.id!)}
            />
            <div className="flex items-center justify-between mt-2.5 px-2">
              <button
                type="button"
                onClick={() => handleOpenEdit(acc)}
                className="h-8 px-3 rounded-xl bg-surface border border-line text-sky hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors active:scale-95"
              >
                <Edit2 size={13} />
                ویرایش مشخصات کارت
              </button>
              <button
                type="button"
                onClick={() => handleDelete(acc.id!)}
                className="h-8 px-3 rounded-xl bg-surface border border-line text-muted hover:text-bad text-xs font-bold flex items-center gap-1.5 transition-colors active:scale-95"
              >
                <Trash2 size={13} />
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Account Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="text-sm font-bold text-white">
                {editingAccount ? 'ویرایش مشخصات کارت و حساب' : 'افزودن کارت یا حساب بانکی'}
              </h2>
              <button
                onClick={() => setIsAddOpen(false)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Live Card Preview */}
            {type === 'BANK' && (
              <div className="my-1">
                <BankCard
                  account={{
                    id: editingAccount?.id || 0,
                    name: name || 'نام کارت',
                    type: 'BANK',
                    bankCode,
                    cardNumber,
                    cardExpiry,
                    cardCvv2,
                    iban,
                    cardColor: cardColor || undefined,
                    initialBalance: (parseInt(initialBalanceStr, 10) || 0) * 10,
                    style: 0,
                    archived: false,
                    sortOrder: 0,
                    balance: editingAccount ? editingAccount.balance : (parseInt(initialBalanceStr, 10) || 0) * 10,
                    last4: cardNumber.slice(-4),
                  }}
                  variant="large"
                  interactive={false}
                />
              </div>
            )}

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('BANK')}
                className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  type === 'BANK' ? 'bg-lime text-onLime shadow' : 'bg-surface text-muted'
                }`}
              >
                <CreditCard size={15} />
                کارت بانکی
              </button>
              <button
                type="button"
                onClick={() => setType('CASH')}
                className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  type === 'CASH' ? 'bg-lime text-onLime shadow' : 'bg-surface text-muted'
                }`}
              >
                <Wallet size={15} />
                پول نقد
              </button>
              <button
                type="button"
                onClick={() => setType('WALLET')}
                className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  type === 'WALLET' ? 'bg-lime text-onLime shadow' : 'bg-surface text-muted'
                }`}
              >
                کیف پول
              </button>
            </div>

            {type === 'BANK' && (
              <>
                <div>
                  <label className="text-[11px] text-muted block mb-1">شماره ۱۶ رقمی کارت</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="6219 8618 0000 0000"
                    value={cardNumber ? BankKit.formatCardNumber(cardNumber) : ''}
                    onChange={(e) => handleCardNumberChange(e.target.value)}
                    className="w-full h-11 rounded-xl bg-surface border border-line text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-sky"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-muted block mb-1">بانک صادرکننده</label>
                  <select
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
                  >
                    {Banks.map(b => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted block mb-1">تاریخ انقضا (ماه/سال)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="05/08"
                      dir="ltr"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(BankKit.cleanDigits(e.target.value).slice(0, 4))}
                      className="w-full h-11 rounded-xl bg-surface border border-line text-white font-mono text-center text-xs focus:outline-none focus:border-sky"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted block mb-1">کد CVV2</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="•••"
                      dir="ltr"
                      value={cardCvv2}
                      onChange={(e) => setCardCvv2(BankKit.cleanDigits(e.target.value).slice(0, 4))}
                      className="w-full h-11 rounded-xl bg-surface border border-line text-white font-mono text-center text-xs focus:outline-none focus:border-sky"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted block mb-1">شماره شبا (اختیاری)</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="IR12 0120 0000 ..."
                    value={iban ? BankKit.formatIban(iban) : ''}
                    onChange={(e) => setIban(e.target.value)}
                    className="w-full h-11 rounded-xl bg-surface border border-line text-white font-mono text-xs px-3 focus:outline-none focus:border-sky"
                  />
                </div>

                {/* Card Color Palette */}
                <div>
                  <label className="text-[11px] text-muted block mb-1.5">رنگ سفارشی کارت</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button
                      type="button"
                      onClick={() => setCardColor(null)}
                      className={`h-7 px-2.5 rounded-full text-[10px] font-bold border transition-all ${
                        cardColor === null ? 'bg-lime text-onLime border-transparent' : 'bg-surface text-muted border-line'
                      }`}
                    >
                      رنگ پیش‌فرض بانک
                    </button>
                    {CardPalettes.presets.map(p => (
                      <button
                        key={p.color}
                        type="button"
                        onClick={() => setCardColor(p.color)}
                        title={p.name}
                        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center transition-transform ${
                          cardColor === p.color ? 'ring-2 ring-lime scale-110' : 'opacity-80'
                        }`}
                        style={{ backgroundColor: p.color }}
                      >
                        {cardColor === p.color && <Check size={14} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-[11px] text-muted block mb-1">نام دلخواه حساب / کارت</label>
              <input
                type="text"
                placeholder="مثلاً: کارت حقوق، پس‌انداز..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">موجودی فعلی (تومان)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="۰"
                value={initialBalanceStr}
                onChange={(e) => setInitialBalanceStr(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
              {initialBalanceStr && (
                <span className="text-[11px] text-muted block mt-1">
                  {Money.words(parseInt(initialBalanceStr, 10))} تومان
                </span>
              )}
            </div>

            <button
              onClick={handleSave}
              className="w-full h-12 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab active:scale-95 transition-transform"
            >
              <Check size={16} />
              {editingAccount ? 'ذخیره تغییرات کارت' : 'افزودن و ذخیره کارت'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
