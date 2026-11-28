import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AmountInput } from '../components/AmountInput';
import {
  Plus,
  X,
  CreditCard,
  Wallet,
  Trash2,
  Check,
  PiggyBank,
  RotateCcw,
  Copy,
  Building2,
  UserCheck,
  ChevronLeft,
  AlertTriangle,
  History,
  PieChart,
} from 'lucide-react';
import { db, type Person } from '../core/db';
import {
  computeAccountBalanceInTx,
  getAccountsWithBalances,
  getSavingsCommitments,
  getSavingsAccountEarmarks,
  releaseSavingsEarmark,
  returnToSavings,
  syncAccountPersonHoldInTx,
  type AccountWithBalance,
  type SavingsCommitmentWithRemaining,
  type SavingsAccountEarmarks,
} from '../core/db/helpers';
import { Jalali } from '../core/jalali';
import { Banks, findBankByCardPrefix } from '../core/banks';
import { BankKit, CardPalettes } from '../core/bankKit';
import { BankCard } from '../components/BankCard';
import { Select } from '../components/Select';
import { Money } from '../core/money';
import { protectInTransaction, revealRow, revealRows } from '../core/db/protectedRows';

interface AccountsProps {
  hidden: boolean;
  onSelectAccount?: (id: number) => void;
  onQuickAddForAccount?: (accountId: number, type?: 'EXPENSE' | 'INCOME' | 'TRANSFER') => void;
  onOpenMonthlyReport?: (accountId?: number) => void;
}

interface SavingsAccountSummary {
  remaining: number;
  count: number;
  loanReserved: number;
  personHold: number;
  totalEarmarked: number;
  commitments: SavingsCommitmentWithRemaining[];
  earmarks: SavingsAccountEarmarks;
}

const EMPTY_EARMARKS: SavingsAccountEarmarks = {
  loanReserves: [],
  personHolds: [],
  loanReservedTotal: 0,
  personHoldTotal: 0,
  totalEarmarked: 0,
};

function computeCardMoneyBreakdown(
  balance: number,
  personHold: number,
  loanReserved: number
) {
  const totalEarmarked = personHold + loanReserved;
  const rawOwn = balance - totalEarmarked;
  const ownSavings = Math.max(0, rawOwn);
  const deficit = rawOwn < 0 ? Math.abs(rawOwn) : 0;
  const denom = ownSavings + personHold + loanReserved;

  if (denom <= 0) {
    return {
      ownSavings,
      personHold,
      loanReserved,
      deficit,
      ownPct: 0,
      personPct: 0,
      loanPct: 0,
    };
  }

  const ownPct = ownSavings > 0 ? Math.round((ownSavings / denom) * 100) : 0;
  const personPct = personHold > 0 ? Math.round((personHold / denom) * 100) : 0;
  const loanPct = loanReserved > 0 ? Math.max(0, 100 - ownPct - personPct) : 0;

  return {
    ownSavings,
    personHold,
    loanReserved,
    deficit,
    ownPct,
    personPct,
    loanPct,
  };
}

export function Accounts({ hidden, onSelectAccount, onQuickAddForAccount, onOpenMonthlyReport }: AccountsProps) {
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
  const [balanceInputStr, setBalanceInputStr] = useState('');
  const [isSavings, setIsSavings] = useState(false);
  const [savingsPartStr, setSavingsPartStr] = useState('');
  const [personHoldPartStr, setPersonHoldPartStr] = useState('');
  const [personHoldName, setPersonHoldName] = useState('');
  const [editingLoanReserved, setEditingLoanReserved] = useState(0);
  const [persons, setPersons] = useState<Person[]>([]);
  const parsedBalanceInput = balanceInputStr === '' ? 0 : Money.parseToman(balanceInputStr, true);
  const [accountToDelete, setAccountToDelete] = useState<AccountWithBalance | null>(null);

  // Savings tracking modal states
  const [savingsDetailAccountId, setSavingsDetailAccountId] = useState<number | null>(null);
  const [showSettledHistory, setShowSettledHistory] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<SavingsCommitmentWithRemaining | null>(null);
  const [returnSourceAccId, setReturnSourceAccId] = useState<number | undefined>();
  const [returnAmountStr, setReturnAmountStr] = useState('');
  const [releaseTarget, setReleaseTarget] = useState<SavingsCommitmentWithRemaining | null>(null);
  const [releaseMode, setReleaseMode] = useState<'NO_TXN' | 'EXPENSE' | 'TRANSFER'>('NO_TXN');
  const [releaseToAccId, setReleaseToAccId] = useState<number | undefined>();
  const [releaseAmountStr, setReleaseAmountStr] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { accounts, savingsMap } = useLiveQuery(
    async () => {
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

      const map: Record<number, SavingsAccountSummary> = {};
      await Promise.all(
        revealedList.map(async a => {
          if (a.isSavings && a.id != null) {
            const [comms, earmarks] = await Promise.all([
              getSavingsCommitments(a.id),
              getSavingsAccountEarmarks(a.id),
            ]);
            const rem = comms.reduce((acc, c) => acc + c.remaining, 0);
            map[a.id] = {
              remaining: rem,
              count: comms.filter(c => c.remaining > 0).length,
              loanReserved: earmarks.loanReservedTotal,
              personHold: earmarks.personHoldTotal,
              totalEarmarked: earmarks.totalEarmarked,
              commitments: comms,
              earmarks,
            };
          }
        })
      );

      return { accounts: revealedList, savingsMap: map };
    },
    [],
    { accounts: [] as AccountWithBalance[], savingsMap: {} as Record<number, SavingsAccountSummary> }
  );

  const savingsDetailAccount =
    savingsDetailAccountId != null
      ? accounts.find(a => a.id === savingsDetailAccountId) ?? null
      : null;
  const savingsDetailSummary =
    savingsDetailAccount?.id != null ? savingsMap[savingsDetailAccount.id] : undefined;
  const savingsCommitmentsList = savingsDetailSummary?.commitments ?? [];
  const savingsEarmarks = savingsDetailSummary?.earmarks ?? EMPTY_EARMARKS;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openSavingsDetail = (acc: AccountWithBalance) => {
    if (acc.id == null) return;
    setShowSettledHistory(false);
    setSavingsDetailAccountId(acc.id);
  };

  const openReleaseModal = (item: SavingsCommitmentWithRemaining) => {
    const otherAccs = accounts.filter(a => a.id !== item.accountId);
    setReleaseTarget(item);
    setReleaseMode(item.kind === 'PERSON_HOLD' ? 'EXPENSE' : 'NO_TXN');
    setReleaseToAccId(otherAccs[0]?.id);
    setReleaseAmountStr(Money.tomanInput(item.remaining));
  };

  const handleExecuteRelease = async () => {
    if (!releaseTarget?.id) return;
    const rial = Money.parseToman(releaseAmountStr);
    if (!rial || rial <= 0 || rial > releaseTarget.remaining) {
      alert(`مبلغ باید بیشتر از صفر و حداکثر ${Money.toman(releaseTarget.remaining)} تومان باشد.`);
      return;
    }
    if (releaseMode === 'TRANSFER' && !releaseToAccId) {
      alert('لطفاً حساب مقصد را انتخاب کنید.');
      return;
    }

    await releaseSavingsEarmark({
      commitmentId: releaseTarget.id,
      amountRial: rial,
      outgoingTxn:
        releaseMode === 'NO_TXN'
          ? undefined
          : {
              type: releaseMode,
              toAccountId: releaseMode === 'TRANSFER' ? releaseToAccId : undefined,
              note:
                releaseTarget.kind === 'PERSON_HOLD'
                  ? `بازگشت امانت ${releaseTarget.personName || ''}`.trim()
                  : releaseTarget.note || 'برداشت از ذخیره وام',
            },
    });

    setReleaseTarget(null);
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
    const defaultAmountRial = commitment
      ? commitment.remaining
      : savingsMap[savingsDetailAccount.id!]?.remaining || 0;
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
    const maxAllowed = selectedCommitment
      ? selectedCommitment.remaining
      : savingsMap[savingsDetailAccount.id!]?.remaining || 0;
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
  };

  const loadPersons = () => {
    db.persons
      .toArray()
      .then(rows => revealRows('persons', rows))
      .then(setPersons)
      .catch(() => setPersons([]));
  };

  const handleOpenAdd = () => {
    setEditingAccount(null);
    resetForm();
    loadPersons();
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
    loadPersons();
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
    const isSav = Boolean(acc.isSavings);
    setIsSavings(isSav);
    setBalanceInputStr(stored.balance ? Money.tomanInput(stored.balance) : '');

    if (acc.id != null) {
      const earmarks = await getSavingsAccountEarmarks(acc.id);
      const loanRes = earmarks.loanReservedTotal;
      const pHold = earmarks.personHoldTotal;
      const ownSav = Math.max(0, stored.balance - pHold - loanRes);
      setEditingLoanReserved(loanRes);
      setPersonHoldPartStr(pHold > 0 ? Money.tomanInput(pHold) : '');
      setSavingsPartStr(ownSav > 0 ? Money.tomanInput(ownSav) : '');
      const activeHolds = earmarks.personHolds.filter(h => h.remaining > 0);
      const cardLevelHold = activeHolds.find(h => h.txnId == null) ?? activeHolds[0];
      setPersonHoldName(cardLevelHold?.personName || '');
    } else {
      setEditingLoanReserved(0);
      setPersonHoldPartStr('');
      setSavingsPartStr(stored.balance > 0 ? Money.tomanInput(stored.balance) : '');
      setPersonHoldName('');
    }
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
    if (expMonth && BankKit.isMonthValid(expMonth)) {
      setExpMonth(BankKit.normalizeMonth(expMonth));
    }
  };

  const handleYearChange = (raw: string) => {
    const digits = BankKit.cleanDigits(raw).slice(0, 2);
    setExpYear(digits);
  };

  const isMonthInvalid = expMonth !== '' && !BankKit.isMonthValid(expMonth);
  const isYearInvalid = expYear !== '' && (expYear.length !== 2 || !BankKit.isYearValid(expYear));

  const availableForSplit = Math.max(0, (parsedBalanceInput ?? 0) - editingLoanReserved);

  const handleTotalBalanceChange = (val: string) => {
    setBalanceInputStr(val);
    if (!isSavings) return;
    const nextTotal = val === '' ? 0 : Money.parseToman(val, true);
    if (nextTotal === null) return;
    const nextAvail = Math.max(0, nextTotal - editingLoanReserved);
    const curHold = personHoldPartStr === '' ? 0 : (Money.parseToman(personHoldPartStr) ?? 0);
    const nextSav = Math.max(0, nextAvail - curHold);
    setSavingsPartStr(nextSav > 0 ? Money.tomanInput(nextSav) : '');
  };

  const handleToggleSavings = () => {
    const next = !isSavings;
    setIsSavings(next);
    if (next) {
      const nextAvail = Math.max(0, (parsedBalanceInput ?? 0) - editingLoanReserved);
      const curHold = personHoldPartStr === '' ? 0 : (Money.parseToman(personHoldPartStr) ?? 0);
      const nextSav = Math.max(0, nextAvail - curHold);
      setSavingsPartStr(nextSav > 0 ? Money.tomanInput(nextSav) : '');
    }
  };

  const handleSavingsPartChange = (val: string) => {
    setSavingsPartStr(val);
    const sav = val === '' ? 0 : Money.parseToman(val);
    if (sav === null) return;
    const nextHold = Math.max(0, availableForSplit - sav);
    setPersonHoldPartStr(nextHold > 0 ? Money.tomanInput(nextHold) : '');
  };

  const handlePersonHoldPartChange = (val: string) => {
    setPersonHoldPartStr(val);
    const hold = val === '' ? 0 : Money.parseToman(val);
    if (hold === null) return;
    const nextSav = Math.max(0, availableForSplit - hold);
    setSavingsPartStr(nextSav > 0 ? Money.tomanInput(nextSav) : '');
  };

  const parsedSavingsPart = savingsPartStr === '' ? 0 : Money.parseToman(savingsPartStr);
  const parsedPersonHoldPart = personHoldPartStr === '' ? 0 : Money.parseToman(personHoldPartStr);
  const splitOverTotal = Boolean(
    isSavings &&
    parsedPersonHoldPart !== null &&
    parsedPersonHoldPart > availableForSplit
  );

  const handleSave = async () => {
    if (!name.trim()) {
      alert('لطفاً نام حساب را وارد کنید');
      return;
    }
    if (parsedBalanceInput === null) {
      alert('موجودی حساب را به‌صورت مبلغ معتبر وارد کنید.');
      return;
    }
    if (isSavings) {
      if (parsedPersonHoldPart === null || parsedPersonHoldPart < 0 || parsedSavingsPart === null || parsedSavingsPart < 0) {
        alert('مبالغ پس‌انداز و امانت را به‌صورت معتبر وارد کنید.');
        return;
      }
      if (parsedPersonHoldPart > availableForSplit) {
        alert('مبلغ امانت دیگران نمی‌تواند بیشتر از موجودی قابل تخصیص کارت باشد.');
        return;
      }
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

    const baseDetails = {
      name: name.trim(),
      type,
      bankCode: type === 'BANK' ? bankCode : undefined,
      cardNumber: cardNumber || undefined,
      cardExpiry: finalExpiry,
      cardCvv2: cardCvv2 || undefined,
      iban: iban ? BankKit.cleanDigits(iban) : undefined,
      cardColor: cardColor || undefined,
      isSavings,
    };
    try {
      await db.transaction(
        'rw',
        [db.accounts, db.cards, db.txns, db.savingsCommitments, db.savingsPayments, db.outbox],
        async () => {
          let finalInitialBalance = parsedBalanceInput;
          let adjustDiff = 0;

          if (editingAccount?.id != null) {
            const { balance: actualBalance, hasTxns } = await computeAccountBalanceInTx(
              editingAccount.id,
              editingAccount.initialBalance
            );
            if (hasTxns) {
              finalInitialBalance = editingAccount.initialBalance;
              adjustDiff = parsedBalanceInput - actualBalance;
            }
          }

          const account = await protectInTransaction('accounts', {
            id: editingAccount?.id,
            accountNo: editingAccount?.accountNo,
            archived: editingAccount?.archived ?? false,
            style: editingAccount?.style ?? 0,
            sortOrder: editingAccount?.sortOrder ?? accounts.length,
            initialBalance: finalInitialBalance,
            ...baseDetails,
          });
          const accountId = await db.accounts.put(account);

          if (adjustDiff !== 0) {
            const now = Date.now();
            await db.txns.add({
              type: 'ADJUST',
              amount: adjustDiff,
              accountId,
              title: 'تنظیم دستی موجودی',
              occurredAt: now,
              source: 'MANUAL',
              createdAt: now,
            });
          }

          if (isSavings && parsedPersonHoldPart !== null) {
            const cleanPerson = personHoldName.trim();
            const matchedPerson = cleanPerson
              ? persons.find(p => p.name.trim() === cleanPerson)
              : undefined;
            await syncAccountPersonHoldInTx({
              accountId,
              targetHoldRial: parsedPersonHoldPart,
              personName: cleanPerson || undefined,
              personId: matchedPerson?.id,
            });
          }

          if (cardNumber.length >= 4) {
            const existing = await db.cards.where('accountId').equals(accountId).first();
            await db.cards.put(
              await protectInTransaction('cards', {
                id: existing?.id,
                accountId,
                last4: cardNumber.slice(-4),
              })
            );
          }
        }
      );
    } catch {
      alert('ذخیره امن اطلاعات حساب انجام نشد.');
      return;
    }
    setEditingAccount(null);
    setIsAddOpen(false);
    resetForm();
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
    setBalanceInputStr('');
    setSavingsPartStr('');
    setPersonHoldPartStr('');
    setPersonHoldName('');
    setEditingLoanReserved(0);
  };

  const handleDelete = async (id: number) => {
    if (confirm('با حذف حساب، تراکنش‌های مربوط به آن نیز پاک خواهند شد. ادامه می‌دهید؟')) {
      await db.accounts.delete(id);
      await db.cards.where('accountId').equals(id).delete();
      await db.txns.where('accountId').equals(id).delete();
      if (savingsDetailAccountId === id) setSavingsDetailAccountId(null);
    }
  };

  const detailBreakdown = savingsDetailAccount
    ? computeCardMoneyBreakdown(
        savingsDetailAccount.balance,
        savingsEarmarks.personHoldTotal,
        savingsEarmarks.loanReservedTotal
      )
    : null;
  const activeLoanReserves = savingsEarmarks.loanReserves.filter(r => r.remaining > 0);
  const activePersonHolds = savingsEarmarks.personHolds.filter(p => p.remaining > 0);
  const openWithdrawals = savingsCommitmentsList.filter(c => c.remaining > 0);
  const settledWithdrawals = savingsCommitmentsList.filter(c => c.remaining === 0);
  const selfOwedRemaining = savingsDetailSummary?.remaining ?? 0;

  return (
    <div className="flex flex-col pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-black text-white">حساب‌ها و کارت‌ها</h1>
          <span className="text-xs text-muted block truncate">مدیریت کارت‌های شتابی، حساب‌های بانکی و کیف پول</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenMonthlyReport && (
            <button
              type="button"
              onClick={() => onOpenMonthlyReport()}
              title="گزارش ماهانه همه کارت‌ها"
              aria-label="گزارش ماهانه همه کارت‌ها"
              className="w-10 h-10 rounded-2xl bg-surface border border-line hover:border-lineStrong text-sky hover:text-white flex items-center justify-center active:scale-95 transition-all"
            >
              <PieChart size={18} />
            </button>
          )}
          <button
            onClick={handleOpenAdd}
            className="h-10 px-3.5 rounded-2xl bg-lime text-onLime font-bold text-xs flex items-center gap-1.5 shadow-fab active:scale-95 transition-transform"
          >
            <Plus size={16} strokeWidth={2.8} />
            کارت جدید
          </button>
        </div>
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
          const breakdown =
            acc.isSavings && savingsInfo
              ? computeCardMoneyBreakdown(acc.balance, savingsInfo.personHold, savingsInfo.loanReserved)
              : null;
          const hasSavingsDebt = Boolean(acc.isSavings && savingsInfo && savingsInfo.remaining > 0);

          return (
            <div key={acc.id} className="space-y-2">
              <BankCard
                account={acc}
                hidden={hidden}
                variant="compact"
                onReport={onOpenMonthlyReport ? () => onOpenMonthlyReport(acc.id!) : undefined}
                onEdit={() => handleOpenEdit(acc)}
                onDelete={() => setAccountToDelete(acc)}
                onClick={() =>
                  acc.isSavings
                    ? openSavingsDetail(acc)
                    : onSelectAccount && onSelectAccount(acc.id!)
                }
              />

              {/* Unified Savings Card Money Summary */}
              {acc.isSavings && savingsInfo && breakdown && (
                <div className="rounded-[20px] bg-surface border border-line overflow-hidden">
                  <div
                    onClick={() => openSavingsDetail(acc)}
                    role="button"
                    tabIndex={0}
                    className="p-3.5 space-y-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <PiggyBank size={14} className="text-lime" />
                        ترکیب موجودی کارت
                      </span>
                      <span className="text-[10.5px] font-semibold text-sky flex items-center gap-0.5">
                        جزئیات کارت
                        <ChevronLeft size={14} />
                      </span>
                    </div>

                    {/* Stacked proportion bar */}
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden flex gap-0.5">
                      {breakdown.ownPct > 0 && (
                        <div
                          className="h-full bg-lime rounded-full transition-all"
                          style={{ width: `${breakdown.ownPct}%` }}
                        />
                      )}
                      {breakdown.personPct > 0 && (
                        <div
                          className="h-full bg-warn rounded-full transition-all"
                          style={{ width: `${breakdown.personPct}%` }}
                        />
                      )}
                      {breakdown.loanPct > 0 && (
                        <div
                          className="h-full bg-sky rounded-full transition-all"
                          style={{ width: `${breakdown.loanPct}%` }}
                        />
                      )}
                    </div>

                    {/* Single-glance split values */}
                    <div
                      className={`grid gap-2 ${
                        breakdown.loanReserved > 0 ? 'grid-cols-3' : 'grid-cols-2'
                      }`}
                    >
                      <div className="rounded-xl bg-lime/10 border border-lime/20 px-2.5 py-2">
                        <div className="flex items-center gap-1 text-[10px] text-lime/90 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-lime shrink-0" />
                          پس‌انداز شما
                        </div>
                        <div className="text-xs font-black text-lime mt-0.5 dir-ltr text-right">
                          {hidden ? '•••' : Money.toman(breakdown.ownSavings)}
                          <span className="text-[9.5px] font-normal opacity-80 mr-1">تومان</span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-warn/10 border border-warn/20 px-2.5 py-2">
                        <div className="flex items-center gap-1 text-[10px] text-warn/90 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" />
                          مال مردم (امانت)
                        </div>
                        <div className="text-xs font-black text-warn mt-0.5 dir-ltr text-right">
                          {hidden ? '•••' : Money.toman(breakdown.personHold)}
                          <span className="text-[9.5px] font-normal opacity-80 mr-1">تومان</span>
                        </div>
                      </div>

                      {breakdown.loanReserved > 0 && (
                        <div className="rounded-xl bg-sky/10 border border-sky/20 px-2.5 py-2">
                          <div className="flex items-center gap-1 text-[10px] text-sky/90 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky shrink-0" />
                            ذخیره وام
                          </div>
                          <div className="text-xs font-black text-sky mt-0.5 dir-ltr text-right">
                            {hidden ? '•••' : Money.toman(breakdown.loanReserved)}
                            <span className="text-[9.5px] font-normal opacity-80 mr-1">تومان</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasSavingsDebt && (
                    <div className="flex items-center justify-between px-3.5 py-2 bg-lime/10 border-t border-lime/20 text-xs">
                      <span className="text-[11px] font-bold text-lime truncate">
                        طلب از خود: {hidden ? '•••' : Money.toman(savingsInfo.remaining)} تومان
                      </span>
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

            <div className="flex gap-2">
              {onOpenMonthlyReport && viewingAccount.id != null && (
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingAccount.id!;
                    setViewingAccount(undefined);
                    onOpenMonthlyReport(id);
                  }}
                  className="flex-1 h-11 rounded-xl bg-sky/15 border border-sky/25 text-xs font-bold text-sky hover:bg-sky/25 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  <PieChart size={15} />
                  گزارش ماهانه کارت
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingAccount(undefined)}
                className="flex-1 h-11 rounded-xl bg-surface border border-line text-xs font-bold text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[min(92vh,100%)] overflow-y-auto no-scrollbar">
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
                    initialBalance: parsedBalanceInput ?? 0,
                    style: 0,
                    archived: false,
                    sortOrder: 0,
                    balance: parsedBalanceInput ?? 0,
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
                  <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-3 px-1.5 -mx-1.5">
                    <button
                      type="button"
                      onClick={() => setCardColor(null)}
                      className={`h-8 px-3 rounded-full text-xs font-bold border shrink-0 whitespace-nowrap transition-all ${
                        cardColor === null
                          ? 'bg-lime text-onLime border-transparent shadow-sm'
                          : 'bg-surface text-muted hover:text-white border-line'
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
                        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center transition-all ${
                          cardColor === p.color
                            ? 'ring-2 ring-lime ring-offset-2 ring-offset-sheet'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        style={{ backgroundColor: p.color }}
                      >
                        {cardColor === p.color && (
                          <Check size={13} strokeWidth={3} className="text-white drop-shadow-sm" />
                        )}
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
              <label htmlFor="account-start-balance" className="text-[11px] text-muted block mb-1">
                {editingAccount ? 'موجودی فعلی کارت (تومان)' : 'موجودی اولیه کارت (تومان)'}
              </label>
              <AmountInput
                id="account-start-balance"
                placeholder="۰"
                value={balanceInputStr}
                allowNegative
                onChange={handleTotalBalanceChange}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
              {editingAccount && (
                <p className="text-[10px] text-muted mt-1 leading-relaxed">
                  اگر موجودی کارت تغییر کرده، عدد واقعی فعلی را اینجا بنویسید؛ موجودی دقیقاً روی همین عدد تنظیم می‌شود و فاکتورهای قبلی آن را تغییر نمی‌دهند.
                </p>
              )}
            </div>

            {/* Savings Toggle */}
            <div
              onClick={handleToggleSavings}
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

            {/* Savings vs Amanat Initial/Current Split */}
            {isSavings && (
              <div className="p-3.5 rounded-2xl bg-lime/10 border border-lime/25 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <PiggyBank size={15} className="text-lime shrink-0" />
                    تفکیک موجودی کارت (پس‌انداز / امانت)
                  </span>
                  {editingLoanReserved > 0 && (
                    <span className="text-[10px] text-sky font-semibold shrink-0">
                      ذخیره وام: {Money.toman(editingLoanReserved)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="account-savings-part" className="text-[10.5px] text-lime block mb-1 font-semibold">
                      پس‌انداز شما (تومان)
                    </label>
                    <AmountInput
                      id="account-savings-part"
                      placeholder="۰"
                      value={savingsPartStr}
                      onChange={handleSavingsPartChange}
                      className="w-full h-10 rounded-xl bg-sheet border border-lime/30 text-white text-xs px-2.5 dir-ltr focus:outline-none focus:border-lime"
                    />
                  </div>
                  <div>
                    <label htmlFor="account-amanat-part" className="text-[10.5px] text-warn block mb-1 font-semibold">
                      امانت دیگران (تومان)
                    </label>
                    <AmountInput
                      id="account-amanat-part"
                      placeholder="۰"
                      value={personHoldPartStr}
                      onChange={handlePersonHoldPartChange}
                      className="w-full h-10 rounded-xl bg-sheet border border-warn/30 text-white text-xs px-2.5 dir-ltr focus:outline-none focus:border-warn"
                    />
                  </div>
                </div>

                {splitOverTotal && (
                  <p className="text-[10.5px] text-bad font-bold">
                    مبلغ امانت نمی‌تواند بیشتر از موجودی قابل تخصیص ({Money.toman(availableForSplit)} تومان) باشد.
                  </p>
                )}

                {(parsedPersonHoldPart ?? 0) > 0 && (
                  <div className="space-y-1.5 pt-0.5">
                    {persons.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {persons.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPersonHoldName(p.name)}
                            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border transition-colors ${
                              personHoldName.trim() === p.name.trim()
                                ? 'bg-warn/20 border-warn text-warn'
                                : 'bg-sheet border-line text-t2 hover:text-white'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="نام صاحب امانت (اختیاری)"
                      value={personHoldName}
                      onChange={e => setPersonHoldName(e.target.value)}
                      className="w-full h-9 rounded-xl bg-sheet border border-line text-white text-xs px-3 focus:outline-none focus:border-warn placeholder:text-muted"
                    />
                  </div>
                )}

                <p className="text-[10px] text-white/70 leading-relaxed">
                  مبلغ امانت از «پس‌انداز خالص» جدا نگه داشته می‌شود و در بخش جزئیات کارت قابل تسویه است.
                </p>
              </div>
            )}

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

      {/* Savings Card Details Modal */}
      {savingsDetailAccount && detailBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div role="dialog" aria-modal="true" aria-label="جزئیات کارت پس‌انداز" className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl max-h-[92vh] flex flex-col animate-modal-in">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-lime/20 flex items-center justify-center text-lime shrink-0">
                  <PiggyBank size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-extrabold text-white truncate">جزئیات کارت پس‌انداز</h2>
                  <span className="text-[11px] text-muted truncate block">{savingsDetailAccount.name}</span>
                </div>
              </div>
              <button
                onClick={() => setSavingsDetailAccountId(null)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3.5">
              <BankCard
                account={savingsDetailAccount}
                variant="large"
                hidden={hidden}
                revealDetails
                onEdit={() => handleOpenEdit(savingsDetailAccount)}
              />

              {/* Single Unified Card Balance Breakdown Box */}
              <div className="rounded-2xl bg-surface border border-line p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-white block">ترکیب موجودی این کارت</span>
                    <span className="text-[10px] text-muted">چقدر از پول کارت واقعاً پس‌انداز است و چقدرش مال مردم</span>
                  </div>
                  <div className="text-left dir-ltr shrink-0">
                    <span className="text-[10px] text-muted block">موجودی کل کارت</span>
                    <span className="text-sm font-black text-white">
                      {hidden ? Money.HIDDEN : Money.toman(savingsDetailAccount.balance)}
                      <span className="text-[10px] font-normal text-muted mr-1">تومان</span>
                    </span>
                  </div>
                </div>

                {/* Proportional Visual Bar */}
                <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden flex gap-0.5 p-0.5">
                  {detailBreakdown.ownPct > 0 && (
                    <div
                      className="h-full bg-lime rounded-full transition-all duration-300"
                      style={{ width: `${detailBreakdown.ownPct}%` }}
                    />
                  )}
                  {detailBreakdown.personPct > 0 && (
                    <div
                      className="h-full bg-warn rounded-full transition-all duration-300"
                      style={{ width: `${detailBreakdown.personPct}%` }}
                    />
                  )}
                  {detailBreakdown.loanPct > 0 && (
                    <div
                      className="h-full bg-sky rounded-full transition-all duration-300"
                      style={{ width: `${detailBreakdown.loanPct}%` }}
                    />
                  )}
                </div>

                {/* Unified Line-by-Line Breakdown */}
                <div className="space-y-2 pt-0.5">
                  {/* 1. User's Own Net Savings */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-lime/10 border border-lime/25">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-lime shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block">پس‌انداز واقعی شما (مال خودتان)</span>
                        <span className="text-[10px] text-lime/80 block truncate">آزاد و متعلق به خودتان</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-sm font-black text-lime dir-ltr">
                        {hidden ? Money.HIDDEN : Money.toman(detailBreakdown.ownSavings)}{' '}
                        <span className="text-[10px] font-normal text-lime/80">تومان</span>
                      </div>
                      <span className="text-[10px] text-lime/80 font-bold block">
                        {Money.fa(String(detailBreakdown.ownPct))}٪ از موجودی
                      </span>
                    </div>
                  </div>

                  {/* 2. People's Money (Trust / Earmarked for Others) */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-warn/10 border border-warn/25">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-warn shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block">مال مردم (امانت دیگران)</span>
                        <span className="text-[10px] text-warn/85 block truncate">
                          {activePersonHolds.length > 0
                            ? `${Money.fa(String(activePersonHolds.length))} امانت فعال در این کارت`
                            : 'مبلغی به‌عنوان امانت در کارت نیست'}
                        </span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-sm font-black text-warn dir-ltr">
                        {hidden ? Money.HIDDEN : Money.toman(detailBreakdown.personHold)}{' '}
                        <span className="text-[10px] font-normal text-warn/80">تومان</span>
                      </div>
                      <span className="text-[10px] text-warn/80 font-bold block">
                        {Money.fa(String(detailBreakdown.personPct))}٪ از موجودی
                      </span>
                    </div>
                  </div>

                  {/* 3. Loan Reserves (shown when > 0) */}
                  {detailBreakdown.loanReserved > 0 && (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-sky/10 border border-sky/25">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block">ذخیره اقساط وام</span>
                          <span className="text-[10px] text-sky/85 block truncate">
                            کنارگذاشته‌شده برای پرداخت وام‌ها
                          </span>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-sm font-black text-sky dir-ltr">
                          {hidden ? Money.HIDDEN : Money.toman(detailBreakdown.loanReserved)}{' '}
                          <span className="text-[10px] font-normal text-sky/80">تومان</span>
                        </div>
                        <span className="text-[10px] text-sky/80 font-bold block">
                          {Money.fa(String(detailBreakdown.loanPct))}٪ از موجودی
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {detailBreakdown.deficit > 0 && (
                  <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px] flex items-start gap-2 leading-relaxed">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      موجودی فعلی کارت {hidden ? '•••' : Money.toman(detailBreakdown.deficit)} تومان کمتر از مجموع امانت‌ها و ذخیره‌های ثبت‌شده است.
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {onQuickAddForAccount && (
                  <button
                    type="button"
                    onClick={() => onQuickAddForAccount(savingsDetailAccount.id!, 'INCOME')}
                    className="flex-1 h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab active:scale-95 transition-transform"
                  >
                    <Plus size={15} strokeWidth={2.6} />
                    واریز / ثبت امانت
                  </button>
                )}
                {selfOwedRemaining > 0 && (
                  <button
                    type="button"
                    onClick={() => openReturnModal()}
                    className="flex-1 h-11 rounded-xl bg-lime/15 border border-lime/30 text-lime font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <RotateCcw size={14} />
                    بازگرداندن ({hidden ? '•••' : Money.toman(selfOwedRemaining)})
                  </button>
                )}
                {onOpenMonthlyReport && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = savingsDetailAccount.id!;
                      setSavingsDetailAccountId(null);
                      onOpenMonthlyReport(id);
                    }}
                    title="گزارش ماهانه این کارت"
                    aria-label="گزارش ماهانه این کارت"
                    className="w-11 h-11 rounded-xl bg-surface border border-line text-sky flex items-center justify-center hover:bg-white/5 active:scale-95 transition-transform shrink-0"
                  >
                    <PieChart size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const id = savingsDetailAccount.id!;
                    setSavingsDetailAccountId(null);
                    if (onSelectAccount) onSelectAccount(id);
                  }}
                  className="h-11 px-3.5 rounded-xl bg-surface border border-line text-white text-xs font-bold hover:bg-white/5 active:scale-95 transition-transform shrink-0"
                >
                  گردش حساب
                </button>
              </div>

              {/* Person Holds Section ("مال مردم") */}
              {activePersonHolds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <UserCheck size={14} className="text-warn" />
                      جزئیات مال مردم (امانت دیگران)
                    </span>
                    <span className="text-[10px] text-warn font-bold">
                      {hidden ? '•••' : `${Money.toman(savingsEarmarks.personHoldTotal)} تومان`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activePersonHolds.map(p => (
                      <div key={p.id} className="p-3 rounded-2xl bg-surface border border-warn/25 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            امانت {p.personName || 'شخص'}
                          </div>
                          <div className="text-[10px] text-muted mt-0.5">
                            {Jalali.dayLabel(p.createdAt)} · مانده: {hidden ? '•••' : `${Money.toman(p.remaining)} تومان`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openReleaseModal(p)}
                          className="h-7 px-2.5 rounded-lg bg-warn/15 hover:bg-warn/25 text-warn text-[10.5px] font-bold shrink-0"
                        >
                          بازگرداندن / تسویه
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loan Reserves Section */}
              {activeLoanReserves.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Building2 size={14} className="text-sky" />
                      مبالغ کنارگذاشته‌شده برای وام‌ها
                    </span>
                    <span className="text-[10px] text-sky font-bold">
                      {hidden ? '•••' : `${Money.toman(savingsEarmarks.loanReservedTotal)} تومان`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activeLoanReserves.map(r => (
                      <div key={r.id} className="p-3 rounded-2xl bg-surface border border-sky/25 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{r.note || 'ذخیره وام'}</div>
                          <div className="text-[10px] text-muted mt-0.5">
                            {Jalali.dayLabel(r.createdAt)} · مانده ذخیره: {hidden ? '•••' : `${Money.toman(r.remaining)} تومان`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openReleaseModal(r)}
                          className="h-7 px-2.5 rounded-lg bg-sky/15 hover:bg-sky/25 text-sky text-[10.5px] font-bold shrink-0"
                        >
                          آزادسازی / برداشت
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Separated Withdrawals / Self-Owed Commitments Section */}
              {(openWithdrawals.length > 0 || settledWithdrawals.length > 0) && (
                <div className="space-y-2 pt-1 border-t border-line/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <RotateCcw size={13} className="text-lime" />
                      برداشت‌ها و طلب از خود
                    </span>
                    {selfOwedRemaining > 0 && (
                      <span className="text-[10px] font-bold text-bad">
                        مانده بدهی به پس‌انداز: {hidden ? '•••' : `${Money.toman(selfOwedRemaining)} تومان`}
                      </span>
                    )}
                  </div>

                  {openWithdrawals.map(c => (
                    <div key={c.id} className="p-3 rounded-2xl bg-surface border border-line space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{c.note || 'برداشت از پس‌انداز'}</span>
                        <span className="text-[10px] text-muted">{Jalali.dayLabel(c.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-muted text-[10px] block">مبلغ برداشتی</span>
                          <span className="font-extrabold text-white">{hidden ? '•••' : `${Money.toman(c.amount)} تومان`}</span>
                        </div>
                        <div>
                          <span className="text-muted text-[10px] block">بازگردانده شده</span>
                          <span className="font-bold text-sky">{hidden ? '•••' : `${Money.toman(c.paidAmount)} تومان`}</span>
                        </div>
                        <div>
                          <span className="text-muted text-[10px] block">مانده تعهد</span>
                          <span className="font-extrabold text-bad">
                            {hidden ? '•••' : `${Money.toman(c.remaining)} تومان`}
                          </span>
                        </div>
                      </div>
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
                    </div>
                  ))}

                  {settledWithdrawals.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowSettledHistory(v => !v)}
                        className="text-[11px] text-muted hover:text-white flex items-center gap-1 py-1"
                      >
                        <History size={12} />
                        {showSettledHistory
                          ? 'پنهان کردن تسویه‌شده‌ها ▲'
                          : `نمایش ${Money.fa(String(settledWithdrawals.length))} مورد تسویه‌شده ▼`}
                      </button>
                      {showSettledHistory && (
                        <div className="space-y-2 mt-1.5">
                          {settledWithdrawals.map(c => (
                            <div key={c.id} className="p-2.5 rounded-xl bg-surface/60 border border-line/60 flex items-center justify-between text-xs">
                              <div className="min-w-0">
                                <div className="font-semibold text-white/80 truncate">{c.note || 'برداشت از پس‌انداز'}</div>
                                <div className="text-[10px] text-muted">{Jalali.dayLabel(c.createdAt)}</div>
                              </div>
                              <div className="text-left shrink-0">
                                <span className="text-[10px] text-ok font-bold block">تسویه شده ✓</span>
                                <span className="text-[11px] text-muted dir-ltr">{hidden ? '•••' : `${Money.toman(c.amount)} تومان`}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Return to Savings Modal */}
      {isReturnModalOpen && savingsDetailAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div role="dialog" aria-modal="true" aria-label="بازگرداندن به پس‌انداز" className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 animate-modal-in">
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

      {/* Release / Settle Earmark Modal */}
      {releaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div role="dialog" aria-modal="true" aria-label="تسویه یا آزادسازی مبلغ" className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 animate-modal-in">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="text-sm font-bold text-white">
                {releaseTarget.kind === 'PERSON_HOLD'
                  ? `بازگرداندن / تسویه امانت ${releaseTarget.personName || ''}`
                  : 'آزادسازی / برداشت ذخیره وام'}
              </h2>
              <button
                onClick={() => setReleaseTarget(null)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-surface border border-line text-xs">
              <span className="text-muted block text-[10px]">بابت:</span>
              <span className="font-bold text-white">{releaseTarget.note || releaseTarget.personName || 'ذخیره'}</span>
              <span className="text-sky text-[11px] block mt-0.5">
                مانده: {Money.toman(releaseTarget.remaining)} تومان
              </span>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">نحوه تسویه / آزادسازی</label>
              <div className="grid grid-cols-3 gap-1.5 bg-surface p-1 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => setReleaseMode('EXPENSE')}
                  className={`py-2 rounded-lg text-[10.5px] font-bold transition-all ${
                    releaseMode === 'EXPENSE' ? 'bg-lime text-onLime' : 'text-muted'
                  }`}
                >
                  برداشت از کارت
                </button>
                <button
                  type="button"
                  onClick={() => setReleaseMode('TRANSFER')}
                  className={`py-2 rounded-lg text-[10.5px] font-bold transition-all ${
                    releaseMode === 'TRANSFER' ? 'bg-lime text-onLime' : 'text-muted'
                  }`}
                >
                  انتقال به حساب
                </button>
                <button
                  type="button"
                  onClick={() => setReleaseMode('NO_TXN')}
                  className={`py-2 rounded-lg text-[10.5px] font-bold transition-all ${
                    releaseMode === 'NO_TXN' ? 'bg-lime text-onLime' : 'text-muted'
                  }`}
                >
                  آزادسازی بدون تراکنش
                </button>
              </div>
            </div>

            {releaseMode === 'TRANSFER' && (
              <div>
                <label className="text-[11px] text-muted block mb-1">انتقال به حساب</label>
                <Select
                  value={releaseToAccId}
                  onChange={val => setReleaseToAccId(Number(val))}
                  options={accounts
                    .filter((a): a is AccountWithBalance & { id: number } => a.id != null && a.id !== releaseTarget.accountId)
                    .map(a => ({
                      value: a.id,
                      label: a.name,
                    }))}
                  placeholder="انتخاب حساب مقصد"
                />
              </div>
            )}

            <div>
              <label htmlFor="release-amount-input" className="text-[11px] text-muted block mb-1">مبلغ (تومان)</label>
              <AmountInput
                id="release-amount-input"
                value={releaseAmountStr}
                onChange={setReleaseAmountStr}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReleaseTarget(null)}
                className="flex-1 h-11 rounded-xl bg-surface border border-line text-xs font-bold text-muted hover:text-white"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleExecuteRelease}
                className="flex-1 h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab active:scale-95 transition-transform"
              >
                <Check size={16} />
                تأیید و ثبت
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
