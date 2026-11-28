import type { Table } from 'dexie';
import { backupFormat, decryptBackup, encryptBackup } from './crypto';
import { db, SYNC_TABLES, type SyncTableName } from './db';
import { protectRow, revealRows } from './db/protectedRows';
import type {
  AlertEventLog as InvestmentAlertEventLog,
  AlertRule as InvestmentAlertRule,
  Asset as InvestmentAsset,
  CashLink as InvestmentCashLink,
  DcaPlan as InvestmentDcaPlan,
  DcaStepLink as InvestmentDcaStepLink,
  LedgerEvent as InvestmentLedgerEvent,
  Portfolio as InvestmentPortfolio,
  PriceSnapshot as InvestmentPriceSnapshot,
  TargetAllocation as InvestmentTargetAllocation,
} from './investment/types';

type BackupRow = { id: number };
const table = (name: SyncTableName): Table<BackupRow, number> => db.table(name);

const INVESTMENT_TABLES = [
  'portfolios',
  'assets',
  'ledgerEvents',
  'cashLinks',
  'priceSnapshots',
] as const;

const OPTIONAL_INVESTMENT_TABLES = ['dcaPlans', 'dcaStepLinks', 'alertRules', 'alertEvents', 'targetAllocations'] as const;

const ALL_INVESTMENT_TABLE_NAMES = new Set<string>([
  ...INVESTMENT_TABLES,
  ...OPTIONAL_INVESTMENT_TABLES,
]);

const NUMERIC_SYNC_TABLES = SYNC_TABLES.filter(
  name => !ALL_INVESTMENT_TABLE_NAMES.has(name)
);

type InvestmentTableName =
  | (typeof INVESTMENT_TABLES)[number]
  | (typeof OPTIONAL_INVESTMENT_TABLES)[number];

interface ValidatedInvestmentPayload {
  portfolios: InvestmentPortfolio[];
  assets: InvestmentAsset[];
  ledgerEvents: InvestmentLedgerEvent[];
  cashLinks: InvestmentCashLink[];
  priceSnapshots: InvestmentPriceSnapshot[];
  dcaPlans: InvestmentDcaPlan[];
  dcaStepLinks: InvestmentDcaStepLink[];
  alertRules: InvestmentAlertRule[];
  alertEvents: InvestmentAlertEventLog[];
  targetAllocations: InvestmentTargetAllocation[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateInvestmentSection(raw: unknown): ValidatedInvestmentPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid investment backup section');
  }
  const obj = raw as Record<string, unknown>;
  for (const tbl of INVESTMENT_TABLES) {
    if (!Array.isArray(obj[tbl])) {
      throw new Error(`Invalid investment backup table: ${tbl}`);
    }
    const rows = obj[tbl] as unknown[];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !isNonEmptyString((row as { id?: unknown }).id)) {
        throw new Error(`Invalid investment row id in ${tbl}`);
      }
      const id = (row as { id: string }).id;
      if (seen.has(id)) {
        throw new Error(`Duplicate investment row id in ${tbl}`);
      }
      seen.add(id);
    }
  }

  const portfolios = obj.portfolios as InvestmentPortfolio[];
  const assets = obj.assets as InvestmentAsset[];
  const ledgerEvents = obj.ledgerEvents as InvestmentLedgerEvent[];
  const cashLinks = obj.cashLinks as InvestmentCashLink[];
  const priceSnapshots = obj.priceSnapshots as InvestmentPriceSnapshot[];
  const dcaPlans = (Array.isArray(obj.dcaPlans) ? obj.dcaPlans : []) as InvestmentDcaPlan[];
  const dcaStepLinks = (Array.isArray(obj.dcaStepLinks) ? obj.dcaStepLinks : []) as InvestmentDcaStepLink[];
  const alertRules = (Array.isArray(obj.alertRules) ? obj.alertRules : []) as InvestmentAlertRule[];
  const alertEvents = (Array.isArray(obj.alertEvents) ? obj.alertEvents : []) as InvestmentAlertEventLog[];
  const targetAllocations = (Array.isArray(obj.targetAllocations) ? obj.targetAllocations : []) as InvestmentTargetAllocation[];

  const portfolioIds = new Set(portfolios.map(p => p.id));
  const assetIds = new Set(assets.map(a => a.id));
  const eventIds = new Set(ledgerEvents.map(e => e.id));
  const recordIds = new Set(ledgerEvents.map(e => e.recordId));

  for (const p of portfolios) {
    if (!isNonEmptyString(p.name) || p.baseCurrency !== 'IRR') {
      throw new Error('Invalid portfolio entry in backup');
    }
  }

  for (const a of assets) {
    if (
      !portfolioIds.has(a.portfolioId) ||
      !isNonEmptyString(a.name) ||
      !isNonEmptyString(a.instrumentKey) ||
      !['GRAM', 'COUNT', 'UNIT'].includes(a.baseUnit)
    ) {
      throw new Error('Invalid asset entry in backup');
    }
  }

  for (const ev of ledgerEvents) {
    if (
      !portfolioIds.has(ev.portfolioId) ||
      !assetIds.has(ev.assetId) ||
      !isNonEmptyString(ev.recordId) ||
      !isNonEmptyString(ev.operationId) ||
      !['OPENING', 'BUY', 'SELL', 'AMEND', 'VOID'].includes(ev.kind) ||
      typeof ev.recordedAtMs !== 'number' ||
      typeof ev.effectiveAtMs !== 'number' ||
      !ev.payload ||
      typeof ev.payload !== 'object'
    ) {
      throw new Error('Invalid ledger event entry in backup');
    }
  }

  for (const link of cashLinks) {
    if (
      !recordIds.has(link.recordId) ||
      !eventIds.has(link.effectiveEventId) ||
      !Number.isSafeInteger(link.accountId) ||
      !['CREATED_BY_PORTFOLIO', 'EXISTING_TXN'].includes(link.origin) ||
      !['ACTIVE', 'VOIDED', 'NEEDS_RELINK', 'NEEDS_REVIEW'].includes(link.status)
    ) {
      throw new Error('Invalid cashLink entry in backup');
    }
  }

  for (const snap of priceSnapshots) {
    if (
      !isNonEmptyString(snap.instrumentKey) ||
      !isNonEmptyString(snap.amount) ||
      typeof snap.observedAtMs !== 'number' ||
      !['DEALER_BID', 'DEALER_ASK', 'REFERENCE'].includes(snap.quoteSide)
    ) {
      throw new Error('Invalid priceSnapshot entry in backup');
    }
  }

  for (const plan of dcaPlans) {
    if (!isNonEmptyString(plan?.id) || !assetIds.has(plan.assetId)) {
      throw new Error('Invalid dcaPlan entry in backup');
    }
  }
  const planIds = new Set(dcaPlans.map(p => p.id));
  for (const sl of dcaStepLinks) {
    if (!isNonEmptyString(sl?.id) || !planIds.has(sl.planId)) {
      throw new Error('Invalid dcaStepLink entry in backup');
    }
  }

  return { portfolios, assets, ledgerEvents, cashLinks, priceSnapshots, dcaPlans, dcaStepLinks, alertRules, alertEvents, targetAllocations };
}

export async function exportBackup(password: string): Promise<string> {
  const allTables = [
    ...NUMERIC_SYNC_TABLES.map(table),
    db.portfolios,
    db.assets,
    db.ledgerEvents,
    db.cashLinks,
    db.priceSnapshots,
    db.dcaPlans,
    db.dcaStepLinks,
    db.alertRules,
    db.alertEvents,
    db.targetAllocations,
  ];
  const [data, portfolios, assets, ledgerEvents, cashLinks, priceSnapshots, dcaPlans, dcaStepLinks, alertRules, alertEvents, targetAllocations] = await db.transaction(
    'r',
    allTables,
    async () =>
      Promise.all([
        Promise.all(NUMERIC_SYNC_TABLES.map(async name => [name, await table(name).toArray()] as const)),
        db.portfolios.toArray(),
        db.assets.toArray(),
        db.ledgerEvents.toArray(),
        db.cashLinks.toArray(),
        db.priceSnapshots.toArray(),
        db.dcaPlans.toArray(),
        db.dcaStepLinks.toArray(),
        db.alertRules.toArray(),
        db.alertEvents.toArray(),
        db.targetAllocations.toArray(),
      ])
  );
  const entries = await Promise.all(data.map(async ([name, rows]) => [name, await revealRows(name, rows)]));
  return encryptBackup(
    JSON.stringify({
      version: 2,
      exportedAt: Date.now(),
      data: Object.fromEntries(entries),
      investment: {
        portfolios,
        assets,
        ledgerEvents,
        cashLinks,
        priceSnapshots,
        dcaPlans,
        dcaStepLinks,
        alertRules,
        alertEvents,
        targetAllocations,
      },
    }),
    password
  );
}

export async function restoreBackup(text: string, password: string): Promise<void> {
  const envelope = JSON.parse(text);
  const backup =
    envelope?.format === backupFormat
      ? JSON.parse(await decryptBackup(envelope, password))
      : envelope;

  const version = backup?.version;
  if ((version !== 1 && version !== 2) || !backup.data || typeof backup.data !== 'object') {
    throw new Error('Invalid backup');
  }
  for (const name of ['accounts', 'cards', 'categories', 'txns']) {
    if (!Array.isArray(backup.data[name])) throw new Error('Invalid backup');
  }

  const data = new Map<SyncTableName, BackupRow[]>();
  for (const name of NUMERIC_SYNC_TABLES) {
    if (!Object.hasOwn(backup.data, name)) continue;
    const rows: unknown = backup.data[name];
    if (
      !Array.isArray(rows) ||
      rows.some(
        row =>
          !row ||
          typeof row !== 'object' ||
          !Number.isSafeInteger((row as { id?: unknown }).id) ||
          (row as { id: number }).id < 1 ||
          Object.hasOwn(row, 'privateData')
      )
    ) {
      throw new Error('Invalid backup');
    }
    if (new Set(rows.map(row => (row as { id: number }).id)).size !== rows.length) {
      throw new Error('Duplicate backup row');
    }
    data.set(name, await Promise.all(rows.map(row => protectRow(name, row as BackupRow))));
  }

  const investmentData: ValidatedInvestmentPayload =
    version === 2 && backup.investment !== undefined
      ? validateInvestmentSection(backup.investment)
      : {
          portfolios: [],
          assets: [],
          ledgerEvents: [],
          cashLinks: [],
          priceSnapshots: [],
          dcaPlans: [],
          dcaStepLinks: [],
          alertRules: [],
          alertEvents: [],
          targetAllocations: [],
        };

  // Additional referential integrity for cashLinks against restored accounts/txns
  if (investmentData.cashLinks.length > 0) {
    const accountIds = new Set((data.get('accounts') ?? []).map(a => a.id));
    const txnIds = new Set((data.get('txns') ?? []).map(t => t.id));
    for (const link of investmentData.cashLinks) {
      if (!accountIds.has(link.accountId)) {
        throw new Error('Invalid cashLink account reference in backup');
      }
      if (link.status === 'ACTIVE' && link.bankTxnId != null && !txnIds.has(link.bankTxnId)) {
        throw new Error('Invalid cashLink transaction reference in backup');
      }
    }
  }

  await db.transaction(
    'rw',
    [
      ...[...data.keys()].map(table),
      db.portfolios,
      db.assets,
      db.ledgerEvents,
      db.cashLinks,
      db.priceSnapshots,
      db.dcaPlans,
      db.dcaStepLinks,
      db.alertRules,
      db.alertEvents,
      db.targetAllocations,
      db.syncConflicts,
      db.outbox,
    ],
    async () => {
      for (const [name, rows] of data) {
        const target = table(name);
        await target.clear();
        if (rows.length > 0) await target.bulkAdd(rows);
      }
      await db.syncConflicts.clear();
      const invTargets: Array<[InvestmentTableName, Table<any, string>, any[]]> = [
        ['portfolios', db.portfolios, investmentData.portfolios],
        ['assets', db.assets, investmentData.assets],
        ['ledgerEvents', db.ledgerEvents, investmentData.ledgerEvents],
        ['cashLinks', db.cashLinks, investmentData.cashLinks],
        ['priceSnapshots', db.priceSnapshots, investmentData.priceSnapshots],
        ['dcaPlans', db.dcaPlans, investmentData.dcaPlans],
        ['dcaStepLinks', db.dcaStepLinks, investmentData.dcaStepLinks],
        ['alertRules', db.alertRules, investmentData.alertRules],
        ['alertEvents', db.alertEvents, investmentData.alertEvents],
        ['targetAllocations', db.targetAllocations, investmentData.targetAllocations],
      ];
      for (const [, tbl, rows] of invTargets) {
        await tbl.clear();
        if (rows.length > 0) await tbl.bulkAdd(rows);
      }
    }
  );
}
