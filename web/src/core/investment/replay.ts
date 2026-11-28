import {
  computeJewelryEstimate,
  computeTradeSettlementRial,
  convertPriceSnapshotToAssetUnit,
  normalizeQuantityForAsset,
} from './formulas';
import { R, type Rational } from './rational';
import type {
  AmendPayload,
  Asset,
  LedgerEvent,
  PriceSnapshot,
  QuoteSide,
  TradeSnapshotPayload,
} from './types';

export type ConflictCode =
  | 'DUPLICATE_ID_MISMATCH'
  | 'CONCURRENT_EDIT_FORK'
  | 'MISSING_PARENT'
  | 'DUPLICATE_ROOT_RECORD'
  | 'PARENT_CYCLE'
  | 'NEGATIVE_BALANCE'
  | 'ASSET_MISMATCH';

export interface ConflictDetail {
  code: ConflictCode;
  message: string;
  eventId?: string;
  recordId?: string;
  parentEventId?: string;
  dependentRecordId?: string;
}

export interface EffectiveRecord {
  recordId: string;
  rootEventId: string;
  effectiveEventId: string;
  effectiveKind: 'OPENING' | 'BUY' | 'SELL';
  initialRecordedAtMs: number;
  effectiveAtMs: number;
  datePrecision: LedgerEvent['datePrecision'];
  snapshot: TradeSnapshotPayload;
  voided: boolean;
  historyEventIds: string[];
}

export interface RecordReplayEffect {
  recordId: string;
  effectiveKind: 'OPENING' | 'BUY' | 'SELL';
  normalizedQuantity: Rational;
  settlementRial: Rational;
  costKnown: boolean;
  costAllocatedRial: Rational | null;
  realizedProfitRial: Rational | null;
  quantityAfter: Rational;
  costBasisAfterRial: Rational | null;
}

export interface ReplayPositionSnapshot {
  quantity: Rational;
  costBasisRial: Rational | null;
  costKnown: boolean;
  averageUnitCostRial: Rational | null;
  realizedProfitRial: Rational;
  realizedProfitKnown: boolean;
  asOfEffectiveAtMs: number;
}

export interface AssetReplayResult {
  assetId: string;
  status: 'VALID' | 'NEEDS_REVIEW';
  conflicts: ConflictDetail[];
  quantity: Rational;
  costBasisRial: Rational | null;
  costKnown: boolean;
  averageUnitCostRial: Rational | null;
  realizedProfitRial: Rational;
  realizedProfitKnown: boolean;
  effectiveRecords: EffectiveRecord[];
  voidedRecords: EffectiveRecord[];
  recordEffects: Map<string, RecordReplayEffect>;
  lastValidState: ReplayPositionSnapshot;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) sorted[k] = canonicalize(v);
    }
    return sorted;
  }
  return value;
}

export function canonicalEventFingerprint(ev: LedgerEvent): string {
  return JSON.stringify(canonicalize(ev));
}

function isAmendPayload(p: unknown): p is AmendPayload {
  return Boolean(p && typeof p === 'object' && 'snapshot' in p && 'targetKind' in p);
}

function resolveEffectiveRecords(
  assetId: string,
  events: LedgerEvent[]
): {
  deduped: LedgerEvent[];
  active: EffectiveRecord[];
  voided: EffectiveRecord[];
  conflicts: ConflictDetail[];
} {
  const conflicts: ConflictDetail[] = [];
  const byId = new Map<string, { event: LedgerEvent; fingerprint: string }>();

  for (const ev of events) {
    if (ev.assetId !== assetId) {
      conflicts.push({
        code: 'ASSET_MISMATCH',
        message: 'رویداد متعلق به این دارایی نیست',
        eventId: ev.id,
        recordId: ev.recordId,
      });
      continue;
    }
    const fp = canonicalEventFingerprint(ev);
    const prev = byId.get(ev.id);
    if (prev) {
      if (prev.fingerprint !== fp) {
        conflicts.push({
          code: 'DUPLICATE_ID_MISMATCH',
          message: 'شناسهٔ رویداد تکراری با محتوای متفاوت دریافت شده است',
          eventId: ev.id,
          recordId: ev.recordId,
        });
      }
      continue; // exact duplicate -> idempotent no-op
    }
    byId.set(ev.id, { event: ev, fingerprint: fp });
  }

  const deduped = Array.from(byId.values()).map(v => v.event);

  // Detect forks (two child events pointing to same parentEventId) & missing parents
  const childrenByParent = new Map<string, LedgerEvent[]>();
  for (const ev of deduped) {
    if (ev.kind === 'AMEND' || ev.kind === 'VOID') {
      if (!ev.parentEventId || !byId.has(ev.parentEventId)) {
        conflicts.push({
          code: 'MISSING_PARENT',
          message: 'رویداد اصلاح یا ابطال بدون والد معتبر یافت شد',
          eventId: ev.id,
          recordId: ev.recordId,
          parentEventId: ev.parentEventId,
        });
      } else {
        const list = childrenByParent.get(ev.parentEventId) ?? [];
        list.push(ev);
        childrenByParent.set(ev.parentEventId, list);
      }
    }
  }

  for (const [parentId, children] of childrenByParent.entries()) {
    if (children.length > 1) {
      conflicts.push({
        code: 'CONCURRENT_EDIT_FORK',
        message: 'دو اصلاح یا ابطال هم‌زمان با یک والد مشترک وجود دارد',
        parentEventId: parentId,
        recordId: children[0].recordId,
      });
    }
  }

  // Group by recordId to resolve effective record
  const byRecord = new Map<string, LedgerEvent[]>();
  for (const ev of deduped) {
    const list = byRecord.get(ev.recordId) ?? [];
    list.push(ev);
    byRecord.set(ev.recordId, list);
  }

  const active: EffectiveRecord[] = [];
  const voided: EffectiveRecord[] = [];

  for (const [recordId, recEvents] of byRecord.entries()) {
    const roots = recEvents.filter(
      e => e.kind === 'OPENING' || e.kind === 'BUY' || e.kind === 'SELL'
    );
    if (roots.length === 0) {
      conflicts.push({
        code: 'MISSING_PARENT',
        message: 'رویداد پایهٔ ثبت یافت نشد',
        recordId,
      });
      continue;
    }
    if (roots.length > 1) {
      conflicts.push({
        code: 'DUPLICATE_ROOT_RECORD',
        message: 'چند رویداد پایه برای یک ثبت منطقی وجود دارد',
        recordId,
      });
      continue;
    }

    const root = roots[0];
    let curr: LedgerEvent = root;
    const historyIds = [root.id];
    const visited = new Set<string>([root.id]);

    while (true) {
      const nextChildren = (childrenByParent.get(curr.id) ?? []).filter(
        c => c.recordId === recordId
      );
      if (nextChildren.length === 0) break;
      if (nextChildren.length > 1) {
        // Fork already recorded; stop following ambiguous branch
        break;
      }
      const next = nextChildren[0];
      if (visited.has(next.id)) {
        conflicts.push({
          code: 'PARENT_CYCLE',
          message: 'چرخه در زنجیرهٔ اصلاح رویداد شناسایی شد',
          eventId: next.id,
          recordId,
        });
        break;
      }
      visited.add(next.id);
      historyIds.push(next.id);
      curr = next;
    }

    // Find latest valid snapshot (from last non-VOID event in chain)
    let latestSnapshotEvent: LedgerEvent = root;
    for (const id of historyIds) {
      const ev = byId.get(id)?.event;
      if (ev && ev.kind !== 'VOID') latestSnapshotEvent = ev;
    }

    const effectiveKind =
      latestSnapshotEvent.kind === 'AMEND' && isAmendPayload(latestSnapshotEvent.payload)
        ? latestSnapshotEvent.payload.targetKind
        : (root.kind as 'OPENING' | 'BUY' | 'SELL');

    const snapshot =
      latestSnapshotEvent.kind === 'AMEND' && isAmendPayload(latestSnapshotEvent.payload)
        ? latestSnapshotEvent.payload.snapshot
        : (root.payload as TradeSnapshotPayload);

    const record: EffectiveRecord = {
      recordId,
      rootEventId: root.id,
      effectiveEventId: curr.id,
      effectiveKind,
      initialRecordedAtMs: root.recordedAtMs,
      effectiveAtMs: latestSnapshotEvent.effectiveAtMs,
      datePrecision: latestSnapshotEvent.datePrecision,
      snapshot,
      voided: curr.kind === 'VOID',
      historyEventIds: historyIds,
    };

    if (record.voided) voided.push(record);
    else active.push(record);
  }

  active.sort((a, b) => {
    if (a.effectiveAtMs !== b.effectiveAtMs) return a.effectiveAtMs - b.effectiveAtMs;
    const pa = a.effectiveKind === 'OPENING' ? 0 : 1;
    const pb = b.effectiveKind === 'OPENING' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.initialRecordedAtMs !== b.initialRecordedAtMs) {
      return a.initialRecordedAtMs - b.initialRecordedAtMs;
    }
    return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
  });

  return { deduped, active, voided, conflicts };
}

export function replayAssetLedger(
  asset: Asset,
  events: LedgerEvent[]
): AssetReplayResult {
  const { active, voided, conflicts } = resolveEffectiveRecords(asset.id, events);

  let Q = R.zero;
  let C = R.zero;
  let costKnown = true;
  let realizedProfit = R.zero;
  let realizedProfitKnown = true;
  let lastValidAtMs = 0;

  let lastValidState: ReplayPositionSnapshot = {
    quantity: R.zero,
    costBasisRial: R.zero,
    costKnown: true,
    averageUnitCostRial: null,
    realizedProfitRial: R.zero,
    realizedProfitKnown: true,
    asOfEffectiveAtMs: 0,
  };

  const recordEffects = new Map<string, RecordReplayEffect>();
  let negativeBalanceEncountered = false;

  for (const rec of active) {
    if (negativeBalanceEncountered) break;

    const q = normalizeQuantityForAsset(asset, rec.snapshot);
    const { settlementRial, costKnown: entryCostKnown } = computeTradeSettlementRial(
      rec.snapshot,
      rec.effectiveKind
    );

    if (rec.effectiveKind === 'OPENING') {
      Q = R.add(Q, q);
      if (!entryCostKnown) {
        costKnown = false;
      } else if (costKnown) {
        C = R.add(C, settlementRial);
      }

      recordEffects.set(rec.recordId, {
        recordId: rec.recordId,
        effectiveKind: 'OPENING',
        normalizedQuantity: q,
        settlementRial,
        costKnown: entryCostKnown,
        costAllocatedRial: null,
        realizedProfitRial: null,
        quantityAfter: Q,
        costBasisAfterRial: costKnown ? C : null,
      });
    } else if (rec.effectiveKind === 'BUY') {
      Q = R.add(Q, q);
      if (costKnown) {
        C = R.add(C, settlementRial);
      }

      recordEffects.set(rec.recordId, {
        recordId: rec.recordId,
        effectiveKind: 'BUY',
        normalizedQuantity: q,
        settlementRial,
        costKnown: true,
        costAllocatedRial: null,
        realizedProfitRial: null,
        quantityAfter: Q,
        costBasisAfterRial: costKnown ? C : null,
      });
    } else {
      // SELL
      if (R.cmp(q, Q) > 0) {
        negativeBalanceEncountered = true;
        conflicts.push({
          code: 'NEGATIVE_BALANCE',
          message: 'مقدار فروش از موجودی قابل معامله در این زمان بیشتر است',
          recordId: rec.recordId,
          dependentRecordId: rec.recordId,
        });
        break;
      }

      if (costKnown) {
        const costSold = R.div(R.mul(C, q), Q);
        const profit = R.sub(settlementRial, costSold);
        Q = R.sub(Q, q);
        C = R.isZero(Q) ? R.zero : R.sub(C, costSold);
        realizedProfit = R.add(realizedProfit, profit);

        recordEffects.set(rec.recordId, {
          recordId: rec.recordId,
          effectiveKind: 'SELL',
          normalizedQuantity: q,
          settlementRial,
          costKnown: true,
          costAllocatedRial: costSold,
          realizedProfitRial: profit,
          quantityAfter: Q,
          costBasisAfterRial: C,
        });
      } else {
        Q = R.sub(Q, q);
        realizedProfitKnown = false;
        if (R.isZero(Q)) {
          C = R.zero;
          costKnown = true;
        }

        recordEffects.set(rec.recordId, {
          recordId: rec.recordId,
          effectiveKind: 'SELL',
          normalizedQuantity: q,
          settlementRial,
          costKnown: false,
          costAllocatedRial: null,
          realizedProfitRial: null,
          quantityAfter: Q,
          costBasisAfterRial: costKnown ? C : null,
        });
      }
    }

    lastValidAtMs = rec.effectiveAtMs;
    lastValidState = {
      quantity: Q,
      costBasisRial: costKnown ? C : null,
      costKnown,
      averageUnitCostRial: costKnown && R.isPos(Q) ? R.div(C, Q) : null,
      realizedProfitRial: realizedProfit,
      realizedProfitKnown,
      asOfEffectiveAtMs: lastValidAtMs,
    };
  }

  const status: 'VALID' | 'NEEDS_REVIEW' = conflicts.length > 0 ? 'NEEDS_REVIEW' : 'VALID';
  const averageUnitCostRial = costKnown && R.isPos(Q) ? R.div(C, Q) : null;

  return {
    assetId: asset.id,
    status,
    conflicts,
    quantity: Q,
    costBasisRial: costKnown ? C : null,
    costKnown,
    averageUnitCostRial,
    realizedProfitRial: realizedProfit,
    realizedProfitKnown,
    effectiveRecords: active,
    voidedRecords: voided,
    recordEffects,
    lastValidState,
  };
}

export function validateCandidateEventSequence(
  asset: Asset,
  existingEvents: LedgerEvent[],
  candidate: LedgerEvent
):
  | { ok: true; replay: AssetReplayResult }
  | { ok: false; reason: string; dependentRecordId?: string } {
  // Reject new structural conflicts or negative balances locally before commit
  try {
    const replay = replayAssetLedger(asset, [...existingEvents, candidate]);
    if (replay.status === 'NEEDS_REVIEW') {
      const first = replay.conflicts[0];
      return {
        ok: false,
        reason: first?.message || 'توالی رویدادها معتبر نیست',
        dependentRecordId: first?.dependentRecordId ?? first?.recordId,
      };
    }
    return { ok: true, replay };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'خطا در اعتبارسنجی رویداد',
    };
  }
}

export function validateAssetUpdateImmutability(
  existing: Asset,
  next: Pick<Asset, 'kind' | 'instrumentKey' | 'baseUnit' | 'pricingSpec'>,
  hasEvents: boolean
): void {
  if (!hasEvents) return;
  if (
    existing.kind !== next.kind ||
    existing.instrumentKey !== next.instrumentKey ||
    existing.baseUnit !== next.baseUnit ||
    existing.pricingSpec.referenceFineness !== next.pricingSpec.referenceFineness
  ) {
    throw new Error(
      'جنس، عیار مبنا، واحد پایه و هویت ابزار پس از ثبت معامله قابل تغییر نیستند؛ دارایی جدید تعریف کنید.'
    );
  }
}

export function mergePriceSnapshots(
  existing: PriceSnapshot[],
  incoming: PriceSnapshot
): PriceSnapshot[] {
  const matchIdx = existing.findIndex(
    s =>
      s.instrumentKey === incoming.instrumentKey &&
      s.sourceId === incoming.sourceId &&
      s.market === incoming.market &&
      s.quoteSide === incoming.quoteSide &&
      s.unit === incoming.unit &&
      s.fineness === incoming.fineness &&
      s.amount === incoming.amount &&
      s.observedAtMs === incoming.observedAtMs
  );
  if (matchIdx >= 0) {
    const next = [...existing];
    next[matchIdx] = {
      ...next[matchIdx],
      fetchedAtMs: incoming.fetchedAtMs ?? Date.now(),
    };
    return next;
  }
  return [...existing, incoming];
}

export type ValuationPriceLabel =
  | 'DEALER_BID'
  | 'REFERENCE_ESTIMATE'
  | 'JEWELRY_NET_RATE'
  | 'JEWELRY_ESTIMATE'
  | 'METAL_ONLY_NEEDS_INFO'
  | 'NO_PRICE';

export interface AssetValuation {
  assetId: string;
  hasHoldings: boolean;
  priced: boolean;
  priceLabel: ValuationPriceLabel;
  priceSourceSnapshot?: PriceSnapshot;
  unitPriceRial: Rational | null;
  metalValueRial: Rational | null;
  estimatedSaleRial: Rational | null;
  unrealizedProfitRial: Rational | null;
  priceObservedAtMs?: number;
  isStale: boolean;
  assumedHaircutRate?: string;
}

const QUOTE_SIDE_PRIORITY: Record<QuoteSide, number> = {
  DEALER_BID: 0,
  REFERENCE: 1,
  DEALER_ASK: 2,
};

export function selectCompatiblePriceSnapshot(
  asset: Asset,
  snapshots: PriceSnapshot[]
): { snapshot: PriceSnapshot; unitPriceRial: Rational } | null {
  const candidates = snapshots
    .filter(s => s.instrumentKey === asset.instrumentKey && s.quoteSide !== 'DEALER_ASK')
    .map(s => ({
      snapshot: s,
      unitPriceRial: convertPriceSnapshotToAssetUnit(s, asset),
    }))
    .filter(
      (item): item is { snapshot: PriceSnapshot; unitPriceRial: Rational } =>
        item.unitPriceRial !== null
    );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const pa = QUOTE_SIDE_PRIORITY[a.snapshot.quoteSide];
    const pb = QUOTE_SIDE_PRIORITY[b.snapshot.quoteSide];
    if (pa !== pb) return pa - pb;
    if (b.snapshot.observedAtMs !== a.snapshot.observedAtMs) {
      return b.snapshot.observedAtMs - a.snapshot.observedAtMs;
    }
    return (b.snapshot.fetchedAtMs ?? 0) - (a.snapshot.fetchedAtMs ?? 0);
  });

  return candidates[0];
}

export function valuateAssetPosition(
  replay: AssetReplayResult,
  asset: Asset,
  snapshots: PriceSnapshot[],
  options?: {
    nowMs?: number;
    staleAfterHours?: number;
    jewelryIsNetDealerRate?: boolean;
    haircutRateOverride?: string;
    fixedSellingFeeRial?: string;
  }
): AssetValuation {
  const nowMs = options?.nowMs ?? Date.now();
  const staleAfterMs = (options?.staleAfterHours ?? 24) * 3600_000;
  const hasHoldings = R.isPos(replay.quantity);

  const selected = selectCompatiblePriceSnapshot(asset, snapshots);
  if (!selected) {
    return {
      assetId: asset.id,
      hasHoldings,
      priced: false,
      priceLabel: 'NO_PRICE',
      unitPriceRial: null,
      metalValueRial: null,
      estimatedSaleRial: hasHoldings ? null : R.zero,
      unrealizedProfitRial: hasHoldings ? null : R.zero,
      isStale: false,
    };
  }

  const { snapshot, unitPriceRial } = selected;
  const isStale = nowMs - snapshot.observedAtMs > staleAfterMs;

  if (!hasHoldings) {
    return {
      assetId: asset.id,
      hasHoldings: false,
      priced: true,
      priceLabel:
        snapshot.quoteSide === 'DEALER_BID' ? 'DEALER_BID' : 'REFERENCE_ESTIMATE',
      priceSourceSnapshot: snapshot,
      unitPriceRial,
      metalValueRial: R.zero,
      estimatedSaleRial: R.zero,
      unrealizedProfitRial: R.zero,
      priceObservedAtMs: snapshot.observedAtMs,
      isStale,
    };
  }

  if (asset.kind === 'GOLD_JEWELRY') {
    const lastActive = [...replay.effectiveRecords]
      .reverse()
      .find(r => r.effectiveKind !== 'SELL');
    const haircutRate =
      options?.haircutRateOverride ??
      lastActive?.snapshot.haircutRateOverride ??
      asset.pricingSpec.defaultHaircutRate;
    const fixedFee =
      options?.fixedSellingFeeRial ?? lastActive?.snapshot.fixedSellingFeeRial;

    const jewelry = computeJewelryEstimate({
      equivalentGram: replay.quantity,
      compatiblePerGramRial: unitPriceRial,
      isNetDealerRate: options?.jewelryIsNetDealerRate,
      haircutRate,
      fixedSellingFeeRial: fixedFee,
    });

    const priceLabel: ValuationPriceLabel =
      jewelry.mode === 'NET_RATE'
        ? 'JEWELRY_NET_RATE'
        : jewelry.mode === 'ESTIMATE_WITH_HAIRCUT'
        ? 'JEWELRY_ESTIMATE'
        : 'METAL_ONLY_NEEDS_INFO';

    const unrealizedProfitRial =
      jewelry.estimatedNetSaleRial !== null &&
      replay.costKnown &&
      replay.costBasisRial !== null
        ? R.sub(jewelry.estimatedNetSaleRial, replay.costBasisRial)
        : null;

    return {
      assetId: asset.id,
      hasHoldings: true,
      priced: jewelry.estimatedNetSaleRial !== null,
      priceLabel,
      priceSourceSnapshot: snapshot,
      unitPriceRial,
      metalValueRial: jewelry.metalValueRial,
      estimatedSaleRial: jewelry.estimatedNetSaleRial,
      unrealizedProfitRial,
      priceObservedAtMs: snapshot.observedAtMs,
      isStale,
      assumedHaircutRate: jewelry.assumedHaircutRate,
    };
  }

  const estimatedSaleRial = R.mul(replay.quantity, unitPriceRial);
  const unrealizedProfitRial =
    replay.costKnown && replay.costBasisRial !== null
      ? R.sub(estimatedSaleRial, replay.costBasisRial)
      : null;

  return {
    assetId: asset.id,
    hasHoldings: true,
    priced: true,
    priceLabel:
      snapshot.quoteSide === 'DEALER_BID' ? 'DEALER_BID' : 'REFERENCE_ESTIMATE',
    priceSourceSnapshot: snapshot,
    unitPriceRial,
    metalValueRial: estimatedSaleRial,
    estimatedSaleRial,
    unrealizedProfitRial,
    priceObservedAtMs: snapshot.observedAtMs,
    isStale,
  };
}

export interface PortfolioSummary {
  pricedMarketValueRial: Rational;
  calculableCostBasisRial: Rational;
  calculableRealizedProfitRial: Rational;
  calculableUnrealizedProfitRial: Rational;
  unpricedAssetsCount: number;
  staleAssetsCount: number;
  unknownCostAssetsCount: number;
  unknownRealizedProfitAssetsCount: number;
  needsReviewAssetsCount: number;
  hasDefiniteTotalValue: boolean;
  hasDefiniteUnrealizedProfit: boolean;
  hasPartialRealizedProfit: boolean;
}

export function summarizePortfolio(
  positions: Array<{ replay: AssetReplayResult; valuation: AssetValuation }>
): PortfolioSummary {
  let pricedMarketValueRial = R.zero;
  let calculableCostBasisRial = R.zero;
  let calculableRealizedProfitRial = R.zero;
  let calculableUnrealizedProfitRial = R.zero;

  let unpricedAssetsCount = 0;
  let staleAssetsCount = 0;
  let unknownCostAssetsCount = 0;
  let unknownRealizedProfitAssetsCount = 0;
  let needsReviewAssetsCount = 0;

  for (const { replay, valuation } of positions) {
    if (replay.status === 'NEEDS_REVIEW') {
      needsReviewAssetsCount += 1;
      continue;
    }

    if (!replay.realizedProfitKnown) {
      unknownRealizedProfitAssetsCount += 1;
    }
    calculableRealizedProfitRial = R.add(
      calculableRealizedProfitRial,
      replay.realizedProfitRial
    );

    if (!valuation.hasHoldings) continue;

    if (!replay.costKnown || replay.costBasisRial === null) {
      unknownCostAssetsCount += 1;
    } else {
      calculableCostBasisRial = R.add(calculableCostBasisRial, replay.costBasisRial);
    }

    if (valuation.isStale) staleAssetsCount += 1;

    if (!valuation.priced || valuation.estimatedSaleRial === null) {
      unpricedAssetsCount += 1;
    } else {
      pricedMarketValueRial = R.add(pricedMarketValueRial, valuation.estimatedSaleRial);
      if (valuation.unrealizedProfitRial !== null) {
        calculableUnrealizedProfitRial = R.add(
          calculableUnrealizedProfitRial,
          valuation.unrealizedProfitRial
        );
      }
    }
  }

  return {
    pricedMarketValueRial,
    calculableCostBasisRial,
    calculableRealizedProfitRial,
    calculableUnrealizedProfitRial,
    unpricedAssetsCount,
    staleAssetsCount,
    unknownCostAssetsCount,
    unknownRealizedProfitAssetsCount,
    needsReviewAssetsCount,
    hasDefiniteTotalValue: unpricedAssetsCount === 0 && needsReviewAssetsCount === 0,
    hasDefiniteUnrealizedProfit:
      unpricedAssetsCount === 0 &&
      unknownCostAssetsCount === 0 &&
      needsReviewAssetsCount === 0,
    hasPartialRealizedProfit: unknownRealizedProfitAssetsCount > 0,
  };
}
