import { db, type Account, type Category, type Txn } from './db';
import { getAccountsWithBalances, getActiveInvestmentLinkedTxnIds, getPersonHoldTxnIds, type AccountWithBalance, type TxnWithDetails } from './db/helpers';
import { Jalali } from './jalali';
import { Money } from './money';
import { CAT_COLORS } from '../components/UI';

export interface CategorySpendItem {
  key: string; // 'cat-<id>' or 'uncategorized'
  categoryId: number | null;
  name: string;
  icon: string;
  colorIdx: number;
  colorHex: string;
  totalAmount: number; // rial
  count: number;
  percent: number; // 0..100
  txns: TxnWithDetails[];
}

export interface AccountSpendItem {
  accountId: number;
  name: string;
  type: Account['type'];
  bankCode?: string;
  last4?: string;
  isSavings?: boolean;
  totalAmount: number; // rial
  count: number;
  percent: number; // 0..100
}

export interface MonthlyReportData {
  year: number;
  month: number;
  prevYear: number;
  prevMonth: number;
  accountId?: number;
  totalExpense: number;
  totalIncome: number;
  totalTransferOut: number;
  expenseCount: number;
  prevMonthExpense: number;
  deltaPercent: number | null;
  dailyAverage: number;
  categories: CategorySpendItem[];
  accountShares: AccountSpendItem[];
}

export function getPrevJalaliMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function getNextJalaliMonth(year: number, month: number): { year: number; month: number } {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function buildMonthlyReportData(params: {
  year: number;
  month: number;
  accountId?: number;
  monthTxns: Txn[];
  prevMonthTxns: Txn[];
  accounts: AccountWithBalance[];
  allAccounts: Account[];
  categories: Category[];
  personHoldTxnIds?: Set<number>;
  investmentLinkedTxnIds?: Set<number>;
  now?: number;
}): MonthlyReportData {
  const {
    year,
    month,
    accountId,
    monthTxns,
    prevMonthTxns,
    accounts,
    allAccounts,
    categories,
    personHoldTxnIds,
    investmentLinkedTxnIds,
    now = Date.now(),
  } = params;

  const prev = getPrevJalaliMonth(year, month);
  const accMap = new Map<number, AccountWithBalance | Account>();
  for (const a of allAccounts) {
    if (a.id != null) accMap.set(a.id, a);
  }
  for (const a of accounts) {
    if (a.id != null) accMap.set(a.id, a);
  }

  const catMap = new Map<number, Category>();
  for (const c of categories) {
    if (c.id != null) catMap.set(c.id, c);
  }

  const matchesScope = (t: Txn) =>
    (accountId == null || t.accountId === accountId) &&
    !(t.id != null && (personHoldTxnIds?.has(t.id) || investmentLinkedTxnIds?.has(t.id)));

  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransferOut = 0;
  let expenseCount = 0;

  const expenseTxns: Txn[] = [];
  for (const t of monthTxns) {
    if (!matchesScope(t)) continue;
    if (t.type === 'EXPENSE') {
      totalExpense += t.amount;
      expenseCount += 1;
      expenseTxns.push(t);
    } else if (t.type === 'INCOME') {
      totalIncome += t.amount;
    } else if (t.type === 'TRANSFER') {
      totalTransferOut += t.amount;
    }
  }

  let prevMonthExpense = 0;
  for (const t of prevMonthTxns) {
    if (matchesScope(t) && t.type === 'EXPENSE') {
      prevMonthExpense += t.amount;
    }
  }

  const deltaPercent =
    prevMonthExpense > 0
      ? Math.round(((totalExpense - prevMonthExpense) / prevMonthExpense) * 100)
      : null;

  const curJ = Jalali.of(now);
  const isCurrentMonth = year === curJ.y && month === curJ.m;
  const isFutureMonth = year > curJ.y || (year === curJ.y && month > curJ.m);
  const elapsedDays = isCurrentMonth
    ? Math.max(1, curJ.d)
    : isFutureMonth
    ? 1
    : Jalali.monthDays(year, month);
  const dailyAverage = totalExpense > 0 ? Math.round(totalExpense / elapsedDays) : 0;

  // Group expenses by category
  const catGroups = new Map<string, CategorySpendItem>();
  const accGroups = new Map<number, AccountSpendItem>();

  const sortedExpenses = [...expenseTxns].sort((a, b) => {
    if (b.occurredAt !== a.occurredAt) return b.occurredAt - a.occurredAt;
    return (b.id ?? 0) - (a.id ?? 0);
  });

  for (const t of sortedExpenses) {
    const cat = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
    const key = cat?.id != null ? `cat-${cat.id}` : 'uncategorized';
    const colorIdx = cat ? cat.color : 6;
    const colorHex = CAT_COLORS[colorIdx % CAT_COLORS.length].text;

    const acc = accMap.get(t.accountId);
    const txnDetail: TxnWithDetails = {
      ...t,
      accountName: acc?.name || 'حساب نامشخص',
      toAccountName: t.toAccountId != null ? accMap.get(t.toAccountId)?.name : undefined,
      categoryName: cat?.name,
      categoryIcon: cat?.icon,
      categoryColor: cat?.color,
    };

    let catGroup = catGroups.get(key);
    if (!catGroup) {
      catGroup = {
        key,
        categoryId: cat?.id ?? null,
        name: cat?.name || 'بدون دسته',
        icon: cat?.icon || 'Tag',
        colorIdx,
        colorHex,
        totalAmount: 0,
        count: 0,
        percent: 0,
        txns: [],
      };
      catGroups.set(key, catGroup);
    }
    catGroup.totalAmount += t.amount;
    catGroup.count += 1;
    catGroup.txns.push(txnDetail);

    if (accountId == null) {
      let accGroup = accGroups.get(t.accountId);
      if (!accGroup) {
        const accWithBal = acc as AccountWithBalance | undefined;
        accGroup = {
          accountId: t.accountId,
          name: acc?.name || 'حساب نامشخص',
          type: acc?.type || 'BANK',
          bankCode: acc?.bankCode,
          last4: accWithBal?.last4,
          isSavings: acc?.isSavings,
          totalAmount: 0,
          count: 0,
          percent: 0,
        };
        accGroups.set(t.accountId, accGroup);
      }
      accGroup.totalAmount += t.amount;
      accGroup.count += 1;
    }
  }

  const categoriesList = Array.from(catGroups.values())
    .map(item => ({
      ...item,
      percent: totalExpense > 0 ? (item.totalAmount / totalExpense) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const accountShares = Array.from(accGroups.values())
    .map(item => ({
      ...item,
      percent: totalExpense > 0 ? (item.totalAmount / totalExpense) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    year,
    month,
    prevYear: prev.year,
    prevMonth: prev.month,
    accountId,
    totalExpense,
    totalIncome,
    totalTransferOut,
    expenseCount,
    prevMonthExpense,
    deltaPercent,
    dailyAverage,
    categories: categoriesList,
    accountShares,
  };
}

export async function getMonthlyReport(
  year: number,
  month: number,
  accountId?: number
): Promise<{ report: MonthlyReportData; accounts: AccountWithBalance[] }> {
  const [start, end] = Jalali.monthRange(year, month);
  const prev = getPrevJalaliMonth(year, month);
  const [prevStart, prevEnd] = Jalali.monthRange(prev.year, prev.month);

  const [accounts, allAccounts, categories, monthTxns, prevMonthTxns, personHoldTxnIds, investmentLinkedTxnIds] = await Promise.all([
    getAccountsWithBalances(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.txns.where('occurredAt').between(start, end, true, false).toArray(),
    db.txns.where('occurredAt').between(prevStart, prevEnd, true, false).toArray(),
    getPersonHoldTxnIds(),
    getActiveInvestmentLinkedTxnIds(),
  ]);

  return {
    accounts,
    report: buildMonthlyReportData({
      year,
      month,
      accountId,
      monthTxns,
      prevMonthTxns,
      accounts,
      allAccounts,
      categories,
      personHoldTxnIds,
      investmentLinkedTxnIds,
    }),
  };
}

export function formatSpendPercent(percent: number): string {
  if (percent <= 0) return '۰٪';
  if (percent < 1) return 'کمتر از ۱٪';
  return `${Money.fa(String(Math.round(percent)))}٪`;
}
