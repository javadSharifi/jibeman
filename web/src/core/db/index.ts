import Dexie, { type Table } from 'dexie';

export interface Account {
  id?: number;
  name: string;
  type: 'BANK' | 'CASH' | 'WALLET';
  bankCode?: string;
  accountNo?: string;
  initialBalance: number; // rial
  style: number; // 0..2
  archived: boolean;
  sortOrder: number;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv2?: string;
  iban?: string;
  cardColor?: string;
}

export interface Card {
  id?: number;
  accountId: number;
  last4: string;
}

export interface Category {
  id?: number;
  name: string;
  kind: 'EXPENSE' | 'INCOME';
  icon: string;
  color: number;
  sortOrder: number;
}

export interface Txn {
  id?: number;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'ADJUST' | 'DEBT';
  amount: number; // rial
  accountId: number;
  toAccountId?: number;
  categoryId?: number;
  title?: string;
  note?: string;
  refNo?: string;
  balanceAfter?: number;
  occurredAt: number;
  source: 'MANUAL' | 'SMS' | 'IMPORT';
  createdAt: number;
}

export interface Loan {
  id?: number;
  title: string;
  lender?: string;
  principal: number; // rial
  installment: number; // rial
  count: number;
  firstDueAt: number;
  accountId?: number;
  note?: string;
  createdAt: number;
}

export interface Installment {
  id?: number;
  loanId: number;
  n: number;
  dueAt: number;
  amount: number;
  paidTxnId?: number;
}

export interface Debt {
  id?: number;
  direction: 'OWED_TO_ME' | 'I_OWE';
  person: string;
  amount: number;
  dueAt?: number;
  note?: string;
  createdAt: number;
  personId?: number;
}

export interface DebtPayment {
  id?: number;
  debtId: number;
  amount: number;
  at: number;
  txnId?: number;
}

export interface Person {
  id?: number;
  name: string;
  phone?: string;
  cardNo?: string;
  note?: string;
  createdAt: number;
}

export interface Goal {
  id?: number;
  title: string;
  target: number;
  dueAt?: number;
  icon: string;
  color: number;
  closed: boolean;
  createdAt: number;
}

export interface GoalEntry {
  id?: number;
  goalId: number;
  amount: number; // signed
  at: number;
}

export interface SplitGroup {
  id?: number;
  title: string;
  closed: boolean;
  createdAt: number;
}

export interface SplitMember {
  id?: number;
  groupId: number;
  personId?: number | null; // null = me
}

export interface SplitExpense {
  id?: number;
  groupId: number;
  title: string;
  amount: number;
  payerId: number;
  at: number;
  settlement: boolean;
}

export interface SplitShare {
  id?: number;
  expenseId: number;
  memberId: number;
  amount: number;
}

export interface Rule {
  id?: number;
  contains: string;
  categoryId?: number;
  bank?: string;
  type?: string;
  enabled: boolean;
}

export interface Outbox {
  key: string; // `${tbl}|${id}`
  t: string;
  id: string;
  updatedAt: number;
  deleted: 0 | 1;
}

export const SYNC_TABLES = [
  'accounts',
  'cards',
  'categories',
  'txns',
  'loans',
  'installments',
  'debts',
  'debtPayments',
  'persons',
  'goals',
  'goalEntries',
  'splitGroups',
  'splitMembers',
  'splitExpenses',
  'splitShares',
  'rules',
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

let isSyncingRemote = false;
export function setSyncingRemote(val: boolean) {
  isSyncingRemote = val;
}

export class JibemanDatabase extends Dexie {
  accounts!: Table<Account, number>;
  cards!: Table<Card, number>;
  categories!: Table<Category, number>;
  txns!: Table<Txn, number>;
  loans!: Table<Loan, number>;
  installments!: Table<Installment, number>;
  debts!: Table<Debt, number>;
  debtPayments!: Table<DebtPayment, number>;
  persons!: Table<Person, number>;
  goals!: Table<Goal, number>;
  goalEntries!: Table<GoalEntry, number>;
  splitGroups!: Table<SplitGroup, number>;
  splitMembers!: Table<SplitMember, number>;
  splitExpenses!: Table<SplitExpense, number>;
  splitShares!: Table<SplitShare, number>;
  rules!: Table<Rule, number>;
  outbox!: Table<Outbox, string>;

  constructor() {
    super('jibeman_pwa_db');

    this.version(1).stores({
      accounts: '++id, type, bankCode, archived, sortOrder',
      cards: '++id, accountId, last4',
      categories: '++id, kind, sortOrder',
      txns: '++id, type, accountId, toAccountId, categoryId, occurredAt, source',
      loans: '++id, accountId, firstDueAt, createdAt',
      installments: '++id, loanId, dueAt, paidTxnId',
      debts: '++id, direction, personId, dueAt',
      debtPayments: '++id, debtId, txnId, at',
      persons: '++id, name',
      goals: '++id, closed, dueAt',
      goalEntries: '++id, goalId, at',
      splitGroups: '++id, closed',
      splitMembers: '++id, groupId, personId',
      splitExpenses: '++id, groupId, payerId, at',
      splitShares: '++id, expenseId, memberId',
      rules: '++id, categoryId, enabled',
    });

    this.version(2).stores({
      outbox: 'key, t, updatedAt',
    });

    this.setupSyncHooks();
  }

  private setupSyncHooks() {
    for (const tbl of SYNC_TABLES) {
      const table = (this as any)[tbl] as Table<any, any>;
      if (!table) continue;

      table.hook('creating', function (primKey, obj, trans) {
        if (isSyncingRemote) return;
        this.onsuccess = (key) => {
          const id = String(key ?? primKey ?? (obj as any)?.id);
          const now = Date.now();
          trans.table('outbox').put({
            key: `${tbl}|${id}`,
            t: tbl,
            id,
            updatedAt: now,
            deleted: 0,
          }).catch(() => {});
        };
      });

      table.hook('updating', function (modifications, primKey, obj, trans) {
        if (isSyncingRemote) return;
        const id = String(primKey ?? (obj as any)?.id);
        const now = Date.now();
        trans.table('outbox').put({
          key: `${tbl}|${id}`,
          t: tbl,
          id,
          updatedAt: now,
          deleted: 0,
        }).catch(() => {});
      });

      table.hook('deleting', function (primKey, obj, trans) {
        if (isSyncingRemote) return;
        const id = String(primKey);
        const now = Date.now();
        trans.table('outbox').put({
          key: `${tbl}|${id}`,
          t: tbl,
          id,
          updatedAt: now,
          deleted: 1,
        }).catch(() => {});
      });
    }
  }
}

export const db = new JibemanDatabase();

export async function seedInitialDataIfNeeded() {
  const count = await db.categories.count();
  if (count === 0) {
    const defaultCategories: Omit<Category, 'id'>[] = [
      { name: 'خوراک', kind: 'EXPENSE', icon: 'Utensils', color: 1, sortOrder: 0 },
      { name: 'حمل‌ونقل', kind: 'EXPENSE', icon: 'Car', color: 0, sortOrder: 1 },
      { name: 'خرید', kind: 'EXPENSE', icon: 'ShoppingBag', color: 2, sortOrder: 2 },
      { name: 'قبض', kind: 'EXPENSE', icon: 'Zap', color: 6, sortOrder: 3 },
      { name: 'شارژ و اینترنت', kind: 'EXPENSE', icon: 'Smartphone', color: 4, sortOrder: 4 },
      { name: 'خانه', kind: 'EXPENSE', icon: 'Home', color: 5, sortOrder: 5 },
      { name: 'سلامت', kind: 'EXPENSE', icon: 'Heart', color: 7, sortOrder: 6 },
      { name: 'تفریح', kind: 'EXPENSE', icon: 'Gift', color: 2, sortOrder: 7 },
      { name: 'آموزش', kind: 'EXPENSE', icon: 'BookOpen', color: 0, sortOrder: 8 },
      { name: 'قسط و وام', kind: 'EXPENSE', icon: 'Building2', color: 0, sortOrder: 9 },
      { name: 'سایر', kind: 'EXPENSE', icon: 'Tag', color: 5, sortOrder: 10 },
      { name: 'حقوق', kind: 'INCOME', icon: 'Briefcase', color: 3, sortOrder: 11 },
      { name: 'فروش', kind: 'INCOME', icon: 'ShoppingBag', color: 3, sortOrder: 12 },
      { name: 'هدیه', kind: 'INCOME', icon: 'Gift', color: 4, sortOrder: 13 },
      { name: 'سایر درآمد', kind: 'INCOME', icon: 'PlusCircle', color: 3, sortOrder: 14 },
    ];
    await db.categories.bulkAdd(defaultCategories);
  }

  const accCount = await db.accounts.count();
  if (accCount === 0) {
    const accId = await db.accounts.add({
      name: 'بلو بانک',
      type: 'BANK',
      bankCode: 'blu',
      initialBalance: 0,
      style: 0,
      archived: false,
      sortOrder: 0,
      cardNumber: '6219861800000000',
    });
    await db.cards.add({
      accountId: accId,
      last4: '0000',
    });
    await db.accounts.add({
      name: 'کیف پول نقدی',
      type: 'CASH',
      initialBalance: 0,
      style: 1,
      archived: false,
      sortOrder: 1,
    });
  }
}
