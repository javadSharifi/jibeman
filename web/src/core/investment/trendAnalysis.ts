import { convertPriceSnapshotToAssetUnit } from './formulas';
import { R, type Rational } from './rational';
import { getTehranDateParts, listTehranMarketDays } from './tehranDate';
import type { Asset, PriceSnapshot, QuoteSide } from './types';

export type TrendWindow = '24H' | '7D' | '30D' | '90D';
export type DataQualityGrade = 'GOOD' | 'LIMITED' | 'INSUFFICIENT';

export interface DataQualityReport {
  window: TrendWindow;
  grade: DataQualityGrade;
  sampleCount: number;
  expectedDays: number;
  coveredDays: number;
  coverageRatio: number;
  maxGapDays: number;
  isIntradaySatisfied: boolean;
  distinctSources: string[];
  distinctQuoteSides: QuoteSide[];
  hasSourceSwitch: boolean;
  hasQuoteSideMix: boolean;
  hasDerivedOrConvertedRate: boolean;
  reasons: string[];
}

export interface DescriptiveTrendMetrics {
  sufficient: boolean;
  insufficientReason?: string;
  periodReturnPct: number | null;
  highRial: Rational | null;
  lowRial: Rational | null;
  movingAverageRial: Rational | null;
  distanceFromMaPct: number | null;
  volatilityPct: number | null;
  zScore: number | null;
  zScoreReason?: string;
}

export interface ConditionalStatsReport {
  sufficient: boolean;
  insufficientReason?: string;
  eventDefinitionFa: string;
  horizonDays: number;
  independentEventCount: number;
  completeSampleCount: number;
  medianReturnPct: number | null;
  p25ReturnPct: number | null;
  p75ReturnPct: number | null;
  sourceSwitchCaveat: boolean;
}

export interface AssetTrendAnalysis {
  window: TrendWindow;
  quality: DataQualityReport;
  descriptive: DescriptiveTrendMetrics;
  conditional: ConditionalStatsReport;
  disclaimerFa: string;
}

const QUOTE_PRIORITY: Record<QuoteSide, number> = {
  DEALER_BID: 0,
  REFERENCE: 1,
  DEALER_ASK: 2,
};

const TREND_DISCLAIMER_FA =
  'این شاخص‌ها صرفاً برای مشاهدهٔ تاریخچه و مدیریت ریسک هستند و نرخ حاصل از تبدیل یا تعویض منبع، اثر علّی یا سیگنال قطعی معامله نیست.';

function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function meanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return { mean, stdDev: Math.sqrt(variance) };
}

function windowDays(window: TrendWindow): number {
  switch (window) {
    case '24H':
      return 1;
    case '7D':
      return 7;
    case '30D':
      return 30;
    case '90D':
      return 90;
  }
}

function maxAllowedGapDays(window: TrendWindow): number {
  switch (window) {
    case '24H':
      return 0;
    case '7D':
      return 2;
    case '30D':
      return 7;
    case '90D':
      return 14;
  }
}

export function analyzeAssetTrend(
  asset: Asset,
  snapshots: PriceSnapshot[],
  window: TrendWindow = '30D',
  nowMs = Date.now()
): AssetTrendAnalysis {
  const compatible = snapshots
    .filter(s => s.instrumentKey === asset.instrumentKey && s.quoteSide !== 'DEALER_ASK')
    .map(s => ({
      snapshot: s,
      unitPriceRial: convertPriceSnapshotToAssetUnit(s, asset),
      converted:
        s.method === 'DERIVED' ||
        (asset.baseUnit === 'GRAM' &&
          (s.unit !== 'GRAM' ||
            (asset.pricingSpec.referenceFineness != null &&
              s.fineness != null &&
              s.fineness !== asset.pricingSpec.referenceFineness))),
    }))
    .filter(
      (x): x is { snapshot: PriceSnapshot; unitPriceRial: Rational; converted: boolean } =>
        x.unitPriceRial !== null && R.isPos(x.unitPriceRial)
    )
    .sort((a, b) => a.snapshot.observedAtMs - b.snapshot.observedAtMs);

  const daysCount = windowDays(window);
  const windowStartMs =
    window === '24H' ? nowMs - 24 * 3600_000 : listTehranMarketDays(nowMs, daysCount)[0].startMs;
  const inWindow = compatible.filter(
    x => x.snapshot.observedAtMs >= windowStartMs && x.snapshot.observedAtMs <= nowMs
  );

  const distinctSources = Array.from(new Set(inWindow.map(x => x.snapshot.sourceId)));
  const distinctQuoteSides = Array.from(new Set(inWindow.map(x => x.snapshot.quoteSide)));
  const hasSourceSwitch = distinctSources.length > 1;
  const hasQuoteSideMix = distinctQuoteSides.length > 1;
  const hasDerivedOrConvertedRate = inWindow.some(x => x.converted);

  // Build daily Tehran series for the requested window (or intraday check for 24H)
  const calendarDays = listTehranMarketDays(nowMs, daysCount);
  const byDay = new Map<
    string,
    Array<{ snapshot: PriceSnapshot; unitPriceRial: Rational }>
  >();

  for (const item of inWindow) {
    const { dayKey } = getTehranDateParts(item.snapshot.observedAtMs);
    const list = byDay.get(dayKey) ?? [];
    list.push({ snapshot: item.snapshot, unitPriceRial: item.unitPriceRial });
    byDay.set(dayKey, list);
  }

  const dailyPoints = calendarDays.map(day => {
    const list = byDay.get(day.dayKey);
    if (!list || list.length === 0) {
      return { dayKey: day.dayKey, unitPriceRial: null as Rational | null, priceNum: null as number | null };
    }
    list.sort((a, b) => {
      const pa = QUOTE_PRIORITY[a.snapshot.quoteSide];
      const pb = QUOTE_PRIORITY[b.snapshot.quoteSide];
      if (pa !== pb) return pa - pb;
      return b.snapshot.observedAtMs - a.snapshot.observedAtMs;
    });
    const r = list[0].unitPriceRial;
    return { dayKey: day.dayKey, unitPriceRial: r, priceNum: R.toNumber(r) };
  });

  // Gap and coverage calculation
  let coveredDays = 0;
  let maxGapDays = 0;
  let currentGap = 0;
  for (const p of dailyPoints) {
    if (p.unitPriceRial !== null) {
      coveredDays += 1;
      currentGap = 0;
    } else {
      currentGap += 1;
      if (currentGap > maxGapDays) maxGapDays = currentGap;
    }
  }
  const coverageRatio = daysCount > 0 ? coveredDays / daysCount : 0;

  // Intraday check for 24H: must have >= 3 distinct observed timestamps spanning >= 6 hours,
  // with consecutive points separated (not duplicate identical timestamps).
  let isIntradaySatisfied = true;
  if (window === '24H') {
    const uniqueTimestamps = Array.from(new Set(inWindow.map(x => x.snapshot.observedAtMs))).sort(
      (a, b) => a - b
    );
    const spanMs =
      uniqueTimestamps.length >= 2
        ? uniqueTimestamps[uniqueTimestamps.length - 1] - uniqueTimestamps[0]
        : 0;
    isIntradaySatisfied = uniqueTimestamps.length >= 3 && spanMs >= 6 * 3600_000;
  }

  const reasons: string[] = [];
  if (window === '24H' && !isIntradaySatisfied) {
    reasons.push('بازهٔ ۲۴ ساعته نیازمند حداقل ۳ نرخ درون‌روزی با پراکندگی زمانی است؛ صرف تعداد ردیف کافی نیست.');
  }
  if (window !== '24H') {
    if (coveredDays < 3) {
      reasons.push('تعداد روزهای دارای نرخ معتبر کمتر از ۳ روز است.');
    }
    if (coverageRatio < 0.5) {
      reasons.push('پوشش زمانی بازه کمتر از ۵۰٪ است.');
    }
    if (maxGapDays > maxAllowedGapDays(window)) {
      reasons.push(`بیشینهٔ شکاف پیوسته (${maxGapDays} روز) از حد مجاز این بازه بیشتر است.`);
    }
  }
  if (hasSourceSwitch) {
    reasons.push('منابع قیمت در این بازه تغییر کرده یا ترکیب شده‌اند.');
  }
  if (hasQuoteSideMix) {
    reasons.push('سمت نرخ (خرید بازار و نرخ مرجع) در این بازه ترکیب شده‌اند.');
  }
  if (hasDerivedOrConvertedRate) {
    reasons.push('بخشی از نرخ‌ها از تبدیل واحد یا عیار (مثل مظنه به گرم) به دست آمده است.');
  }

  let grade: DataQualityGrade = 'GOOD';
  if (
    (window === '24H' && !isIntradaySatisfied) ||
    (window !== '24H' &&
      (coveredDays < 3 || coverageRatio < 0.5 || maxGapDays > maxAllowedGapDays(window)))
  ) {
    grade = 'INSUFFICIENT';
  } else if (hasSourceSwitch || hasQuoteSideMix || hasDerivedOrConvertedRate || coverageRatio < 0.85) {
    grade = 'LIMITED';
  }

  const quality: DataQualityReport = {
    window,
    grade,
    sampleCount: inWindow.length,
    expectedDays: daysCount,
    coveredDays,
    coverageRatio,
    maxGapDays,
    isIntradaySatisfied,
    distinctSources,
    distinctQuoteSides,
    hasSourceSwitch,
    hasQuoteSideMix,
    hasDerivedOrConvertedRate,
    reasons,
  };

  // Descriptive metrics
  let descriptive: DescriptiveTrendMetrics;
  if (grade === 'INSUFFICIENT') {
    descriptive = {
      sufficient: false,
      insufficientReason:
        window === '24H'
          ? 'دادهٔ درون‌روزی کافی برای تحلیل ۲۴ ساعته موجود نیست.'
          : 'پوشش داده یا پیوستگی تاریخی برای محاسبهٔ شاخص‌های توصیفی کافی نیست.',
      periodReturnPct: null,
      highRial: null,
      lowRial: null,
      movingAverageRial: null,
      distanceFromMaPct: null,
      volatilityPct: null,
      zScore: null,
      zScoreReason: 'تاریخچه ناکافی',
    };
  } else {
    const series =
      window === '24H'
        ? inWindow.map(x => ({
            unitPriceRial: x.unitPriceRial,
            priceNum: R.toNumber(x.unitPriceRial),
          }))
        : dailyPoints.filter(
            (p): p is { dayKey: string; unitPriceRial: Rational; priceNum: number } =>
              p.unitPriceRial !== null && p.priceNum !== null
          );

    const first = series[0];
    const last = series[series.length - 1];
    const periodReturnPct =
      series.length >= 2 && first.priceNum > 0
        ? ((last.priceNum - first.priceNum) / first.priceNum) * 100
        : null;

    let highRial = series[0].unitPriceRial;
    let lowRial = series[0].unitPriceRial;
    let sumRial = R.zero;
    for (const p of series) {
      if (R.cmp(p.unitPriceRial, highRial) > 0) highRial = p.unitPriceRial;
      if (R.cmp(p.unitPriceRial, lowRial) < 0) lowRial = p.unitPriceRial;
      sumRial = R.add(sumRial, p.unitPriceRial);
    }

    const movingAverageRial = R.div(sumRial, R.fromInt(series.length));
    const maNum = R.toNumber(movingAverageRial);
    const distanceFromMaPct =
      maNum > 0 ? ((last.priceNum - maNum) / maNum) * 100 : null;

    // Volatility on consecutive non-gap returns
    const returnsPct: number[] = [];
    if (window === '24H') {
      for (let i = 1; i < series.length; i++) {
        const prev = series[i - 1].priceNum;
        const cur = series[i].priceNum;
        if (prev > 0) returnsPct.push(((cur - prev) / prev) * 100);
      }
    } else {
      for (let i = 1; i < dailyPoints.length; i++) {
        const prev = dailyPoints[i - 1].priceNum;
        const cur = dailyPoints[i].priceNum;
        if (prev != null && cur != null && prev > 0) {
          returnsPct.push(((cur - prev) / prev) * 100);
        }
      }
    }

    const volatilityPct =
      returnsPct.length >= 3 ? meanAndStdDev(returnsPct).stdDev : null;

    // Z-Score of percentage distance from rolling moving average
    // Standardizes current % distance from MA against historical dispersion of that same % distance.
    const maLookback = Math.min(7, Math.max(3, Math.floor(series.length / 2)));
    const distanceHistory: number[] = [];
    for (let i = maLookback - 1; i < series.length; i++) {
      const slice = series.slice(i - maLookback + 1, i + 1);
      const sliceMean = slice.reduce((a, b) => a + b.priceNum, 0) / slice.length;
      if (sliceMean > 0) {
        distanceHistory.push(((series[i].priceNum - sliceMean) / sliceMean) * 100);
      }
    }

    let zScore: number | null = null;
    let zScoreReason: string | undefined;
    if (distanceHistory.length < 5) {
      zScoreReason = 'تاریخچه برای محاسبهٔ Z-Score کافی نیست.';
    } else {
      const { mean, stdDev } = meanAndStdDev(distanceHistory);
      if (stdDev === 0 || !Number.isFinite(stdDev)) {
        zScoreReason = 'واریانس تاریخی صفر است (خروجی نامعلوم).';
      } else {
        const currentDist = distanceHistory[distanceHistory.length - 1];
        zScore = (currentDist - mean) / stdDev;
      }
    }

    descriptive = {
      sufficient: true,
      periodReturnPct,
      highRial,
      lowRial,
      movingAverageRial,
      distanceFromMaPct,
      volatilityPct,
      zScore,
      zScoreReason,
    };
  }

  // Conditional historical statistics across ALL available daily history for this asset
  const conditional = computeConditionalPullbackStats(asset, compatible, nowMs);

  return {
    window,
    quality,
    descriptive,
    conditional,
    disclaimerFa: TREND_DISCLAIMER_FA,
  };
}

/**
 * Evaluates independent, non-overlapping pullback events (>= 3% drop from 14-day rolling peak)
 * and measures 7-day forward complete-sample return quantiles (P25, P50 median, P75).
 */
export function computeConditionalPullbackStats(
  asset: Asset,
  compatibleSorted: Array<{ snapshot: PriceSnapshot; unitPriceRial: Rational; converted: boolean }>,
  nowMs = Date.now()
): ConditionalStatsReport {
  const horizonDays = 7;
  const peakWindowDays = 14;
  const pullbackThresholdPct = 3;
  const eventDefinitionFa = `افت حداقل ${pullbackThresholdPct}٪ از سقف ${peakWindowDays} روزه با پنجرهٔ بازده ${horizonDays} روزه (بدون هم‌پوشانی موج‌ها)`;

  if (compatibleSorted.length === 0) {
    return {
      sufficient: false,
      insufficientReason: 'داده‌ای برای آمار شرطی ثبت نشده است.',
      eventDefinitionFa,
      horizonDays,
      independentEventCount: 0,
      completeSampleCount: 0,
      medianReturnPct: null,
      p25ReturnPct: null,
      p75ReturnPct: null,
      sourceSwitchCaveat: false,
    };
  }

  const firstMs = compatibleSorted[0].snapshot.observedAtMs;
  const totalSpanDays = Math.min(365, Math.max(1, Math.ceil((nowMs - firstMs) / (24 * 3600_000)) + 1));
  const calendar = listTehranMarketDays(nowMs, totalSpanDays);

  const byDay = new Map<string, Array<{ snapshot: PriceSnapshot; priceNum: number }>>();
  for (const item of compatibleSorted) {
    const { dayKey } = getTehranDateParts(item.snapshot.observedAtMs);
    const list = byDay.get(dayKey) ?? [];
    list.push({ snapshot: item.snapshot, priceNum: R.toNumber(item.unitPriceRial) });
    byDay.set(dayKey, list);
  }

  const daily = calendar.map(day => {
    const list = byDay.get(day.dayKey);
    if (!list || list.length === 0) return null;
    list.sort((a, b) => {
      const pa = QUOTE_PRIORITY[a.snapshot.quoteSide];
      const pb = QUOTE_PRIORITY[b.snapshot.quoteSide];
      if (pa !== pb) return pa - pb;
      return b.snapshot.observedAtMs - a.snapshot.observedAtMs;
    });
    return list[0];
  });

  const distinctSources = new Set(compatibleSorted.map(x => x.snapshot.sourceId));
  const distinctSides = new Set(compatibleSorted.map(x => x.snapshot.quoteSide));
  const sourceSwitchCaveat =
    distinctSources.size > 1 ||
    distinctSides.size > 1 ||
    compatibleSorted.some(x => x.converted);

  let independentEventCount = 0;
  const forwardReturns: number[] = [];
  let cooldownUntilIdx = -1;

  for (let i = 0; i < daily.length; i++) {
    const cur = daily[i];
    if (!cur || cur.priceNum <= 0) continue;
    // Non-overlapping wave rule: skip days inside the active event horizon window
    if (i <= cooldownUntilIdx) continue;

    // Find rolling 14-day peak up to i
    let peak = 0;
    const startLookback = Math.max(0, i - peakWindowDays + 1);
    let priorPoints = 0;
    for (let j = startLookback; j <= i; j++) {
      const pt = daily[j];
      if (pt && pt.priceNum > 0) {
        priorPoints += 1;
        if (pt.priceNum > peak) peak = pt.priceNum;
      }
    }
    if (priorPoints < 3 || peak <= 0) continue;

    const drawdownPct = ((peak - cur.priceNum) / peak) * 100;
    if (drawdownPct >= pullbackThresholdPct) {
      independentEventCount += 1;
      // Lock out overlapping days of the same wave until t + horizonDays completes
      cooldownUntilIdx = i + horizonDays;

      const futureIdx = i + horizonDays;
      if (futureIdx < daily.length) {
        const futurePt = daily[futureIdx];
        if (futurePt && futurePt.priceNum > 0) {
          forwardReturns.push(((futurePt.priceNum - cur.priceNum) / cur.priceNum) * 100);
        }
      }
    }
  }

  const completeSampleCount = forwardReturns.length;
  if (completeSampleCount < 3) {
    return {
      sufficient: false,
      insufficientReason: `تعداد نمونهٔ کامل مستقل (${completeSampleCount} از حداقل ۳ مورد) برای آمار شرطی کافی نیست.`,
      eventDefinitionFa,
      horizonDays,
      independentEventCount,
      completeSampleCount,
      medianReturnPct: null,
      p25ReturnPct: null,
      p75ReturnPct: null,
      sourceSwitchCaveat,
    };
  }

  const sorted = [...forwardReturns].sort((a, b) => a - b);
  return {
    sufficient: true,
    eventDefinitionFa,
    horizonDays,
    independentEventCount,
    completeSampleCount,
    medianReturnPct: percentileSorted(sorted, 0.5),
    p25ReturnPct: percentileSorted(sorted, 0.25),
    p75ReturnPct: percentileSorted(sorted, 0.75),
    sourceSwitchCaveat,
  };
}
