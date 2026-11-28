import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  Coins,
  Edit3,
  History,
  LineChart,
  Link2,
  PieChart,
  Plus,
  Radio,
  RefreshCw,
  ShieldAlert,
  Tag,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { db, type Account, type Txn } from '../core/db';
import {
  amendInvestmentEntry,
  checkDevicePushSupport,
  clearResolvedSyncConflicts,
  createDcaPlan,
  createInvestmentAlertRule,
  createInvestmentAsset,
  deleteInvestmentAlertRule,
  deleteTargetAllocation,
  ensureDefaultPortfolio,
  evaluateInvestmentAlerts,
  executeDcaStepPurchase,
  findCandidateBankTxnsForInvestment,
  getInvestmentSyncMode,
  isCloudSyncActiveForInvestment,
  linkCashToRecord,
  loadPortfolioOverview,
  recordInvestmentEntry,
  recordManualPriceSnapshot,
  saveTargetAllocation,
  toggleInvestmentAlertRule,
  unlinkCashLink,
  updateDcaPlanStatus,
  voidInvestmentEntry,
  type AssetPositionView,
  type CashLinkChoice,
  type PortfolioOverview,
} from '../core/db/investmentLedger';
import {
  fetchInstrumentHistoryFromFeed,
  getCachedFeedMeta,
  isMarketFeedEnabled,
  refreshMarketPriceFeed,
  setMarketFeedEnabled,
  type MarketFeedMeta,
} from '../core/db/priceFeed';
import {
  ALLOCATION_CATEGORY_LABELS,
  R,
  analyzeAssetTrend,
  buildInstrumentPriceSeries,
  buildPortfolioHistorySeries,
  computeTradeSettlementRial,
  formatAlertNotificationBody,
  unitLabelFa,
  type AlertConditionKind,
  type AlertRuleScope,
  type AllocationCategory,
  type AssetKind,
  type BaseUnit,
  type DcaDropReference,
  type DcaPlanEvaluation,
  type DcaTriggerCombinator,
  type EffectiveRecord,
  type EvaluatedDcaStep,
  type PriceSnapshot,
  type PricingSpec,
  type QuoteSide,
  type Rational,
  type TradeSnapshotPayload,
  type TradeUnit,
  type TrendWindow,
} from '../core/investment';
import { Jalali } from '../core/jalali';
import { Money } from '../core/money';
import { AmountInput } from '../components/AmountInput';
import { Select } from '../components/Select';
import { HeaderBar } from '../components/UI';
import { ImpulseBrakeModal } from '../components/impulse/ImpulseBrakeModal';
import { isLockEnabled } from '../core/security';

interface InvestmentsProps {
  onBack: () => void;
  hidden?: boolean;
}

interface AssetPreset {
  id: string;
  label: string;
  sublabel: string;
  kind: AssetKind;
  instrumentKey: string;
  baseUnit: BaseUnit;
  pricingSpec: PricingSpec;
}

const ASSET_PRESETS: AssetPreset[] = [
  {
    id: 'gold_18k',
    label: 'طلای آب‌شده ۱۸ عیار',
    sublabel: 'واحد گرم · عیار مبنا ۷۵۰',
    kind: 'GOLD_MELTED',
    instrumentKey: 'gold_18k_gram',
    baseUnit: 'GRAM',
    pricingSpec: { referenceFineness: 750, quoteUnit: 'GRAM' },
  },
  {
    id: 'gold_mazaneh',
    label: 'طلای آب‌شده (مبنای مظنه)',
    sublabel: 'ثبت قیمت با مثقال ۷۰۵ یا گرم ۱۸',
    kind: 'GOLD_MELTED',
    instrumentKey: 'gold_mazaneh',
    baseUnit: 'GRAM',
    pricingSpec: { referenceFineness: 750, quoteUnit: 'MESGHAL' },
  },
  {
    id: 'coin_emami',
    label: 'سکه امامی',
    sublabel: 'تعداد · عیار ۹۰۰',
    kind: 'GOLD_COIN',
    instrumentKey: 'coin_emami',
    baseUnit: 'COUNT',
    pricingSpec: { quoteUnit: 'COUNT', coinNetMassGram: '8.133', coinFineness: 900, referenceFineness: 750 },
  },
  {
    id: 'coin_bahar',
    label: 'سکه بهار آزادی',
    sublabel: 'تعداد · عیار ۹۰۰',
    kind: 'GOLD_COIN',
    instrumentKey: 'coin_bahar',
    baseUnit: 'COUNT',
    pricingSpec: { quoteUnit: 'COUNT', coinNetMassGram: '8.133', coinFineness: 900, referenceFineness: 750 },
  },
  {
    id: 'coin_nim',
    label: 'نیم‌سکه بهار آزادی',
    sublabel: 'تعداد · عیار ۹۰۰',
    kind: 'GOLD_COIN',
    instrumentKey: 'coin_nim',
    baseUnit: 'COUNT',
    pricingSpec: { quoteUnit: 'COUNT', coinNetMassGram: '4.0665', coinFineness: 900, referenceFineness: 750 },
  },
  {
    id: 'coin_rob',
    label: 'ربع‌سکه بهار آزادی',
    sublabel: 'تعداد · عیار ۹۰۰',
    kind: 'GOLD_COIN',
    instrumentKey: 'coin_rob',
    baseUnit: 'COUNT',
    pricingSpec: { quoteUnit: 'COUNT', coinNetMassGram: '2.03325', coinFineness: 900, referenceFineness: 750 },
  },
  {
    id: 'coin_gerami',
    label: 'سکه گرمی',
    sublabel: 'تعداد · عیار ۹۰۰',
    kind: 'GOLD_COIN',
    instrumentKey: 'coin_gerami',
    baseUnit: 'COUNT',
    pricingSpec: { quoteUnit: 'COUNT', coinNetMassGram: '1.01', coinFineness: 900, referenceFineness: 750 },
  },
  {
    id: 'gold_jewelry',
    label: 'طلای زینتی / زیورآلات',
    sublabel: 'وزن خالص فلز پس از کسر سنگ و متعلقات',
    kind: 'GOLD_JEWELRY',
    instrumentKey: 'gold_18k_gram',
    baseUnit: 'GRAM',
    pricingSpec: { referenceFineness: 750, quoteUnit: 'GRAM' },
  },
  {
    id: 'silver_999',
    label: 'نقره ۹۹۹',
    sublabel: 'گرم · عیار ۹۹۹',
    kind: 'SILVER',
    instrumentKey: 'silver_999_gram',
    baseUnit: 'GRAM',
    pricingSpec: { referenceFineness: 999, quoteUnit: 'GRAM' },
  },
  {
    id: 'usd_cash',
    label: 'دلار نقد',
    sublabel: 'واحد ارزی مستقل',
    kind: 'CURRENCY',
    instrumentKey: 'usd_cash',
    baseUnit: 'UNIT',
    pricingSpec: { quoteUnit: 'UNIT' },
  },
  {
    id: 'usdt',
    label: 'تتر (USDT)',
    sublabel: 'واحد دیجیتال مستقل',
    kind: 'CRYPTO',
    instrumentKey: 'usdt',
    baseUnit: 'UNIT',
    pricingSpec: { quoteUnit: 'UNIT' },
  },
];

function kindLabelFa(kind: AssetKind): string {
  switch (kind) {
    case 'GOLD_MELTED':
      return 'طلای آب‌شده';
    case 'GOLD_COIN':
      return 'سکه طلا';
    case 'GOLD_JEWELRY':
      return 'زیورآلات طلا';
    case 'SILVER':
      return 'نقره';
    case 'CURRENCY':
      return 'ارز نقد';
    case 'CRYPTO':
      return 'رمزارز';
    case 'OTHER':
      return 'دارایی دیگر';
  }
}

function formatQtyFa(q: Rational, unit: BaseUnit, fineness?: number): string {
  const numStr = Money.fa(R.toDecimalString(q, unit === 'GRAM' ? 4 : 6).replace('.', '٫'));
  const u = unit === 'GRAM' ? 'گرم' : unit === 'COUNT' ? 'عدد' : 'واحد';
  return fineness != null && unit === 'GRAM'
    ? `${numStr} ${u} (عیار ${Money.fa(String(fineness))})`
    : `${numStr} ${u}`;
}

function formatProfitBadge(
  val: Rational | null,
  hidden: boolean
): { text: string; toneClass: string } {
  if (hidden) {
    return { text: Money.HIDDEN, toneClass: 'text-muted bg-white/5 border-line' };
  }
  if (val === null) {
    return { text: 'نامشخص', toneClass: 'text-warn bg-warn/10 border-warn/25' };
  }
  const rounded = Number(R.roundHalfUp(val));
  if (R.isZero(val) || rounded === 0) {
    return { text: 'سربه‌سر (۰ تومان)', toneClass: 'text-muted bg-white/5 border-line' };
  }
  if (rounded > 0) {
    return {
      text: `سود +${Money.toman(rounded)} تومان`,
      toneClass: 'text-ok bg-ok/15 border-ok/25',
    };
  }
  return {
    text: `زیان −${Money.toman(Math.abs(rounded))} تومان`,
    toneClass: 'text-bad bg-bad/15 border-bad/25',
  };
}

function formatPriceAgeFa(observedAtMs: number, nowMs = Date.now()): string {
  const diffHours = Math.max(0, Math.floor((nowMs - observedAtMs) / 3600_000));
  if (diffHours < 1) return 'کمتر از ۱ ساعت پیش';
  if (diffHours < 24) return `${Money.fa(String(diffHours))} ساعت پیش`;
  const days = Math.floor(diffHours / 24);
  return `${Money.fa(String(days))} روز پیش (${Jalali.shortDateTime(observedAtMs, nowMs)})`;
}

function sourceDisplayLabelFa(sourceId?: string): string {
  switch (sourceId) {
    case 'nerkhara':
      return 'NerkhAra';
    case 'iran_market':
      return 'Iran Market';
    case 'navasan':
      return 'نوسان';
    case 'bonbast':
      return 'بن‌بست';
    case 'manual':
      return 'دستی';
    default:
      return sourceId || 'نامشخص';
  }
}

export function Investments({ onBack, hidden = false }: InvestmentsProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [tradeModal, setTradeModal] = useState<{
    assetId: string;
    mode: 'CREATE' | 'AMEND';
    initialKind: 'OPENING' | 'BUY' | 'SELL';
    record?: EffectiveRecord;
  } | null>(null);
  const [priceModalAssetId, setPriceModalAssetId] = useState<string | null>(null);
  const [linkModal, setLinkModal] = useState<{
    assetId: string;
    record: EffectiveRecord;
  } | null>(null);
  const [showVoidedHistory, setShowVoidedHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState<7 | 30 | 90>(30);
  const [isFeedModalOpen, setIsFeedModalOpen] = useState(false);
  const [feedEnabled, setFeedEnabledState] = useState(() => isMarketFeedEnabled());
  const [feedMeta, setFeedMeta] = useState<MarketFeedMeta>(() => getCachedFeedMeta());
  const [feedBusy, setFeedBusy] = useState(false);
  const [isCreateDcaOpen, setIsCreateDcaOpen] = useState(false);
  const [executeDcaTarget, setExecuteDcaTarget] = useState<{
    evaluation: DcaPlanEvaluation;
    step: EvaluatedDcaStep;
  } | null>(null);
  const [brakeAssetId, setBrakeAssetId] = useState<string | null>(null);
  const [isCreateAlertOpen, setIsCreateAlertOpen] = useState(false);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);

  const cloudSyncActive = isCloudSyncActiveForInvestment();
  const syncMode = getInvestmentSyncMode();

  const handleRefreshFeed = async () => {
    setFeedBusy(true);
    try {
      const next = await refreshMarketPriceFeed();
      setFeedMeta(next);
    } finally {
      setFeedBusy(false);
    }
  };

  const data = useLiveQuery(async () => {
    const [overview, accounts] = await Promise.all([
      loadPortfolioOverview(),
      db.accounts.filter(a => !a.archived).sortBy('sortOrder'),
    ]);
    return { overview, accounts };
  }, []);

  const overview = data?.overview;
  const accounts = data?.accounts ?? [];
  const selectedPosition = useMemo(
    () => overview?.positions.find(p => p.asset.id === selectedAssetId) ?? null,
    [overview, selectedAssetId]
  );

  const handleVoidRecord = async (assetId: string, recordId: string) => {
    setActionError(null);
    if (!confirm('آیا از ابطال این ثبت مطمئن هستید؟ سابقه در دفتر باقی می‌ماند.')) return;
    try {
      await voidInvestmentEntry({ assetId, recordId, reason: 'ابطال توسط کاربر' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'خطا در ابطال ثبت');
    }
  };

  const handleUnlinkCash = async (recordId: string) => {
    setActionError(null);
    if (!confirm('پیوند این معامله با حساب بانکی قطع شود؟ ماندهٔ حساب بانکی در اتصال به گردش موجود تغییر نمی‌کند.')) return;
    try {
      await unlinkCashLink(recordId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'خطا در قطع پیوند');
    }
  };

  const summary = overview?.summary;

  return (
    <div className="flex flex-col pb-28 min-h-screen bg-bg max-w-md mx-auto">
      <HeaderBar
        title={selectedPosition ? selectedPosition.asset.name : 'مرکز سرمایه‌گذاری'}
        onBack={() => {
          setActionError(null);
          if (selectedPosition) setSelectedAssetId(null);
          else onBack();
        }}
        action={
          !selectedPosition ? (
            <button
              type="button"
              onClick={() => setIsAddAssetOpen(true)}
              aria-label="افزودن دارایی"
              className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab active:scale-95 transition-transform"
            >
              <Plus size={20} strokeWidth={2.4} />
            </button>
          ) : undefined
        }
      />

      <div className="px-4 space-y-3.5">
        {syncMode === 'SYNC_V2_UPGRADE_NEEDED' && (
          <div className="p-3 rounded-2xl bg-sky/10 border border-sky/25 text-[11px] text-sky leading-relaxed">
            همگام‌سازی ابری روی پروتکل قدیمی (نسخه ۲) متصل است؛ تا پیش از ارتقای سرور به نسخه ۳، ثبت معامله فقط «بدون پیوند حساب» در دسترس است.
          </div>
        )}
        {syncMode === 'SYNC_V3_ACTIVE' && (
          <div className="p-2.5 rounded-2xl bg-ok/10 border border-ok/25 text-[11px] text-ok leading-relaxed">
            همگام‌سازی ابری رمزدار برای مرکز سرمایه‌گذاری (نسخه ۳) فعال است.
          </div>
        )}

        {actionError && (
          <div className="p-3 rounded-2xl bg-bad/15 border border-bad/30 text-xs text-bad flex items-start justify-between gap-2">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="shrink-0">
              <X size={15} />
            </button>
          </div>
        )}

        {!selectedPosition ? (
          <>
            {/* Portfolio Summary */}
            <div className="p-4 rounded-[24px] bg-gradient-to-br from-surface2 via-surface to-surface border border-line space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] text-muted block">
                    {summary && !summary.hasDefiniteTotalValue
                      ? 'ارزش فروش برآوردی (بخش قیمت‌دار)'
                      : 'ارزش فروش برآوردی کل سبد'}
                  </span>
                  <div className="text-2xl font-black text-white mt-0.5 dir-ltr text-right">
                    {hidden ? (
                      Money.HIDDEN
                    ) : summary ? (
                      <>
                        {Money.toman(Number(R.roundHalfUp(summary.pricedMarketValueRial)))}
                        <span className="text-xs text-muted font-normal mr-1">تومان</span>
                      </>
                    ) : (
                      '۰ تومان'
                    )}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-300 border border-amber-400/25 flex items-center justify-center shrink-0">
                  <Coins size={20} />
                </div>
              </div>

              {/* Realized & Unrealized P&L with explicit text sign */}
              {summary && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line">
                  <div className="p-2.5 rounded-2xl bg-bg/60 border border-line/70 space-y-1">
                    <span className="text-[10px] text-muted block">
                      {summary.hasPartialRealizedProfit ? 'سود بخش قابل محاسبه (تحقق‌یافته)' : 'سود/زیان تحقق‌یافته'}
                    </span>
                    {(() => {
                      const b = formatProfitBadge(summary.calculableRealizedProfitRial, hidden);
                      return (
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-lg border ${b.toneClass}`}>
                          {b.text}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="p-2.5 rounded-2xl bg-bg/60 border border-line/70 space-y-1">
                    <span className="text-[10px] text-muted block">
                      {summary.hasDefiniteUnrealizedProfit
                        ? 'سود/زیان تحقق‌نیافته'
                        : 'تحقق‌نیافته (بخش قابل محاسبه)'}
                    </span>
                    {(() => {
                      const val =
                        summary.unknownCostAssetsCount > 0 && summary.pricedMarketValueRial.num === 0n
                          ? null
                          : summary.calculableUnrealizedProfitRial;
                      const b = formatProfitBadge(
                        summary.unpricedAssetsCount > 0 && overview?.positions.every(p => !p.valuation.priced)
                          ? null
                          : val,
                        hidden
                      );
                      return (
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-lg border ${b.toneClass}`}>
                          {b.text}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Data quality / partial status badges */}
              {summary &&
                (summary.unpricedAssetsCount > 0 ||
                  summary.staleAssetsCount > 0 ||
                  summary.unknownCostAssetsCount > 0 ||
                  summary.needsReviewAssetsCount > 0) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {summary.needsReviewAssetsCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-bad/15 text-bad border border-bad/30">
                        {Money.fa(String(summary.needsReviewAssetsCount))} مورد نیازمند بررسی
                      </span>
                    )}
                    {summary.unpricedAssetsCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn border border-warn/25">
                        {Money.fa(String(summary.unpricedAssetsCount))} دارایی بی‌قیمت (جمع قطعی ناموجود)
                      </span>
                    )}
                    {summary.staleAssetsCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25">
                        {Money.fa(String(summary.staleAssetsCount))} قیمت قدیمی
                      </span>
                    )}
                    {summary.unknownCostAssetsCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-muted border border-line">
                        {Money.fa(String(summary.unknownCostAssetsCount))} دارایی با بهای نامعلوم
                      </span>
                    )}
                  </div>
                )}

              <div className="flex items-center justify-between pt-2 border-t border-line/70">
                <button
                  type="button"
                  onClick={() => setIsFeedModalOpen(true)}
                  className="text-[10px] text-sky hover:underline flex items-center gap-1"
                >
                  <Radio size={12} />
                  <span>
                    {feedEnabled ? 'فید سرور + قیمت دستی' : 'پیش‌فرض: قیمت دستی'} · منابع و کش
                  </span>
                </button>
                {feedEnabled && (
                  <button
                    type="button"
                    disabled={feedBusy}
                    onClick={handleRefreshFeed}
                    className="text-[10px] text-lime flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={feedBusy ? 'animate-spin' : ''} />
                    <span>بروزرسانی نرخ</span>
                  </button>
                )}
              </div>
            </div>

            {overview && overview.positions.length > 0 && (
              <PortfolioHistorySection
                overview={overview}
                days={historyDays}
                onChangeDays={setHistoryDays}
                hidden={hidden}
              />
            )}

            {overview && overview.positions.length > 0 && (
              <DcaPlansSection
                overview={overview}
                hidden={hidden}
                onOpenCreate={() => setIsCreateDcaOpen(true)}
                onExecuteStep={(evaluation, step) =>
                  setExecuteDcaTarget({ evaluation, step })
                }
              />
            )}

            {overview && (
              <AlertsSection
                overview={overview}
                hidden={hidden}
                feedEnabled={feedEnabled}
                onOpenCreate={() => setIsCreateAlertOpen(true)}
              />
            )}

            {overview && (
              <AllocationSection
                overview={overview}
                hidden={hidden}
                onOpenEdit={() => setIsAllocationModalOpen(true)}
              />
            )}

            {/* Assets List */}
            {overview && overview.positions.length > 0 ? (
              <div className="space-y-3">
                {overview.positions.map(pos => (
                  <AssetCard
                    key={pos.asset.id}
                    position={pos}
                    hidden={hidden}
                    onOpenDetail={() => {
                      setShowVoidedHistory(false);
                      setSelectedAssetId(pos.asset.id);
                    }}
                    onOpenTrade={kind =>
                      setTradeModal({ assetId: pos.asset.id, mode: 'CREATE', initialKind: kind })
                    }
                    onOpenPrice={() => setPriceModalAssetId(pos.asset.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-[24px] bg-surface border border-line text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-300 border border-amber-400/25 flex items-center justify-center mx-auto">
                  <Coins size={26} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-white">هنوز دارایی سرمایه‌ای ثبت نکرده‌اید</h2>
                  <p className="text-xs text-muted leading-relaxed">
                    طلای آب‌شده، سکه، زیورآلات، نقره یا ارزهای خود را اضافه کنید تا بهای میانگین، سود تحقق‌یافته و ارزش فروش روز آن‌ها دقیق محاسبه شود.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddAssetOpen(true)}
                  className="px-5 h-11 rounded-2xl bg-lime text-onLime font-extrabold text-xs inline-flex items-center gap-1.5 shadow-fab active:scale-95 transition-transform"
                >
                  <Plus size={16} />
                  <span>افزودن اولین دارایی</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <AssetDetailView
            position={selectedPosition}
            snapshots={overview?.snapshots ?? []}
            feedEnabled={feedEnabled}
            hidden={hidden}
            showVoided={showVoidedHistory}
            onToggleVoided={() => setShowVoidedHistory(v => !v)}
            onOpenTrade={kind =>
              setTradeModal({
                assetId: selectedPosition.asset.id,
                mode: 'CREATE',
                initialKind: kind,
              })
            }
            onAmendRecord={rec =>
              setTradeModal({
                assetId: selectedPosition.asset.id,
                mode: 'AMEND',
                initialKind: rec.effectiveKind,
                record: rec,
              })
            }
            onVoidRecord={recId => handleVoidRecord(selectedPosition.asset.id, recId)}
            onOpenPrice={() => setPriceModalAssetId(selectedPosition.asset.id)}
            onOpenLinkCash={rec => setLinkModal({ assetId: selectedPosition.asset.id, record: rec })}
            onUnlinkCash={handleUnlinkCash}
            onOpenPurchaseBrake={() => setBrakeAssetId(selectedPosition.asset.id)}
          />
        )}
      </div>

      {/* Add Asset Modal */}
      {isAddAssetOpen && overview && (
        <AddAssetModal
          portfolioId={overview.portfolio.id}
          onClose={() => setIsAddAssetOpen(false)}
          onCreated={assetId => {
            setIsAddAssetOpen(false);
            setSelectedAssetId(assetId);
          }}
        />
      )}

      {/* Record / Amend Trade Modal */}
      {tradeModal && overview && (
        <TradeModal
          position={overview.positions.find(p => p.asset.id === tradeModal.assetId)!}
          accounts={accounts}
          mode={tradeModal.mode}
          initialKind={tradeModal.initialKind}
          record={tradeModal.record}
          cloudSyncActive={cloudSyncActive}
          onClose={() => setTradeModal(null)}
        />
      )}

      {/* Manual Price Modal */}
      {priceModalAssetId && overview && (
        <ManualPriceModal
          position={overview.positions.find(p => p.asset.id === priceModalAssetId)!}
          onClose={() => setPriceModalAssetId(null)}
        />
      )}

      {/* Cash Link Modal for existing record */}
      {linkModal && overview && (
        <CashLinkModal
          position={overview.positions.find(p => p.asset.id === linkModal.assetId)!}
          record={linkModal.record}
          accounts={accounts}
          cloudSyncActive={cloudSyncActive}
          onClose={() => setLinkModal(null)}
        />
      )}

      {/* Market Feed & Cache Status Modal */}
      {isFeedModalOpen && (
        <MarketFeedModal
          feedEnabled={feedEnabled}
          onToggleFeed={enabled => {
            setMarketFeedEnabled(enabled);
            setFeedEnabledState(enabled);
          }}
          feedMeta={feedMeta}
          busy={feedBusy}
          onRefresh={handleRefreshFeed}
          onClose={() => setIsFeedModalOpen(false)}
        />
      )}

      {/* Create DCA Plan Modal */}
      {isCreateDcaOpen && overview && (
        <CreateDcaPlanModal
          overview={overview}
          onClose={() => setIsCreateDcaOpen(false)}
        />
      )}

      {/* Execute DCA Step Modal */}
      {executeDcaTarget && overview && (
        <ExecuteDcaStepModal
          evaluation={executeDcaTarget.evaluation}
          step={executeDcaTarget.step}
          position={overview.positions.find(p => p.asset.id === executeDcaTarget.evaluation.plan.assetId)!}
          accounts={accounts}
          cloudSyncActive={cloudSyncActive}
          onClose={() => setExecuteDcaTarget(null)}
        />
      )}

      {/* Optional Purchase Intent Brake Modal */}
      {brakeAssetId && overview && (
        <ImpulseBrakeModal
          isOpen={true}
          onClose={() => setBrakeAssetId(null)}
          initialData={{
            purpose: 'INVESTMENT',
            investmentAssetId: brakeAssetId,
            itemTitle: `خرید ${overview.positions.find(p => p.asset.id === brakeAssetId)?.asset.name || 'دارایی'}`,
          }}
        />
      )}

      {/* Create Alert Rule Modal */}
      {isCreateAlertOpen && overview && (
        <CreateAlertModal
          overview={overview}
          onClose={() => setIsCreateAlertOpen(false)}
        />
      )}

      {/* Target Allocation & Cash Reserve Modal */}
      {isAllocationModalOpen && overview && (
        <AllocationModal
          overview={overview}
          accounts={accounts}
          onClose={() => setIsAllocationModalOpen(false)}
        />
      )}
    </div>
  );
}

function AssetCard({
  position,
  hidden,
  onOpenDetail,
  onOpenTrade,
  onOpenPrice,
}: {
  position: AssetPositionView;
  hidden: boolean;
  onOpenDetail: () => void;
  onOpenTrade: (kind: 'BUY' | 'SELL' | 'OPENING') => void;
  onOpenPrice: () => void;
}) {
  const { asset, replay, valuation } = position;
  const unrealizedBadge = formatProfitBadge(
    replay.status === 'NEEDS_REVIEW' ? null : valuation.unrealizedProfitRial,
    hidden
  );

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-right flex-1 min-w-0 group"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-white truncate">{asset.name}</span>
            <ChevronLeft size={15} className="text-muted group-hover:text-white shrink-0" />
          </div>
          <div className="text-[11px] text-muted mt-0.5">
            {kindLabelFa(asset.kind)} ·{' '}
            {hidden
              ? Money.HIDDEN
              : formatQtyFa(replay.quantity, asset.baseUnit, asset.pricingSpec.referenceFineness)}
          </div>
        </button>

        {replay.status === 'NEEDS_REVIEW' ? (
          <span className="px-2 py-0.5 rounded-full bg-bad/15 text-bad border border-bad/30 text-[10px] font-bold shrink-0">
            نیازمند بررسی
          </span>
        ) : !valuation.priced && valuation.hasHoldings ? (
          <span className="px-2 py-0.5 rounded-full bg-warn/15 text-warn border border-warn/25 text-[10px] font-bold shrink-0">
            بی‌قیمت
          </span>
        ) : valuation.isStale ? (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25 text-[10px] font-bold shrink-0">
            قیمت قدیمی
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-bg/50 border border-line/60">
          <span className="text-[10px] text-muted block">ارزش فروش برآوردی</span>
          <span className="text-xs font-extrabold text-white mt-0.5 block dir-ltr text-right">
            {hidden ? (
              Money.HIDDEN
            ) : valuation.estimatedSaleRial !== null ? (
              `${Money.toman(Number(R.roundHalfUp(valuation.estimatedSaleRial)))} تومان`
            ) : valuation.metalValueRial !== null ? (
              `ارزش فلز ${Money.toman(Number(R.roundHalfUp(valuation.metalValueRial)))} تومان`
            ) : (
              'ثبت قیمت نشده'
            )}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-bg/50 border border-line/60">
          <span className="text-[10px] text-muted block">سود/زیان تحقق‌نیافته</span>
          <span
            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border mt-0.5 ${unrealizedBadge.toneClass}`}
          >
            {unrealizedBadge.text}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          میانگین بها:{' '}
          {hidden
            ? Money.HIDDEN
            : replay.averageUnitCostRial
            ? `${Money.toman(Number(R.roundHalfUp(replay.averageUnitCostRial)))} ت`
            : replay.costKnown
            ? '—'
            : 'نامعلوم'}
        </span>
        <span>
          {valuation.priceObservedAtMs
            ? `${formatPriceAgeFa(valuation.priceObservedAtMs)}${valuation.priceSourceSnapshot?.sourceId === 'nerkhara' ? ' · NerkhAra' : ''}`
            : 'بدون نرخ دستی'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-line/80">
        <button
          type="button"
          onClick={() => onOpenTrade('BUY')}
          className="h-9 rounded-xl bg-lime/15 text-lime hover:bg-lime/20 text-[11px] font-bold flex items-center justify-center gap-1"
        >
          <Plus size={13} />
          <span>خرید</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenTrade('SELL')}
          className="h-9 rounded-xl bg-surface2 border border-line text-white hover:bg-white/10 text-[11px] font-bold flex items-center justify-center gap-1"
        >
          <ArrowUpRight size={13} />
          <span>فروش</span>
        </button>
        <button
          type="button"
          onClick={onOpenPrice}
          className="h-9 rounded-xl bg-surface2 border border-line text-sky hover:bg-white/10 text-[11px] font-bold flex items-center justify-center gap-1"
        >
          <Tag size={13} />
          <span>قیمت</span>
        </button>
      </div>
    </div>
  );
}

function AssetDetailView({
  position,
  snapshots,
  feedEnabled,
  hidden,
  showVoided,
  onToggleVoided,
  onOpenTrade,
  onAmendRecord,
  onVoidRecord,
  onOpenPrice,
  onOpenLinkCash,
  onUnlinkCash,
  onOpenPurchaseBrake,
}: {
  position: AssetPositionView;
  snapshots: PriceSnapshot[];
  feedEnabled: boolean;
  hidden: boolean;
  showVoided: boolean;
  onToggleVoided: () => void;
  onOpenTrade: (kind: 'BUY' | 'SELL' | 'OPENING') => void;
  onAmendRecord: (rec: EffectiveRecord) => void;
  onVoidRecord: (recordId: string) => void;
  onOpenPrice: () => void;
  onOpenLinkCash: (rec: EffectiveRecord) => void;
  onUnlinkCash: (recordId: string) => void;
  onOpenPurchaseBrake: () => void;
}) {
  const [priceDays, setPriceDays] = useState<7 | 30 | 90>(30);
  const { asset, replay, valuation, cashLinksByRecordId } = position;
  const realizedBadge = formatProfitBadge(
    replay.realizedProfitKnown ? replay.realizedProfitRial : null,
    hidden
  );
  const unrealizedBadge = formatProfitBadge(valuation.unrealizedProfitRial, hidden);

  const visibleRecords = showVoided
    ? [...replay.effectiveRecords, ...replay.voidedRecords].sort(
        (a, b) => b.effectiveAtMs - a.effectiveAtMs
      )
    : [...replay.effectiveRecords].sort((a, b) => b.effectiveAtMs - a.effectiveAtMs);

  return (
    <div className="space-y-3.5">
      {replay.status === 'NEEDS_REVIEW' && (
        <div className="p-3.5 rounded-2xl bg-bad/15 border border-bad/35 space-y-1.5">
          <div className="flex items-center gap-2 text-bad font-bold text-xs">
            <AlertTriangle size={16} />
            <span>این دارایی در وضعیت «نیازمند بررسی» است</span>
          </div>
          <ul className="text-[11px] text-white/90 list-disc pr-4 space-y-0.5">
            {replay.conflicts.map((c, idx) => (
              <li key={idx}>{c.message}</li>
            ))}
          </ul>
          <div className="text-[10px] text-muted">
            آخرین وضعیت معتبر محلی:{' '}
            {hidden
              ? Money.HIDDEN
              : formatQtyFa(
                  replay.lastValidState.quantity,
                  asset.baseUnit,
                  asset.pricingSpec.referenceFineness
                )}
          </div>
          <button
            type="button"
            onClick={() => {
              clearResolvedSyncConflicts(asset.id).catch(err => {
                alert(err instanceof Error ? err.message : 'هنوز تعارض برطرف نشده است');
              });
            }}
            className="px-3 py-1.5 rounded-xl bg-surface border border-line text-[10px] font-bold text-white hover:bg-white/10"
          >
            تأیید بررسی تعارض همگام‌سازی
          </button>
        </div>
      )}

      {/* Position Summary Card */}
      <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted">{kindLabelFa(asset.kind)} · {asset.instrumentKey}</div>
            <div className="text-lg font-black text-white mt-0.5">
              {hidden
                ? Money.HIDDEN
                : formatQtyFa(replay.quantity, asset.baseUnit, asset.pricingSpec.referenceFineness)}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPrice}
            className="px-3 py-1.5 rounded-xl bg-sky/15 text-sky border border-sky/25 text-[11px] font-bold flex items-center gap-1"
          >
            <Tag size={13} />
            <span>ثبت قیمت روز</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-line">
          <div>
            <span className="text-[10px] text-muted block">بهای مانده</span>
            <span className="font-bold text-white">
              {hidden
                ? Money.HIDDEN
                : replay.costKnown && replay.costBasisRial !== null
                ? `${Money.toman(Number(R.roundHalfUp(replay.costBasisRial)))} تومان`
                : 'نامعلوم'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted block">میانگین هزینه واحد</span>
            <span className="font-bold text-white">
              {hidden
                ? Money.HIDDEN
                : replay.averageUnitCostRial !== null
                ? `${Money.toman(Number(R.roundHalfUp(replay.averageUnitCostRial)))} تومان`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted block">ارزش فروش برآوردی</span>
            <span className="font-bold text-white">
              {hidden
                ? Money.HIDDEN
                : valuation.estimatedSaleRial !== null
                ? `${Money.toman(Number(R.roundHalfUp(valuation.estimatedSaleRial)))} تومان`
                : valuation.metalValueRial !== null
                ? `فلز: ${Money.toman(Number(R.roundHalfUp(valuation.metalValueRial)))} تومان`
                : 'بدون قیمت'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted block">سود/زیان تحقق‌نیافته</span>
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border ${unrealizedBadge.toneClass}`}>
              {unrealizedBadge.text}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
          <span className="text-muted text-[11px]">سود/زیان تحقق‌یافته:</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${realizedBadge.toneClass}`}>
            {realizedBadge.text}
          </span>
        </div>

        {/* Valuation notes */}
        <div className="text-[10px] text-muted space-y-0.5">
          {valuation.priceLabel === 'REFERENCE_ESTIMATE' && (
            <div className="text-amber-300">برآورد با نرخ مرجع (نرخ خرید معامله‌گر ثبت نشده است).</div>
          )}
          {valuation.priceLabel === 'JEWELRY_ESTIMATE' && (
            <div className="text-amber-300">
              برآورد فروش زیورآلات با فرض کسر {Money.fa(String(Number(valuation.assumedHaircutRate || 0) * 100))}٪.
            </div>
          )}
          {valuation.priceLabel === 'METAL_ONLY_NEEDS_INFO' && (
            <div className="text-warn">
              درصد کسر فروش زیورآلات مشخص نیست؛ فقط ارزش فلز خالص نمایش داده شده است.
            </div>
          )}
          {valuation.priceSourceSnapshot && (
            <div className="space-y-0.5">
              <div>
                آخرین نرخ ({valuation.priceSourceSnapshot.quoteSide === 'DEALER_BID' ? 'خرید بازار' : 'مرجع'}):{' '}
                {hidden ? Money.HIDDEN : `${Money.toman(Number(R.roundHalfUp(R.fromDecimal(valuation.priceSourceSnapshot.amount))))} تومان`} ·{' '}
                {formatPriceAgeFa(valuation.priceSourceSnapshot.observedAtMs)}
                {valuation.isStale ? ' (قدیمی)' : ''}
              </div>
              <div className="text-[10px] text-muted">
                منبع:{' '}
                {valuation.priceSourceSnapshot.sourceId === 'nerkhara' ? (
                  <a
                    href="https://nerkhara.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky underline"
                  >
                    NerkhAra (nerkhara.com)
                  </a>
                ) : (
                  sourceDisplayLabelFa(valuation.priceSourceSnapshot.sourceId)
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenTrade('BUY')}
            className="h-10 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1"
          >
            <Plus size={15} />
            <span>خرید</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenTrade('SELL')}
            className="h-10 rounded-xl bg-surface2 border border-line text-white font-bold text-xs flex items-center justify-center gap-1"
          >
            <ArrowUpRight size={15} />
            <span>فروش</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenTrade('OPENING')}
            className="h-10 rounded-xl bg-surface2 border border-line text-t2 font-bold text-xs flex items-center justify-center gap-1"
          >
            <History size={14} />
            <span>افتتاحیه</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenPurchaseBrake}
          className="w-full h-9 rounded-xl bg-amber-500/10 border border-amber-400/25 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-amber-500/15"
        >
          <ShieldAlert size={13} />
          <span>بررسی قصد خرید و مکث اختیاری (ترمز هیجانی)</span>
        </button>
      </div>

      {/* Price History Chart for this Asset */}
      <InstrumentPriceSection
        position={position}
        snapshots={snapshots}
        days={priceDays}
        onChangeDays={setPriceDays}
        feedEnabled={feedEnabled}
        hidden={hidden}
      />

      {/* Trend Analysis & Data Quality Card */}
      <TrendAnalysisSection
        position={position}
        snapshots={snapshots}
        hidden={hidden}
      />

      {/* Ledger Records */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-white">تاریخچهٔ ثبت‌ها ({Money.fa(String(visibleRecords.length))})</span>
          {replay.voidedRecords.length > 0 && (
            <button
              type="button"
              onClick={onToggleVoided}
              className="text-[11px] text-sky hover:underline"
            >
              {showVoided
                ? 'پنهان‌کردن ابطال‌شده‌ها'
                : `نمایش ابطال‌شده‌ها (${Money.fa(String(replay.voidedRecords.length))})`}
            </button>
          )}
        </div>

        {visibleRecords.length === 0 ? (
          <div className="p-6 rounded-2xl bg-surface border border-line text-center text-xs text-muted">
            هنوز معامله یا موجودی افتتاحیه‌ای برای این دارایی ثبت نشده است.
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleRecords.map(rec => {
              const effect = replay.recordEffects.get(rec.recordId);
              const link = cashLinksByRecordId.get(rec.recordId);
              const profitBadge =
                rec.effectiveKind === 'SELL' && effect
                  ? formatProfitBadge(effect.realizedProfitRial, hidden)
                  : null;

              return (
                <div
                  key={rec.recordId}
                  className={`p-3.5 rounded-2xl border space-y-2 ${
                    rec.voided
                      ? 'bg-surface/40 border-line/50 opacity-60'
                      : 'bg-surface border-line'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          rec.effectiveKind === 'BUY'
                            ? 'bg-lime/15 text-lime'
                            : rec.effectiveKind === 'SELL'
                            ? 'bg-sky/15 text-sky'
                            : 'bg-purple-500/15 text-purple-300'
                        }`}
                      >
                        {rec.effectiveKind === 'SELL' ? (
                          <ArrowUpRight size={16} />
                        ) : (
                          <ArrowDownLeft size={16} />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {rec.effectiveKind === 'OPENING'
                            ? 'موجودی افتتاحیه'
                            : rec.effectiveKind === 'BUY'
                            ? 'خرید'
                            : 'فروش'}
                          {rec.voided && ' (ابطال‌شده)'}
                        </div>
                        <div className="text-[10px] text-muted">
                          {Jalali.longDate(rec.effectiveAtMs)}
                          {rec.datePrecision === 'EXACT' ? ` · ${Jalali.time(rec.effectiveAtMs)}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-left">
                      <div className="text-xs font-extrabold text-white">
                        {hidden
                          ? Money.HIDDEN
                          : `${Money.fa(rec.snapshot.quantity)} ${unitLabelFa(rec.snapshot.unit)}`}
                      </div>
                      <div className="text-[10px] text-muted dir-ltr">
                        {hidden
                          ? ''
                          : effect && effect.costKnown
                          ? `${Money.toman(Number(R.roundHalfUp(effect.settlementRial)))} تومان`
                          : 'بها نامعلوم'}
                      </div>
                    </div>
                  </div>

                  {profitBadge && !rec.voided && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">نتیجهٔ فروش:</span>
                      <span className={`px-2 py-0.5 rounded-lg border font-bold text-[10px] ${profitBadge.toneClass}`}>
                        {profitBadge.text}
                      </span>
                    </div>
                  )}

                  {(rec.snapshot.storageLocation || rec.snapshot.note) && (
                    <div className="text-[10px] text-muted space-y-0.5">
                      {rec.snapshot.storageLocation && <div>محل نگهداری: {rec.snapshot.storageLocation}</div>}
                      {rec.snapshot.note && <div>توضیح: {rec.snapshot.note}</div>}
                    </div>
                  )}

                  {/* Cash Link status + actions */}
                  {!rec.voided && (
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-line/70 text-[10px]">
                      <div className="flex items-center gap-1.5 text-muted">
                        {link && link.status === 'ACTIVE' ? (
                          <span className="text-ok font-bold">
                            {link.origin === 'CREATED_BY_PORTFOLIO'
                              ? 'متصل به گردش سرمایه‌ای حساب'
                              : 'متصل به گردش بانکی موجود'}
                          </span>
                        ) : link && link.status === 'NEEDS_RELINK' ? (
                          <span className="text-warn font-bold">نیازمند تطبیق مجدد پیوند حساب</span>
                        ) : link && link.status === 'NEEDS_REVIEW' ? (
                          <span className="text-bad font-bold">پیوند نیازمند بررسی</span>
                        ) : (
                          <span>بدون پیوند حساب</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {rec.effectiveKind !== 'OPENING' && (
                          link && link.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => onUnlinkCash(rec.recordId)}
                              className="px-2 py-1 rounded-lg bg-surface2 text-muted hover:text-white flex items-center gap-1"
                            >
                              <Unlink size={11} />
                              <span>قطع پیوند</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenLinkCash(rec)}
                              className="px-2 py-1 rounded-lg bg-surface2 text-sky hover:bg-white/10 flex items-center gap-1"
                            >
                              <Link2 size={11} />
                              <span>اتصال حساب</span>
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => onAmendRecord(rec)}
                          className="px-2 py-1 rounded-lg bg-surface2 text-white hover:bg-white/10 flex items-center gap-1"
                        >
                          <Edit3 size={11} />
                          <span>اصلاح</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onVoidRecord(rec.recordId)}
                          className="px-2 py-1 rounded-lg bg-bad/15 text-bad hover:bg-bad/25 flex items-center gap-1"
                        >
                          <Trash2 size={11} />
                          <span>ابطال</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AddAssetModal({
  portfolioId,
  onClose,
  onCreated,
}: {
  portfolioId: string;
  onClose: () => void;
  onCreated: (assetId: string) => void;
}) {
  const [presetId, setPresetId] = useState<string>('gold_18k');
  const [customMode, setCustomMode] = useState(false);
  const [name, setName] = useState(ASSET_PRESETS[0].label);
  const [kind, setKind] = useState<AssetKind>('GOLD_MELTED');
  const [instrumentKey, setInstrumentKey] = useState(ASSET_PRESETS[0].instrumentKey);
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('GRAM');
  const [refFineness, setRefFineness] = useState('750');
  const [haircutPercent, setHaircutPercent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (p: AssetPreset) => {
    setCustomMode(false);
    setPresetId(p.id);
    setName(p.label);
    setKind(p.kind);
    setInstrumentKey(p.instrumentKey);
    setBaseUnit(p.baseUnit);
    setRefFineness(p.pricingSpec.referenceFineness ? String(p.pricingSpec.referenceFineness) : '');
    setHaircutPercent('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const preset = ASSET_PRESETS.find(p => p.id === presetId);
      const spec: PricingSpec = customMode
        ? {
            referenceFineness: baseUnit === 'GRAM' && refFineness.trim() ? Number(refFineness) : undefined,
            quoteUnit: baseUnit,
          }
        : { ...(preset?.pricingSpec ?? {}) };

      if (kind === 'GOLD_JEWELRY' && haircutPercent.trim() !== '') {
        const pct = Number(Money.ascii(haircutPercent));
        if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
          throw new Error('درصد کسر فروش باید بین ۰ تا ۹۹ باشد');
        }
        spec.defaultHaircutRate = String(pct / 100);
      }

      const portfolio = await ensureDefaultPortfolio();
      const created = await createInvestmentAsset({
        portfolioId: portfolio.id,
        kind,
        name,
        instrumentKey,
        baseUnit,
        pricingSpec: spec,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ایجاد دارایی');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">افزودن دارایی جدید</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white">انتخاب نوع دارایی</label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
            {ASSET_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`p-2.5 rounded-xl border text-right transition-colors ${
                  !customMode && presetId === p.id
                    ? 'bg-lime/15 border-lime/40 text-white'
                    : 'bg-surface border-line text-t2 hover:text-white'
                }`}
              >
                <div className="text-[11px] font-bold truncate">{p.label}</div>
                <div className="text-[9.5px] text-muted truncate mt-0.5">{p.sublabel}</div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setKind('OTHER');
                setName('');
                setInstrumentKey('');
              }}
              className={`p-2.5 rounded-xl border text-right ${
                customMode
                  ? 'bg-lime/15 border-lime/40 text-white'
                  : 'bg-surface border-line text-t2 hover:text-white'
              }`}
            >
              <div className="text-[11px] font-bold">دارایی دلخواه</div>
              <div className="text-[9.5px] text-muted mt-0.5">تعریف شناسه و واحد دستی</div>
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="text-[11px] text-muted block mb-1">نام نمایشی</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثلاً: دستبند طلا یا سکه امامی"
              className="w-full h-11 px-3 rounded-xl bg-surface border border-line text-xs text-white focus:outline-none focus:border-sky"
            />
          </div>

          {customMode && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-1">واحد پایه</label>
                  <Select
                    value={baseUnit}
                    onChange={val => setBaseUnit(val)}
                    options={[
                      { value: 'GRAM', label: 'گرم' },
                      { value: 'COUNT', label: 'عدد' },
                      { value: 'UNIT', label: 'واحد' },
                    ]}
                  />
                </div>
                {baseUnit === 'GRAM' && (
                  <div>
                    <label className="text-[11px] text-muted block mb-1">عیار مبنا</label>
                    <input
                      type="text"
                      value={refFineness}
                      onChange={e => setRefFineness(Money.ascii(e.target.value))}
                      className="w-full h-11 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">شناسه ابزار (Instrument Key)</label>
                <input
                  type="text"
                  value={instrumentKey}
                  onChange={e => setInstrumentKey(e.target.value)}
                  placeholder="مثلاً: custom_gold_bar"
                  className="w-full h-11 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
                />
              </div>
            </>
          )}

          {kind === 'GOLD_JEWELRY' && (
            <div>
              <label className="text-[11px] text-muted block mb-1">
                درصد کسر فروش پیش‌فرض (اختیاری — اگر نمی‌دانید خالی بگذارید)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={haircutPercent}
                onChange={e => setHaircutPercent(Money.ascii(e.target.value))}
                placeholder="مثلاً: 10"
                className="w-full h-11 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
          )}
        </div>

        <div className="text-[10px] text-muted">
          جنس، عیار مبنا، واحد پایه و هویت ابزار پس از ثبت اولین معامله ثابت می‌مانند.
        </div>

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab active:scale-[0.98]"
        >
          ذخیره دارایی
        </button>
      </form>
    </div>
  );
}

function TradeModal({
  position,
  accounts,
  mode,
  initialKind,
  record,
  cloudSyncActive,
  onClose,
}: {
  position: AssetPositionView;
  accounts: Account[];
  mode: 'CREATE' | 'AMEND';
  initialKind: 'OPENING' | 'BUY' | 'SELL';
  record?: EffectiveRecord;
  cloudSyncActive: boolean;
  onClose: () => void;
}) {
  const { asset } = position;
  const initSnap = record?.snapshot;
  const [kind, setKind] = useState<'OPENING' | 'BUY' | 'SELL'>(initialKind);
  const [unit, setUnit] = useState<TradeUnit>(
    initSnap?.unit ?? (asset.baseUnit === 'GRAM' ? 'GRAM' : asset.baseUnit)
  );
  const [quantity, setQuantity] = useState(initSnap?.quantity ?? '');
  const [grossMassGram, setGrossMassGram] = useState(initSnap?.grossMassGram ?? '');
  const [attachmentsGram, setAttachmentsGram] = useState(initSnap?.attachmentsGram ?? '');
  const [fineness, setFineness] = useState(
    String(initSnap?.fineness ?? asset.pricingSpec.referenceFineness ?? 750)
  );
  const [costKnown, setCostKnown] = useState(initSnap ? initSnap.costKnown : true);
  const [principalToman, setPrincipalToman] = useState(
    initSnap?.principalRial ? Money.tomanInput(Number(initSnap.principalRial)) : ''
  );
  const [wageToman, setWageToman] = useState(
    initSnap?.feesRial?.wage ? Money.tomanInput(Number(initSnap.feesRial.wage)) : ''
  );
  const [sellerProfitToman, setSellerProfitToman] = useState(
    initSnap?.feesRial?.sellerProfit ? Money.tomanInput(Number(initSnap.feesRial.sellerProfit)) : ''
  );
  const [taxToman, setTaxToman] = useState(
    initSnap?.feesRial?.tax ? Money.tomanInput(Number(initSnap.feesRial.tax)) : ''
  );
  const [commissionToman, setCommissionToman] = useState(
    initSnap?.feesRial?.commission ? Money.tomanInput(Number(initSnap.feesRial.commission)) : ''
  );
  const [settlementToman, setSettlementToman] = useState(
    initSnap?.settlementRial ? Money.tomanInput(Number(initSnap.settlementRial)) : ''
  );
  const [useDirectSettlement, setUseDirectSettlement] = useState(
    Boolean(initSnap?.settlementRial && !initSnap?.principalRial)
  );
  const [storageLocation, setStorageLocation] = useState(initSnap?.storageLocation ?? '');
  const [note, setNote] = useState(initSnap?.note ?? '');

  const initJ = Jalali.of(record?.effectiveAtMs ?? Date.now());
  const [jYear, setJYear] = useState(initJ.y);
  const [jMonth, setJMonth] = useState(initJ.m);
  const [jDay, setJDay] = useState(initJ.d);

  const [cashMode, setCashMode] = useState<'NONE' | 'CREATE_TXN' | 'LINK_EXISTING'>('NONE');
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [selectedBankTxnId, setSelectedBankTxnId] = useState<number>(0);
  const [candidateTxns, setCandidateTxns] = useState<Txn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const buildPayload = (): TradeSnapshotPayload => {
    const fees = {
      wage: wageToman ? String(Money.parseToman(wageToman) ?? 0) : undefined,
      sellerProfit: sellerProfitToman ? String(Money.parseToman(sellerProfitToman) ?? 0) : undefined,
      tax: taxToman ? String(Money.parseToman(taxToman) ?? 0) : undefined,
      commission: commissionToman ? String(Money.parseToman(commissionToman) ?? 0) : undefined,
    };

    const netJewelry =
      asset.kind === 'GOLD_JEWELRY' && grossMassGram.trim() !== ''
        ? R.toDecimalString(
            R.sub(
              R.fromDecimal(grossMassGram),
              attachmentsGram.trim() !== '' ? R.fromDecimal(attachmentsGram) : R.zero
            ),
            4
          )
        : quantity;

    return {
      quantity: netJewelry,
      unit,
      fineness: asset.baseUnit === 'GRAM' ? Number(Money.ascii(fineness)) : undefined,
      grossMassGram: asset.kind === 'GOLD_JEWELRY' ? grossMassGram.trim() || undefined : undefined,
      attachmentsGram: asset.kind === 'GOLD_JEWELRY' ? attachmentsGram.trim() || undefined : undefined,
      principalRial:
        costKnown && !useDirectSettlement && principalToman
          ? String(Money.parseToman(principalToman) ?? 0)
          : undefined,
      feesRial: costKnown && !useDirectSettlement ? fees : undefined,
      settlementRial:
        costKnown && useDirectSettlement && settlementToman
          ? String(Money.parseToman(settlementToman) ?? 0)
          : undefined,
      costKnown: kind === 'OPENING' ? costKnown : true,
      storageLocation: storageLocation.trim() || undefined,
      note: note.trim() || undefined,
    };
  };

  const previewSettlementRial = (() => {
    try {
      const p = buildPayload();
      const { settlementRial, costKnown: ck } = computeTradeSettlementRial(p, kind);
      return ck ? Number(R.roundHalfUp(settlementRial)) : null;
    } catch {
      return null;
    }
  })();

  const handleLoadCandidates = async () => {
    if (!accountId || kind === 'OPENING' || previewSettlementRial == null || previewSettlementRial <= 0) {
      setCandidateTxns([]);
      return;
    }
    const found = await findCandidateBankTxnsForInvestment({
      accountId,
      kind,
      settlementRial: previewSettlementRial,
    });
    setCandidateTxns(found);
    if (found[0]?.id) setSelectedBankTxnId(found[0].id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const maxD = Jalali.monthDays(jYear, jMonth);
      const effectiveAtMs = Jalali.millis(jYear, jMonth, Math.min(jDay, maxD), 12, 0);
      const payload = buildPayload();

      let cashLink: CashLinkChoice | undefined;
      if (kind !== 'OPENING') {
        if (cashMode === 'NONE') {
          cashLink = mode === 'CREATE' ? { mode: 'NONE' } : undefined;
        } else if (cashMode === 'CREATE_TXN') {
          cashLink = { mode: 'CREATE_TXN', accountId };
        } else if (cashMode === 'LINK_EXISTING') {
          if (!selectedBankTxnId) {
            throw new Error('لطفاً یک گردش بانکی هم‌مبلغ انتخاب کنید');
          }
          cashLink = { mode: 'LINK_EXISTING', accountId, bankTxnId: selectedBankTxnId };
        }
      }

      if (mode === 'AMEND' && record) {
        await amendInvestmentEntry({
          assetId: asset.id,
          recordId: record.recordId,
          targetKind: kind,
          effectiveAtMs,
          snapshot: payload,
          cashLink,
        });
      } else {
        await recordInvestmentEntry({
          assetId: asset.id,
          kind,
          effectiveAtMs,
          datePrecision: kind === 'OPENING' ? 'DAY' : 'EXACT',
          payload,
          cashLink,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت معامله');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">
            {mode === 'AMEND' ? 'اصلاح ثبت' : 'ثبت جدید'} · {asset.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Kind selector */}
        <div className="grid grid-cols-3 gap-1.5 bg-surface p-1 rounded-2xl border border-line">
          {([
            { id: 'BUY', label: 'خرید' },
            { id: 'SELL', label: 'فروش' },
            { id: 'OPENING', label: 'افتتاحیه' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKind(tab.id)}
              className={`h-9 rounded-xl text-xs font-bold transition-colors ${
                kind === tab.id ? 'bg-lime text-onLime' : 'text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quantity / Jewelry weight */}
        {asset.kind === 'GOLD_JEWELRY' ? (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted block mb-1">وزن ناخالص (گرم)</label>
              <input
                type="text"
                inputMode="decimal"
                value={grossMassGram}
                onChange={e => setGrossMassGram(Money.ascii(e.target.value))}
                placeholder="10"
                className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">سنگ/متعلقات (گرم)</label>
              <input
                type="text"
                inputMode="decimal"
                value={attachmentsGram}
                onChange={e => setAttachmentsGram(Money.ascii(e.target.value))}
                placeholder="0"
                className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">عیار</label>
              <input
                type="text"
                inputMode="numeric"
                value={fineness}
                onChange={e => setFineness(Money.ascii(e.target.value))}
                className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
          </div>
        ) : (
          <div className={`grid gap-2 ${asset.baseUnit === 'GRAM' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div>
              <label className="text-[10px] text-muted block mb-1">مقدار / وزن</label>
              <input
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={e => setQuantity(Money.ascii(e.target.value))}
                placeholder="مثلاً: 2.5"
                className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">واحد</label>
              <Select
                size="sm"
                value={unit}
                onChange={v => setUnit(v)}
                options={
                  asset.baseUnit === 'GRAM'
                    ? [
                        { value: 'GRAM', label: 'گرم' },
                        { value: 'MESGHAL', label: 'مثقال (۷۰۵)' },
                        { value: 'TROY_OUNCE', label: 'اونس تروی' },
                      ]
                    : asset.baseUnit === 'COUNT'
                    ? [{ value: 'COUNT', label: 'عدد' }]
                    : [{ value: 'UNIT', label: 'واحد' }]
                }
              />
            </div>
            {asset.baseUnit === 'GRAM' && (
              <div>
                <label className="text-[10px] text-muted block mb-1">عیار</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fineness}
                  onChange={e => setFineness(Money.ascii(e.target.value))}
                  className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
                />
              </div>
            )}
          </div>
        )}

        {/* Opening cost known toggle */}
        {kind === 'OPENING' && (
          <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
            <input
              type="checkbox"
              checked={!costKnown}
              onChange={e => setCostKnown(!e.target.checked)}
              className="accent-lime"
            />
            <span>بهای تاریخی خرید این موجودی نامعلوم است</span>
          </label>
        )}

        {/* Monetary amounts */}
        {(kind !== 'OPENING' || costKnown) && (
          <div className="p-3 rounded-2xl bg-surface border border-line space-y-2.5">
            <label className="flex items-center gap-2 text-[11px] text-t2 cursor-pointer">
              <input
                type="checkbox"
                checked={useDirectSettlement}
                onChange={e => setUseDirectSettlement(e.target.checked)}
                className="accent-lime"
              />
              <span>وارد کردن مستقیم مبلغ نهایی فاکتور (بدون تفکیک هزینه‌ها)</span>
            </label>

            {useDirectSettlement ? (
              <div>
                <label className="text-[10px] text-muted block mb-1">مبلغ نهایی فاکتور (تومان)</label>
                <AmountInput
                  value={settlementToman}
                  onChange={setSettlementToman}
                  placeholder="مثلاً 45,000,000"
                  className="w-full h-10 px-3 rounded-xl bg-bg border border-line text-xs text-white"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-[10px] text-muted block mb-1">مبلغ اصل (تومان)</label>
                  <AmountInput
                    value={principalToman}
                    onChange={setPrincipalToman}
                    placeholder="مثلاً 42,000,000"
                    className="w-full h-10 px-3 rounded-xl bg-bg border border-line text-xs text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted block mb-1">اجرت (تومان)</label>
                    <AmountInput
                      value={wageToman}
                      onChange={setWageToman}
                      placeholder="۰"
                      className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-[11px] text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-1">سود فروشنده (تومان)</label>
                    <AmountInput
                      value={sellerProfitToman}
                      onChange={setSellerProfitToman}
                      placeholder="۰"
                      className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-[11px] text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-1">مالیات (تومان)</label>
                    <AmountInput
                      value={taxToman}
                      onChange={setTaxToman}
                      placeholder="۰"
                      className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-[11px] text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-1">کارمزد (تومان)</label>
                    <AmountInput
                      value={commissionToman}
                      onChange={setCommissionToman}
                      placeholder="۰"
                      className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-[11px] text-white"
                    />
                  </div>
                </div>
              </>
            )}

            {previewSettlementRial !== null && (
              <div className="text-[11px] text-lime font-bold pt-1 border-t border-line/70 flex justify-between">
                <span>{kind === 'SELL' ? 'دریافتی خالص:' : 'پرداختی نهایی:'}</span>
                <span>{Money.toman(previewSettlementRial)} تومان</span>
              </div>
            )}
          </div>
        )}

        {/* Jalali date */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted block mb-1">روز</label>
            <Select
              size="sm"
              value={jDay}
              onChange={setJDay}
              options={Array.from({ length: Jalali.monthDays(jYear, jMonth) }, (_, i) => ({
                value: i + 1,
                label: Money.fa(String(i + 1)),
              }))}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">ماه</label>
            <Select
              size="sm"
              value={jMonth}
              onChange={setJMonth}
              options={Jalali.MONTHS.map((m, idx) => ({ value: idx + 1, label: m }))}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">سال</label>
            <Select
              size="sm"
              value={jYear}
              onChange={setJYear}
              options={[-2, -1, 0, 1].map(offset => {
                const y = initJ.y + offset;
                return { value: y, label: Money.fa(String(y)) };
              })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted block mb-1">محل نگهداری (اختیاری)</label>
            <input
              type="text"
              value={storageLocation}
              onChange={e => setStorageLocation(e.target.value)}
              placeholder="مثلاً: گاوصندوق"
              className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">توضیح (اختیاری)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="کد عیار / یادداشت"
              className="w-full h-10 px-2.5 rounded-xl bg-surface border border-line text-xs text-white"
            />
          </div>
        </div>

        {/* Cash Link options for BUY / SELL */}
        {kind !== 'OPENING' && (
          <div className="p-3 rounded-2xl bg-surface border border-line space-y-2.5">
            <div className="text-[11px] font-bold text-white">پیوند به حساب بانکی</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'NONE', label: 'بدون پیوند' },
                { id: 'CREATE_TXN', label: 'ثبت گردش', disabled: cloudSyncActive || accounts.length === 0 },
                { id: 'LINK_EXISTING', label: 'گردش موجود', disabled: cloudSyncActive || accounts.length === 0 },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={'disabled' in opt ? opt.disabled : false}
                  onClick={() => {
                    setCashMode(opt.id);
                    if (opt.id === 'LINK_EXISTING') void handleLoadCandidates();
                  }}
                  className={`h-8 rounded-xl text-[10px] font-bold border disabled:opacity-40 ${
                    cashMode === opt.id
                      ? 'bg-sky/15 text-sky border-sky/40'
                      : 'bg-bg border-line text-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {cashMode !== 'NONE' && (
              <div className="space-y-2">
                <Select
                  size="sm"
                  value={accountId}
                  onChange={v => setAccountId(v)}
                  options={accounts.map(a => ({ value: a.id!, label: a.name }))}
                />
                {cashMode === 'LINK_EXISTING' && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleLoadCandidates}
                      className="text-[10px] text-sky flex items-center gap-1"
                    >
                      <RefreshCw size={11} />
                      <span>جستجوی تراکنش هم‌مبلغ در این حساب</span>
                    </button>
                    {candidateTxns.length > 0 ? (
                      <Select
                        size="sm"
                        value={selectedBankTxnId}
                        onChange={setSelectedBankTxnId}
                        options={candidateTxns.map(t => ({
                          value: t.id!,
                          label: `${t.title || 'تراکنش'} · ${Jalali.shortDateTime(t.occurredAt)}`,
                        }))}
                      />
                    ) : (
                      <div className="text-[10px] text-warn">
                        تراکنش هم‌مبلغ و بدون پیوند دیگری در این حساب یافت نشد.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab disabled:opacity-50"
        >
          {saving ? 'در حال ثبت...' : mode === 'AMEND' ? 'ثبت اصلاح' : 'ثبت در دفتر سرمایه‌گذاری'}
        </button>
      </form>
    </div>
  );
}

function ManualPriceModal({
  position,
  onClose,
}: {
  position: AssetPositionView;
  onClose: () => void;
}) {
  const { asset } = position;
  const [amountToman, setAmountToman] = useState('');
  const [quoteSide, setQuoteSide] = useState<QuoteSide>('DEALER_BID');
  const [unit, setUnit] = useState<TradeUnit>(
    asset.pricingSpec.quoteUnit ?? (asset.baseUnit === 'GRAM' ? 'GRAM' : asset.baseUnit)
  );
  const [fineness, setFineness] = useState(
    String(
      unit === 'MESGHAL'
        ? 705
        : asset.pricingSpec.referenceFineness ?? 750
    )
  );
  const initJ = Jalali.of(Date.now());
  const [jYear, setJYear] = useState(initJ.y);
  const [jMonth, setJMonth] = useState(initJ.m);
  const [jDay, setJDay] = useState(initJ.d);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const rial = Money.parseToman(amountToman);
      if (!rial || rial <= 0) throw new Error('لطفاً مبلغ قیمت معتبر وارد کنید');
      const maxD = Jalali.monthDays(jYear, jMonth);
      const observedAtMs = Jalali.millis(jYear, jMonth, Math.min(jDay, maxD), 12, 0);

      await recordManualPriceSnapshot({
        instrumentKey: asset.instrumentKey,
        quoteSide,
        unit,
        fineness:
          unit === 'GRAM' || unit === 'MESGHAL' ? Number(Money.ascii(fineness)) : undefined,
        amountRial: String(rial),
        observedAtMs,
        market: 'manual',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت قیمت');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">ثبت قیمت دستی · {asset.name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">قیمت (تومان)</label>
          <AmountInput
            value={amountToman}
            onChange={setAmountToman}
            placeholder="مثلاً: 4,500,000"
            className="w-full h-11 px-3 rounded-xl bg-surface border border-line text-xs text-white"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">سمت نرخ</label>
          <Select
            size="sm"
            value={quoteSide}
            onChange={setQuoteSide}
            options={[
              { value: 'DEALER_BID', label: 'نرخ خرید بازار از شما (فروش به طلافروش)' },
              { value: 'REFERENCE', label: 'نرخ مرجع تابلو' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted block mb-1">واحد نرخ</label>
            <Select
              size="sm"
              value={unit}
              onChange={v => {
                setUnit(v);
                if (v === 'MESGHAL') setFineness('705');
              }}
              options={
                asset.baseUnit === 'GRAM'
                  ? [
                      { value: 'GRAM', label: 'هر گرم' },
                      { value: 'MESGHAL', label: 'هر مثقال (مظنه)' },
                      { value: 'TROY_OUNCE', label: 'هر اونس تروی' },
                    ]
                  : [{ value: asset.baseUnit, label: unitLabelFa(asset.baseUnit) }]
              }
            />
          </div>
          {(unit === 'GRAM' || unit === 'MESGHAL') && (
            <div>
              <label className="text-[11px] text-muted block mb-1">عیار نرخ</label>
              <input
                type="text"
                inputMode="numeric"
                value={fineness}
                onChange={e => setFineness(Money.ascii(e.target.value))}
                className="w-full h-9 px-2.5 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
          )}
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">تاریخ اعلام قیمت</label>
          <div className="grid grid-cols-3 gap-1.5">
            <Select
              size="sm"
              value={jDay}
              onChange={setJDay}
              options={Array.from({ length: Jalali.monthDays(jYear, jMonth) }, (_, i) => ({
                value: i + 1,
                label: Money.fa(String(i + 1)),
              }))}
            />
            <Select
              size="sm"
              value={jMonth}
              onChange={setJMonth}
              options={Jalali.MONTHS.map((m, idx) => ({ value: idx + 1, label: m }))}
            />
            <Select
              size="sm"
              value={jYear}
              onChange={setJYear}
              options={[-1, 0, 1].map(o => {
                const y = initJ.y + o;
                return { value: y, label: Money.fa(String(y)) };
              })}
            />
          </div>
        </div>

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab"
        >
          ذخیره قیمت
        </button>
      </form>
    </div>
  );
}

function CashLinkModal({
  position,
  record,
  accounts,
  cloudSyncActive,
  onClose,
}: {
  position: AssetPositionView;
  record: EffectiveRecord;
  accounts: Account[];
  cloudSyncActive: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'CREATE_TXN' | 'LINK_EXISTING'>('CREATE_TXN');
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [candidates, setCandidates] = useState<Txn[]>([]);
  const [bankTxnId, setBankTxnId] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const settlementNumber = useMemo(() => {
    const { settlementRial } = computeTradeSettlementRial(record.snapshot, record.effectiveKind);
    return Number(R.roundHalfUp(settlementRial));
  }, [record]);

  const loadCandidates = async () => {
    if (!accountId || record.effectiveKind === 'OPENING') return;
    const found = await findCandidateBankTxnsForInvestment({
      accountId,
      kind: record.effectiveKind,
      settlementRial: settlementNumber,
    });
    setCandidates(found);
    if (found[0]?.id) setBankTxnId(found[0].id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await linkCashToRecord(
        position.asset.id,
        record.recordId,
        mode === 'CREATE_TXN'
          ? { mode: 'CREATE_TXN', accountId }
          : { mode: 'LINK_EXISTING', accountId, bankTxnId }
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در اتصال حساب');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">اتصال معامله به حساب</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-muted">
          مبلغ تسویه: <strong className="text-white">{Money.toman(settlementNumber)} تومان</strong>
        </div>

        {cloudSyncActive ? (
          <div className="text-xs text-warn">
            هنگام فعال بودن همگام‌سازی ابری، اتصال حساب در فاز ۱ مسدود است.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('CREATE_TXN')}
                className={`h-9 rounded-xl text-xs font-bold border ${
                  mode === 'CREATE_TXN'
                    ? 'bg-lime/15 text-lime border-lime/40'
                    : 'bg-surface border-line text-muted'
                }`}
              >
                ایجاد گردش جدید
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('LINK_EXISTING');
                  void loadCandidates();
                }}
                className={`h-9 rounded-xl text-xs font-bold border ${
                  mode === 'LINK_EXISTING'
                    ? 'bg-sky/15 text-sky border-sky/40'
                    : 'bg-surface border-line text-muted'
                }`}
              >
                اتصال به گردش موجود
              </button>
            </div>

            <Select
              size="sm"
              value={accountId}
              onChange={setAccountId}
              options={accounts.map(a => ({ value: a.id!, label: a.name }))}
            />

            {mode === 'LINK_EXISTING' && (
              <div className="space-y-1.5">
                <button type="button" onClick={loadCandidates} className="text-[11px] text-sky">
                  بروزرسانی لیست گردش‌های هم‌مبلغ
                </button>
                {candidates.length > 0 ? (
                  <Select
                    size="sm"
                    value={bankTxnId}
                    onChange={setBankTxnId}
                    options={candidates.map(t => ({
                      value: t.id!,
                      label: `${t.title || 'تراکنش'} · ${Jalali.shortDateTime(t.occurredAt)}`,
                    }))}
                  />
                ) : (
                  <div className="text-[11px] text-warn">تراکنش هم‌مبلغ بدون پیوند یافت نشد.</div>
                )}
              </div>
            )}

            {error && <div className="text-xs text-bad font-bold">{error}</div>}

            <button
              type="submit"
              disabled={accounts.length === 0 || (mode === 'LINK_EXISTING' && !bankTxnId)}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs disabled:opacity-50"
            >
              تأیید اتصال
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function buildBrokenPolylinePaths(
  values: Array<number | null>,
  width: number,
  height: number,
  minVal: number,
  maxVal: number,
  padX = 8,
  padY = 10
): string[] {
  const n = values.length;
  if (n === 0) return [];
  const range = Math.max(1, maxVal - minVal);
  const paths: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null) {
      if (current.length > 0) {
        paths.push(current.join(' '));
        current = [];
      }
      continue;
    }
    const x = n === 1 ? width / 2 : padX + (i / (n - 1)) * (width - padX * 2);
    const y = padY + (1 - (v - minVal) / range) * (height - padY * 2);
    current.push(`${current.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  if (current.length > 0) paths.push(current.join(' '));
  return paths;
}

function PortfolioHistorySection({
  overview,
  days,
  onChangeDays,
  hidden,
}: {
  overview: PortfolioOverview;
  days: 7 | 30 | 90;
  onChangeDays: (d: 7 | 30 | 90) => void;
  hidden: boolean;
}) {
  const history = useMemo(
    () =>
      buildPortfolioHistorySeries(
        overview.positions.map(p => ({ asset: p.asset, events: p.events })),
        overview.snapshots,
        days,
        { staleAfterHours: overview.portfolio.settings?.stalePriceHours ?? 24 }
      ),
    [overview, days]
  );

  const valueNumbers = history.points.map(pt =>
    pt.marketValueRial !== null && pt.status !== 'GAP' && pt.status !== 'NEEDS_REVIEW'
      ? Number(R.roundHalfUp(pt.marketValueRial))
      : null
  );
  const flowNumbers = history.points.map(pt =>
    Number(R.roundHalfUp(pt.cumulativeNetFlowRial))
  );
  const numericAll = [
    ...valueNumbers.filter((v): v is number => v !== null),
    ...flowNumbers,
  ];
  const minVal = numericAll.length > 0 ? Math.min(0, ...numericAll) : 0;
  const maxVal = numericAll.length > 0 ? Math.max(1, ...numericAll) : 1;

  const width = 320;
  const height = 110;
  const valuePaths = buildBrokenPolylinePaths(valueNumbers, width, height, minVal, maxVal);
  const flowPaths = buildBrokenPolylinePaths(flowNumbers, width, height, minVal, maxVal);

  const marketGainBadge = formatProfitBadge(
    history.isCompleteForReturn ? history.marketGainRial : null,
    hidden
  );
  const flowRounded = Number(R.roundHalfUp(history.periodNetInflowRial));

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <LineChart size={15} className="text-lime" />
          <span className="text-xs font-bold text-white">تاریخچهٔ ارزش سبد (تهران)</span>
        </div>
        <div className="flex items-center gap-1 bg-bg p-0.5 rounded-xl border border-line">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => onChangeDays(d)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                days === d ? 'bg-lime text-onLime' : 'text-muted hover:text-white'
              }`}
            >
              {Money.fa(String(d))} روز
            </button>
          ))}
        </div>
      </div>

      {hidden ? (
        <div className="h-24 rounded-2xl bg-bg/60 border border-line/70 flex items-center justify-center text-xs text-muted">
          {Money.HIDDEN}
        </div>
      ) : (
        <div className="rounded-2xl bg-bg/60 border border-line/70 p-2.5 space-y-1.5">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-28 overflow-visible"
            role="img"
            aria-label="نمودار تاریخچه ارزش سبد و جریان سرمایه"
          >
            {flowPaths.map((d, idx) => (
              <path
                key={`flow-${idx}`}
                d={d}
                fill="none"
                stroke="#8DB6FF"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                opacity={0.75}
              />
            ))}
            {valuePaths.map((d, idx) => (
              <path
                key={`val-${idx}`}
                d={d}
                fill="none"
                stroke="#D4F542"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <div className="flex items-center justify-between text-[9.5px] text-muted px-1">
            <span>{history.points[0]?.labelFa}</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-lime inline-block" /> ارزش سبد
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-sky inline-block border-b border-dashed border-sky" /> آوردهٔ تجمعی
              </span>
            </div>
            <span>{history.points[history.points.length - 1]?.labelFa}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2 rounded-xl bg-bg/50 border border-line/60">
          <span className="text-[10px] text-muted block">تغییر آوردهٔ دوره</span>
          <span className="font-bold text-white dir-ltr text-right block mt-0.5">
            {hidden
              ? Money.HIDDEN
              : `${flowRounded >= 0 ? '+' : '−'}${Money.toman(Math.abs(flowRounded))} تومان`}
          </span>
        </div>
        <div className="p-2 rounded-xl bg-bg/50 border border-line/60">
          <span className="text-[10px] text-muted block">تغییر ارزش بازاری</span>
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border mt-0.5 ${marketGainBadge.toneClass}`}>
            {marketGainBadge.text}
          </span>
        </div>
      </div>

      {(history.gapDaysCount > 0 || history.partialDaysCount > 0) && (
        <div className="text-[10px] text-amber-300/90 leading-relaxed">
          {history.gapDaysCount > 0 &&
            `${Money.fa(String(history.gapDaysCount))} روز فاقد نرخ قابل استفاده (به‌صورت شکاف نمایش داده شده است). `}
          {history.partialDaysCount > 0 &&
            `${Money.fa(String(history.partialDaysCount))} روز فقط بخشی از دارایی‌ها قیمت داشته‌اند.`}
        </div>
      )}
    </div>
  );
}

function InstrumentPriceSection({
  position,
  snapshots,
  days,
  onChangeDays,
  feedEnabled,
  hidden,
}: {
  position: AssetPositionView;
  snapshots: PriceSnapshot[];
  days: 7 | 30 | 90;
  onChangeDays: (d: 7 | 30 | 90) => void;
  feedEnabled: boolean;
  hidden: boolean;
}) {
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [histMsg, setHistMsg] = useState<string | null>(null);

  const series = useMemo(
    () => buildInstrumentPriceSeries(position.asset, snapshots, days),
    [position.asset, snapshots, days]
  );

  const vals = series.points.map(p =>
    p.unitPriceRial !== null ? Number(R.roundHalfUp(p.unitPriceRial)) : null
  );
  const nums = vals.filter((v): v is number => v !== null);
  const minVal = nums.length > 0 ? Math.min(...nums) : 0;
  const maxVal = nums.length > 0 ? Math.max(...nums) : 1;
  const width = 320;
  const height = 96;
  const paths = buildBrokenPolylinePaths(vals, width, height, minVal, maxVal);

  const handleFetchHistory = async () => {
    setFetchingHistory(true);
    setHistMsg(null);
    const res = await fetchInstrumentHistoryFromFeed(position.asset.instrumentKey, days);
    setFetchingHistory(false);
    setHistMsg(
      res.error
        ? `خطا: ${res.error}`
        : `${Money.fa(String(res.imported))} رکورد تاریخچه از کش/سرور بروزرسانی شد`
    );
  };

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <LineChart size={15} className="text-sky" />
          <span className="text-xs font-bold text-white">نمودار قیمت (روزهای تهران)</span>
        </div>
        <div className="flex items-center gap-1 bg-bg p-0.5 rounded-xl border border-line">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => onChangeDays(d)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                days === d ? 'bg-sky text-black' : 'text-muted hover:text-white'
              }`}
            >
              {Money.fa(String(d))} روز
            </button>
          ))}
        </div>
      </div>

      {series.pricedPointsCount === 0 ? (
        <div className="p-3 rounded-xl bg-bg/50 border border-line/60 text-[11px] text-muted text-center">
          در بازهٔ انتخاب‌شده هیچ نرخ ثبت‌شده‌ای وجود ندارد ({Money.fa(String(series.gapDaysCount))} روز شکاف داده).
        </div>
      ) : hidden ? (
        <div className="h-20 rounded-xl bg-bg/50 border border-line/60 flex items-center justify-center text-xs text-muted">
          {Money.HIDDEN}
        </div>
      ) : (
        <div className="rounded-xl bg-bg/60 border border-line/60 p-2.5 space-y-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-24 overflow-visible"
            role="img"
            aria-label="نمودار قیمت دارایی"
          >
            {paths.map((d, idx) => (
              <path
                key={idx}
                d={d}
                fill="none"
                stroke="#8DB6FF"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>کف: {series.minPriceRial ? Money.toman(Number(R.roundHalfUp(series.minPriceRial))) : '—'} ت</span>
            <span>سقف: {series.maxPriceRial ? Money.toman(Number(R.roundHalfUp(series.maxPriceRial))) : '—'} ت</span>
            {series.periodChangePercent !== null && (
              <span className={series.periodChangePercent >= 0 ? 'text-ok font-bold' : 'text-bad font-bold'}>
                {series.periodChangePercent >= 0 ? '+' : '−'}
                {Money.fa(Math.abs(series.periodChangePercent).toFixed(1))}٪
              </span>
            )}
          </div>
          {series.gapDaysCount > 0 && (
            <div className="text-[9.5px] text-amber-300/90">
              {Money.fa(String(series.gapDaysCount))} روز فاقد نرخ (شکاف واقعی بدون تخمین)
            </div>
          )}
        </div>
      )}

      {feedEnabled && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            disabled={fetchingHistory}
            onClick={handleFetchHistory}
            className="text-[10px] text-sky flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={fetchingHistory ? 'animate-spin' : ''} />
            <span>دریافت تاریخچه از فید سرور</span>
          </button>
          {histMsg && <span className="text-[10px] text-muted">{histMsg}</span>}
        </div>
      )}
    </div>
  );
}

function MarketFeedModal({
  feedEnabled,
  onToggleFeed,
  feedMeta,
  busy,
  onRefresh,
  onClose,
}: {
  feedEnabled: boolean;
  onToggleFeed: (enabled: boolean) => void;
  feedMeta: MarketFeedMeta;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">منابع قیمت و کش محلی</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-surface border border-line text-[11px] text-white/90 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold">فید عمومی نرخ بازار (سرور Worker)</span>
            <input
              type="checkbox"
              checked={feedEnabled}
              onChange={e => onToggleFeed(e.target.checked)}
              className="accent-lime w-4 h-4"
            />
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            پیش‌فرض سیستم همیشه قیمت دستی است. فید عمومی از طریق Worker کش و ارائه می‌شود؛ منابع رایگان{' '}
            <a
              href="https://nerkhara.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky underline"
            >
              NerkhAra
            </a>
            {' '}و Iran Market بدون نیاز به کلید فعال‌اند و کلیدهای اختیاری فقط به‌صورت Secret روی Worker ذخیره می‌شوند.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          className="w-full h-10 rounded-xl bg-sky text-black font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
          <span>{busy ? 'در حال دریافت از سرور...' : 'بررسی سلامت منابع و دریافت آخرین کش'}</span>
        </button>

        {feedMeta.lastError && (
          <div className="p-2.5 rounded-xl bg-warn/15 border border-warn/25 text-[11px] text-warn">
            {feedMeta.lastError}
          </div>
        )}

        {feedMeta.lastFetchedAt && (
          <div className="text-[10px] text-muted">
            آخرین بروزرسانی کش: {Jalali.shortDateTime(feedMeta.lastFetchedAt)} ·{' '}
            {Money.fa(String(feedMeta.cachedCount))} نرخ دریافت‌شده
          </div>
        )}

        {feedMeta.sources.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-white">وضعیت سلامت منابع</div>
            {feedMeta.sources.map(src => (
              <div
                key={src.source_id}
                className="p-2.5 rounded-xl bg-surface border border-line flex items-center justify-between text-[11px]"
              >
                <div>
                  <span className="font-bold text-white">{sourceDisplayLabelFa(src.source_id)}</span>
                  {src.last_error && (
                    <div className="text-[9.5px] text-muted mt-0.5">{src.last_error}</div>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
                    src.status === 'HEALTHY'
                      ? 'bg-ok/15 text-ok'
                      : src.status === 'BACKOFF_429'
                      ? 'bg-warn/15 text-warn'
                      : src.status === 'ERROR'
                      ? 'bg-bad/15 text-bad'
                      : 'bg-white/5 text-muted'
                  }`}
                >
                  {src.status === 'HEALTHY'
                    ? 'سالم'
                    : src.status === 'BACKOFF_429'
                    ? 'بک‌آف ۴۲۹'
                    : src.status === 'ERROR'
                    ? 'خطا'
                    : src.status === 'DISABLED'
                    ? 'غیرفعال'
                    : 'کلید تنظیم نشده'}
                </span>
              </div>
            ))}
          </div>
        )}

        {feedMeta.discrepancies.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-amber-300">اختلاف نرخ ثبت‌شده بین منابع</div>
            {feedMeta.discrepancies.slice(0, 5).map((d, i) => (
              <div key={i} className="p-2 rounded-xl bg-amber-500/10 border border-amber-400/20 text-[10px] text-white/90">
                {d.instrument_key} ({d.source_a} ↔ {d.source_b}): اختلاف {Money.fa(String((d.diff_bps / 100).toFixed(2)))}٪
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSignedPctFa(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return 'نامعلوم';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Money.fa(Math.abs(pct).toFixed(2))}٪`;
}

function TrendAnalysisSection({
  position,
  snapshots,
  hidden,
}: {
  position: AssetPositionView;
  snapshots: PriceSnapshot[];
  hidden: boolean;
}) {
  const [windowKey, setWindowKey] = useState<TrendWindow>('30D');
  const analysis = useMemo(
    () => analyzeAssetTrend(position.asset, snapshots, windowKey),
    [position.asset, snapshots, windowKey]
  );

  const { quality, descriptive, conditional } = analysis;
  const gradeBadge =
    quality.grade === 'GOOD'
      ? { label: 'کیفیت مناسب', cls: 'bg-ok/15 text-ok border-ok/25' }
      : quality.grade === 'LIMITED'
      ? { label: 'کیفیت محدود', cls: 'bg-amber-500/15 text-amber-300 border-amber-400/25' }
      : { label: 'داده ناکافی', cls: 'bg-bad/15 text-bad border-bad/30' };

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-white">تحلیل روند و آمار شرطی</span>
        <div className="flex items-center gap-0.5 bg-bg p-0.5 rounded-xl border border-line">
          {([
            { id: '24H', label: '۲۴س' },
            { id: '7D', label: '۷ر' },
            { id: '30D', label: '۳۰ر' },
            { id: '90D', label: '۹۰ر' },
          ] as const).map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWindowKey(w.id)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                windowKey === w.id ? 'bg-lime text-onLime' : 'text-muted hover:text-white'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Quality Card */}
      <div className="p-3 rounded-2xl bg-bg/60 border border-line/70 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-white">کارت کیفیت و پوشش داده</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${gradeBadge.cls}`}>
            {gradeBadge.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted">
          <div>نقاط نرخ: {Money.fa(String(quality.sampleCount))}</div>
          <div>
            پوشش: {Money.fa(String(quality.coveredDays))}/{Money.fa(String(quality.expectedDays))} روز
          </div>
          <div>بیشینهٔ شکاف: {Money.fa(String(quality.maxGapDays))} روز</div>
        </div>
        {quality.reasons.length > 0 && (
          <ul className="text-[10px] text-amber-300/90 list-disc pr-4 space-y-0.5 pt-1">
            {quality.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Descriptive Metrics */}
      {descriptive.sufficient ? (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2.5 rounded-xl bg-bg/50 border border-line/60">
            <span className="text-[10px] text-muted block">بازده دوره</span>
            <span
              className={`font-bold mt-0.5 block ${
                (descriptive.periodReturnPct ?? 0) >= 0 ? 'text-ok' : 'text-bad'
              }`}
            >
              {formatSignedPctFa(descriptive.periodReturnPct)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-bg/50 border border-line/60">
            <span className="text-[10px] text-muted block">نوسان (انحراف بازده)</span>
            <span className="font-bold text-white mt-0.5 block">
              {descriptive.volatilityPct !== null
                ? `${Money.fa(descriptive.volatilityPct.toFixed(2))}٪`
                : 'نامعلوم'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-bg/50 border border-line/60">
            <span className="text-[10px] text-muted block">سقف / کف دوره</span>
            <span className="font-bold text-white mt-0.5 block text-[10px]">
              {hidden
                ? Money.HIDDEN
                : `${Money.toman(Number(R.roundHalfUp(descriptive.highRial!)))} / ${Money.toman(Number(R.roundHalfUp(descriptive.lowRial!)))} ت`}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-bg/50 border border-line/60">
            <span className="text-[10px] text-muted block">میانگین متحرک (فاصله)</span>
            <span className="font-bold text-white mt-0.5 block text-[10px]">
              {hidden
                ? Money.HIDDEN
                : `${Money.toman(Number(R.roundHalfUp(descriptive.movingAverageRial!)))} ت (${formatSignedPctFa(descriptive.distanceFromMaPct)})`}
            </span>
          </div>
          <div className="col-span-2 p-2.5 rounded-xl bg-bg/50 border border-line/60 flex items-center justify-between">
            <span className="text-[10px] text-muted">Z-Score فاصله درصدی از میانگین:</span>
            <span className="font-bold text-white text-[11px]">
              {descriptive.zScore !== null
                ? `${descriptive.zScore >= 0 ? '+' : '−'}${Money.fa(Math.abs(descriptive.zScore).toFixed(2))}`
                : `نامعلوم (${descriptive.zScoreReason || 'داده ناکافی'})`}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-bg/50 border border-line/60 text-[11px] text-warn">
          {descriptive.insufficientReason}
        </div>
      )}

      {/* Conditional Historical Statistics */}
      <div className="p-3 rounded-2xl bg-bg/60 border border-line/70 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-white">آمار شرطی رخدادهای مستقل</span>
          <span className="text-[10px] text-muted">
            نمونهٔ کامل: {Money.fa(String(conditional.completeSampleCount))} (رخداد:{' '}
            {Money.fa(String(conditional.independentEventCount))})
          </span>
        </div>
        <div className="text-[10px] text-muted">{conditional.eventDefinitionFa}</div>
        {conditional.sufficient ? (
          <div className="grid grid-cols-3 gap-1.5 text-center pt-1">
            <div className="p-2 rounded-xl bg-surface border border-line">
              <span className="text-[9.5px] text-muted block">چارک ۲۵٪</span>
              <span className="text-[11px] font-bold text-white">
                {formatSignedPctFa(conditional.p25ReturnPct)}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-line">
              <span className="text-[9.5px] text-muted block">میانه (۵۰٪)</span>
              <span className="text-[11px] font-extrabold text-lime">
                {formatSignedPctFa(conditional.medianReturnPct)}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-line">
              <span className="text-[9.5px] text-muted block">چارک ۷۵٪</span>
              <span className="text-[11px] font-bold text-white">
                {formatSignedPctFa(conditional.p75ReturnPct)}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-warn">{conditional.insufficientReason}</div>
        )}
        {conditional.sourceSwitchCaveat && (
          <div className="text-[9.5px] text-amber-300/90">
            هشدار: این سابقه شامل تغییر منبع، ترکیب سمت نرخ یا تبدیل واحد است و نباید به‌عنوان اثر علّی تعبیر شود.
          </div>
        )}
      </div>

      <p className="text-[9.5px] text-muted leading-relaxed">{analysis.disclaimerFa}</p>
    </div>
  );
}

function DcaPlansSection({
  overview,
  hidden,
  onOpenCreate,
  onExecuteStep,
}: {
  overview: PortfolioOverview;
  hidden: boolean;
  onOpenCreate: () => void;
  onExecuteStep: (evaluation: DcaPlanEvaluation, step: EvaluatedDcaStep) => void;
}) {
  const assetById = new Map(overview.positions.map(p => [p.asset.id, p.asset]));
  const evaluations = overview.dcaEvaluations;

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-white">برنامه‌های خرید پله‌ای (DCA)</h3>
          <p className="text-[10px] text-muted mt-0.5">
            بودجه و مراحل از روی دفتر کل بازسازی می‌شوند (پشتیبان خرید جزئی و ابطال)
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCreate}
          className="px-3 py-1.5 rounded-xl bg-lime/15 text-lime border border-lime/30 text-[11px] font-bold flex items-center gap-1"
        >
          <Plus size={13} />
          <span>برنامه جدید</span>
        </button>
      </div>

      {evaluations.length === 0 ? (
        <div className="p-3 rounded-xl bg-bg/50 border border-line/60 text-[11px] text-muted text-center">
          هنوز برنامه خرید پله‌ای تعریف نکرده‌اید.
        </div>
      ) : (
        <div className="space-y-3">
          {evaluations.map(ev => {
            const asset = assetById.get(ev.plan.assetId);
            const totalN = Number(R.roundHalfUp(ev.totalBudgetRial));
            const spentN = Number(R.roundHalfUp(ev.totalExecutedRial));
            const remN = Number(R.roundHalfUp(ev.remainingBudgetRial));
            const pct = totalN > 0 ? Math.min(100, Math.round((spentN / totalN) * 100)) : 0;
            const next = ev.nextActionableStep;

            return (
              <div
                key={ev.plan.id}
                className="p-3.5 rounded-2xl bg-bg/60 border border-line/80 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-white">{ev.plan.name}</div>
                    <div className="text-[10px] text-muted">
                      {asset?.name} · {Money.fa(String(ev.completedStepsCount))}/{Money.fa(String(ev.steps.length))} مرحله تکمیل
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
                        ev.plan.status === 'COMPLETED'
                          ? 'bg-ok/15 text-ok'
                          : ev.plan.status === 'PAUSED'
                          ? 'bg-white/5 text-muted'
                          : 'bg-sky/15 text-sky'
                      }`}
                    >
                      {ev.plan.status === 'COMPLETED'
                        ? 'تکمیل‌شده'
                        : ev.plan.status === 'PAUSED'
                        ? 'متوقف'
                        : 'فعال'}
                    </span>
                    {ev.plan.status !== 'COMPLETED' && (
                      <button
                        type="button"
                        onClick={() =>
                          void updateDcaPlanStatus(
                            ev.plan.id,
                            ev.plan.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
                          )
                        }
                        className="text-[10px] text-muted hover:text-white px-1.5 py-0.5 rounded bg-surface"
                      >
                        {ev.plan.status === 'ACTIVE' ? 'توقف' : 'ادامه'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Budget Progress */}
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full bg-lime rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>
                      مصرف‌شده: {hidden ? Money.HIDDEN : `${Money.toman(spentN)} ت`}
                    </span>
                    <span>
                      باقی‌مانده: {hidden ? Money.HIDDEN : `${Money.toman(remN)} ت`}
                    </span>
                  </div>
                </div>

                {/* Step pills */}
                <div className="flex flex-wrap gap-1.5">
                  {ev.steps.map(s => (
                    <span
                      key={s.rule.stepIndex}
                      className={`px-2 py-0.5 rounded-lg text-[9.5px] font-bold border ${
                        s.status === 'COMPLETED'
                          ? 'bg-ok/15 text-ok border-ok/25'
                          : s.status === 'PARTIAL'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-400/25'
                          : s.status === 'READY'
                          ? 'bg-lime/20 text-lime border-lime/40'
                          : 'bg-surface text-muted border-line'
                      }`}
                    >
                      پله {Money.fa(String(s.rule.stepIndex))}:{' '}
                      {s.status === 'COMPLETED'
                        ? 'تکمیل'
                        : s.status === 'PARTIAL'
                        ? 'جزئی'
                        : s.status === 'READY'
                        ? 'آماده'
                        : 'انتظار'}
                    </span>
                  ))}
                </div>

                {/* Next Step Trigger Info & Action */}
                {next && next.status !== 'COMPLETED' && (
                  <div className="pt-1.5 border-t border-line/60 space-y-1.5">
                    {next.triggerBlockedReason && (
                      <div className="text-[10px] text-amber-300">{next.triggerBlockedReason}</div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted">
                        مرحله {Money.fa(String(next.rule.stepIndex))} · باقی‌مانده:{' '}
                        {hidden
                          ? Money.HIDDEN
                          : `${Money.toman(Number(R.roundHalfUp(next.remainingBudgetRial)))} ت`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onExecuteStep(ev, next)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold ${
                          next.isTriggered || next.status === 'PARTIAL'
                            ? 'bg-lime text-onLime'
                            : 'bg-surface border border-line text-white'
                        }`}
                      >
                        {next.status === 'PARTIAL' ? 'تکمیل خرید جزئی' : 'ثبت خرید مرحله'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateDcaPlanModal({
  overview,
  onClose,
}: {
  overview: PortfolioOverview;
  onClose: () => void;
}) {
  const [assetId, setAssetId] = useState(overview.positions[0]?.asset.id ?? '');
  const [name, setName] = useState('خرید پله‌ای ماهانه');
  const [totalBudgetToman, setTotalBudgetToman] = useState('');
  const [stepCount, setStepCount] = useState('4');
  const [minIntervalDays, setMinIntervalDays] = useState('14');
  const [dropTriggerPct, setDropTriggerPct] = useState('5');
  const [dropReference, setDropReference] = useState<DcaDropReference>('HIGH_WATERMARK');
  const [anchorPriceToman, setAnchorPriceToman] = useState('');
  const [combinator, setCombinator] = useState<DcaTriggerCombinator>('OR');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const budgetRial = Money.parseToman(totalBudgetToman);
      if (!budgetRial || budgetRial <= 0) throw new Error('لطفاً کل بودجه معتبر وارد کنید');
      const anchorRial =
        dropReference === 'FIXED_ANCHOR' && anchorPriceToman
          ? Money.parseToman(anchorPriceToman)
          : undefined;
      if (dropReference === 'FIXED_ANCHOR' && (!anchorRial || anchorRial <= 0)) {
        throw new Error('قیمت مبنای ثابت را وارد کنید');
      }

      await createDcaPlan({
        portfolioId: overview.portfolio.id,
        assetId,
        name,
        totalBudgetRial: String(budgetRial),
        stepCount: Number(Money.ascii(stepCount)),
        minIntervalDays: minIntervalDays.trim() ? Number(Money.ascii(minIntervalDays)) : undefined,
        dropTriggerPct: dropTriggerPct.trim() ? Money.ascii(dropTriggerPct) : undefined,
        dropReference,
        anchorPriceRial: anchorRial ? String(anchorRial) : undefined,
        combinator,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ایجاد برنامه DCA');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">برنامه خرید پله‌ای (DCA) جدید</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">دارایی هدف</label>
          <Select
            size="sm"
            value={assetId}
            onChange={setAssetId}
            options={overview.positions.map(p => ({ value: p.asset.id, label: p.asset.name }))}
          />
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">عنوان برنامه</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted block mb-1">کل بودجه (تومان)</label>
            <AmountInput
              value={totalBudgetToman}
              onChange={setTotalBudgetToman}
              placeholder="مثلاً 20,000,000"
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">تعداد مراحل</label>
            <input
              type="text"
              inputMode="numeric"
              value={stepCount}
              onChange={e => setStepCount(Money.ascii(e.target.value))}
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
            />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-surface border border-line space-y-2.5">
          <div className="text-[11px] font-bold text-white">قواعد محرک زمان و قیمت</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted block mb-1">فاصله زمانی (روز)</label>
              <input
                type="text"
                inputMode="numeric"
                value={minIntervalDays}
                onChange={e => setMinIntervalDays(Money.ascii(e.target.value))}
                placeholder="۰ = غیرفعال"
                className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-xs text-white dir-ltr"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">افت قیمت محرک (٪)</label>
              <input
                type="text"
                inputMode="decimal"
                value={dropTriggerPct}
                onChange={e => setDropTriggerPct(Money.ascii(e.target.value))}
                placeholder="۰ = غیرفعال"
                className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-xs text-white dir-ltr"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted block mb-1">مبنای محاسبهٔ افت</label>
            <Select
              size="sm"
              value={dropReference}
              onChange={setDropReference}
              options={[
                { value: 'HIGH_WATERMARK', label: 'بالاترین قیمت از شروع برنامه' },
                { value: 'LAST_BUY', label: 'قیمت آخرین خرید ثبت‌شده' },
                { value: 'MOVING_AVERAGE', label: 'میانگین ۱۴ روزه' },
                { value: 'FIXED_ANCHOR', label: 'قیمت مبنای ثابت' },
              ]}
            />
          </div>

          {dropReference === 'FIXED_ANCHOR' && (
            <div>
              <label className="text-[10px] text-muted block mb-1">قیمت مبنای ثابت واحد (تومان)</label>
              <AmountInput
                value={anchorPriceToman}
                onChange={setAnchorPriceToman}
                className="w-full h-9 px-2.5 rounded-xl bg-bg border border-line text-xs text-white"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] text-muted block mb-1">منطق ترکیب زمان و قیمت</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCombinator('OR')}
                className={`h-8 rounded-xl text-[11px] font-bold border ${
                  combinator === 'OR'
                    ? 'bg-lime/15 text-lime border-lime/40'
                    : 'bg-bg border-line text-muted'
                }`}
              >
                «یا» (زمان یا افت قیمت)
              </button>
              <button
                type="button"
                onClick={() => setCombinator('AND')}
                className={`h-8 rounded-xl text-[11px] font-bold border ${
                  combinator === 'AND'
                    ? 'bg-sky/15 text-sky border-sky/40'
                    : 'bg-bg border-line text-muted'
                }`}
              >
                «و» (زمان و افت قیمت هم‌زمان)
              </button>
            </div>
          </div>
        </div>

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab"
        >
          ذخیره برنامه DCA
        </button>
      </form>
    </div>
  );
}

function ExecuteDcaStepModal({
  evaluation,
  step,
  position,
  accounts,
  cloudSyncActive,
  onClose,
}: {
  evaluation: DcaPlanEvaluation;
  step: EvaluatedDcaStep;
  position: AssetPositionView;
  accounts: Account[];
  cloudSyncActive: boolean;
  onClose: () => void;
}) {
  const { asset } = position;
  const [quantity, setQuantity] = useState('');
  const [settlementToman, setSettlementToman] = useState(() =>
    Money.tomanInput(Number(R.roundHalfUp(step.remainingBudgetRial)))
  );
  const [fineness, setFineness] = useState(
    String(asset.pricingSpec.referenceFineness ?? 750)
  );
  const [cashMode, setCashMode] = useState<'NONE' | 'CREATE_TXN'>('NONE');
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const rial = Money.parseToman(settlementToman);
      if (!rial || rial <= 0) throw new Error('مبلغ خرید معتبر وارد کنید');

      await executeDcaStepPurchase({
        planId: evaluation.plan.id,
        stepIndex: step.rule.stepIndex,
        effectiveAtMs: Date.now(),
        payload: {
          quantity: quantity.trim(),
          unit: asset.baseUnit === 'GRAM' ? 'GRAM' : asset.baseUnit,
          fineness: asset.baseUnit === 'GRAM' ? Number(Money.ascii(fineness)) : undefined,
          settlementRial: String(rial),
          costKnown: true,
        },
        cashLink:
          cashMode === 'CREATE_TXN'
            ? { mode: 'CREATE_TXN', accountId }
            : { mode: 'NONE' },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت خرید پله‌ای');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">
            اجرای مرحله {Money.fa(String(step.rule.stepIndex))} · {evaluation.plan.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-[11px] text-muted">
          دارایی: <strong className="text-white">{asset.name}</strong> · بودجه باقی‌ماندهٔ این مرحله:{' '}
          <strong className="text-lime">
            {Money.toman(Number(R.roundHalfUp(step.remainingBudgetRial)))} تومان
          </strong>
        </div>

        <div className={`grid gap-2 ${asset.baseUnit === 'GRAM' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="text-[10px] text-muted block mb-1">
              مقدار خریداری‌شده ({unitLabelFa(asset.baseUnit)})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={e => setQuantity(Money.ascii(e.target.value))}
              placeholder="مثلاً: 1.2"
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
            />
          </div>
          {asset.baseUnit === 'GRAM' && (
            <div>
              <label className="text-[10px] text-muted block mb-1">عیار</label>
              <input
                type="text"
                inputMode="numeric"
                value={fineness}
                onChange={e => setFineness(Money.ascii(e.target.value))}
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
              />
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] text-muted block mb-1">
            مبلغ واقعی خرید (تومان — امکان ثبت خرید جزئی با مبلغ کمتر)
          </label>
          <AmountInput
            value={settlementToman}
            onChange={setSettlementToman}
            className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white"
          />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCashMode('NONE')}
              className={`h-8 rounded-xl text-[11px] font-bold border ${
                cashMode === 'NONE'
                  ? 'bg-sky/15 text-sky border-sky/40'
                  : 'bg-surface border-line text-muted'
              }`}
            >
              بدون پیوند حساب
            </button>
            <button
              type="button"
              disabled={cloudSyncActive || accounts.length === 0}
              onClick={() => setCashMode('CREATE_TXN')}
              className={`h-8 rounded-xl text-[11px] font-bold border disabled:opacity-40 ${
                cashMode === 'CREATE_TXN'
                  ? 'bg-lime/15 text-lime border-lime/40'
                  : 'bg-surface border-line text-muted'
              }`}
            >
              کسر از حساب بانکی
            </button>
          </div>
          {cashMode === 'CREATE_TXN' && (
            <Select
              size="sm"
              value={accountId}
              onChange={setAccountId}
              options={accounts.map(a => ({ value: a.id!, label: a.name }))}
            />
          )}
        </div>

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab disabled:opacity-50"
        >
          {saving ? 'در حال ثبت...' : 'ثبت خرید واقعی این مرحله'}
        </button>
      </form>
    </div>
  );
}

function AlertsSection({
  overview,
  hidden,
  feedEnabled,
  onOpenCreate,
}: {
  overview: PortfolioOverview;
  hidden: boolean;
  feedEnabled: boolean;
  onOpenCreate: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const lockEnabled = isLockEnabled();

  const handleEvaluate = async () => {
    setChecking(true);
    setStatusMsg(null);
    try {
      const res = await evaluateInvestmentAlerts({
        overview,
        hidden,
        checkPublicServer: feedEnabled,
      });
      if (res.firedLogs.length > 0) {
        setStatusMsg(`${Money.fa(String(res.firedLogs.length))} هشدار جدید فعال شد.`);
      } else {
        setStatusMsg(res.serverCheckError || 'هشدار فعالی در این لحظه وجود ندارد.');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleCheckPush = async () => {
    const info = await checkDevicePushSupport();
    if (!info.notificationApi) {
      setPushStatus('مرورگر/دستگاه از اعلان وب پشتیبانی نمی‌کند.');
      return;
    }
    if (info.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
    setPushStatus(
      info.serverPushConfigured
        ? `پشتیبانی Push دستگاه: ${info.pushManager ? 'فعال' : 'ناموجود'} · کلید Push سرور تنظیم شده`
        : `اعلان محلی دستگاه: ${Notification.permission === 'granted' ? 'مجاز' : 'نیازمند مجوز'} · Push پس‌زمینه سرور هنوز پیکربندی نشده`
    );
  };

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bell size={15} className="text-amber-300" />
          <h3 className="text-xs font-bold text-white">هشدارهای بازار و سبد</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={checking}
            onClick={handleEvaluate}
            className="px-2.5 py-1 rounded-xl bg-surface2 border border-line text-[10px] font-bold text-sky disabled:opacity-50"
          >
            {checking ? 'در حال بررسی...' : 'بررسی الان'}
          </button>
          <button
            type="button"
            onClick={onOpenCreate}
            className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-400/30 text-[10px] font-bold flex items-center gap-1"
          >
            <Plus size={12} />
            <span>هشدار جدید</span>
          </button>
        </div>
      </div>

      <div className="text-[10px] text-muted leading-relaxed">
        هشدارهای عمومی فقط روی قیمت بازار اجرا می‌شوند و دادهٔ سبد شما هرگز به سرور ارسال نمی‌شود. هشدارهای مقدار/سود سبد کاملاً درون دستگاه می‌مانند.
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleCheckPush}
          className="text-[10px] text-sky hover:underline"
        >
          بررسی پشتیبانی اعلان و Push دستگاه
        </button>
        {lockEnabled && (
          <span className="text-[9.5px] text-ok">محافظت حریم خصوصی قفل فعال است</span>
        )}
      </div>

      {pushStatus && <div className="text-[10px] text-white/90 bg-bg/60 p-2 rounded-xl border border-line">{pushStatus}</div>}
      {statusMsg && <div className="text-[10px] text-lime bg-lime/10 p-2 rounded-xl border border-lime/25">{statusMsg}</div>}

      {overview.alertRules.length > 0 ? (
        <div className="space-y-2">
          {overview.alertRules.map(rule => (
            <div
              key={rule.id}
              className="p-2.5 rounded-xl bg-bg/60 border border-line/70 flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white truncate text-[11px]">{rule.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      rule.scope === 'PUBLIC_MARKET'
                        ? 'bg-sky/15 text-sky'
                        : 'bg-purple-500/15 text-purple-300'
                    }`}
                  >
                    {rule.scope === 'PUBLIC_MARKET' ? 'عمومی بازار' : 'داخلی سبد'}
                  </span>
                </div>
                <div className="text-[9.5px] text-muted mt-0.5">
                  تأخیر تکرار: {Money.fa(String(rule.cooldownMinutes))} دقیقه
                  {rule.lastTriggeredAtMs ? ` · آخرین فعال‌سازی: ${Jalali.shortDateTime(rule.lastTriggeredAtMs)}` : ''}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={e => void toggleInvestmentAlertRule(rule.id, e.target.checked)}
                  className="accent-lime"
                />
                <button
                  type="button"
                  onClick={() => void deleteInvestmentAlertRule(rule.id)}
                  className="p-1 text-muted hover:text-bad"
                  aria-label="حذف هشدار"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted text-center py-2">
          هنوز قانونی برای هشدار تعریف نشده است.
        </div>
      )}

      {overview.alertEvents.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-line/70">
          <div className="text-[10px] font-bold text-muted">رویدادهای اخیر هشدار</div>
          {overview.alertEvents.slice(0, 5).map(ev => (
            <div key={ev.id} className="p-2 rounded-xl bg-bg/50 border border-line/60 text-[10px]">
              <div className="flex justify-between text-white font-bold">
                <span>{ev.title}</span>
                <span className="text-muted font-normal">{Jalali.shortDateTime(ev.triggeredAtMs)}</span>
              </div>
              <div className="text-muted mt-0.5">
                {formatAlertNotificationBody(ev, { lockEnabled, hidden })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAlertModal({
  overview,
  onClose,
}: {
  overview: PortfolioOverview;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<AlertRuleScope>('PUBLIC_MARKET');
  const [name, setName] = useState('هشدار قیمت بازار');
  const [condition, setCondition] = useState<AlertConditionKind>('PRICE_ABOVE');
  const [instrumentKey, setInstrumentKey] = useState(
    overview.positions[0]?.asset.instrumentKey ?? 'gold_18k_gram'
  );
  const [assetId, setAssetId] = useState(overview.positions[0]?.asset.id ?? '');
  const [thresholdInput, setThresholdInput] = useState('');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');
  const [error, setError] = useState<string | null>(null);

  const isPriceCondition =
    condition === 'PRICE_ABOVE' ||
    condition === 'PRICE_BELOW' ||
    condition === 'PORTFOLIO_VALUE_ABOVE' ||
    condition === 'PORTFOLIO_VALUE_BELOW';

  const isPercentCondition =
    condition === 'ASSET_UNREALIZED_GAIN_PCT_ABOVE' ||
    condition === 'ASSET_UNREALIZED_LOSS_PCT_ABOVE';

  const handleScopeChange = (next: AlertRuleScope) => {
    setScope(next);
    if (next === 'PUBLIC_MARKET') {
      setCondition('PRICE_ABOVE');
      setName('هشدار قیمت بازار');
    } else {
      setCondition('PORTFOLIO_VALUE_ABOVE');
      setName('هشدار وضعیت سبد');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const portfolio = await ensureDefaultPortfolio();
      let thresholdValue: string | undefined;
      if (isPriceCondition) {
        const rial = Money.parseToman(thresholdInput);
        if (!rial || rial <= 0) throw new Error('مبلغ آستانه را معتبر وارد کنید');
        thresholdValue = String(rial);
      } else if (isPercentCondition) {
        const pct = Number(Money.ascii(thresholdInput));
        if (!Number.isFinite(pct) || pct <= 0) throw new Error('درصد آستانه را معتبر وارد کنید');
        thresholdValue = String(pct);
      }

      await createInvestmentAlertRule({
        portfolioId: portfolio.id,
        scope,
        name,
        condition,
        instrumentKey: scope === 'PUBLIC_MARKET' ? instrumentKey : undefined,
        assetId: scope === 'PORTFOLIO_LOCAL' ? assetId || undefined : undefined,
        thresholdValue,
        cooldownMinutes: Number(Money.ascii(cooldownMinutes)) || 60,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ایجاد هشدار');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white">تعریف قانون هشدار جدید</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleScopeChange('PUBLIC_MARKET')}
            className={`h-9 rounded-xl text-xs font-bold border ${
              scope === 'PUBLIC_MARKET'
                ? 'bg-sky/15 text-sky border-sky/40'
                : 'bg-surface border-line text-muted'
            }`}
          >
            عمومی بازار (بدون سبد)
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange('PORTFOLIO_LOCAL')}
            className={`h-9 rounded-xl text-xs font-bold border ${
              scope === 'PORTFOLIO_LOCAL'
                ? 'bg-purple-500/15 text-purple-300 border-purple-400/40'
                : 'bg-surface border-line text-muted'
            }`}
          >
            داخلی سبد (فقط دستگاه)
          </button>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">عنوان هشدار</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">شرط فعال‌سازی</label>
          <Select
            size="sm"
            value={condition}
            onChange={v => setCondition(v)}
            options={
              scope === 'PUBLIC_MARKET'
                ? [
                    { value: 'PRICE_ABOVE', label: 'رسیدن قیمت به سقف یا بالاتر' },
                    { value: 'PRICE_BELOW', label: 'رسیدن قیمت به کف یا پایین‌تر' },
                  ]
                : [
                    { value: 'PORTFOLIO_VALUE_ABOVE', label: 'ارزش کل سبد بیشتر یا مساوی آستانه' },
                    { value: 'PORTFOLIO_VALUE_BELOW', label: 'ارزش کل سبد کمتر یا مساوی آستانه' },
                    { value: 'ASSET_UNREALIZED_GAIN_PCT_ABOVE', label: 'سود تحقق‌نیافته دارایی بیشتر از ٪' },
                    { value: 'ASSET_UNREALIZED_LOSS_PCT_ABOVE', label: 'زیان تحقق‌نیافته دارایی بیشتر از ٪' },
                    { value: 'STALE_PRICE', label: 'قدیمی‌شدن نرخ دارایی‌های سبد' },
                    { value: 'NEEDS_REVIEW', label: 'وجود دارایی نیازمند بررسی' },
                  ]
            }
          />
        </div>

        {scope === 'PUBLIC_MARKET' ? (
          <div>
            <label className="text-[11px] text-muted block mb-1">شناسه ابزار بازار</label>
            <input
              type="text"
              value={instrumentKey}
              onChange={e => setInstrumentKey(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
            />
          </div>
        ) : (
          (condition === 'ASSET_UNREALIZED_GAIN_PCT_ABOVE' ||
            condition === 'ASSET_UNREALIZED_LOSS_PCT_ABOVE') && (
            <div>
              <label className="text-[11px] text-muted block mb-1">دارایی سبد</label>
              <Select
                size="sm"
                value={assetId}
                onChange={setAssetId}
                options={overview.positions.map(p => ({ value: p.asset.id, label: p.asset.name }))}
              />
            </div>
          )
        )}

        {isPriceCondition && (
          <div>
            <label className="text-[11px] text-muted block mb-1">مبلغ آستانه (تومان)</label>
            <AmountInput
              value={thresholdInput}
              onChange={setThresholdInput}
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white"
            />
          </div>
        )}

        {isPercentCondition && (
          <div>
            <label className="text-[11px] text-muted block mb-1">درصد آستانه (مثلاً 10)</label>
            <input
              type="text"
              inputMode="decimal"
              value={thresholdInput}
              onChange={e => setThresholdInput(Money.ascii(e.target.value))}
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
            />
          </div>
        )}

        <div>
          <label className="text-[11px] text-muted block mb-1">حداقل فاصلهٔ تکرار اعلان (دقیقه)</label>
          <input
            type="text"
            inputMode="numeric"
            value={cooldownMinutes}
            onChange={e => setCooldownMinutes(Money.ascii(e.target.value))}
            className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-xs text-white dir-ltr"
          />
        </div>

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab"
        >
          ذخیره قانون هشدار
        </button>
      </form>
    </div>
  );
}

const ALLOCATION_CATEGORIES: AllocationCategory[] = [
  'GOLD',
  'SILVER',
  'CURRENCY',
  'CRYPTO',
  'OTHER',
  'CASH_RESERVE',
];

function AllocationSection({
  overview,
  hidden,
  onOpenEdit,
}: {
  overview: PortfolioOverview;
  hidden: boolean;
  onOpenEdit: () => void;
}) {
  const report = overview.allocationReport;
  const activeSlices = report.slices.filter(
    s => s.targetPct > 0 || !R.isZero(s.actualRial)
  );
  const thresholdPct = report.allocation?.concentrationWarningPct ?? 50;

  return (
    <div className="p-4 rounded-[22px] bg-surface border border-line space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PieChart size={15} className="text-lime" />
          <h3 className="text-xs font-bold text-white">ترکیب هدف، ذخیرهٔ نقد و تمرکز</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {report.allocation && (
            <button
              type="button"
              onClick={() => deleteTargetAllocation(report.allocation!.id)}
              className="p-1.5 rounded-xl bg-surface2 border border-line text-muted hover:text-bad"
              title="حذف ترکیب هدف"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenEdit}
            className="px-2.5 py-1 rounded-xl bg-lime/15 text-lime border border-lime/30 text-[10px] font-bold flex items-center gap-1"
          >
            <Edit3 size={11} />
            <span>{report.allocation ? 'ویرایش ترکیب' : 'تنظیم ترکیب هدف'}</span>
          </button>
        </div>
      </div>

      {/* Incomplete portfolio -> explicit نامشخص */}
      {!report.isComplete && (
        <div className="p-3 rounded-xl bg-warn/10 border border-warn/30 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-warn flex items-center gap-1.5">
              <AlertTriangle size={13} />
              وضعیت تخصیص: نامشخص
            </span>
            <span className="px-2 py-0.5 rounded-full bg-warn/20 text-warn text-[10px] font-bold">
              نامشخص
            </span>
          </div>
          <p className="text-[10px] text-white/85 leading-relaxed">
            تا زمانی که ارزش‌گذاری همهٔ دارایی‌های دارای موجودی کامل و معتبر نباشد، سهم درصدها به‌صورت گمراه‌کننده محاسبه نمی‌شود.
          </p>
          {report.incompleteReasons.length > 0 && (
            <ul className="text-[10px] text-warn list-disc list-inside space-y-0.5">
              {report.incompleteReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Cash reserve & combined base summary */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2.5 rounded-xl bg-bg/60 border border-line/70">
          <div className="text-[10px] text-muted">ذخیرهٔ نقد تعریف‌شده</div>
          <div className="font-bold text-white mt-0.5">
            {hidden
              ? Money.HIDDEN
              : `${Money.toman(Number(R.roundHalfUp(report.cashReserveRial)))} تومان`}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-bg/60 border border-line/70">
          <div className="text-[10px] text-muted">کل سبد + ذخیرهٔ نقد</div>
          <div className="font-bold text-white mt-0.5">
            {hidden
              ? Money.HIDDEN
              : !report.isComplete || report.totalWithCashRial === null
                ? 'نامشخص'
                : `${Money.toman(Number(R.roundHalfUp(report.totalWithCashRial)))} تومان`}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {!report.allocation && activeSlices.length === 0 ? (
        <div className="text-[11px] text-muted text-center py-2">
          هنوز ترکیب هدفی تنظیم نشده است؛ با زدن دکمهٔ «تنظیم ترکیب هدف» سهم هر دسته و حساب‌های ذخیرهٔ نقد را مشخص کنید.
        </div>
      ) : (
        <div className="space-y-2">
          {report.slices.map(slice => {
            if (slice.targetPct === 0 && R.isZero(slice.actualRial)) return null;
            const actualPctText = !report.isComplete || slice.actualPct === null
              ? 'نامشخص'
              : `${Money.fa(slice.actualPct.toFixed(1))}٪`;
            const barWidth = report.isComplete && slice.actualPct !== null
              ? Math.min(100, Math.max(0, slice.actualPct))
              : 0;
            const deltaRounded =
              report.isComplete && slice.rebalanceDeltaRial !== null
                ? Number(R.roundHalfUp(slice.rebalanceDeltaRial))
                : null;

            return (
              <div
                key={slice.category}
                className="p-2.5 rounded-xl bg-bg/60 border border-line/70 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-white">{slice.labelFa}</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={!report.isComplete ? 'text-warn font-bold' : 'text-white font-bold'}>
                      فعلی: {actualPctText}
                    </span>
                    {report.allocation && (
                      <span className="text-muted">
                        هدف: {Money.fa(slice.targetPct.toFixed(1))}٪
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-1.5 rounded-full bg-surface2 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full ${
                      !report.isComplete
                        ? 'bg-warn/40'
                        : slice.deviationPct !== null && Math.abs(slice.deviationPct) > 5
                          ? 'bg-amber-400'
                          : 'bg-lime'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                  <span>
                    ارزش فعلی:{' '}
                    {hidden
                      ? Money.HIDDEN
                      : `${Money.toman(Number(R.roundHalfUp(slice.actualRial)))} تومان`}
                  </span>
                  {report.allocation && (
                    <span>
                      {!report.isComplete || deltaRounded === null ? (
                        <span className="text-warn font-bold">موازنه: نامشخص</span>
                      ) : hidden ? (
                        Money.HIDDEN
                      ) : Math.abs(deltaRounded) < 10 ? (
                        <span className="text-ok">در محدودهٔ هدف</span>
                      ) : deltaRounded > 0 ? (
                        <span className="text-sky">
                          کمبود {Money.toman(deltaRounded)} تومان
                        </span>
                      ) : (
                        <span className="text-amber-300">
                          مازاد {Money.toman(Math.abs(deltaRounded))} تومان
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Concentration warning & top single-asset shares */}
      {report.topConcentrations.length > 0 && (
        <div className="pt-2 border-t border-line/70 space-y-1.5">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="font-bold text-white flex items-center gap-1">
              <ShieldAlert
                size={13}
                className={report.hasConcentrationWarning ? 'text-warn' : 'text-muted'}
              />
              تمرکز تک‌دارایی (آستانه: {Money.fa(String(thresholdPct))}٪)
            </span>
            {!report.isComplete && (
              <span className="text-warn font-bold">نامشخص</span>
            )}
          </div>

          {report.hasConcentrationWarning && report.isComplete && (
            <div className="p-2 rounded-xl bg-bad/10 border border-bad/25 text-[10px] text-bad font-bold">
              هشدار تمرکز: حداقل یک دارایی بیش از {Money.fa(String(thresholdPct))}٪ از کل سبد (به‌همراه نقد) را تشکیل داده است.
            </div>
          )}

          <div className="space-y-1">
            {report.topConcentrations.slice(0, 4).map(item => (
              <div
                key={item.assetId}
                className="flex items-center justify-between text-[10px] text-muted"
              >
                <span className="truncate text-white/90">{item.assetName}</span>
                <span
                  className={
                    !report.isComplete || item.sharePct === null
                      ? 'text-warn font-bold'
                      : item.exceedsThreshold
                        ? 'text-bad font-bold'
                        : 'text-white/80'
                  }
                >
                  {!report.isComplete || item.sharePct === null
                    ? 'نامشخص'
                    : `${Money.fa(item.sharePct.toFixed(1))}٪`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AllocationModal({
  overview,
  accounts,
  onClose,
}: {
  overview: PortfolioOverview;
  accounts: Account[];
  onClose: () => void;
}) {
  const existing = overview.allocationReport.allocation;
  const [name, setName] = useState(existing?.name ?? 'ترکیب هدف اصلی');
  const [pcts, setPcts] = useState<Record<AllocationCategory, string>>(() => ({
    GOLD: String(existing?.targetsPct.GOLD ?? 40),
    SILVER: String(existing?.targetsPct.SILVER ?? 0),
    CURRENCY: String(existing?.targetsPct.CURRENCY ?? 20),
    CRYPTO: String(existing?.targetsPct.CRYPTO ?? 10),
    OTHER: String(existing?.targetsPct.OTHER ?? 0),
    CASH_RESERVE: String(existing?.targetsPct.CASH_RESERVE ?? 30),
  }));
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>(
    existing?.cashReserveAccountIds ?? []
  );
  const [manualCashToman, setManualCashToman] = useState(() =>
    existing?.manualCashReserveRial
      ? String(Math.round(Number(existing.manualCashReserveRial) / 10))
      : ''
  );
  const [concentrationPct, setConcentrationPct] = useState(
    String(existing?.concentrationWarningPct ?? 50)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sumPct = ALLOCATION_CATEGORIES.reduce((acc, cat) => {
    const num = Number(pcts[cat] || '0');
    return acc + (Number.isFinite(num) ? num : 0);
  }, 0);

  const toggleAccount = (id: number) => {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedTargets: Partial<Record<AllocationCategory, number>> = {};
    for (const cat of ALLOCATION_CATEGORIES) {
      const val = Number(pcts[cat].trim() || '0');
      if (!Number.isFinite(val) || val < 0 || val > 100) {
        setError(`درصد «${ALLOCATION_CATEGORY_LABELS[cat]}» نامعتبر است.`);
        return;
      }
      parsedTargets[cat] = val;
    }

    const threshold = Number(concentrationPct.trim() || '50');
    const parsedManual = manualCashToman.trim()
      ? Money.parseToman(manualCashToman)
      : 0;
    if (manualCashToman.trim() && (parsedManual === null || Number.isNaN(parsedManual) || parsedManual < 0)) {
      setError('مبلغ ذخیرهٔ نقد دستی نامعتبر است.');
      return;
    }
    const manualRial = parsedManual ?? 0;

    setSaving(true);
    try {
      await saveTargetAllocation({
        id: existing?.id,
        portfolioId: overview.portfolio.id,
        name,
        targetsPct: parsedTargets,
        cashReserveAccountIds: selectedAccountIds,
        manualCashReserveRial: manualRial > 0 ? String(Math.round(manualRial)) : undefined,
        concentrationWarningPct: threshold,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیرهٔ ترکیب هدف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[24px] bg-surface border border-line p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-white">تنظیم ترکیب هدف و ذخیرهٔ نقد</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-surface2 text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">عنوان ترکیب هدف</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-10 px-3 rounded-xl bg-bg border border-line text-xs text-white"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-white">سهم هر دسته (٪)</span>
            <span
              className={`font-bold ${
                Math.abs(sumPct - 100) <= 0.01 ? 'text-ok' : 'text-bad'
              }`}
            >
              جمع: {Money.fa(sumPct.toFixed(1))}٪ / ۱۰۰٪
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ALLOCATION_CATEGORIES.map(cat => (
              <div key={cat} className="p-2 rounded-xl bg-bg/60 border border-line/70">
                <label className="text-[10px] text-muted block mb-1 truncate">
                  {ALLOCATION_CATEGORY_LABELS[cat]}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pcts[cat]}
                  onChange={e =>
                    setPcts(prev => ({ ...prev, [cat]: Money.ascii(e.target.value) }))
                  }
                  className="w-full h-8 px-2 rounded-lg bg-surface border border-line text-xs text-white dir-ltr"
                />
              </div>
            ))}
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted block">
              حساب‌های بانکی متصل به ذخیرهٔ نقد
            </label>
            <div className="max-h-32 overflow-y-auto space-y-1 p-2 rounded-xl bg-bg/60 border border-line/70">
              {accounts.map(acc => {
                const checked = acc.id != null && selectedAccountIds.includes(acc.id);
                return (
                  <label
                    key={acc.id}
                    className="flex items-center justify-between gap-2 text-[11px] text-white cursor-pointer py-0.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => acc.id != null && toggleAccount(acc.id)}
                        className="accent-lime"
                      />
                      <span className="truncate">{acc.name}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] text-muted block mb-1">
            ذخیرهٔ نقد دستی اضافه (تومان، اختیاری)
          </label>
          <AmountInput
            value={manualCashToman}
            onChange={setManualCashToman}
            className="w-full h-10 px-3 rounded-xl bg-bg border border-line text-xs text-white"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">
            آستانهٔ هشدار تمرکز تک‌دارایی (٪)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={concentrationPct}
            onChange={e => setConcentrationPct(Money.ascii(e.target.value))}
            className="w-full h-10 px-3 rounded-xl bg-bg border border-line text-xs text-white dir-ltr"
          />
        </div>

        {error && <div className="text-xs text-bad font-bold">{error}</div>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab disabled:opacity-50"
        >
          {saving ? 'در حال ذخیره...' : 'ذخیره ترکیب هدف'}
        </button>
      </form>
    </div>
  );
}
