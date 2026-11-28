import { computeTradeSettlementRial, convertPriceSnapshotToAssetUnit } from './formulas';
import { R, type Rational } from './rational';
import { replayAssetLedger, selectCompatiblePriceSnapshot, valuateAssetPosition } from './replay';
import { getTehranDateParts, listTehranMarketDays } from './tehranDate';
import type { Asset, LedgerEvent, PriceMethod, PriceSnapshot, QuoteSide } from './types';

export interface PriceSeriesPoint {
  dayKey: string;
  jalaliKey: string;
  labelFa: string;
  startMs: number;
  endMs: number;
  hasGap: boolean;
  unitPriceRial: Rational | null;
  quoteSide?: QuoteSide;
  method?: PriceMethod;
  sourceId?: string;
  observedAtMs?: number;
  fetchedAtMs?: number;
}

export interface InstrumentPriceSeries {
  instrumentKey: string;
  days: number;
  points: PriceSeriesPoint[];
  pricedPointsCount: number;
  gapDaysCount: number;
  minPriceRial: Rational | null;
  maxPriceRial: Rational | null;
  latestPoint: PriceSeriesPoint | null;
  firstPoint: PriceSeriesPoint | null;
  periodChangePercent: number | null;
}

const QUOTE_PRIORITY: Record<QuoteSide, number> = {
  DEALER_BID: 0,
  REFERENCE: 1,
  DEALER_ASK: 2,
};

export function buildInstrumentPriceSeries(
  asset: Asset,
  snapshots: PriceSnapshot[],
  days = 30,
  nowMs = Date.now()
): InstrumentPriceSeries {
  const calendarDays = listTehranMarketDays(nowMs, days);
  const byDay = new Map<
    string,
    Array<{ snapshot: PriceSnapshot; unitPriceRial: Rational }>
  >();

  for (const snap of snapshots) {
    if (snap.instrumentKey !== asset.instrumentKey || snap.quoteSide === 'DEALER_ASK') continue;
    const unitPriceRial = convertPriceSnapshotToAssetUnit(snap, asset);
    if (unitPriceRial === null) continue;
    const { dayKey } = getTehranDateParts(snap.observedAtMs);
    const list = byDay.get(dayKey) ?? [];
    list.push({ snapshot: snap, unitPriceRial });
    byDay.set(dayKey, list);
  }

  let minPriceRial: Rational | null = null;
  let maxPriceRial: Rational | null = null;
  let pricedPointsCount = 0;
  let gapDaysCount = 0;

  const points: PriceSeriesPoint[] = calendarDays.map(day => {
    const candidates = byDay.get(day.dayKey);
    if (!candidates || candidates.length === 0) {
      gapDaysCount += 1;
      return {
        dayKey: day.dayKey,
        jalaliKey: day.jalaliKey,
        labelFa: day.labelFa,
        startMs: day.startMs,
        endMs: day.endMs,
        hasGap: true,
        unitPriceRial: null,
      };
    }

    candidates.sort((a, b) => {
      const pa = QUOTE_PRIORITY[a.snapshot.quoteSide];
      const pb = QUOTE_PRIORITY[b.snapshot.quoteSide];
      if (pa !== pb) return pa - pb;
      if (b.snapshot.observedAtMs !== a.snapshot.observedAtMs) {
        return b.snapshot.observedAtMs - a.snapshot.observedAtMs;
      }
      return (b.snapshot.fetchedAtMs ?? 0) - (a.snapshot.fetchedAtMs ?? 0);
    });

    const chosen = candidates[0];
    pricedPointsCount += 1;
    if (minPriceRial === null || R.cmp(chosen.unitPriceRial, minPriceRial) < 0) {
      minPriceRial = chosen.unitPriceRial;
    }
    if (maxPriceRial === null || R.cmp(chosen.unitPriceRial, maxPriceRial) > 0) {
      maxPriceRial = chosen.unitPriceRial;
    }

    const pt: PriceSeriesPoint = {
      dayKey: day.dayKey,
      jalaliKey: day.jalaliKey,
      labelFa: day.labelFa,
      startMs: day.startMs,
      endMs: day.endMs,
      hasGap: false,
      unitPriceRial: chosen.unitPriceRial,
      quoteSide: chosen.snapshot.quoteSide,
      method: chosen.snapshot.method,
      sourceId: chosen.snapshot.sourceId,
      observedAtMs: chosen.snapshot.observedAtMs,
      fetchedAtMs: chosen.snapshot.fetchedAtMs,
    };

    return pt;
  });

  const pricedPts = points.filter(p => !p.hasGap && p.unitPriceRial !== null);
  const firstPoint = pricedPts[0] ?? null;
  const latestPoint = pricedPts[pricedPts.length - 1] ?? null;

  let periodChangePercent: number | null = null;
  if (
    firstPoint &&
    latestPoint &&
    firstPoint.unitPriceRial &&
    latestPoint.unitPriceRial &&
    R.isPos(firstPoint.unitPriceRial) &&
    firstPoint.dayKey !== latestPoint.dayKey
  ) {
    const firstN = R.toNumber(firstPoint.unitPriceRial);
    const lastN = R.toNumber(latestPoint.unitPriceRial);
    periodChangePercent = ((lastN - firstN) / firstN) * 100;
  }

  return {
    instrumentKey: asset.instrumentKey,
    days,
    points,
    pricedPointsCount,
    gapDaysCount,
    minPriceRial,
    maxPriceRial,
    latestPoint,
    firstPoint,
    periodChangePercent,
  };
}

export type PortfolioHistoryDayStatus =
  | 'EMPTY'
  | 'COMPLETE'
  | 'PARTIAL_UNPRICED'
  | 'GAP'
  | 'NEEDS_REVIEW';

export interface PortfolioHistoryPoint {
  dayKey: string;
  jalaliKey: string;
  labelFa: string;
  startMs: number;
  endMs: number;
  status: PortfolioHistoryDayStatus;
  marketValueRial: Rational | null;
  costBasisRial: Rational | null;
  dayNetFlowRial: Rational;
  cumulativeNetFlowRial: Rational;
  heldAssetsCount: number;
  unpricedAssetsCount: number;
  hasStalePrices: boolean;
  hasSubstituteReferencePrice: boolean;
}

export interface PortfolioHistorySeries {
  days: number;
  points: PortfolioHistoryPoint[];
  startValueRial: Rational | null;
  endValueRial: Rational | null;
  periodNetInflowRial: Rational;
  marketGainRial: Rational | null;
  isCompleteForReturn: boolean;
  gapDaysCount: number;
  partialDaysCount: number;
}

export function buildPortfolioHistorySeries(
  items: Array<{ asset: Asset; events: LedgerEvent[] }>,
  snapshots: PriceSnapshot[],
  days = 30,
  options?: { nowMs?: number; staleAfterHours?: number }
): PortfolioHistorySeries {
  const nowMs = options?.nowMs ?? Date.now();
  const staleAfterHours = options?.staleAfterHours ?? 24;
  const calendarDays = listTehranMarketDays(nowMs, days);

  // Track cumulative cash flows (BUY positive contribution, SELL negative withdrawal) across all effective records
  const allReplaysFinal = items.map(item => ({
    asset: item.asset,
    events: item.events,
    effectiveFinal: replayAssetLedger(item.asset, item.events),
  }));

  const flowEvents: Array<{ effectiveAtMs: number; signedFlowRial: Rational }> = [];
  for (const { effectiveFinal } of allReplaysFinal) {
    for (const rec of effectiveFinal.effectiveRecords) {
      if (rec.effectiveKind === 'OPENING') continue;
      const { settlementRial, costKnown } = computeTradeSettlementRial(
        rec.snapshot,
        rec.effectiveKind
      );
      if (!costKnown) continue;
      flowEvents.push({
        effectiveAtMs: rec.effectiveAtMs,
        signedFlowRial:
          rec.effectiveKind === 'BUY' ? settlementRial : R.neg(settlementRial),
      });
    }
  }

  let periodNetInflowRial = R.zero;
  const periodStartMs = calendarDays[0]?.startMs ?? nowMs;
  const periodEndMs = calendarDays[calendarDays.length - 1]?.endMs ?? nowMs;
  for (const fe of flowEvents) {
    if (fe.effectiveAtMs >= periodStartMs && fe.effectiveAtMs <= periodEndMs) {
      periodNetInflowRial = R.add(periodNetInflowRial, fe.signedFlowRial);
    }
  }

  let gapDaysCount = 0;
  let partialDaysCount = 0;

  const points: PortfolioHistoryPoint[] = calendarDays.map(day => {
    const snapshotsAsOfDay = snapshots.filter(s => s.observedAtMs <= day.endMs);
    let dayMarketValue = R.zero;
    let dayCostBasis = R.zero;
    let anyUnknownCost = false;
    let heldAssetsCount = 0;
    let pricedAssetsCount = 0;
    let unpricedAssetsCount = 0;
    let hasNeedsReview = false;
    let hasStalePrices = false;
    let hasSubstituteReferencePrice = false;

    for (const { asset, events } of items) {
      const eventsAsOfDay = events.filter(ev => ev.effectiveAtMs <= day.endMs);
      if (eventsAsOfDay.length === 0) continue;

      const replay = replayAssetLedger(asset, eventsAsOfDay);
      if (replay.status === 'NEEDS_REVIEW') {
        hasNeedsReview = true;
        continue;
      }
      if (!R.isPos(replay.quantity)) continue;

      heldAssetsCount += 1;
      if (!replay.costKnown || replay.costBasisRial === null) {
        anyUnknownCost = true;
      } else {
        dayCostBasis = R.add(dayCostBasis, replay.costBasisRial);
      }

      const valuation = valuateAssetPosition(replay, asset, snapshotsAsOfDay, {
        nowMs: day.endMs,
        staleAfterHours,
      });

      // Keep strict check whether price actually existed by this day
      const selected = selectCompatiblePriceSnapshot(asset, snapshotsAsOfDay);
      if (!selected || !valuation.priced || valuation.estimatedSaleRial === null) {
        unpricedAssetsCount += 1;
      } else {
        pricedAssetsCount += 1;
        dayMarketValue = R.add(dayMarketValue, valuation.estimatedSaleRial);
        if (valuation.isStale) hasStalePrices = true;
        if (valuation.priceLabel === 'REFERENCE_ESTIMATE') {
          hasSubstituteReferencePrice = true;
        }
      }
    }

    let dayNetFlowRial = R.zero;
    let cumulativeNetFlowRial = R.zero;
    for (const fe of flowEvents) {
      if (fe.effectiveAtMs <= day.endMs) {
        cumulativeNetFlowRial = R.add(cumulativeNetFlowRial, fe.signedFlowRial);
        if (fe.effectiveAtMs >= day.startMs) {
          dayNetFlowRial = R.add(dayNetFlowRial, fe.signedFlowRial);
        }
      }
    }

    let status: PortfolioHistoryDayStatus;
    let marketValueRial: Rational | null = null;
    if (hasNeedsReview) {
      status = 'NEEDS_REVIEW';
      gapDaysCount += 1;
    } else if (heldAssetsCount === 0) {
      status = 'EMPTY';
      marketValueRial = R.zero;
    } else if (pricedAssetsCount === 0) {
      status = 'GAP';
      gapDaysCount += 1;
    } else if (unpricedAssetsCount > 0) {
      status = 'PARTIAL_UNPRICED';
      partialDaysCount += 1;
      marketValueRial = dayMarketValue;
    } else {
      status = 'COMPLETE';
      marketValueRial = dayMarketValue;
    }

    return {
      dayKey: day.dayKey,
      jalaliKey: day.jalaliKey,
      labelFa: day.labelFa,
      startMs: day.startMs,
      endMs: day.endMs,
      status,
      marketValueRial,
      costBasisRial: anyUnknownCost ? null : dayCostBasis,
      dayNetFlowRial,
      cumulativeNetFlowRial,
      heldAssetsCount,
      unpricedAssetsCount,
      hasStalePrices,
      hasSubstituteReferencePrice,
    };
  });

  const startPt = points[0];
  const endPt = points[points.length - 1];
  const startComplete =
    startPt && (startPt.status === 'COMPLETE' || startPt.status === 'EMPTY');
  const endComplete =
    endPt && (endPt.status === 'COMPLETE' || endPt.status === 'EMPTY');

  // If portfolio was empty just before window start and first activity occurred on day 0,
  // start value before window is 0 so day 0's buy isn't double-counted as market gain.
  let priorValueRial: Rational | null = null;
  if (points.length > 0) {
    const beforeStartMs = periodStartMs - 1;
    let hadPriorHoldings = false;
    let priorAllComplete = true;
    let priorSum = R.zero;
    for (const { asset, events } of items) {
      const priorEvents = events.filter(ev => ev.effectiveAtMs <= beforeStartMs);
      if (priorEvents.length === 0) continue;
      const r = replayAssetLedger(asset, priorEvents);
      if (r.status === 'NEEDS_REVIEW') {
        priorAllComplete = false;
        break;
      }
      if (!R.isPos(r.quantity)) continue;
      hadPriorHoldings = true;
      const snapsPrior = snapshots.filter(s => s.observedAtMs <= beforeStartMs);
      const val = valuateAssetPosition(r, asset, snapsPrior, {
        nowMs: beforeStartMs,
        staleAfterHours,
      });
      if (!val.priced || val.estimatedSaleRial === null) {
        priorAllComplete = false;
        break;
      }
      priorSum = R.add(priorSum, val.estimatedSaleRial);
    }
    if (priorAllComplete) {
      priorValueRial = hadPriorHoldings ? priorSum : R.zero;
    }
  }

  const isCompleteForReturn = Boolean(priorValueRial !== null && endComplete);
  const marketGainRial =
    isCompleteForReturn && priorValueRial !== null && endPt?.marketValueRial !== null
      ? R.sub(R.sub(endPt.marketValueRial, priorValueRial), periodNetInflowRial)
      : null;

  return {
    days,
    points,
    startValueRial: startComplete ? startPt.marketValueRial : null,
    endValueRial: endComplete ? endPt.marketValueRial : null,
    periodNetInflowRial,
    marketGainRial,
    isCompleteForReturn,
    gapDaysCount,
    partialDaysCount,
  };
}
