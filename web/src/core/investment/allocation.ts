import { R, type Rational } from './rational';
import type { AssetReplayResult, AssetValuation, PortfolioSummary } from './replay';
import type { AllocationCategory, Asset, AssetKind, TargetAllocation } from './types';

export const ALLOCATION_CATEGORY_LABELS: Record<AllocationCategory, string> = {
  GOLD: 'طلا (آب‌شده، سکه، زینتی)',
  SILVER: 'نقره',
  CURRENCY: 'ارز نقد',
  CRYPTO: 'رمزارز',
  OTHER: 'سایر دارایی‌ها',
  CASH_RESERVE: 'ذخیرهٔ نقد',
};

export function assetKindToAllocationCategory(kind: AssetKind): Exclude<AllocationCategory, 'CASH_RESERVE'> {
  switch (kind) {
    case 'GOLD_MELTED':
    case 'GOLD_COIN':
    case 'GOLD_JEWELRY':
      return 'GOLD';
    case 'SILVER':
      return 'SILVER';
    case 'CURRENCY':
      return 'CURRENCY';
    case 'CRYPTO':
      return 'CRYPTO';
    case 'OTHER':
      return 'OTHER';
  }
}

export interface AllocationCategorySlice {
  category: AllocationCategory;
  labelFa: string;
  targetPct: number;
  actualRial: Rational;
  actualPct: number | null;
  deviationPct: number | null;
  rebalanceDeltaRial: Rational | null;
}

export interface AssetConcentrationItem {
  assetId: string;
  assetName: string;
  valueRial: Rational;
  sharePct: number | null;
  exceedsThreshold: boolean;
}

export interface PortfolioAllocationReport {
  allocation: TargetAllocation | null;
  isComplete: boolean;
  incompleteReasons: string[];
  cashReserveRial: Rational;
  investedMarketValueRial: Rational;
  totalWithCashRial: Rational | null;
  slices: AllocationCategorySlice[];
  topConcentrations: AssetConcentrationItem[];
  hasConcentrationWarning: boolean;
}

export function validateTargetPercentages(
  targetsPct: Partial<Record<AllocationCategory, number>>
): void {
  let sum = 0;
  for (const val of Object.values(targetsPct)) {
    if (val == null) continue;
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      throw new Error('هر درصد هدف باید بین ۰ تا ۱۰۰ باشد');
    }
    sum += val;
  }
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error('مجموع درصدهای ترکیب هدف (به‌همراه ذخیرهٔ نقد) باید دقیقاً ۱۰۰٪ باشد');
  }
}

export function evaluatePortfolioAllocation(params: {
  allocation: TargetAllocation | null;
  positions: Array<{ asset: Asset; replay: AssetReplayResult; valuation: AssetValuation }>;
  summary: PortfolioSummary;
  cashReserveRial: Rational;
}): PortfolioAllocationReport {
  const { allocation, positions, summary, cashReserveRial } = params;

  const incompleteReasons: string[] = [];
  if (summary.needsReviewAssetsCount > 0) {
    incompleteReasons.push(
      `${summary.needsReviewAssetsCount} دارایی در وضعیت «نیازمند بررسی» است.`
    );
  }
  if (summary.unpricedAssetsCount > 0) {
    incompleteReasons.push(
      `${summary.unpricedAssetsCount} دارایی دارای موجودی هنوز قیمت معتبر ندارد.`
    );
  }

  const isComplete = summary.hasDefiniteTotalValue;
  const investedMarketValueRial = summary.pricedMarketValueRial;
  const totalWithCashRial = isComplete
    ? R.add(investedMarketValueRial, cashReserveRial)
    : null;

  const categories: AllocationCategory[] = [
    'GOLD',
    'SILVER',
    'CURRENCY',
    'CRYPTO',
    'OTHER',
    'CASH_RESERVE',
  ];

  const actualByCategory = new Map<AllocationCategory, Rational>();
  for (const c of categories) actualByCategory.set(c, R.zero);
  actualByCategory.set('CASH_RESERVE', cashReserveRial);

  const heldPricedPositions: Array<{ asset: Asset; valueRial: Rational }> = [];
  for (const pos of positions) {
    if (pos.replay.status === 'NEEDS_REVIEW' || !pos.valuation.hasHoldings) continue;
    if (!pos.valuation.priced || pos.valuation.estimatedSaleRial === null) continue;
    const cat = assetKindToAllocationCategory(pos.asset.kind);
    actualByCategory.set(
      cat,
      R.add(actualByCategory.get(cat) ?? R.zero, pos.valuation.estimatedSaleRial)
    );
    heldPricedPositions.push({
      asset: pos.asset,
      valueRial: pos.valuation.estimatedSaleRial,
    });
  }

  const totalNum =
    totalWithCashRial !== null && R.isPos(totalWithCashRial)
      ? R.toNumber(totalWithCashRial)
      : 0;

  const slices: AllocationCategorySlice[] = categories.map(cat => {
    const actualRial = actualByCategory.get(cat) ?? R.zero;
    const targetPct = allocation?.targetsPct?.[cat] ?? 0;

    if (!isComplete || totalWithCashRial === null || totalNum <= 0) {
      return {
        category: cat,
        labelFa: ALLOCATION_CATEGORY_LABELS[cat],
        targetPct,
        actualRial,
        actualPct: null,
        deviationPct: null,
        rebalanceDeltaRial: null,
      };
    }

    const actualNum = R.toNumber(actualRial);
    const actualPct = (actualNum / totalNum) * 100;
    const deviationPct = allocation ? actualPct - targetPct : null;
    const targetRial = R.div(
      R.mul(totalWithCashRial, R.fromDecimal(String(targetPct))),
      R.fromInt(100)
    );
    const rebalanceDeltaRial = allocation ? R.sub(targetRial, actualRial) : null;

    return {
      category: cat,
      labelFa: ALLOCATION_CATEGORY_LABELS[cat],
      targetPct,
      actualRial,
      actualPct,
      deviationPct,
      rebalanceDeltaRial,
    };
  });

  const thresholdPct = allocation?.concentrationWarningPct ?? 50;
  const topConcentrations: AssetConcentrationItem[] = heldPricedPositions
    .map(item => {
      const sharePct =
        isComplete && totalNum > 0 ? (R.toNumber(item.valueRial) / totalNum) * 100 : null;
      return {
        assetId: item.asset.id,
        assetName: item.asset.name,
        valueRial: item.valueRial,
        sharePct,
        exceedsThreshold: sharePct !== null && sharePct > thresholdPct,
      };
    })
    .sort((a, b) => R.cmp(b.valueRial, a.valueRial));

  return {
    allocation,
    isComplete,
    incompleteReasons,
    cashReserveRial,
    investedMarketValueRial,
    totalWithCashRial,
    slices,
    topConcentrations,
    hasConcentrationWarning: topConcentrations.some(c => c.exceedsThreshold),
  };
}
