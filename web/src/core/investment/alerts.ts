import { R } from './rational';
import { selectCompatiblePriceSnapshot, type AssetReplayResult, type AssetValuation, type PortfolioSummary } from './replay';
import type {
  AlertEventLog,
  AlertRule,
  Asset,
  PriceSnapshot,
} from './types';

export interface PublicAlertRequestRule {
  id: string;
  instrumentKey: string;
  condition: 'PRICE_ABOVE' | 'PRICE_BELOW';
  thresholdRial: string;
  cooldownMinutes: number;
  lastTriggeredAtMs?: number;
  lastTriggeredObservedAtMs?: number;
}

/**
 * Strictly extracts ONLY public market rules without any portfolio IDs, quantities,
 * balances, cost basis, or local-only rules so portfolio data NEVER leaves the device
 * in public alert requests.
 */
export function buildPublicAlertRequestPayload(
  rules: AlertRule[]
): PublicAlertRequestRule[] {
  const out: PublicAlertRequestRule[] = [];
  for (const r of rules) {
    if (!r.enabled || r.scope !== 'PUBLIC_MARKET') continue;
    if (r.condition !== 'PRICE_ABOVE' && r.condition !== 'PRICE_BELOW') continue;
    if (!r.instrumentKey || !r.thresholdValue) continue;
    out.push({
      id: r.id,
      instrumentKey: r.instrumentKey,
      condition: r.condition,
      thresholdRial: r.thresholdValue,
      cooldownMinutes: r.cooldownMinutes,
      lastTriggeredAtMs: r.lastTriggeredAtMs,
      lastTriggeredObservedAtMs: r.lastTriggeredObservedAtMs,
    });
  }
  return out;
}

export interface EvaluatedAlertCandidate {
  rule: AlertRule;
  title: string;
  publicMessage: string;
  detailedMessage: string;
  observedAtMs?: number;
}

function isInCooldownOrDuplicate(
  rule: AlertRule,
  observedAtMs: number | undefined,
  nowMs: number
): boolean {
  if (rule.lastTriggeredAtMs != null) {
    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
    if (nowMs - rule.lastTriggeredAtMs < cooldownMs) return true;
  }
  if (
    observedAtMs != null &&
    rule.lastTriggeredObservedAtMs != null &&
    observedAtMs <= rule.lastTriggeredObservedAtMs
  ) {
    return true;
  }
  return false;
}

export function evaluateLocalAlerts(params: {
  rules: AlertRule[];
  assets: Asset[];
  positions: Array<{ asset: Asset; replay: AssetReplayResult; valuation: AssetValuation }>;
  summary: PortfolioSummary;
  snapshots: PriceSnapshot[];
  nowMs?: number;
  defaultStaleHours?: number;
}): EvaluatedAlertCandidate[] {
  const {
    rules,
    assets,
    positions,
    summary,
    snapshots,
    nowMs = Date.now(),
    defaultStaleHours = 24,
  } = params;

  const posByAsset = new Map(positions.map(p => [p.asset.id, p]));
  const assetByKey = new Map<string, Asset>();
  for (const a of assets) {
    if (!assetByKey.has(a.instrumentKey)) assetByKey.set(a.instrumentKey, a);
  }

  const triggered: EvaluatedAlertCandidate[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.scope === 'PUBLIC_MARKET') {
      if (!rule.instrumentKey || !rule.thresholdValue) continue;
      const syntheticAsset: Asset = assetByKey.get(rule.instrumentKey) ?? {
        id: 'public-eval',
        portfolioId: rule.portfolioId,
        kind: 'OTHER',
        name: rule.instrumentKey,
        instrumentKey: rule.instrumentKey,
        baseUnit: 'UNIT',
        pricingSpec: {},
        createdAt: 0,
        updatedAt: 0,
      };
      const selected = selectCompatiblePriceSnapshot(syntheticAsset, snapshots);
      if (!selected) continue;

      const staleMs = (rule.staleAfterHours ?? defaultStaleHours) * 3600_000;
      if (nowMs - selected.snapshot.observedAtMs > staleMs) {
        continue; // Do not fire price alerts on stale/disconnected feeds
      }
      if (isInCooldownOrDuplicate(rule, selected.snapshot.observedAtMs, nowMs)) continue;

      const threshold = R.fromInt(rule.thresholdValue);
      const cmp = R.cmp(selected.unitPriceRial, threshold);
      const hit =
        (rule.condition === 'PRICE_ABOVE' && cmp >= 0) ||
        (rule.condition === 'PRICE_BELOW' && cmp <= 0);
      if (!hit) continue;

      const msg =
        rule.condition === 'PRICE_ABOVE'
          ? `نرخ ${syntheticAsset.name} به آستانهٔ بالای هدف رسید`
          : `نرخ ${syntheticAsset.name} به آستانهٔ پایین هدف رسید`;
      triggered.push({
        rule,
        title: rule.name,
        publicMessage: msg,
        detailedMessage: msg,
        observedAtMs: selected.snapshot.observedAtMs,
      });
      continue;
    }

    // PORTFOLIO_LOCAL rules: evaluated strictly on-device
    if (rule.condition === 'NEEDS_REVIEW') {
      if (summary.needsReviewAssetsCount <= 0) continue;
      if (isInCooldownOrDuplicate(rule, undefined, nowMs)) continue;
      triggered.push({
        rule,
        title: rule.name,
        publicMessage: 'یک وضعیت سبد سرمایه‌گذاری نیازمند بررسی است',
        detailedMessage: `${summary.needsReviewAssetsCount} دارایی در وضعیت «نیازمند بررسی» قرار دارد`,
      });
      continue;
    }

    if (rule.condition === 'STALE_PRICE') {
      const thresholdHours = rule.staleAfterHours ?? defaultStaleHours;
      const staleHeld = positions.filter(p => {
        if (!p.valuation.hasHoldings) return false;
        if (rule.assetId && p.asset.id !== rule.assetId) return false;
        if (!p.valuation.priceObservedAtMs) return true;
        return nowMs - p.valuation.priceObservedAtMs > thresholdHours * 3600_000;
      });
      if (staleHeld.length === 0) continue;
      if (isInCooldownOrDuplicate(rule, undefined, nowMs)) continue;
      triggered.push({
        rule,
        title: rule.name,
        publicMessage: 'قیمت برخی دارایی‌های سبد قدیمی یا ثبت‌نشده است',
        detailedMessage: `${staleHeld.length} دارایی دارای نرخ قدیمی‌تر از ${thresholdHours} ساعت یا بدون قیمت است`,
      });
      continue;
    }

    if (
      rule.condition === 'PORTFOLIO_VALUE_ABOVE' ||
      rule.condition === 'PORTFOLIO_VALUE_BELOW'
    ) {
      if (!summary.hasDefiniteTotalValue || !rule.thresholdValue) continue;
      if (isInCooldownOrDuplicate(rule, undefined, nowMs)) continue;
      const threshold = R.fromInt(rule.thresholdValue);
      const cmp = R.cmp(summary.pricedMarketValueRial, threshold);
      const hit =
        (rule.condition === 'PORTFOLIO_VALUE_ABOVE' && cmp >= 0) ||
        (rule.condition === 'PORTFOLIO_VALUE_BELOW' && cmp <= 0);
      if (!hit) continue;

      triggered.push({
        rule,
        title: rule.name,
        publicMessage: 'هشدار ارزش کل سبد سرمایه‌گذاری فعال شد (برای جزئیات وارد برنامه شوید)',
        detailedMessage:
          rule.condition === 'PORTFOLIO_VALUE_ABOVE'
            ? 'ارزش برآوردی کل سبد از سقف تعیین‌شده عبور کرد'
            : 'ارزش برآوردی کل سبد به زیر کف تعیین‌شده رسید',
      });
      continue;
    }

    if (
      rule.condition === 'ASSET_UNREALIZED_GAIN_PCT_ABOVE' ||
      rule.condition === 'ASSET_UNREALIZED_LOSS_PCT_ABOVE'
    ) {
      if (!rule.assetId || !rule.thresholdValue) continue;
      const pos = posByAsset.get(rule.assetId);
      if (
        !pos ||
        pos.replay.status === 'NEEDS_REVIEW' ||
        !pos.replay.costKnown ||
        !pos.replay.costBasisRial ||
        !R.isPos(pos.replay.costBasisRial) ||
        !pos.valuation.priced ||
        pos.valuation.unrealizedProfitRial === null
      ) {
        continue;
      }
      if (isInCooldownOrDuplicate(rule, pos.valuation.priceObservedAtMs, nowMs)) continue;

      const costN = R.toNumber(pos.replay.costBasisRial);
      const pnlN = R.toNumber(pos.valuation.unrealizedProfitRial);
      const pnlPct = (pnlN / costN) * 100;
      const targetPct = Number(rule.thresholdValue);
      if (!Number.isFinite(targetPct) || targetPct <= 0) continue;

      const hit =
        (rule.condition === 'ASSET_UNREALIZED_GAIN_PCT_ABOVE' && pnlPct >= targetPct) ||
        (rule.condition === 'ASSET_UNREALIZED_LOSS_PCT_ABOVE' && pnlPct <= -targetPct);
      if (!hit) continue;

      triggered.push({
        rule,
        title: rule.name,
        publicMessage: 'هشدار سبد سرمایه‌گذاری فعال شد (جزئیات به دلیل حریم خصوصی مخفی است)',
        detailedMessage:
          rule.condition === 'ASSET_UNREALIZED_GAIN_PCT_ABOVE'
            ? `سود تحقق‌نیافته ${pos.asset.name} به ${pnlPct.toFixed(1)}٪ رسید`
            : `زیان تحقق‌نیافته ${pos.asset.name} به ${Math.abs(pnlPct).toFixed(1)}٪ رسید`,
        observedAtMs: pos.valuation.priceObservedAtMs,
      });
    }
  }

  return triggered;
}

export function formatAlertNotificationBody(
  log: Pick<AlertEventLog, 'scope' | 'publicMessage' | 'detailedMessage'>,
  options: { lockEnabled: boolean; hidden: boolean }
): string {
  // Never leak portfolio numbers/details when app lock is enabled or amounts are hidden
  if (log.scope === 'PORTFOLIO_LOCAL' && (options.lockEnabled || options.hidden)) {
    return log.publicMessage;
  }
  return log.detailedMessage;
}
