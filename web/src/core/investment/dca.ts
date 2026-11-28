import { convertPriceSnapshotToAssetUnit } from './formulas';
import { R, type Rational } from './rational';
import { selectCompatiblePriceSnapshot, type AssetReplayResult } from './replay';
import type {
  Asset,
  DcaDropReference,
  DcaPlan,
  DcaStepLink,
  DcaStepRule,
  PriceSnapshot,
} from './types';

export type DcaStepStatus = 'COMPLETED' | 'PARTIAL' | 'READY' | 'WAITING';

export interface EvaluatedDcaStep {
  rule: DcaStepRule;
  status: DcaStepStatus;
  plannedBudgetRial: Rational;
  executedRial: Rational;
  remainingBudgetRial: Rational;
  activeRecordIds: string[];
  lastExecutedAtMs?: number;
  timeMet: boolean;
  priceMet: boolean;
  isTriggered: boolean;
  triggerBlockedReason?: string;
  observedDropPct?: number;
  referencePriceRial?: Rational | null;
}

export interface DcaPlanEvaluation {
  plan: DcaPlan;
  totalBudgetRial: Rational;
  totalExecutedRial: Rational;
  remainingBudgetRial: Rational;
  completedStepsCount: number;
  partialStepsCount: number;
  steps: EvaluatedDcaStep[];
  nextActionableStep: EvaluatedDcaStep | null;
  currentUnitPriceRial: Rational | null;
  isPriceStale: boolean;
  priceObservedAtMs?: number;
}

function resolveDropReferencePrice(
  ref: DcaDropReference,
  step: DcaStepRule,
  plan: DcaPlan,
  asset: Asset,
  replay: AssetReplayResult,
  snapshots: PriceSnapshot[],
  nowMs: number
): Rational | null {
  if (ref === 'FIXED_ANCHOR') {
    if (!step.anchorPriceRial) return null;
    const r = R.fromDecimal(step.anchorPriceRial);
    return R.isPos(r) ? r : null;
  }

  if (ref === 'LAST_BUY') {
    const buys = replay.effectiveRecords.filter(r => r.effectiveKind === 'BUY');
    const lastBuy = buys[buys.length - 1];
    if (!lastBuy) return null;
    const eff = replay.recordEffects.get(lastBuy.recordId);
    if (!eff || !R.isPos(eff.normalizedQuantity) || !eff.costKnown) return null;
    return R.div(eff.settlementRial, eff.normalizedQuantity);
  }

  const compatiblePrices = snapshots
    .filter(
      s =>
        s.instrumentKey === asset.instrumentKey &&
        s.quoteSide !== 'DEALER_ASK' &&
        s.observedAtMs <= nowMs
    )
    .map(s => ({
      snap: s,
      unitPrice: convertPriceSnapshotToAssetUnit(s, asset),
    }))
    .filter(
      (x): x is { snap: PriceSnapshot; unitPrice: Rational } =>
        x.unitPrice !== null && R.isPos(x.unitPrice)
    );

  if (compatiblePrices.length === 0) return null;

  if (ref === 'HIGH_WATERMARK') {
    const sincePlan = compatiblePrices.filter(x => x.snap.observedAtMs >= plan.createdAt);
    const pool = sincePlan.length > 0 ? sincePlan : compatiblePrices;
    let peak = pool[0].unitPrice;
    for (const item of pool) {
      if (R.cmp(item.unitPrice, peak) > 0) peak = item.unitPrice;
    }
    return peak;
  }

  // MOVING_AVERAGE (14d window)
  const cutoff = nowMs - 14 * 24 * 3600_000;
  const recent = compatiblePrices.filter(x => x.snap.observedAtMs >= cutoff);
  const pool = recent.length > 0 ? recent : compatiblePrices;
  let sum = R.zero;
  for (const item of pool) sum = R.add(sum, item.unitPrice);
  return R.div(sum, R.fromInt(pool.length));
}

export function evaluateDcaPlan(
  plan: DcaPlan,
  asset: Asset,
  replay: AssetReplayResult,
  snapshots: PriceSnapshot[],
  stepLinks: DcaStepLink[],
  nowMs = Date.now()
): DcaPlanEvaluation {
  const linkByStep = new Map<number, DcaStepLink>();
  for (const l of stepLinks) {
    if (l.planId === plan.id) linkByStep.set(l.stepIndex, l);
  }

  const effectiveMap = new Map(replay.effectiveRecords.map(r => [r.recordId, r]));
  const selected = selectCompatiblePriceSnapshot(asset, snapshots);
  const staleAfterMs = (plan.stalePriceHours || 24) * 3600_000;
  const currentUnitPriceRial = selected?.unitPriceRial ?? null;
  const priceObservedAtMs = selected?.snapshot.observedAtMs;
  const isPriceStale =
    selected == null || nowMs - selected.snapshot.observedAtMs > staleAfterMs;

  let totalExecutedRial = R.zero;
  let completedStepsCount = 0;
  let partialStepsCount = 0;
  let prevStepAnchorMs = plan.createdAt;
  let nextCandidateAssigned = false;

  const sortedSteps = [...plan.steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const evaluatedSteps: EvaluatedDcaStep[] = [];

  for (const rule of sortedSteps) {
    const plannedBudgetRial = R.fromInt(rule.budgetRial);
    const link = linkByStep.get(rule.stepIndex);
    const activeRecordIds: string[] = [];
    let executedRial = R.zero;
    let lastExecutedAtMs: number | undefined;

    if (link) {
      for (const recId of link.recordIds) {
        const effRec = effectiveMap.get(recId);
        const eff = replay.recordEffects.get(recId);
        if (!effRec || !eff || effRec.effectiveKind !== 'BUY') continue;
        activeRecordIds.push(recId);
        executedRial = R.add(executedRial, eff.settlementRial);
        if (lastExecutedAtMs == null || effRec.effectiveAtMs > lastExecutedAtMs) {
          lastExecutedAtMs = effRec.effectiveAtMs;
        }
      }
    }

    totalExecutedRial = R.add(totalExecutedRial, executedRial);
    const remainingBudgetRial =
      R.cmp(plannedBudgetRial, executedRial) > 0
        ? R.sub(plannedBudgetRial, executedRial)
        : R.zero;

    const hasRemaining = R.isPos(remainingBudgetRial);
    const hasExecuted = R.isPos(executedRial);

    // Trigger evaluation only for the current active (next uncompleted) step while plan is ACTIVE
    const hasTimeRule = rule.minIntervalDays != null && rule.minIntervalDays > 0;
    const hasPriceRule =
      rule.dropTriggerPct != null && Number(rule.dropTriggerPct) > 0;

    let timeMet = !hasTimeRule;
    if (hasTimeRule) {
      const requiredMs = rule.minIntervalDays! * 24 * 3600_000;
      timeMet = nowMs - prevStepAnchorMs >= requiredMs;
    }

    let priceMet = false;
    let triggerBlockedReason: string | undefined;
    let observedDropPct: number | undefined;
    let referencePriceRial: Rational | null = null;

    if (hasPriceRule) {
      if (currentUnitPriceRial === null) {
        triggerBlockedReason = 'قیمت فعلی برای بررسی محرک افت ثبت نشده است';
      } else if (isPriceStale) {
        triggerBlockedReason = 'آخرین قیمت قدیمی است؛ محرک قیمتی با نرخ قدیمی فعال نمی‌شود';
      } else {
        const refType = rule.dropReference ?? 'HIGH_WATERMARK';
        referencePriceRial = resolveDropReferencePrice(
          refType,
          rule,
          plan,
          asset,
          replay,
          snapshots,
          nowMs
        );
        if (!referencePriceRial || !R.isPos(referencePriceRial)) {
          triggerBlockedReason = 'قیمت مبنای افت هنوز در دسترس نیست';
        } else {
          const refNum = R.toNumber(referencePriceRial);
          const curNum = R.toNumber(currentUnitPriceRial);
          observedDropPct = ((refNum - curNum) / refNum) * 100;
          priceMet = observedDropPct >= Number(rule.dropTriggerPct);
        }
      }
    } else {
      priceMet = true;
    }

    let isTriggered = false;
    if (plan.status === 'ACTIVE' && hasRemaining && !nextCandidateAssigned) {
      if (!hasTimeRule && !hasPriceRule) {
        isTriggered = true;
      } else if (rule.combinator === 'AND') {
        isTriggered = timeMet && priceMet;
      } else {
        // OR: at least one configured rule is met
        isTriggered = (hasTimeRule && timeMet) || (hasPriceRule && priceMet);
      }
    }

    let status: DcaStepStatus;
    if (!hasRemaining && hasExecuted) {
      status = 'COMPLETED';
      completedStepsCount += 1;
      if (lastExecutedAtMs != null) prevStepAnchorMs = lastExecutedAtMs;
    } else if (hasExecuted && hasRemaining) {
      status = 'PARTIAL';
      partialStepsCount += 1;
      nextCandidateAssigned = true;
    } else if (isTriggered) {
      status = 'READY';
      nextCandidateAssigned = true;
    } else {
      status = 'WAITING';
      if (!nextCandidateAssigned) nextCandidateAssigned = true;
    }

    evaluatedSteps.push({
      rule,
      status,
      plannedBudgetRial,
      executedRial,
      remainingBudgetRial,
      activeRecordIds,
      lastExecutedAtMs,
      timeMet,
      priceMet,
      isTriggered,
      triggerBlockedReason,
      observedDropPct,
      referencePriceRial,
    });
  }

  const totalBudgetRial = R.fromInt(plan.totalBudgetRial);
  const remainingBudgetRial =
    R.cmp(totalBudgetRial, totalExecutedRial) > 0
      ? R.sub(totalBudgetRial, totalExecutedRial)
      : R.zero;

  const nextActionableStep =
    evaluatedSteps.find(s => s.status === 'READY' || s.status === 'PARTIAL') ??
    evaluatedSteps.find(s => s.status === 'WAITING') ??
    null;

  return {
    plan,
    totalBudgetRial,
    totalExecutedRial,
    remainingBudgetRial,
    completedStepsCount,
    partialStepsCount,
    steps: evaluatedSteps,
    nextActionableStep,
    currentUnitPriceRial,
    isPriceStale,
    priceObservedAtMs,
  };
}
