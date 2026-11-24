import React, { useState, useEffect } from 'react';
import { AmountInput } from '../components/AmountInput';
import { Plus, X, CreditCard, Wallet, Trash2, Check, Edit2, Pencil, PiggyBank, RotateCcw, ArrowRight, Eye, Copy } from 'lucide-react';
import { db, type Account } from '../core/db';
import { getAccountsWithBalances, getSavingsCommitments, returnToSavings, type AccountWithBalance, type SavingsCommitmentWithRemaining } from '../core/db/helpers';
import { Jalali } from '../core/jalali';
import { Banks, findBankByCardPrefix } from '../core/banks';
import { BankKit, CardPalettes } from '../core/bankKit';
import { BankCard } from '../components/BankCard';
import { Select } from '../components/Select';
import { Money } from '../core/money';
import { protectInTransaction, revealRow } from '../core/db/protectedRows';
import { isLockEnabled } from '../core/security';

interface AccountsProps {
  hidden: boolean;
  onSelectAccount?: (id: number) => void;
}

export function Accounts({ hidden, onSelectAccount }: AccountsProps) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithBalance | null>(null);
  const [viewingAccount, setViewingAccount] = useState<AccountWithBalance>();

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<'BANK' | 'CASH' | 'WALLET'>('BANK');
  const [bankCode, setBankCode] = useState('blu');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cardCvv2, setCardCvv2] = useState('');
  const [iban, setIban] = useState('');
  const [cardColor, setCardColor] = useState<string | null>(null);
  const [initialBalanceStr, setInitialBalanceStr] = useState('');
  const [isSavings, setIsSavings] = useState(false);
  const initialBalance = initialBalanceStr === '' ? 0 : Money.parseToman(initialBalanceStr, true);
  const [accountToDelete, setAccountToDelete] = useState<AccountWithBalance | null>(null);

  // Savings tracking states
  const [savingsMap, setSavingsMap] = useState<Record<number, { remaining: number; count: number }>>({});
  const [savingsDetailAccount, setSavingsDetailAccount] = useState<AccountWithBalance | null>(null);
  const [savingsCommitmentsList, setSavingsCommitmentsList] = useState<SavingsCommitmentWithRemaining[]>([]);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<SavingsCommitmentWithRemaining | null>(null);
  const [returnSourceAccId, setReturnSourceAccId] = useState<number | undefined>();
  const [returnAmountStr, setReturnAmountStr] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const loadAccounts = async () => {
    const list = await getAccountsWithBalances();
    const revealedList = await Promise.all(
      list.map(async a => {
        try {
          return await revealRow('accounts', a);
        } catch {
          return a;
        }
      })
    );
    setAccounts(revealedList);
    const map: Record<number, { remaining: number; count: number }> = {};
    for (const a of revealedList) {
      if (a.isSavings && a.id) {
        const comms = await getSavingsCommitments(a.id);
        const rem = comms.reduce((acc, c) => acc + c.remaining, 0);
        map[a.id] = { remaining: rem, count: comms.filter(c => c.remaining > 0).length };
      }
    }
    setSavingsMap(map);
  };

  const openSavingsDetail = async (acc: AccountWithBalance) => {
    const comms = await getSavingsCommitments(acc.id!);
    setSavingsCommitmentsList(comms);
    setSavingsDetailAccount(acc);
  };

  const openReturnModal = (commitment?: SavingsCommitmentWithRemaining) => {
    if (!savingsDetailAccount) return;
    const availableSources = accounts.filter(a => a.id !== savingsDetailAccount.id);
    if (availableSources.length === 0) {
      alert('برای بازگرداندن به پس‌انداز، حداقل به یک حساب دیگر نیاز است.');
      return;
    }
    setReturnSourceAccId(availableSources[0].id);
    setSelectedCommitment(commitment || null);
    const defaultAmountRial = commitment ? commitment.remaining : (savingsMap[savingsDetailAccount.id!]?.remaining || 0);
    setReturnAmountStr(defaultAmountRial > 0 ? Money.tomanInput(defaultAmountRial) : '');
    setIsReturnModalOpen(true);
  };

  const handleExecuteReturn = async () => {
    if (!savingsDetailAccount || !returnSourceAccId) return;
    const rial = Money.parseToman(returnAmountStr);
    if (!rial || rial <= 0) {
      alert('لطفاً مبلغ بازگرداندن را وارد کنید.');
      return;
    }
    const maxAllowed = selectedCommitment ? selectedCommitment.remaining : (savingsMap[savingsDetailAccount.id!]?.remaining || 0);
    if (maxAllowed > 0 && rial > maxAllowed) {
      alert(`مبلغ بازگرداندن نمی‌تواند بیشتر از مانده تعهد (${Money.toman(maxAllowed)} تومان) باشد.`);
      return;
    }

    await returnToSavings({
      savingsAccountId: savingsDetailAccount.id!,
      sourceAccountId: returnSourceAccId,
      amount: rial,
      commitmentId: selectedCommitment?.id,
    });

    setIsReturnModalOpen(false);
    setSelectedCommitment(null);
    setReturnAmountStr('');
    await loadAccounts();
    const updated = (await getAccountsWithBalances()).find(a => a.id === savingsDetailAccount.id);
    if (updated) {
      setSavingsDetailAccount(updated);
      await openSavingsDetail(updated);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleOpenAdd = () => {
    setEditingAccount(null);
    resetForm();
    setIsAddOpen(true);
  };

  const openCard = async (stored: AccountWithBalance) => {
    try {
      return await revealRow('accounts', stored);
    } catch {
      alert('باز کردن اطلاعات کارت ممکن نشد.');
    }
  };

  const handleOpenEdit = async (stored: AccountWithBalance) => {
    const acc = await openCard(stored);
    if (!acc) return;
    setEditingAccount(acc);
    setName(acc.name);
    setType(acc.type);
    setBankCode(acc.bankCode || 'blu');
    setCardNumber(acc.cardNumber || '');
    const parsed = BankKit.parseExpiry(acc.cardExpiry);
    setExpMonth(parsed.month);
    setExpYear(parsed.year ? (parsed.year.length === 4 ? parsed.year.slice(-2) : parsed.year) : '');
    setCardCvv2(acc.cardCvv2 || '');
    setIban(acc.iban || '');
    setCardColor(acc.cardColor || null);
    setIsSavings(Boolean(acc.isSavings));
    setInitialBalanceStr(acc.initialBalance ? Money.tomanInput(acc.initialBalance) : '');
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

  const handleMonthChange = (raw: string) => {
    const digits = BankKit.cleanDigits(raw).slice(0, 2);
    setExpMonth(digits);
  };

  const handleMonthBlur = () => {
    if (expMonth) {
      if (BankKit.isMonthValid(expMonth)) {
        setExpMonth(BankKit.normalizeMonth(expMonth));
      }
    }
  };

  const handleYearChange = (raw: string) => {
    const digits = BankKit.cleanDigits(raw).slice(0, 2);
    setExpYear(digits);
  };

  const isMonthInvalid = expMonth !== '' && !BankKit.isMonthValid(expMonth);
  const isYearInvalid = expYear !== '' && (expYear.length !== 2 || !BankKit.isYearValid(expYear));

  const handleSave = async () => {
    if (!name.trim()) {
      alert('لطفاً نام حساب را وارد کنید');
      return;
    }
    if (initialBalance === null) {
      alert('موجودی حساب را به‌صورت مبلغ معتبر وارد کنید.');
      return;
    }
    if (isMonthInvalid) {
      alert('ماه انقضا نامعتبر است (باید بین ۰۱ تا ۱۲ باشد)');
      return;
    }
    if (isYearInvalid) {
      alert('سال انقضا باید ۲ رقم باشد (مثلاً ۲۰ یا ۰۶)');
      return;
    }
    if ((expMonth && !expYear) || (!expMonth && expYear)) {
      alert('لطفاً ماه و سال انقضا را کامل وارد کنید');
      return;
    }

    const finalExpiry = BankKit.buildExpiry(expMonth, expYear) || undefined;

    const details = {
      name: name.trim(), type, bankCode: type === 'BANK' ? bankCode : undefined,
      cardNumber: cardNumber || undefined, cardExpiry: finalExpiry,
      cardCvv2: cardCvv2 || undefined, iban: iban ? BankKit.cleanDigits(iban) : undefined,
      cardColor: cardColor || undefined, initialBalance,
      isSavings,
    };
    try {
      await db.transaction('rw', [db.accounts, db.cards, db.outbox], async () => {
        const account = await protectInTransaction('accounts', {
          id: editingAccount?.id, accountNo: editingAccount?.accountNo,
          archived: editingAccount?.archived ?? false, style: editingAccount?.style ?? 0,
          sortOrder: editingAccount?.sortOrder ?? accounts.length, ...details,
        });
        const accountId = await db.accounts.put(account);
        if (cardNumber.length >= 4) {
          const existing = await db.cards.where('accountId').equals(accountId).first();
          await db.cards.put(await protectInTransaction('cards', {
            id: existing?.id, accountId, last4: cardNumber.slice(-4),
          }));
        }
      });
    } catch {
      alert('ذخیره امن اطلاعات حساب انجام نشد.');
      return;
    }
    setEditingAccount(null);
    setIsAddOpen(false);
    resetForm();
    loadAccounts();
  };

  const resetForm = () => {
    setName('');
    setCardNumber('');
    setExpMonth('');
    setExpYear('');
    setCardCvv2('');
    setIban('');
    setCardColor(null);
    setIsSavings(false);
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

      {/* List Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs font-bold text-muted">
          فهرست حساب‌ها ({Money.fa(accounts.length.toString())})
        </span>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {accounts.map(acc => {
          const savingsInfo = savingsMap[acc.id!];
          const hasSavingsDebt = Boolean(acc.isSavings && savingsInfo && savingsInfo.remaining > 0);

          return (
            <div key={acc.id} className="space-y-2">
              <BankCard
                account={acc}
                hidden={hidden}
                variant="compact"
                onEdit={() => handleOpenEdit(acc)}
                onDelete={() => setAccountToDelete(acc)}
                onClick={() =>
                  acc.isSavings
                    ? openSavingsDetail(acc)
                    : onSelectAccount && onSelectAccount(acc.id!)
                }
              />

              {/* Savings commitment banner if debt exists */}
              {hasSavingsDebt && (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-lime/10 border border-lime/25 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PiggyBank size={14} className="text-lime shrink-0" />
                    <span className="text-[11px] font-bold text-lime truncate">
                      طلب از خود: {Money.toman(savingsInfo.remaining)} تومان
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openSavingsDetail(acc)}
                    className="h-6 px-2.5 rounded-lg bg-lime text-onLime text-[10px] font-extrabold active:scale-95 transition-transform shrink-0 shadow-sm"
                  >
                    بازگرداندن
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in p-4">
          <div role="dialog" aria-modal="true" aria-label="مشخصات کارت" className="w-full max-w-md rounded-[28px] bg-sheet p-5 space-y-4 max-h-[min(92vh,100%)] overflow-y-auto no-scrollbar border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="text-sm font-bold text-white">مشخصات کارت و حساب</h2>
              <button
                type="button"
                onClick={() => setViewingAccount(undefined)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <BankCard account={viewingAccount} variant="large" hidden={hidden} revealDetails />

            {/* Quick Copy Data List */}
            <div className="space-y-2 bg-surface/50 border border-line rounded-2xl p-3 text-xs">
              {viewingAccount.cardNumber && (
                <div className="flex items-center justify-between py-1.5 border-b border-line/60">
                  <span className="text-muted">شماره کارت:</span>
                  <div className="flex items-center gap-2 dir-ltr">
                    <span className="font-mono font-bold text-sm tracking-wider text-white">
                      {Money.fa(BankKit.formatCardNumber(BankKit.cleanDigits(viewingAccount.cardNumber)))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(BankKit.cleanDigits(viewingAccount.cardNumber!), 'pan')}
                      className="p-1 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors"
                      title="کپی شماره کارت"
                    >
                      {copiedField === 'pan' ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {viewingAccount.cardExpiry && (
                <div className="flex items-center justify-between py-1.5 border-b border-line/60">
                  <span className="text-muted">تاریخ انقضا:</span>
                  <div className="dir-ltr font-mono font-bold text-white">
                    {Money.fa(BankKit.formatExpiry(viewingAccount.cardExpiry))}
                  </div>
                </div>
              )}

              {viewingAccount.cardCvv2 && (
                <div className="flex items-center justify-between py-1.5 border-b border-line/60">
                  <span className="text-muted">کد CVV2:</span>
                  <div className="flex items-center gap-2 dir-ltr">
                    <span className="font-mono font-bold text-white">{Money.fa(viewingAccount.cardCvv2)}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(viewingAccount.cardCvv2!, 'cvv')}
                      className="p-1 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors"
                      title="کپی CVV2"
                    >
                      {copiedField === 'cvv' ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {viewingAccount.accountNo && (
                <div className="flex items-center justify-between py-1.5 border-b border-line/60">
                  <span className="text-muted">شماره حساب:</span>
                  <div className="flex items-center gap-2 dir-ltr">
                    <span className="font-mono font-bold text-white">{Money.fa(viewingAccount.accountNo)}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(viewingAccount.accountNo!, 'accNo')}
                      className="p-1 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors"
                      title="کپی شماره حساب"
                    >
                      {copiedField === 'accNo' ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {viewingAccount.iban && (
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted">شماره شبا (IBAN):</span>
                  <div className="flex items-center gap-2 dir-ltr">
                    <span className="font-mono font-bold text-xs text-white">
                      {BankKit.formatIban(viewingAccount.iban)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`IR${BankKit.cleanDigits(viewingAccount.iban!)}`, 'iban')}
                      className="p-1 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors"
                      title="کپی شماره شبا"
                    >
                      {copiedField === 'iban' ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewingAccount(undefined)}
              className="w-full h-11 rounded-xl bg-surface border border-line text-xs font-bold text-white hover:bg-white/5 active:scale-95 transition-all"
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[min(92vh,100%)] no-scrollbar">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="text-sm font-bold text-white">
                {editingAccount ? 'ویرایش مشخصات کارت و حساب' : 'افزودن کارت یا حساب بانکی'}
              </h2>
              <button
                onClick={() => { setIsAddOpen(false); setEditingAccount(null); resetForm(); }}
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
                    cardExpiry: BankKit.buildExpiry(expMonth, expYear),
                    cardCvv2,
                    iban,
                    cardColor: cardColor || undefined,
                    initialBalance: initialBalance ?? 0,
                    style: 0,
                    archived: false,
                    sortOrder: 0,
                    balance: editingAccount ? editingAccount.balance : initialBalance ?? 0,
                    last4: cardNumber.slice(-4),
                  }}
                  variant="large"
                  interactive={false}
                  revealDetails={true}
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
                  <Select
                    value={bankCode}
                    onChange={(val) => setBankCode(String(val))}
                    options={Banks.map(b => ({ value: b.code, label: b.name }))}
                    placeholder="انتخاب بانک"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-muted block mb-1">ماه انقضا</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="۰۱ تا ۱۲"
                      dir="ltr"
                      value={expMonth}
                      onChange={(e) => handleMonthChange(e.target.value)}
                      onBlur={handleMonthBlur}
                      maxLength={2}
                      className={`w-full h-11 rounded-xl bg-surface border ${
                        isMonthInvalid ? 'border-bad' : 'border-line'
                      } text-white font-mono text-center text-xs focus:outline-none focus:border-sky`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted block mb-1">سال انقضا</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="مثلاً ۲۰"
                      dir="ltr"
                      value={expYear}
                      onChange={(e) => handleYearChange(e.target.value)}
                      maxLength={2}
                      className={`w-full h-11 rounded-xl bg-surface border ${
                        isYearInvalid ? 'border-bad' : 'border-line'
                      } text-white font-mono text-center text-xs focus:outline-none focus:border-sky`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted block mb-1">کد CVV2 (اختیاری)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="۳ یا ۴ رقم"
                      dir="ltr"
                      value={cardCvv2}
                      onChange={(e) => setCardCvv2(BankKit.cleanDigits(e.target.value).slice(0, 4))}
                      maxLength={4}
                      className="w-full h-11 rounded-xl bg-surface border border-line text-white font-mono text-center text-xs focus:outline-none focus:border-sky"
                    />
                  </div>
                </div>
                {isMonthInvalid && (
                  <span className="text-[10.5px] text-bad -mt-1 block">ماه انقضا نامعتبر است (باید بین ۰۱ تا ۱۲ باشد)</span>
                )}
                {isYearInvalid && (
                  <span className="text-[10.5px] text-bad -mt-1 block">سال انقضا نامعتبر است (باید ۲ رقم باشد مثلاً ۲۰)</span>
                )}

                <div>
                  <label className="text-[11px] text-muted block mb-1">شماره شبا (اختیاری)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="IR12 0120 0000 ..."
                    value={iban ? BankKit.formatIban(iban) : ''}
                    onChange={(e) => setIban(BankKit.cleanDigits(e.target.value).slice(0, 24))}
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
              <label htmlFor="account-start-balance" className="text-[11px] text-muted block mb-1">موجودی فعلی (تومان)</label>
              <AmountInput
                id="account-start-balance"
                placeholder="۰"
                value={initialBalanceStr}
                allowNegative
                onChange={setInitialBalanceStr}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            {/* Savings Toggle */}
            <div
              onClick={() => setIsSavings(s => !s)}
              className="flex items-center justify-between p-3 rounded-xl bg-surface border border-line cursor-pointer select-none"
            >
              <div>
                <span className="text-xs font-bold text-white block">حساب پس‌انداز</span>
                <span className="text-[10px] text-muted block mt-0.5">
                  تفکیک از موجودی قابل‌خرج روزمره و رهگیری مبالغ برداشتی
                </span>
              </div>
              <div
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  isSavings ? 'bg-lime' : 'bg-white/10'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    isSavings ? 'translate-x-5 !bg-onLime' : 'translate-x-0'
                  }`}
                />
              </div>
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
      {/* Savings Detail Modal */}
      {savingsDetailAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div role="dialog" aria-modal="true" aria-label="جزئیات پس‌انداز" className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-lime/20 flex items-center justify-center text-lime">
                  <PiggyBank size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">جزئیات حساب پس‌انداز</h2>
                  <span className="text-[11px] text-muted">{savingsDetailAccount.name}</span>
                </div>
              </div>
              <button
                onClick={() => setSavingsDetailAccount(null)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3.5">
              <BankCard account={savingsDetailAccount} variant="large" hidden={hidden} />

              {/* Balances Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-surface border border-line p-3">
                  <span className="text-[11px] text-muted block">موجودی فعلی پس‌انداز</span>
                  <div className="text-base font-extrabold text-white mt-1 dir-ltr text-right">
                    {hidden ? Money.HIDDEN : Money.toman(savingsDetailAccount.balance)} <span className="text-[10px] font-normal text-muted">تومان</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-lime/10 border border-lime/25 p-3">
                  <span className="text-[11px] text-lime font-bold block">مانده قابل بازگشت (طلب از خود)</span>
                  <div className="text-base font-extrabold text-lime mt-1 dir-ltr text-right">
                    {hidden ? Money.HIDDEN : Money.toman(savingsMap[savingsDetailAccount.id!]?.remaining || 0)} <span className="text-[10px] font-normal text-lime/80">تومان</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={(savingsMap[savingsDetailAccount.id!]?.remaining || 0) <= 0}
                  onClick={() => openReturnModal()}
                  className="flex-1 h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                >
                  <RotateCcw size={15} />
                  بازگرداندن به پس‌انداز
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = savingsDetailAccount.id!;
                    setSavingsDetailAccount(null);
                    if (onSelectAccount) onSelectAccount(id);
                  }}
                  className="h-11 px-3.5 rounded-xl bg-surface border border-line text-white text-xs font-bold hover:bg-white/5 active:scale-95 transition-transform"
                >
                  گردش حساب
                </button>
              </div>

              {/* Withdrawals List with Commitments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">مبالغ برداشتی و تعهدات بازگشت</span>
                  <span className="text-[10px] text-muted">
                    {savingsCommitmentsList.length} مورد
                  </span>
                </div>

                {savingsCommitmentsList.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-surface/40 border border-line/60 text-center text-xs text-muted">
                    هیچ برداشت دارای تعهد بازگشتی برای این حساب ثبت نشده است.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savingsCommitmentsList.map(c => (
                      <div key={c.id} className="p-3 rounded-2xl bg-surface border border-line space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{c.note || 'برداشت از پس‌انداز'}</span>
                          <span className="text-[10px] text-muted">{Jalali.dayLabel(c.createdAt)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-muted text-[10px] block">مبلغ برداشتی</span>
                            <span className="font-extrabold text-white">{Money.toman(c.amount)} تومان</span>
                          </div>
                          <div>
                            <span className="text-muted text-[10px] block">بازگردانده شده</span>
                            <span className="font-bold text-sky">{Money.toman(c.paidAmount)} تومان</span>
                          </div>
                          <div>
                            <span className="text-muted text-[10px] block">مانده تعهد</span>
                            <span className={`font-extrabold ${c.remaining === 0 ? 'text-ok' : 'text-bad'}`}>
                              {c.remaining === 0 ? 'تسویه شده' : `${Money.toman(c.remaining)} تومان`}
                            </span>
                          </div>
                        </div>
                        {c.remaining > 0 && (
                          <div className="pt-1.5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => openReturnModal(c)}
                              className="h-7 px-3 rounded-lg bg-lime text-onLime text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform"
                            >
                              <RotateCcw size={12} />
                              بازگرداندن این مبلغ
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return to Savings Modal */}
      {isReturnModalOpen && savingsDetailAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div role="dialog" aria-modal="true" aria-label="بازگرداندن به پس‌انداز" className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="text-sm font-bold text-white">بازگرداندن مبلغ به پس‌انداز</h2>
              <button
                onClick={() => setIsReturnModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {selectedCommitment && (
              <div className="p-2.5 rounded-xl bg-surface border border-line text-xs">
                <span className="text-muted block text-[10px]">بابت تعهد:</span>
                <span className="font-bold text-white">{selectedCommitment.note || 'برداشت از پس‌انداز'}</span>
                <span className="text-lime text-[11px] block mt-0.5">
                  مانده قابل بازگشت: {Money.toman(selectedCommitment.remaining)} تومان
                </span>
              </div>
            )}

            <div>
              <label className="text-[11px] text-muted block mb-1">پرداخت از حساب (مبدأ)</label>
              <Select
                value={returnSourceAccId}
                onChange={val => setReturnSourceAccId(Number(val))}
                options={accounts
                  .filter((a): a is AccountWithBalance & { id: number } => a.id != null && a.id !== savingsDetailAccount.id)
                  .map(a => ({
                    value: a.id,
                    label: a.name,
                    sublabel: `${Money.toman(a.balance)} تومان`,
                  }))}
                placeholder="انتخاب حساب"
              />
            </div>

            <div>
              <label htmlFor="return-amount-input" className="text-[11px] text-muted block mb-1">مبلغ بازگرداندن (تومان)</label>
              <AmountInput
                id="return-amount-input"
                placeholder="۰"
                value={returnAmountStr}
                onChange={setReturnAmountStr}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="flex-1 h-11 rounded-xl bg-surface border border-line text-xs font-bold text-muted hover:text-white"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleExecuteReturn}
                className="flex-1 h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab active:scale-95 transition-transform"
              >
                <Check size={16} />
                ثبت بازگرداندن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-sm rounded-[24px] bg-sheet border border-line p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 text-bad">
              <div className="w-9 h-9 rounded-xl bg-bad/15 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <h2 id="delete-account-title" className="text-sm font-bold text-white">
                حذف حساب «{accountToDelete.name}»
              </h2>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              با حذف این حساب، کارت و کلیه تراکنش‌های ثبت‌شده مرتبط با آن پاک خواهند شد. آیا از انجام این کار مطمئن هستید؟
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleDelete(accountToDelete.id!);
                  setAccountToDelete(null);
                }}
                className="flex-1 h-10 rounded-xl bg-bad hover:bg-bad/90 text-white text-xs font-bold transition-colors active:scale-95 shadow-sm"
              >
                حذف قطعی
              </button>
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="flex-1 h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-white text-xs font-semibold transition-colors active:scale-95"
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
