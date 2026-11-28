import { db, type Account, type Txn } from './index';
import { getAccountsWithBalances } from './helpers';
import { DEFAULT_SYNC_URL, getCfg, isInvestmentSyncReady } from '../sync';
import { isLockEnabled } from '../security';
import {
  R,
  buildPublicAlertRequestPayload,
  computeTradeSettlementRial,
  evaluateDcaPlan,
  evaluateLocalAlerts,
  evaluatePortfolioAllocation,
  formatAlertNotificationBody,
  mergePriceSnapshots,
  replayAssetLedger,
  summarizePortfolio,
  validateAssetUpdateImmutability,
  validateCandidateEventSequence,
  validateTargetPercentages,
  valuateAssetPosition,
  type AlertConditionKind,
  type AlertEventLog,
  type AlertRule,
  type AlertRuleScope,
  type AllocationCategory,
  type Asset,
  type AssetKind,
  type AssetReplayResult,
  type AssetValuation,
  type BaseUnit,
  type CashLink,
  type DatePrecision,
  type DcaDropReference,
  type DcaPlan,
  type DcaPlanEvaluation,
  type DcaStepLink,
  type DcaStepRule,
  type DcaTriggerCombinator,
  type LedgerEvent,
  type Portfolio,
  type PortfolioAllocationReport,
  type PortfolioSummary,
  type PriceSnapshot,
  type PricingSpec,
  type QuoteSide,
  type TargetAllocation,
  type TradeSnapshotPayload,
  type TradeUnit,
} from '../investment';

export function newInvestmentUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isCloudSyncActiveForInvestment(): boolean {
  const cfg = getCfg();
  if (!cfg) return false;
  return !isInvestmentSyncReady();
}

export function getInvestmentSyncMode(): 'LOCAL_ONLY' | 'SYNC_V3_ACTIVE' | 'SYNC_V2_UPGRADE_NEEDED' {
  const cfg = getCfg();
  if (!cfg) return 'LOCAL_ONLY';
  return isInvestmentSyncReady() ? 'SYNC_V3_ACTIVE' : 'SYNC_V2_UPGRADE_NEEDED';
}

export type CashLinkChoice =
  | { mode: 'NONE' }
  | { mode: 'CREATE_TXN'; accountId: number }
  | { mode: 'LINK_EXISTING'; accountId: number; bankTxnId: number; allowDateMismatch?: boolean };

export interface AssetPositionView {
  asset: Asset;
  replay: AssetReplayResult;
  valuation: AssetValuation;
  events: LedgerEvent[];
  cashLinksByRecordId: Map<string, CashLink>;
}

export interface PortfolioOverview {
  portfolio: Portfolio;
  positions: AssetPositionView[];
  summary: PortfolioSummary;
  snapshots: PriceSnapshot[];
  dcaEvaluations: DcaPlanEvaluation[];
  alertRules: AlertRule[];
  alertEvents: AlertEventLog[];
  allocationReport: PortfolioAllocationReport;
}

export async function ensureDefaultPortfolio(): Promise<Portfolio> {
  const existing = await db.portfolios.toArray();
  if (existing.length > 0) return existing[0];
  const now = Date.now();
  const portfolio: Portfolio = {
    id: newInvestmentUuid(),
    name: 'سبد اصلی',
    baseCurrency: 'IRR',
    settings: { stalePriceHours: 24 },
    createdAt: now,
    updatedAt: now,
  };
  await db.portfolios.add(portfolio);
  return portfolio;
}

export async function createInvestmentAsset(input: {
  portfolioId: string;
  kind: AssetKind;
  name: string;
  instrumentKey: string;
  baseUnit: BaseUnit;
  pricingSpec: PricingSpec;
}): Promise<Asset> {
  const name = input.name.trim();
  const instrumentKey = input.instrumentKey.trim();
  if (!name) throw new Error('نام دارایی الزامی است');
  if (!instrumentKey) throw new Error('شناسه ابزار الزامی است');

  const now = Date.now();
  const asset: Asset = {
    id: newInvestmentUuid(),
    portfolioId: input.portfolioId,
    kind: input.kind,
    name,
    instrumentKey,
    baseUnit: input.baseUnit,
    pricingSpec: input.pricingSpec,
    createdAt: now,
    updatedAt: now,
  };
  await db.assets.add(asset);
  return asset;
}

export async function updateInvestmentAsset(
  assetId: string,
  patch: {
    name: string;
    kind: AssetKind;
    instrumentKey: string;
    baseUnit: BaseUnit;
    pricingSpec: PricingSpec;
    archivedAt?: number;
  }
): Promise<Asset> {
  return db.transaction('rw', [db.assets, db.ledgerEvents], async () => {
    const existing = await db.assets.get(assetId);
    if (!existing) throw new Error('دارایی یافت نشد');
    const eventCount = await db.ledgerEvents.where('assetId').equals(assetId).count();
    validateAssetUpdateImmutability(existing, patch, eventCount > 0);
    const updated: Asset = {
      ...existing,
      name: patch.name.trim() || existing.name,
      kind: patch.kind,
      instrumentKey: patch.instrumentKey,
      baseUnit: patch.baseUnit,
      pricingSpec: patch.pricingSpec,
      archivedAt: patch.archivedAt,
      updatedAt: Date.now(),
    };
    await db.assets.put(updated);
    return updated;
  });
}

function assertCashLinkAllowed(choice: CashLinkChoice, kind: 'OPENING' | 'BUY' | 'SELL') {
  if (choice.mode === 'NONE') return;
  if (kind === 'OPENING') {
    throw new Error('موجودی افتتاحیه به گردش بانکی متصل نمی‌شود');
  }
  if (isCloudSyncActiveForInvestment()) {
    throw new Error(
      'هنگام فعال بودن همگام‌سازی ابری، در فاز ۱ ثبت معامله فقط بدون پیوند حساب مجاز است.'
    );
  }
}

async function validateExistingTxnMatch(params: {
  accountId: number;
  bankTxnId: number;
  kind: 'BUY' | 'SELL';
  settlementRial: number;
  effectiveAtMs: number;
  allowDateMismatch?: boolean;
  excludeRecordId?: string;
}): Promise<Txn> {
  const txn = await db.txns.get(params.bankTxnId);
  if (!txn) throw new Error('تراکنش بانکی انتخاب‌شده یافت نشد');
  if (txn.accountId !== params.accountId) {
    throw new Error('حساب تراکنش بانکی با حساب انتخاب‌شده مطابقت ندارد');
  }
  const expectedTypes =
    params.kind === 'BUY' ? ['EXPENSE', 'INVESTMENT_OUT'] : ['INCOME', 'INVESTMENT_IN'];
  if (!expectedTypes.includes(txn.type)) {
    throw new Error(
      params.kind === 'BUY'
        ? 'برای خرید، تراکنش بانکی باید از نوع برداشت/هزینه باشد'
        : 'برای فروش، تراکنش بانکی باید از نوع واریز/درآمد باشد'
    );
  }
  if (txn.amount !== params.settlementRial) {
    throw new Error('مبلغ تراکنش بانکی با مبلغ تسویهٔ فاکتور برابر نیست');
  }

  const existingLinks = await db.cashLinks.where('bankTxnId').equals(params.bankTxnId).toArray();
  const activeOther = existingLinks.find(
    l => l.status === 'ACTIVE' && l.recordId !== params.excludeRecordId
  );
  if (activeOther) {
    throw new Error('این گردش بانکی قبلاً به یک ثبت سرمایه‌گذاری فعال دیگر متصل شده است');
  }

  const maxDateDiffMs = 7 * 24 * 3600_000;
  if (!params.allowDateMismatch && Math.abs(txn.occurredAt - params.effectiveAtMs) > maxDateDiffMs) {
    throw new Error('تاریخ تراکنش بانکی با تاریخ معامله بیش از ۷ روز اختلاف دارد');
  }

  return txn;
}

function formatCashTxnTitle(kind: 'BUY' | 'SELL', assetName: string): string {
  return kind === 'BUY' ? `خرید سرمایه‌ای · ${assetName}` : `فروش سرمایه‌ای · ${assetName}`;
}

export async function recordInvestmentEntry(input: {
  assetId: string;
  kind: 'OPENING' | 'BUY' | 'SELL';
  effectiveAtMs: number;
  datePrecision?: DatePrecision;
  payload: TradeSnapshotPayload;
  cashLink?: CashLinkChoice;
  operationId?: string;
}): Promise<{ recordId: string; eventId: string; cashLink?: CashLink }> {
  const operationId = input.operationId ?? newInvestmentUuid();
  const cashChoice: CashLinkChoice = input.cashLink ?? { mode: 'NONE' };
  assertCashLinkAllowed(cashChoice, input.kind);

  return db.transaction(
    'rw',
    [db.assets, db.ledgerEvents, db.cashLinks, db.txns, db.accounts, db.outbox],
    async () => {
      // Idempotency by operationId
      const existingByOp = await db.ledgerEvents
        .where('operationId')
        .equals(operationId)
        .first();
      if (existingByOp) {
        const existingLink = await db.cashLinks
          .where('recordId')
          .equals(existingByOp.recordId)
          .first();
        return {
          recordId: existingByOp.recordId,
          eventId: existingByOp.id,
          cashLink: existingLink,
        };
      }

      const asset = await db.assets.get(input.assetId);
      if (!asset) throw new Error('دارایی یافت نشد');

      const existingEvents = await db.ledgerEvents
        .where('assetId')
        .equals(asset.id)
        .toArray();

      const now = Date.now();
      const recordId = newInvestmentUuid();
      const eventId = newInvestmentUuid();
      const candidate: LedgerEvent = {
        id: eventId,
        portfolioId: asset.portfolioId,
        assetId: asset.id,
        recordId,
        operationId,
        kind: input.kind,
        recordedAtMs: now,
        effectiveAtMs: input.effectiveAtMs,
        datePrecision: input.datePrecision ?? 'EXACT',
        schemaVersion: 1,
        payload: input.payload,
      };

      const check = validateCandidateEventSequence(asset, existingEvents, candidate);
      if (!check.ok) {
        const err = new Error(check.reason) as Error & { dependentRecordId?: string };
        err.dependentRecordId = check.dependentRecordId;
        throw err;
      }

      const { settlementRial, costKnown } = computeTradeSettlementRial(input.payload, input.kind);
      const settlementNumber = R.toSafeRialNumber(settlementRial);

      let createdLink: CashLink | undefined;
      if (cashChoice.mode === 'CREATE_TXN') {
        if (!costKnown || settlementNumber <= 0) {
          throw new Error('برای ایجاد گردش حساب، مبلغ تسویه باید بزرگ‌تر از صفر باشد');
        }
        const acc = await db.accounts.get(cashChoice.accountId);
        if (!acc || acc.archived) throw new Error('حساب انتخاب‌شده در دسترس نیست');
        const txnId = await db.txns.add({
          type: input.kind === 'BUY' ? 'INVESTMENT_OUT' : 'INVESTMENT_IN',
          amount: settlementNumber,
          accountId: cashChoice.accountId,
          title: formatCashTxnTitle(input.kind as 'BUY' | 'SELL', asset.name),
          note: input.payload.note,
          occurredAt: input.effectiveAtMs,
          source: 'MANUAL',
          createdAt: now,
        });
        createdLink = {
          id: newInvestmentUuid(),
          recordId,
          effectiveEventId: eventId,
          accountId: cashChoice.accountId,
          bankTxnId: txnId,
          origin: 'CREATED_BY_PORTFOLIO',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        };
        await db.cashLinks.add(createdLink);
      } else if (cashChoice.mode === 'LINK_EXISTING') {
        if (!costKnown || settlementNumber <= 0) {
          throw new Error('مبلغ تسویه برای اتصال به گردش موجود معتبر نیست');
        }
        await validateExistingTxnMatch({
          accountId: cashChoice.accountId,
          bankTxnId: cashChoice.bankTxnId,
          kind: input.kind as 'BUY' | 'SELL',
          settlementRial: settlementNumber,
          effectiveAtMs: input.effectiveAtMs,
          allowDateMismatch: cashChoice.allowDateMismatch,
        });
        createdLink = {
          id: newInvestmentUuid(),
          recordId,
          effectiveEventId: eventId,
          accountId: cashChoice.accountId,
          bankTxnId: cashChoice.bankTxnId,
          origin: 'EXISTING_TXN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        };
        await db.cashLinks.add(createdLink);
      }

      await db.ledgerEvents.add(candidate);
      return { recordId, eventId, cashLink: createdLink };
    }
  );
}

export async function amendInvestmentEntry(input: {
  assetId: string;
  recordId: string;
  targetKind: 'OPENING' | 'BUY' | 'SELL';
  effectiveAtMs: number;
  datePrecision?: DatePrecision;
  snapshot: TradeSnapshotPayload;
  cashLink?: CashLinkChoice;
  operationId?: string;
}): Promise<{ eventId: string; cashLink?: CashLink }> {
  const operationId = input.operationId ?? newInvestmentUuid();
  if (input.cashLink) assertCashLinkAllowed(input.cashLink, input.targetKind);

  return db.transaction(
    'rw',
    [db.assets, db.ledgerEvents, db.cashLinks, db.txns, db.accounts, db.outbox],
    async () => {
      const existingByOp = await db.ledgerEvents
        .where('operationId')
        .equals(operationId)
        .first();
      if (existingByOp) {
        const link = await db.cashLinks.where('recordId').equals(input.recordId).first();
        return { eventId: existingByOp.id, cashLink: link };
      }

      const asset = await db.assets.get(input.assetId);
      if (!asset) throw new Error('دارایی یافت نشد');

      const assetEvents = await db.ledgerEvents.where('assetId').equals(asset.id).toArray();
      const beforeReplay = replayAssetLedger(asset, assetEvents);
      const currentRecord = beforeReplay.effectiveRecords.find(r => r.recordId === input.recordId);
      if (!currentRecord) throw new Error('ثبت مؤثر برای اصلاح یافت نشد');

      const now = Date.now();
      const eventId = newInvestmentUuid();
      const candidate: LedgerEvent = {
        id: eventId,
        portfolioId: asset.portfolioId,
        assetId: asset.id,
        recordId: input.recordId,
        parentEventId: currentRecord.effectiveEventId,
        operationId,
        kind: 'AMEND',
        recordedAtMs: now,
        effectiveAtMs: input.effectiveAtMs,
        datePrecision: input.datePrecision ?? currentRecord.datePrecision,
        schemaVersion: 1,
        payload: {
          targetKind: input.targetKind,
          snapshot: input.snapshot,
        },
      };

      const check = validateCandidateEventSequence(asset, assetEvents, candidate);
      if (!check.ok) {
        const err = new Error(check.reason) as Error & { dependentRecordId?: string };
        err.dependentRecordId = check.dependentRecordId;
        throw err;
      }

      const { settlementRial, costKnown } = computeTradeSettlementRial(
        input.snapshot,
        input.targetKind
      );
      const settlementNumber = R.toSafeRialNumber(settlementRial);

      const activeLink = (await db.cashLinks.where('recordId').equals(input.recordId).toArray())
        .find(l => l.status === 'ACTIVE');

      let finalLink = activeLink;

      if (input.cashLink) {
        // Explicit cashLink mode passed
        if (input.cashLink.mode === 'NONE') {
          if (activeLink) {
            if (activeLink.origin === 'CREATED_BY_PORTFOLIO' && activeLink.bankTxnId != null) {
              await db.txns.delete(activeLink.bankTxnId);
            }
            await db.cashLinks.update(activeLink.id, {
              status: 'VOIDED',
              updatedAt: now,
            });
            finalLink = undefined;
          }
        } else if (input.cashLink.mode === 'CREATE_TXN') {
          if (!costKnown || settlementNumber <= 0) {
            throw new Error('مبلغ تسویه برای گردش حساب معتبر نیست');
          }
          const acc = await db.accounts.get(input.cashLink.accountId);
          if (!acc || acc.archived) throw new Error('حساب انتخاب‌شده در دسترس نیست');

          if (activeLink && activeLink.origin === 'CREATED_BY_PORTFOLIO' && activeLink.bankTxnId != null) {
            await db.txns.update(activeLink.bankTxnId, {
              type: input.targetKind === 'BUY' ? 'INVESTMENT_OUT' : 'INVESTMENT_IN',
              amount: settlementNumber,
              accountId: input.cashLink.accountId,
              title: formatCashTxnTitle(input.targetKind as 'BUY' | 'SELL', asset.name),
              note: input.snapshot.note,
              occurredAt: input.effectiveAtMs,
            });
            await db.cashLinks.update(activeLink.id, {
              effectiveEventId: eventId,
              accountId: input.cashLink.accountId,
              updatedAt: now,
            });
            finalLink = await db.cashLinks.get(activeLink.id);
          } else {
            if (activeLink) {
              await db.cashLinks.update(activeLink.id, { status: 'VOIDED', updatedAt: now });
            }
            const txnId = await db.txns.add({
              type: input.targetKind === 'BUY' ? 'INVESTMENT_OUT' : 'INVESTMENT_IN',
              amount: settlementNumber,
              accountId: input.cashLink.accountId,
              title: formatCashTxnTitle(input.targetKind as 'BUY' | 'SELL', asset.name),
              note: input.snapshot.note,
              occurredAt: input.effectiveAtMs,
              source: 'MANUAL',
              createdAt: now,
            });
            finalLink = {
              id: newInvestmentUuid(),
              recordId: input.recordId,
              effectiveEventId: eventId,
              accountId: input.cashLink.accountId,
              bankTxnId: txnId,
              origin: 'CREATED_BY_PORTFOLIO',
              status: 'ACTIVE',
              createdAt: now,
              updatedAt: now,
            };
            await db.cashLinks.add(finalLink);
          }
        } else if (input.cashLink.mode === 'LINK_EXISTING') {
          await validateExistingTxnMatch({
            accountId: input.cashLink.accountId,
            bankTxnId: input.cashLink.bankTxnId,
            kind: input.targetKind as 'BUY' | 'SELL',
            settlementRial: settlementNumber,
            effectiveAtMs: input.effectiveAtMs,
            allowDateMismatch: input.cashLink.allowDateMismatch,
            excludeRecordId: input.recordId,
          });
          if (activeLink) {
            if (activeLink.origin === 'CREATED_BY_PORTFOLIO' && activeLink.bankTxnId != null) {
              await db.txns.delete(activeLink.bankTxnId);
            }
            await db.cashLinks.update(activeLink.id, { status: 'VOIDED', updatedAt: now });
          }
          finalLink = {
            id: newInvestmentUuid(),
            recordId: input.recordId,
            effectiveEventId: eventId,
            accountId: input.cashLink.accountId,
            bankTxnId: input.cashLink.bankTxnId,
            origin: 'EXISTING_TXN',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          };
          await db.cashLinks.add(finalLink);
        }
      } else if (activeLink) {
        // No explicit cashLink override passed: keep portfolio-created txn synced,
        // or mark EXISTING_TXN as NEEDS_RELINK if settlement amount changed.
        if (activeLink.origin === 'CREATED_BY_PORTFOLIO' && activeLink.bankTxnId != null) {
          await db.txns.update(activeLink.bankTxnId, {
            type: input.targetKind === 'BUY' ? 'INVESTMENT_OUT' : 'INVESTMENT_IN',
            amount: settlementNumber,
            title: formatCashTxnTitle(input.targetKind as 'BUY' | 'SELL', asset.name),
            note: input.snapshot.note,
            occurredAt: input.effectiveAtMs,
          });
          await db.cashLinks.update(activeLink.id, {
            effectiveEventId: eventId,
            updatedAt: now,
          });
        } else if (activeLink.origin === 'EXISTING_TXN' && activeLink.bankTxnId != null) {
          const linkedTxn = await db.txns.get(activeLink.bankTxnId);
          if (!linkedTxn || linkedTxn.amount !== settlementNumber) {
            await db.cashLinks.update(activeLink.id, {
              effectiveEventId: eventId,
              status: 'NEEDS_RELINK',
              updatedAt: now,
            });
          } else {
            await db.cashLinks.update(activeLink.id, {
              effectiveEventId: eventId,
              updatedAt: now,
            });
          }
        }
        finalLink = await db.cashLinks.get(activeLink.id);
      }

      await db.ledgerEvents.add(candidate);
      return { eventId, cashLink: finalLink };
    }
  );
}

export async function voidInvestmentEntry(input: {
  assetId: string;
  recordId: string;
  reason?: string;
  operationId?: string;
}): Promise<{ eventId: string }> {
  const operationId = input.operationId ?? newInvestmentUuid();

  return db.transaction(
    'rw',
    [db.assets, db.ledgerEvents, db.cashLinks, db.txns, db.syncConflicts, db.outbox],
    async () => {
      const existingByOp = await db.ledgerEvents
        .where('operationId')
        .equals(operationId)
        .first();
      if (existingByOp) return { eventId: existingByOp.id };

      const asset = await db.assets.get(input.assetId);
      if (!asset) throw new Error('دارایی یافت نشد');

      const assetEvents = await db.ledgerEvents.where('assetId').equals(asset.id).toArray();
      const beforeReplay = replayAssetLedger(asset, assetEvents);
      const currentRecord = beforeReplay.effectiveRecords.find(r => r.recordId === input.recordId);
      if (!currentRecord) throw new Error('ثبت مؤثر برای ابطال یافت نشد');

      const now = Date.now();
      const eventId = newInvestmentUuid();
      const candidate: LedgerEvent = {
        id: eventId,
        portfolioId: asset.portfolioId,
        assetId: asset.id,
        recordId: input.recordId,
        parentEventId: currentRecord.effectiveEventId,
        operationId,
        kind: 'VOID',
        recordedAtMs: now,
        effectiveAtMs: currentRecord.effectiveAtMs,
        datePrecision: currentRecord.datePrecision,
        schemaVersion: 1,
        payload: { reason: input.reason },
      };

      const check = validateCandidateEventSequence(asset, assetEvents, candidate);
      if (!check.ok) {
        const err = new Error(check.reason) as Error & { dependentRecordId?: string };
        err.dependentRecordId = check.dependentRecordId;
        throw err;
      }

      const links = await db.cashLinks.where('recordId').equals(input.recordId).toArray();
      for (const link of links) {
        if (link.status === 'VOIDED') continue;
        if (link.origin === 'CREATED_BY_PORTFOLIO' && link.bankTxnId != null) {
          await db.txns.delete(link.bankTxnId);
        }
        // For EXISTING_TXN, we leave the bank txn untouched so it returns to its original classification!
        await db.cashLinks.update(link.id, {
          status: 'VOIDED',
          updatedAt: now,
        });
      }

      await db.ledgerEvents.add(candidate);

      // If voiding cleared the last structural conflict, clean up NEEDS_REVIEW markers on this asset
      if (check.replay.status === 'VALID') {
        await db.syncConflicts.where('assetId').equals(asset.id).delete();
        for (const rec of check.replay.effectiveRecords) {
          const recLinks = await db.cashLinks.where('recordId').equals(rec.recordId).toArray();
          for (const l of recLinks) {
            if (l.status === 'NEEDS_REVIEW') {
              await db.cashLinks.update(l.id, { status: 'NEEDS_RELINK', updatedAt: now });
            }
          }
        }
      }

      return { eventId };
    }
  );
}

export async function unlinkCashLink(recordId: string): Promise<void> {
  await db.transaction('rw', [db.cashLinks, db.txns, db.outbox], async () => {
    const now = Date.now();
    const links = await db.cashLinks.where('recordId').equals(recordId).toArray();
    for (const link of links) {
      if (link.status === 'VOIDED') continue;
      if (link.origin === 'CREATED_BY_PORTFOLIO' && link.bankTxnId != null) {
        await db.txns.delete(link.bankTxnId);
      }
      await db.cashLinks.update(link.id, {
        status: 'VOIDED',
        updatedAt: now,
      });
    }
  });
}

export async function linkCashToRecord(
  assetId: string,
  recordId: string,
  choice: Exclude<CashLinkChoice, { mode: 'NONE' }>
): Promise<CashLink> {
  if (isCloudSyncActiveForInvestment()) {
    throw new Error(
      'هنگام فعال بودن همگام‌سازی ابری، در فاز ۱ ثبت معامله فقط بدون پیوند حساب مجاز است.'
    );
  }
  return db.transaction(
    'rw',
    [db.assets, db.ledgerEvents, db.cashLinks, db.txns, db.accounts, db.outbox],
    async () => {
      const asset = await db.assets.get(assetId);
      if (!asset) throw new Error('دارایی یافت نشد');
      const events = await db.ledgerEvents.where('assetId').equals(assetId).toArray();
      const replay = replayAssetLedger(asset, events);
      if (replay.status === 'NEEDS_REVIEW') {
        throw new Error('موقعیت نیازمند بررسی است؛ تا رفع تعارض امکان پیوند حساب جدید نیست.');
      }
      const rec = replay.effectiveRecords.find(r => r.recordId === recordId);
      if (!rec || rec.effectiveKind === 'OPENING') {
        throw new Error('فقط ثبت‌های خرید و فروش قابلیت پیوند به حساب دارند');
      }
      const { settlementRial, costKnown } = computeTradeSettlementRial(
        rec.snapshot,
        rec.effectiveKind
      );
      const settlementNumber = R.toSafeRialNumber(settlementRial);
      if (!costKnown || settlementNumber <= 0) {
        throw new Error('مبلغ تسویه برای پیوند حساب معتبر نیست');
      }

      const now = Date.now();
      const oldLinks = await db.cashLinks.where('recordId').equals(recordId).toArray();
      for (const old of oldLinks) {
        if (old.status !== 'VOIDED') {
          if (old.origin === 'CREATED_BY_PORTFOLIO' && old.bankTxnId != null) {
            await db.txns.delete(old.bankTxnId);
          }
          await db.cashLinks.update(old.id, { status: 'VOIDED', updatedAt: now });
        }
      }

      let link: CashLink;
      if (choice.mode === 'CREATE_TXN') {
        const acc = await db.accounts.get(choice.accountId);
        if (!acc || acc.archived) throw new Error('حساب انتخاب‌شده در دسترس نیست');
        const txnId = await db.txns.add({
          type: rec.effectiveKind === 'BUY' ? 'INVESTMENT_OUT' : 'INVESTMENT_IN',
          amount: settlementNumber,
          accountId: choice.accountId,
          title: formatCashTxnTitle(rec.effectiveKind, asset.name),
          note: rec.snapshot.note,
          occurredAt: rec.effectiveAtMs,
          source: 'MANUAL',
          createdAt: now,
        });
        link = {
          id: newInvestmentUuid(),
          recordId,
          effectiveEventId: rec.effectiveEventId,
          accountId: choice.accountId,
          bankTxnId: txnId,
          origin: 'CREATED_BY_PORTFOLIO',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        };
      } else {
        await validateExistingTxnMatch({
          accountId: choice.accountId,
          bankTxnId: choice.bankTxnId,
          kind: rec.effectiveKind,
          settlementRial: settlementNumber,
          effectiveAtMs: rec.effectiveAtMs,
          allowDateMismatch: choice.allowDateMismatch,
          excludeRecordId: recordId,
        });
        link = {
          id: newInvestmentUuid(),
          recordId,
          effectiveEventId: rec.effectiveEventId,
          accountId: choice.accountId,
          bankTxnId: choice.bankTxnId,
          origin: 'EXISTING_TXN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        };
      }
      await db.cashLinks.add(link);
      return link;
    }
  );
}

export async function recordManualPriceSnapshot(input: {
  instrumentKey: string;
  quoteSide: QuoteSide;
  unit: TradeUnit;
  fineness?: number;
  amountRial: string;
  observedAtMs: number;
  market?: string;
}): Promise<PriceSnapshot> {
  const parsed = R.fromDecimal(input.amountRial);
  if (!R.isPos(parsed)) throw new Error('قیمت باید بزرگ‌تر از صفر باشد');

  const now = Date.now();
  const incoming: PriceSnapshot = {
    id: newInvestmentUuid(),
    instrumentKey: input.instrumentKey,
    sourceId: 'manual',
    market: input.market?.trim() || 'manual',
    quoteSide: input.quoteSide,
    currency: 'IRR',
    unit: input.unit,
    fineness: input.fineness,
    amount: R.toDecimalString(parsed, 0),
    observedAtMs: input.observedAtMs,
    fetchedAtMs: now,
    method: 'MANUAL',
  };

  return db.transaction('rw', db.priceSnapshots, async () => {
    const existing = await db.priceSnapshots
      .where('instrumentKey')
      .equals(input.instrumentKey)
      .toArray();
    const merged = mergePriceSnapshots(existing, incoming);
    await db.priceSnapshots.bulkPut(merged);
    return merged.find(
      s =>
        s.observedAtMs === incoming.observedAtMs &&
        s.amount === incoming.amount &&
        s.quoteSide === incoming.quoteSide
    ) ?? incoming;
  });
}

/**
 * Replays and merges incoming ledger events (e.g. multi-device sync bundle) while
 * marking conflicted positions and cash links NEEDS_REVIEW without applying conflicting txns.
 */
export async function ingestInvestmentEventsBundle(
  assetId: string,
  incomingEvents: LedgerEvent[]
): Promise<AssetReplayResult> {
  return db.transaction('rw', [db.assets, db.ledgerEvents, db.cashLinks], async () => {
    const asset = await db.assets.get(assetId);
    if (!asset) throw new Error('دارایی یافت نشد');

    const existing = await db.ledgerEvents.where('assetId').equals(assetId).toArray();
    const byId = new Map(existing.map(e => [e.id, e]));
    const conflictTaggedEvents: LedgerEvent[] = [...existing];

    for (const ev of incomingEvents) {
      if (!byId.has(ev.id)) {
        await db.ledgerEvents.add(ev);
        byId.set(ev.id, ev);
        conflictTaggedEvents.push(ev);
      } else {
        // Keep both in memory for replay conflict detection if payload differs
        const cur = byId.get(ev.id)!;
        if (JSON.stringify(cur) !== JSON.stringify(ev)) {
          conflictTaggedEvents.push(ev);
        }
      }
    }

    const replay = replayAssetLedger(asset, conflictTaggedEvents);
    if (replay.status === 'NEEDS_REVIEW') {
      const now = Date.now();
      const recordIds = new Set(conflictTaggedEvents.map(e => e.recordId));
      for (const recId of recordIds) {
        const links = await db.cashLinks.where('recordId').equals(recId).toArray();
        for (const l of links) {
          if (l.status === 'ACTIVE') {
            await db.cashLinks.update(l.id, { status: 'NEEDS_REVIEW', updatedAt: now });
          }
        }
      }
    }
    return replay;
  });
}

export async function clearResolvedSyncConflicts(assetId: string): Promise<void> {
  await db.transaction('rw', [db.assets, db.ledgerEvents, db.cashLinks, db.syncConflicts, db.outbox], async () => {
    const asset = await db.assets.get(assetId);
    if (!asset) throw new Error('دارایی یافت نشد');
    const events = await db.ledgerEvents.where('assetId').equals(assetId).toArray();
    const replay = replayAssetLedger(asset, events);
    if (replay.status === 'NEEDS_REVIEW') {
      throw new Error('تعارض ساختاری این دارایی هنوز برطرف نشده است؛ ابتدا ثبت متعارض را اصلاح یا ابطال کنید.');
    }
    await db.syncConflicts.where('assetId').equals(assetId).delete();
    const now = Date.now();
    for (const rec of replay.effectiveRecords) {
      const links = await db.cashLinks.where('recordId').equals(rec.recordId).toArray();
      for (const l of links) {
        if (l.status === 'NEEDS_REVIEW') {
          await db.cashLinks.update(l.id, { status: 'NEEDS_RELINK', updatedAt: now });
        }
      }
    }
  });
}

export async function loadPortfolioOverview(
  options?: { nowMs?: number }
): Promise<PortfolioOverview> {
  const existingPortfolios = await db.portfolios.toArray();
  const portfolio: Portfolio = existingPortfolios[0] ?? {
    id: 'default-pending',
    name: 'سبد اصلی',
    baseCurrency: 'IRR',
    settings: { stalePriceHours: 24 },
    createdAt: 0,
    updatedAt: 0,
  };
  const [assets, allEvents, allLinks, snapshots, syncConflicts, dcaPlans, dcaStepLinks, alertRules, alertEvents, targetAllocations] =
    existingPortfolios.length === 0
      ? [[], [], [], [], [], [], [], [], [], []]
      : await Promise.all([
          db.assets.where('portfolioId').equals(portfolio.id).toArray(),
          db.ledgerEvents.where('portfolioId').equals(portfolio.id).toArray(),
          db.cashLinks.toArray(),
          db.priceSnapshots.toArray(),
          db.syncConflicts.toArray(),
          db.dcaPlans.where('portfolioId').equals(portfolio.id).toArray(),
          db.dcaStepLinks.toArray(),
          db.alertRules.where('portfolioId').equals(portfolio.id).toArray(),
          db.alertEvents.orderBy('triggeredAtMs').reverse().limit(30).toArray(),
          db.targetAllocations.where('portfolioId').equals(portfolio.id).toArray(),
        ]);

  const eventsByAsset = new Map<string, LedgerEvent[]>();
  for (const ev of allEvents) {
    const list = eventsByAsset.get(ev.assetId) ?? [];
    list.push(ev);
    eventsByAsset.set(ev.assetId, list);
  }

  const syncConflictsByAsset = new Map<string, typeof syncConflicts>();
  for (const sc of syncConflicts) {
    const list = syncConflictsByAsset.get(sc.assetId) ?? [];
    list.push(sc);
    syncConflictsByAsset.set(sc.assetId, list);
  }

  const linkByRecord = new Map<string, CashLink>();
  for (const l of allLinks) {
    const existing = linkByRecord.get(l.recordId);
    if (!existing || l.status === 'ACTIVE' || l.updatedAt > existing.updatedAt) {
      linkByRecord.set(l.recordId, l);
    }
  }

  const nowMs = options?.nowMs ?? Date.now();
  const staleAfterHours = portfolio.settings?.stalePriceHours ?? 24;

  const positions: AssetPositionView[] = assets
    .filter(a => !a.archivedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(asset => {
      const events = eventsByAsset.get(asset.id) ?? [];
      const baseReplay = replayAssetLedger(asset, events);
      const extraConflicts = (syncConflictsByAsset.get(asset.id) ?? []).map(c => c.conflict);
      const replay: AssetReplayResult =
        extraConflicts.length > 0
          ? {
              ...baseReplay,
              status: 'NEEDS_REVIEW',
              conflicts: [...baseReplay.conflicts, ...extraConflicts],
            }
          : baseReplay;
      const valuation = valuateAssetPosition(replay, asset, snapshots, {
        nowMs,
        staleAfterHours,
      });
      const cashLinksByRecordId = new Map<string, CashLink>();
      for (const rec of [...replay.effectiveRecords, ...replay.voidedRecords]) {
        const link = linkByRecord.get(rec.recordId);
        if (link) cashLinksByRecordId.set(rec.recordId, link);
      }
      return { asset, replay, valuation, events, cashLinksByRecordId };
    });

  const summary = summarizePortfolio(
    positions.map(p => ({ replay: p.replay, valuation: p.valuation }))
  );

  const posByAsset = new Map(positions.map(p => [p.asset.id, p]));
  const dcaEvaluations: DcaPlanEvaluation[] = dcaPlans
    .filter(p => p.status !== 'ARCHIVED')
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap(plan => {
      const pos = posByAsset.get(plan.assetId);
      if (!pos) return [];
      const linksForPlan = dcaStepLinks.filter(l => l.planId === plan.id);
      return [evaluateDcaPlan(plan, pos.asset, pos.replay, snapshots, linksForPlan, nowMs)];
    });

  const activeAllocation =
    targetAllocations.length > 0
      ? [...targetAllocations].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : null;

  let cashReserveRial = R.zero;
  if (activeAllocation) {
    if (activeAllocation.cashReserveAccountIds.length > 0) {
      const accountBalances = await getAccountsWithBalances();
      const linkedSet = new Set(activeAllocation.cashReserveAccountIds);
      for (const acc of accountBalances) {
        if (acc.id != null && linkedSet.has(acc.id) && acc.balance > 0) {
          cashReserveRial = R.add(cashReserveRial, R.fromInt(Math.round(acc.balance)));
        }
      }
    }
    if (activeAllocation.manualCashReserveRial && /^\d+$/.test(activeAllocation.manualCashReserveRial)) {
      cashReserveRial = R.add(cashReserveRial, R.fromDecimal(activeAllocation.manualCashReserveRial));
    }
  }

  const allocationReport = evaluatePortfolioAllocation({
    allocation: activeAllocation,
    positions: positions.map(p => ({ asset: p.asset, replay: p.replay, valuation: p.valuation })),
    summary,
    cashReserveRial,
  });

  return {
    portfolio,
    positions,
    summary,
    snapshots,
    dcaEvaluations,
    alertRules: alertRules.sort((a, b) => b.createdAt - a.createdAt),
    alertEvents,
    allocationReport,
  };
}

// --- Phase 4-A: DCA Plan & Step Execution Helpers ---

export async function createDcaPlan(input: {
  portfolioId: string;
  assetId: string;
  name: string;
  totalBudgetRial: string;
  stepCount: number;
  minIntervalDays?: number;
  dropTriggerPct?: string;
  dropReference?: DcaDropReference;
  anchorPriceRial?: string;
  combinator: DcaTriggerCombinator;
  stalePriceHours?: number;
}): Promise<DcaPlan> {
  const name = input.name.trim();
  if (!name) throw new Error('نام برنامه خرید پله‌ای الزامی است');
  const totalBudget = R.fromInt(input.totalBudgetRial);
  if (!R.isPos(totalBudget)) throw new Error('کل بودجه باید بزرگ‌تر از صفر باشد');
  if (!Number.isInteger(input.stepCount) || input.stepCount < 1 || input.stepCount > 24) {
    throw new Error('تعداد مراحل باید بین ۱ تا ۲۴ باشد');
  }

  const totalBig = totalBudget.num;
  const countBig = BigInt(input.stepCount);
  const baseStep = totalBig / countBig;
  const remainder = totalBig % countBig;

  const steps: DcaStepRule[] = [];
  for (let i = 1; i <= input.stepCount; i++) {
    const stepAmt = i === input.stepCount ? baseStep + remainder : baseStep;
    steps.push({
      stepIndex: i,
      budgetRial: stepAmt.toString(),
      minIntervalDays: input.minIntervalDays && input.minIntervalDays > 0 ? input.minIntervalDays : undefined,
      dropTriggerPct:
        input.dropTriggerPct && Number(input.dropTriggerPct) > 0 ? input.dropTriggerPct : undefined,
      dropReference: input.dropReference,
      anchorPriceRial: input.anchorPriceRial,
      combinator: input.combinator,
    });
  }

  const now = Date.now();
  const plan: DcaPlan = {
    id: newInvestmentUuid(),
    portfolioId: input.portfolioId,
    assetId: input.assetId,
    name,
    totalBudgetRial: totalBig.toString(),
    status: 'ACTIVE',
    stalePriceHours: input.stalePriceHours ?? 24,
    steps,
    createdAt: now,
    updatedAt: now,
  };
  await db.dcaPlans.add(plan);
  return plan;
}

export async function updateDcaPlanStatus(
  planId: string,
  status: DcaPlan['status']
): Promise<void> {
  await db.dcaPlans.update(planId, { status, updatedAt: Date.now() });
}

export async function executeDcaStepPurchase(input: {
  planId: string;
  stepIndex: number;
  effectiveAtMs: number;
  payload: TradeSnapshotPayload;
  cashLink?: CashLinkChoice;
  operationId?: string;
}): Promise<{ recordId: string; eventId: string }> {
  const cashChoice: CashLinkChoice = input.cashLink ?? { mode: 'NONE' };
  if (cashChoice.mode !== 'NONE' && isCloudSyncActiveForInvestment()) {
    throw new Error(
      'هنگام فعال بودن همگام‌سازی قدیمی (نسخه ۲)، ثبت معامله فقط بدون پیوند حساب مجاز است.'
    );
  }

  const opId = input.operationId ?? newInvestmentUuid();

  return db.transaction(
    'rw',
    [db.assets, db.ledgerEvents, db.cashLinks, db.txns, db.accounts, db.dcaPlans, db.dcaStepLinks, db.priceSnapshots, db.outbox],
    async () => {
      // Idempotency by operationId
      const existingByOp = await db.ledgerEvents.where('operationId').equals(opId).first();
      if (existingByOp) {
        return { recordId: existingByOp.recordId, eventId: existingByOp.id };
      }

      const plan = await db.dcaPlans.get(input.planId);
      if (!plan) throw new Error('برنامه DCA یافت نشد');
      const asset = await db.assets.get(plan.assetId);
      if (!asset) throw new Error('دارایی برنامه یافت نشد');

      const [existingEvents, snapshots, stepLinks] = await Promise.all([
        db.ledgerEvents.where('assetId').equals(asset.id).toArray(),
        db.priceSnapshots.toArray(),
        db.dcaStepLinks.where('planId').equals(plan.id).toArray(),
      ]);
      const replay = replayAssetLedger(asset, existingEvents);
      const evaluation = evaluateDcaPlan(plan, asset, replay, snapshots, stepLinks);
      const stepEval = evaluation.steps.find(s => s.rule.stepIndex === input.stepIndex);
      if (!stepEval) throw new Error('مرحلهٔ مورد نظر یافت نشد');
      if (stepEval.status === 'COMPLETED') {
        throw new Error('این مرحله قبلاً به‌طور کامل اجرا شده است و خرید تکراری مجاز نیست.');
      }

      const { settlementRial, costKnown } = computeTradeSettlementRial(input.payload, 'BUY');
      if (!costKnown || !R.isPos(settlementRial)) {
        throw new Error('مبلغ خرید مرحله باید بزرگ‌تر از صفر باشد');
      }

      const now = Date.now();
      const recordId = newInvestmentUuid();
      const eventId = newInvestmentUuid();
      const candidate: LedgerEvent = {
        id: eventId,
        portfolioId: asset.portfolioId,
        assetId: asset.id,
        recordId,
        operationId: opId,
        kind: 'BUY',
        recordedAtMs: now,
        effectiveAtMs: input.effectiveAtMs,
        datePrecision: 'EXACT',
        schemaVersion: 1,
        payload: {
          ...input.payload,
          note: input.payload.note || `خرید پله‌ای (${plan.name} · مرحله ${input.stepIndex})`,
        },
      };

      const check = validateCandidateEventSequence(asset, existingEvents, candidate);
      if (!check.ok) {
        throw new Error(check.reason);
      }

      const settlementNumber = R.toSafeRialNumber(settlementRial);
      if (cashChoice.mode === 'CREATE_TXN') {
        const acc = await db.accounts.get(cashChoice.accountId);
        if (!acc || acc.archived) throw new Error('حساب انتخاب‌شده در دسترس نیست');
        const txnId = await db.txns.add({
          type: 'INVESTMENT_OUT',
          amount: settlementNumber,
          accountId: cashChoice.accountId,
          title: `خرید پله‌ای · ${asset.name}`,
          note: input.payload.note,
          occurredAt: input.effectiveAtMs,
          source: 'MANUAL',
          createdAt: now,
        });
        await db.cashLinks.add({
          id: newInvestmentUuid(),
          recordId,
          effectiveEventId: eventId,
          accountId: cashChoice.accountId,
          bankTxnId: txnId,
          origin: 'CREATED_BY_PORTFOLIO',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
      } else if (cashChoice.mode === 'LINK_EXISTING') {
        await validateExistingTxnMatch({
          accountId: cashChoice.accountId,
          bankTxnId: cashChoice.bankTxnId,
          kind: 'BUY',
          settlementRial: settlementNumber,
          effectiveAtMs: input.effectiveAtMs,
          allowDateMismatch: cashChoice.allowDateMismatch,
        });
        await db.cashLinks.add({
          id: newInvestmentUuid(),
          recordId,
          effectiveEventId: eventId,
          accountId: cashChoice.accountId,
          bankTxnId: cashChoice.bankTxnId,
          origin: 'EXISTING_TXN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.ledgerEvents.add(candidate);

      const linkId = `${plan.id}#${input.stepIndex}`;
      const prevLink = await db.dcaStepLinks.get(linkId);
      const nextRecordIds = Array.from(new Set([...(prevLink?.recordIds ?? []), recordId]));
      await db.dcaStepLinks.put({
        id: linkId,
        planId: plan.id,
        assetId: asset.id,
        stepIndex: input.stepIndex,
        recordIds: nextRecordIds,
        triggeredAtMs: prevLink?.triggeredAtMs ?? now,
        updatedAt: now,
      });

      // Mark plan completed if all steps are now filled
      const nextTotalExecuted = R.add(evaluation.totalExecutedRial, settlementRial);
      if (R.cmp(nextTotalExecuted, evaluation.totalBudgetRial) >= 0) {
        await db.dcaPlans.update(plan.id, { status: 'COMPLETED', updatedAt: now });
      } else if (plan.status === 'COMPLETED') {
        await db.dcaPlans.update(plan.id, { status: 'ACTIVE', updatedAt: now });
      }

      return { recordId, eventId };
    }
  );
}

export async function findCandidateBankTxnsForInvestment(params: {
  accountId: number;
  kind: 'BUY' | 'SELL';
  settlementRial: number;
}): Promise<Txn[]> {
  const expectedTypes =
    params.kind === 'BUY' ? ['EXPENSE', 'INVESTMENT_OUT'] : ['INCOME', 'INVESTMENT_IN'];
  const [txns, links] = await Promise.all([
    db.txns.where('accountId').equals(params.accountId).toArray(),
    db.cashLinks.where('status').equals('ACTIVE').toArray(),
  ]);
  const takenTxnIds = new Set(links.flatMap(l => (l.bankTxnId != null ? [l.bankTxnId] : [])));
  return txns
    .filter(
      t =>
        t.id != null &&
        expectedTypes.includes(t.type) &&
        t.amount === params.settlementRial &&
        !takenTxnIds.has(t.id)
    )
    .sort((a, b) => b.occurredAt - a.occurredAt);
}

// --- Phase 4-C: Market & Portfolio Alerts ---

export async function createInvestmentAlertRule(input: {
  portfolioId: string;
  scope: AlertRuleScope;
  name: string;
  condition: AlertConditionKind;
  instrumentKey?: string;
  assetId?: string;
  thresholdValue?: string;
  staleAfterHours?: number;
  cooldownMinutes?: number;
}): Promise<AlertRule> {
  const name = input.name.trim();
  if (!name) throw new Error('عنوان هشدار الزامی است');
  if (input.scope === 'PUBLIC_MARKET' && !input.instrumentKey) {
    throw new Error('برای هشدار عمومی بازار، انتخاب ابزار الزامی است');
  }
  const now = Date.now();
  const rule: AlertRule = {
    id: newInvestmentUuid(),
    portfolioId: input.portfolioId,
    scope: input.scope,
    name,
    enabled: true,
    instrumentKey: input.scope === 'PUBLIC_MARKET' ? input.instrumentKey : undefined,
    assetId: input.scope === 'PORTFOLIO_LOCAL' ? input.assetId : undefined,
    condition: input.condition,
    thresholdValue: input.thresholdValue,
    staleAfterHours: input.staleAfterHours,
    cooldownMinutes: Math.max(1, input.cooldownMinutes ?? 60),
    createdAt: now,
    updatedAt: now,
  };
  await db.alertRules.add(rule);
  return rule;
}

export async function toggleInvestmentAlertRule(ruleId: string, enabled: boolean): Promise<void> {
  await db.alertRules.update(ruleId, { enabled, updatedAt: Date.now() });
}

export async function deleteInvestmentAlertRule(ruleId: string): Promise<void> {
  await db.transaction('rw', [db.alertRules, db.alertEvents, db.outbox], async () => {
    await db.alertEvents.where('ruleId').equals(ruleId).delete();
    await db.alertRules.delete(ruleId);
  });
}

export async function evaluateInvestmentAlerts(options?: {
  overview?: PortfolioOverview;
  hidden?: boolean;
  checkPublicServer?: boolean;
}): Promise<{
  firedLogs: AlertEventLog[];
  serverCheckError?: string;
}> {
  const overview = options?.overview ?? (await loadPortfolioOverview());
  const nowMs = Date.now();
  const lockEnabled = isLockEnabled();
  const hidden = Boolean(options?.hidden);

  const candidates = evaluateLocalAlerts({
    rules: overview.alertRules,
    assets: overview.positions.map(p => p.asset),
    positions: overview.positions,
    summary: overview.summary,
    snapshots: overview.snapshots,
    nowMs,
    defaultStaleHours: overview.portfolio.settings?.stalePriceHours ?? 24,
  });

  let serverCheckError: string | undefined;
  const firedIds = new Set(candidates.map(c => c.rule.id));

  // Optional server evaluation ONLY for PUBLIC_MARKET rules (zero portfolio data sent!)
  if (options?.checkPublicServer) {
    const publicPayload = buildPublicAlertRequestPayload(overview.alertRules);
    if (publicPayload.length > 0) {
      try {
        const baseUrl = (getCfg()?.url || DEFAULT_SYNC_URL).replace(/\/$/, '');
        const res = await fetch(`${baseUrl}/api/alerts/evaluate-public`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rules: publicPayload }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          triggered?: Array<{ ruleId: string; instrumentKey: string; observedAtMs: number; amount: string }>;
        };
        for (const t of body.triggered ?? []) {
          if (firedIds.has(t.ruleId)) continue;
          const rule = overview.alertRules.find(r => r.id === t.ruleId && r.scope === 'PUBLIC_MARKET');
          if (!rule) continue;
          const msg = `هشدار عمومی بازار (${t.instrumentKey}) در سرور فعال شد`;
          candidates.push({
            rule,
            title: rule.name,
            publicMessage: msg,
            detailedMessage: msg,
            observedAtMs: t.observedAtMs,
          });
          firedIds.add(rule.id);
        }
      } catch (err) {
        serverCheckError =
          err instanceof Error
            ? `خطا در بررسی هشدار عمومی سرور (${err.message}) — ارزیابی محلی انجام شد`
            : 'خطا در بررسی هشدار عمومی سرور';
      }
    }
  }

  if (candidates.length === 0) {
    return { firedLogs: [], serverCheckError };
  }

  const firedLogs: AlertEventLog[] = [];
  await db.transaction('rw', [db.alertRules, db.alertEvents, db.outbox], async () => {
    for (const c of candidates) {
      const log: AlertEventLog = {
        id: newInvestmentUuid(),
        ruleId: c.rule.id,
        scope: c.rule.scope,
        title: c.title,
        publicMessage: c.publicMessage,
        detailedMessage: c.detailedMessage,
        observedAtMs: c.observedAtMs,
        triggeredAtMs: nowMs,
      };
      await db.alertEvents.add(log);
      await db.alertRules.update(c.rule.id, {
        lastTriggeredAtMs: nowMs,
        lastTriggeredObservedAtMs: c.observedAtMs ?? c.rule.lastTriggeredObservedAtMs,
        updatedAt: nowMs,
      });
      firedLogs.push(log);
    }
  });

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    for (const log of firedLogs) {
      try {
        new Notification(log.title, {
          body: formatAlertNotificationBody(log, { lockEnabled, hidden }),
          tag: `jibeman-alert-${log.ruleId}`,
        });
      } catch {
        // Ignore notification errors in unsupported standalone contexts
      }
    }
  }

  return { firedLogs, serverCheckError };
}

export async function checkDevicePushSupport(): Promise<{
  notificationApi: boolean;
  pushManager: boolean;
  permission: NotificationPermission | 'unsupported';
  serverPushConfigured: boolean;
}> {
  const notificationApi = typeof Notification !== 'undefined';
  const pushManager =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
  const permission: NotificationPermission | 'unsupported' = notificationApi
    ? Notification.permission
    : 'unsupported';

  let serverPushConfigured = false;
  try {
    const baseUrl = (getCfg()?.url || DEFAULT_SYNC_URL).replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/api/alerts/public-capabilities`, { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { pushConfigured?: boolean };
      serverPushConfigured = Boolean(body.pushConfigured);
    }
  } catch {
    serverPushConfigured = false;
  }

  return { notificationApi, pushManager, permission, serverPushConfigured };
}

// --- Phase 4-D: Target Allocation & Cash Reserve Helpers ---

export async function saveTargetAllocation(input: {
  id?: string;
  portfolioId?: string;
  name: string;
  targetsPct: Partial<Record<AllocationCategory, number>>;
  cashReserveAccountIds: number[];
  manualCashReserveRial?: string;
  concentrationWarningPct: number;
}): Promise<TargetAllocation> {
  const cleanName = input.name.trim() || 'ترکیب هدف اصلی';
  validateTargetPercentages(input.targetsPct);

  if (!Number.isFinite(input.concentrationWarningPct) || input.concentrationWarningPct <= 0 || input.concentrationWarningPct > 100) {
    throw new Error('آستانهٔ هشدار تمرکز باید بین ۱ تا ۱۰۰ درصد باشد');
  }

  const manualTrimmed = input.manualCashReserveRial?.trim();
  if (manualTrimmed && !/^\d+$/.test(manualTrimmed)) {
    throw new Error('مبلغ ذخیرهٔ نقد دستی معتبر نیست');
  }

  const portfolio = await ensureDefaultPortfolio();
  const portfolioId = input.portfolioId || portfolio.id;
  const now = Date.now();
  const existing = input.id ? await db.targetAllocations.get(input.id) : undefined;

  const cleanedTargets: Partial<Record<AllocationCategory, number>> = {};
  for (const [k, v] of Object.entries(input.targetsPct) as Array<[AllocationCategory, number | undefined]>) {
    if (v != null && Number.isFinite(v) && v >= 0) {
      cleanedTargets[k] = Number(v.toFixed(2));
    }
  }

  const record: TargetAllocation = {
    id: existing?.id ?? input.id ?? newInvestmentUuid(),
    portfolioId,
    name: cleanName,
    targetsPct: cleanedTargets,
    cashReserveAccountIds: Array.from(new Set(input.cashReserveAccountIds)),
    manualCashReserveRial: manualTrimmed && manualTrimmed !== '0' ? manualTrimmed : undefined,
    concentrationWarningPct: Number(input.concentrationWarningPct.toFixed(1)),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.targetAllocations.put(record);
  return record;
}

export async function deleteTargetAllocation(allocationId: string): Promise<void> {
  await db.targetAllocations.delete(allocationId);
}
