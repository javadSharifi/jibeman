import Dexie, { type Table } from 'dexie';
import { hasRawCardData, protectInTransaction } from './protectedRows';

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
  privateData?: string;
  isSavings?: boolean;
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
  accountId?: number; // default account for installment payments
  receiveAccountId?: number;
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
  paidAt?: number;
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

export type SavingsCommitmentKind = 'WITHDRAWAL' | 'LOAN_RESERVE' | 'PERSON_HOLD';

export interface SavingsCommitment {
  id?: number;
  accountId: number;
  txnId?: number;
  amount: number; // rial
  paidAmount: number; // rial
  note?: string;
  createdAt: number;
  kind?: SavingsCommitmentKind;
  loanId?: number;
  targetYear?: number;
  targetMonth?: number;
  personId?: number;
  personName?: string;
}

export interface SavingsPayment {
  id?: number;
  commitmentId: number;
  amount: number; // rial
  at: number;
  txnId?: number;
}

export interface CompareSession {
  id?: number;
  title: string;
  budget?: number; // rial
  status: 'OPEN' | 'DECIDED' | 'ARCHIVED';
  chosenItemId?: number;
  decisionNote?: string;
  decidedAt?: number;
  sellerFlags?: string[];
  scorecard?: {
    needFit: number;
    valueForPrice: number;
    quality: number;
    sellerTrust: number;
    marketResearch: number;
    warranty: number;
    maintenanceCost: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CompareCriterion {
  id?: number;
  sessionId: number;
  title: string;
  why?: string;
  strict: boolean; // خط قرمز / deal-breaker
  weight: number; // 3 = بسیار مهم, 1 = معمولی, 0.5 = کم‌اهمیت
  sortOrder: number;
  createdAt: number;
}

export interface CompareItem {
  id?: number;
  sessionId: number;
  name: string;
  price?: number; // rial (قیمت پیشنهادی فروشنده)
  marketPrice?: number; // rial (قیمت عرف و واقعی بازار)
  storeName?: string;
  url?: string;
  warranty?: string;
  pros?: string;
  cons?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CompareCheck {
  id?: number;
  sessionId: number;
  itemId: number;
  criterionId: number;
  state: 'PASS' | 'FAIL' | 'UNKNOWN';
  note?: string;
  updatedAt: number;
}

export type PurchaseMotivation =
  | 'REAL_NEED'
  | 'REPLACEMENT'
  | 'SPECIAL_DISCOUNT'
  | 'EXCITEMENT'
  | 'PEER_PRESSURE'
  | 'FEEL_GOOD_ESCAPE'
  | 'FOMO'
  | 'SELLER_RECOMMENDATION'
  | 'OTHER';

export type ImpulseSessionStatus =
  | 'COOLING_OFF'
  | 'WAITING_EVAL'
  | 'CANCELLED'
  | 'PURCHASED'
  | 'EMERGENCY_BYPASS';

export interface ImpulseSession {
  id?: number;
  itemTitle: string;
  amount: number; // rial
  categoryName?: string;
  storeName?: string;
  compareSessionId?: number;
  compareItemId?: number;
  accountId?: number;
  categoryId?: number;

  // Emotional & Context checklist
  isTired: boolean;
  isStressed: boolean;
  isRushing: boolean;
  isSellerPushing: boolean;
  isOverexcited: boolean;
  hasResearched: boolean;
  isPrePlanned: boolean;

  // Primary motivation
  motivation: PurchaseMotivation;
  motivationNote?: string;

  // Store exit & Timing
  leftStoreAt?: number;
  requiredDelayMinutes: number;
  coolingStartsAt: number;
  coolingEndsAt: number;

  // Notes
  initialEmotionNote?: string;
  intentNote?: string;

  // Post-brake evaluation answers
  postEval?: {
    stillNeed: boolean;
    stillExcited: boolean;
    badIfSkipped: boolean;
    alternativesChecked: boolean;
    priceCompared: boolean;
    sellerPressureFelt: boolean;
    happyTomorrow: boolean;
    finalNote?: string;
  };

  // Outcome
  status: ImpulseSessionStatus;
  savedAmount?: number; // rial saved if cancelled
  finalTxnId?: number;
  completedAt?: number;
  bypassReason?: string;
  createdAt: number;
  updatedAt: number;
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
  'savingsCommitments',
  'savingsPayments',
  'compareSessions',
  'compareCriteria',
  'compareItems',
  'compareChecks',
  'impulseSessions',
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

const remoteTransactions = new WeakSet<object>();
export function markSyncTransaction() {
  const tx = Dexie.currentTransaction;
  if (tx) remoteTransactions.add(tx);
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
  savingsCommitments!: Table<SavingsCommitment, number>;
  savingsPayments!: Table<SavingsPayment, number>;
  compareSessions!: Table<CompareSession, number>;
  compareCriteria!: Table<CompareCriterion, number>;
  compareItems!: Table<CompareItem, number>;
  compareChecks!: Table<CompareCheck, number>;
  impulseSessions!: Table<ImpulseSession, number>;
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

    this.version(3).stores({ cards: '++id, accountId', persons: '++id' }).upgrade(async tx => {
      remoteTransactions.add(tx);
      for (const name of ['accounts', 'cards', 'persons']) {
        const table = tx.table(name);
        const rows = (await table.toArray()).filter(row => hasRawCardData(name, row));
        const protectedRows = [];
        for (const row of rows) protectedRows.push(await protectInTransaction(name, row));
        await table.bulkPut(protectedRows);
      }
    });

    this.version(4).stores({
      accounts: '++id, type, bankCode, archived, sortOrder, isSavings',
      savingsCommitments: '++id, accountId, txnId, createdAt',
      savingsPayments: '++id, commitmentId, txnId, at',
    });

    this.version(4).stores({
      installments: '++id, loanId, dueAt, paidTxnId, paidAt',
    });

    this.version(5).stores({
      compareSessions: '++id, status, createdAt, updatedAt',
      compareCriteria: '++id, sessionId, strict, sortOrder',
      compareItems: '++id, sessionId, price, createdAt',
      compareChecks: '++id, sessionId, itemId, criterionId, state',
    });

    this.version(6).stores({
      impulseSessions: '++id, status, coolingEndsAt, createdAt, updatedAt',
    });

    this.use({
      stack: 'dbcore',
      name: 'protect-card-fields',
      create: core => ({
        ...core,
        table: name => {
          const table = core.table(name);
          return {
            ...table,
            mutate: request => {
              if ((request.type === 'add' || request.type === 'put') &&
                  request.values.some(row => hasRawCardData(name, row))) {
                return Promise.reject(new Error('Unencrypted card data cannot be stored'));
              }
              return table.mutate(request);
            },
          };
        },
      }),
    });
    this.setupSyncHooks();
  }

  private setupSyncHooks() {
    for (const tbl of SYNC_TABLES) {
      const table = (this as any)[tbl] as Table<any, any>;
      if (!table) continue;

      table.hook('creating', function (primKey, obj, trans) {
        if (remoteTransactions.has(trans)) return;
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
        if (remoteTransactions.has(trans)) return;
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
        if (remoteTransactions.has(trans)) return;
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
  await db.transaction('rw', [db.categories, db.accounts, db.outbox], async () => {
    markSyncTransaction();
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
      await db.accounts.add({
        name: 'بلو بانک',
        type: 'BANK',
        bankCode: 'blu',
        initialBalance: 0,
        style: 0,
        archived: false,
        sortOrder: 0,
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
  });
}
