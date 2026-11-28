import { R, type Rational } from './rational';
import type {
  Asset,
  PriceSnapshot,
  TradeFeesRial,
  TradeSnapshotPayload,
  TradeUnit,
} from './types';

export const MESGHAL_GRAM_STR = '4.6083';
export const MESGHAL_GRAM = R.fromDecimal(MESGHAL_GRAM_STR);
export const MAZANEH_FINENESS = 705;
export const GOLD_18K_FINENESS = 750;
export const TROY_OUNCE_GRAM_STR = '31.1034768';
export const TROY_OUNCE_GRAM = R.fromDecimal(TROY_OUNCE_GRAM_STR);

export function normalizeWeightToReferenceFineness(
  massGram: Rational,
  actualFineness: number,
  referenceFineness: number
): Rational {
  if (actualFineness <= 0 || referenceFineness <= 0) {
    throw new Error('Fineness must be positive');
  }
  return R.div(
    R.mul(massGram, R.fromInt(actualFineness)),
    R.fromInt(referenceFineness)
  );
}

/**
 * Price per gram at targetFineness derived from Mazaneh (1 mesghal = 4.6083g at 705 fineness).
 * pricePerGramAtFineness = mazaneh / 4.6083 * targetFineness / quoteFineness
 */
export function mazanehToPricePerGram(
  mazanehRial: Rational,
  targetFineness = GOLD_18K_FINENESS,
  quoteFineness = MAZANEH_FINENESS
): Rational {
  if (targetFineness <= 0 || quoteFineness <= 0) {
    throw new Error('Fineness must be positive');
  }
  return R.div(
    R.mul(mazanehRial, R.fromInt(targetFineness)),
    R.mul(MESGHAL_GRAM, R.fromInt(quoteFineness))
  );
}

export function sumTradeFeesRial(fees?: TradeFeesRial): bigint {
  if (!fees) return 0n;
  const fields = [fees.wage, fees.sellerProfit, fees.tax, fees.commission, fees.other];
  let total = 0n;
  for (const f of fields) {
    if (f == null || f.trim() === '') continue;
    const val = R.fromInt(f);
    if (R.isNeg(val)) throw new Error('Fee cannot be negative');
    total += val.num;
  }
  return total;
}

export function computeTradeSettlementRial(
  payload: TradeSnapshotPayload,
  kind: 'OPENING' | 'BUY' | 'SELL'
): { settlementRial: Rational; costKnown: boolean } {
  if (kind === 'OPENING' && !payload.costKnown) {
    return { settlementRial: R.zero, costKnown: false };
  }

  if (payload.settlementRial != null && payload.settlementRial.trim() !== '') {
    const settlement = R.fromInt(payload.settlementRial);
    if (R.isNeg(settlement)) throw new Error('Settlement amount cannot be negative');
    return { settlementRial: settlement, costKnown: true };
  }

  const principal =
    payload.principalRial != null && payload.principalRial.trim() !== ''
      ? R.fromInt(payload.principalRial)
      : R.zero;
  if (R.isNeg(principal)) throw new Error('Principal amount cannot be negative');

  const fees = R.fromInt(sumTradeFeesRial(payload.feesRial));
  if (payload.invoiceIncludesFees) {
    return { settlementRial: principal, costKnown: true };
  }

  if (kind === 'SELL') {
    const net = R.sub(principal, fees);
    if (R.isNeg(net)) throw new Error('Net sale proceeds cannot be negative');
    return { settlementRial: net, costKnown: true };
  }

  return { settlementRial: R.add(principal, fees), costKnown: true };
}

export function getEffectiveRawQuantity(payload: TradeSnapshotPayload): Rational {
  if (payload.grossMassGram != null && payload.grossMassGram.trim() !== '') {
    const gross = R.fromDecimal(payload.grossMassGram);
    const attachments =
      payload.attachmentsGram != null && payload.attachmentsGram.trim() !== ''
        ? R.fromDecimal(payload.attachmentsGram)
        : R.zero;
    const net = R.sub(gross, attachments);
    if (!R.isPos(net)) {
      throw new Error('وزن خالص فلز پس از کسر سنگ و متعلقات باید مثبت باشد');
    }
    return net;
  }
  const qty = R.fromDecimal(payload.quantity);
  if (!R.isPos(qty)) {
    throw new Error('مقدار معامله باید بزرگ‌تر از صفر باشد');
  }
  return qty;
}

/**
 * Normalizes a trade's quantity into the asset's baseUnit and reference fineness.
 */
export function normalizeQuantityForAsset(
  asset: Asset,
  payload: TradeSnapshotPayload
): Rational {
  const rawQty = getEffectiveRawQuantity(payload);

  if (asset.baseUnit === 'COUNT' || asset.baseUnit === 'UNIT') {
    if (payload.unit !== asset.baseUnit && payload.unit !== 'UNIT' && payload.unit !== 'COUNT') {
      throw new Error(`واحد ${payload.unit} با واحد پایه دارایی (${asset.baseUnit}) سازگار نیست`);
    }
    return rawQty;
  }

  // asset.baseUnit === 'GRAM'
  let massGram: Rational;
  let effectiveFineness = payload.fineness ?? asset.pricingSpec.referenceFineness;

  if (payload.unit === 'GRAM') {
    massGram = rawQty;
  } else if (payload.unit === 'MESGHAL') {
    massGram = R.mul(rawQty, MESGHAL_GRAM);
    if (payload.fineness == null) effectiveFineness = MAZANEH_FINENESS;
  } else if (payload.unit === 'TROY_OUNCE') {
    massGram = R.mul(rawQty, TROY_OUNCE_GRAM);
  } else {
    throw new Error(`واحد ${payload.unit} به گرم قابل تبدیل نیست`);
  }

  const refFineness = asset.pricingSpec.referenceFineness;
  if (refFineness != null && effectiveFineness != null && effectiveFineness !== refFineness) {
    return normalizeWeightToReferenceFineness(massGram, effectiveFineness, refFineness);
  }
  return massGram;
}

/**
 * Converts a price snapshot into Rial per 1 baseUnit of the asset.
 * Returns null if the snapshot unit/fineness is incompatible with the asset.
 */
export function convertPriceSnapshotToAssetUnit(
  snapshot: PriceSnapshot,
  asset: Asset
): Rational | null {
  const amount = R.fromDecimal(snapshot.amount);
  if (R.isNeg(amount)) return null;

  if (asset.baseUnit === 'COUNT' || asset.baseUnit === 'UNIT') {
    if (snapshot.unit === asset.baseUnit || snapshot.unit === 'UNIT' || snapshot.unit === 'COUNT') {
      return amount;
    }
    return null;
  }

  // asset.baseUnit === 'GRAM'
  const refFineness = asset.pricingSpec.referenceFineness;
  if (snapshot.unit === 'MESGHAL') {
    const quoteFineness = snapshot.fineness ?? MAZANEH_FINENESS;
    const targetFineness = refFineness ?? GOLD_18K_FINENESS;
    return mazanehToPricePerGram(amount, targetFineness, quoteFineness);
  }

  if (snapshot.unit === 'GRAM') {
    if (refFineness != null && snapshot.fineness != null && snapshot.fineness !== refFineness) {
      return R.div(
        R.mul(amount, R.fromInt(refFineness)),
        R.fromInt(snapshot.fineness)
      );
    }
    return amount;
  }

  if (snapshot.unit === 'TROY_OUNCE') {
    const perGramAtQuoteFineness = R.div(amount, TROY_OUNCE_GRAM);
    if (refFineness != null && snapshot.fineness != null && snapshot.fineness !== refFineness) {
      return R.div(
        R.mul(perGramAtQuoteFineness, R.fromInt(refFineness)),
        R.fromInt(snapshot.fineness)
      );
    }
    return perGramAtQuoteFineness;
  }

  return null;
}

export function computeCoinIntrinsicAndBubble(params: {
  coinNetMassGram: string | Rational;
  coinFineness: number;
  referenceFineness: number;
  compatibleGoldPerGramRial: Rational;
  coinReferencePriceRial?: Rational;
}): {
  intrinsicValueRial: Rational;
  bubbleRial: Rational | null;
} {
  const mass =
    typeof params.coinNetMassGram === 'string'
      ? R.fromDecimal(params.coinNetMassGram)
      : params.coinNetMassGram;
  const equivGram = normalizeWeightToReferenceFineness(
    mass,
    params.coinFineness,
    params.referenceFineness
  );
  const intrinsicValueRial = R.mul(equivGram, params.compatibleGoldPerGramRial);
  const bubbleRial = params.coinReferencePriceRial
    ? R.sub(params.coinReferencePriceRial, intrinsicValueRial)
    : null;
  return { intrinsicValueRial, bubbleRial };
}

export interface JewelryEstimateResult {
  metalValueRial: Rational;
  estimatedNetSaleRial: Rational | null;
  mode: 'NET_RATE' | 'ESTIMATE_WITH_HAIRCUT' | 'METAL_ONLY_NEEDS_INFO';
  assumedHaircutRate?: string;
  fixedSellingFeeRial?: Rational;
}

export function computeJewelryEstimate(params: {
  equivalentGram: Rational;
  compatiblePerGramRial: Rational;
  isNetDealerRate?: boolean;
  haircutRate?: string;
  fixedSellingFeeRial?: string;
}): JewelryEstimateResult {
  const metalValueRial = R.mul(params.equivalentGram, params.compatiblePerGramRial);
  const fixedFee =
    params.fixedSellingFeeRial != null && params.fixedSellingFeeRial.trim() !== ''
      ? R.fromInt(params.fixedSellingFeeRial)
      : R.zero;

  if (params.isNetDealerRate) {
    const net = R.sub(metalValueRial, fixedFee);
    if (R.isNeg(net)) {
      return {
        metalValueRial,
        estimatedNetSaleRial: null,
        mode: 'METAL_ONLY_NEEDS_INFO',
        fixedSellingFeeRial: fixedFee,
      };
    }
    return {
      metalValueRial,
      estimatedNetSaleRial: net,
      mode: 'NET_RATE',
      fixedSellingFeeRial: fixedFee,
    };
  }

  if (params.haircutRate == null || params.haircutRate.trim() === '') {
    return {
      metalValueRial,
      estimatedNetSaleRial: null,
      mode: 'METAL_ONLY_NEEDS_INFO',
      fixedSellingFeeRial: fixedFee,
    };
  }

  const haircut = R.fromDecimal(params.haircutRate);
  if (R.isNeg(haircut) || R.cmp(haircut, R.one) >= 0) {
    return {
      metalValueRial,
      estimatedNetSaleRial: null,
      mode: 'METAL_ONLY_NEEDS_INFO',
      fixedSellingFeeRial: fixedFee,
    };
  }

  const afterHaircut = R.mul(metalValueRial, R.sub(R.one, haircut));
  const net = R.sub(afterHaircut, fixedFee);
  if (R.isNeg(net)) {
    return {
      metalValueRial,
      estimatedNetSaleRial: null,
      mode: 'METAL_ONLY_NEEDS_INFO',
      assumedHaircutRate: params.haircutRate,
      fixedSellingFeeRial: fixedFee,
    };
  }

  return {
    metalValueRial,
    estimatedNetSaleRial: net,
    mode: 'ESTIMATE_WITH_HAIRCUT',
    assumedHaircutRate: params.haircutRate,
    fixedSellingFeeRial: fixedFee,
  };
}

export function unitLabelFa(unit: TradeUnit): string {
  switch (unit) {
    case 'GRAM':
      return 'گرم';
    case 'MESGHAL':
      return 'مثقال';
    case 'TROY_OUNCE':
      return 'اونس تروی';
    case 'COUNT':
      return 'عدد';
    case 'UNIT':
      return 'واحد';
  }
}
