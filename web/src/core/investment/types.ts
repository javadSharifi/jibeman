export type AssetKind =
  | 'GOLD_MELTED'
  | 'GOLD_COIN'
  | 'GOLD_JEWELRY'
  | 'SILVER'
  | 'CURRENCY'
  | 'CRYPTO'
  | 'OTHER';

export type BaseUnit = 'GRAM' | 'COUNT' | 'UNIT';
export type TradeUnit = 'GRAM' | 'MESGHAL' | 'TROY_OUNCE' | 'COUNT' | 'UNIT';
export type QuoteSide = 'DEALER_BID' | 'DEALER_ASK' | 'REFERENCE';
export type PriceMethod = 'MANUAL' | 'MARKET_FEED' | 'DERIVED';
export type DatePrecision = 'EXACT' | 'DAY';

export interface Portfolio {
  id: string; // UUID v4
  name: string;
  baseCurrency: 'IRR';
  settings?: {
    stalePriceHours?: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface PricingSpec {
  referenceFineness?: number; // e.g., 750 for gold, 999 for silver
  coinNetMassGram?: string;   // e.g., '8.133'
  coinFineness?: number;      // e.g., 900
  quoteUnit?: TradeUnit;
  defaultHaircutRate?: string; // optional user setting, e.g., '0.1'
}

export interface Asset {
  id: string; // UUID v4
  portfolioId: string;
  kind: AssetKind;
  name: string;
  instrumentKey: string;
  baseUnit: BaseUnit;
  pricingSpec: PricingSpec;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TradeFeesRial {
  wage?: string;         // اجرت
  sellerProfit?: string; // سود فروشنده
  tax?: string;          // مالیات
  commission?: string;   // کارمزد
  other?: string;        // سایر
}

export interface TradeSnapshotPayload {
  quantity: string;            // decimal string in `unit` (or net metal weight for jewelry)
  unit: TradeUnit;
  fineness?: number;           // actual fineness of the traded lot (e.g., 750, 705, 999)
  grossMassGram?: string;      // jewelry gross mass
  attachmentsGram?: string;    // jewelry stone & attachments subtracted
  principalRial?: string;      // integer rial string
  feesRial?: TradeFeesRial;
  settlementRial?: string;     // final invoice paid (BUY) or net received (SELL) in integer rial
  invoiceIncludesFees?: boolean;
  costKnown: boolean;          // false only when OPENING historical cost is unknown
  storageLocation?: string;
  note?: string;
  haircutRateOverride?: string;
  fixedSellingFeeRial?: string;
}

export type LedgerEventKind = 'OPENING' | 'BUY' | 'SELL' | 'AMEND' | 'VOID';

export interface AmendPayload {
  targetKind: 'OPENING' | 'BUY' | 'SELL';
  snapshot: TradeSnapshotPayload;
}

export interface VoidPayload {
  reason?: string;
}

export type LedgerEventPayload = TradeSnapshotPayload | AmendPayload | VoidPayload;

export interface LedgerEvent {
  id: string; // UUID v4
  portfolioId: string;
  assetId: string;
  recordId: string; // stable UUID across AMEND / VOID
  parentEventId?: string;
  operationId: string;
  kind: LedgerEventKind;
  recordedAtMs: number;
  effectiveAtMs: number;
  datePrecision: DatePrecision;
  schemaVersion: 1;
  payload: LedgerEventPayload;
}

export type CashLinkOrigin = 'CREATED_BY_PORTFOLIO' | 'EXISTING_TXN';
export type CashLinkStatus = 'ACTIVE' | 'VOIDED' | 'NEEDS_RELINK' | 'NEEDS_REVIEW';

export interface CashLink {
  id: string; // UUID v4
  recordId: string;
  effectiveEventId: string;
  accountId: number;
  bankTxnId?: number;
  origin: CashLinkOrigin;
  status: CashLinkStatus;
  createdAt: number;
  updatedAt: number;
}

export interface PriceSnapshot {
  id: string; // UUID v4
  instrumentKey: string;
  sourceId: string;
  market: string;
  quoteSide: QuoteSide;
  currency: 'IRR';
  unit: TradeUnit;
  fineness?: number;
  amount: string; // decimal or integer rial string
  observedAtMs: number;
  fetchedAtMs?: number;
  method: PriceMethod;
}

export type DcaTriggerCombinator = 'AND' | 'OR';
export type DcaDropReference =
  | 'HIGH_WATERMARK'
  | 'LAST_BUY'
  | 'FIXED_ANCHOR'
  | 'MOVING_AVERAGE';

export interface DcaStepRule {
  stepIndex: number; // 1-based
  budgetRial: string; // integer rial string
  minIntervalDays?: number;
  dropTriggerPct?: string; // e.g. '5' for 5%
  dropReference?: DcaDropReference;
  anchorPriceRial?: string; // unit price in Rial for FIXED_ANCHOR
  combinator: DcaTriggerCombinator;
}

export interface DcaPlan {
  id: string; // UUID v4
  portfolioId: string;
  assetId: string;
  name: string;
  totalBudgetRial: string; // integer rial string
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  stalePriceHours: number;
  steps: DcaStepRule[];
  createdAt: number;
  updatedAt: number;
}

export interface DcaStepLink {
  id: string; // `${planId}#${stepIndex}`
  planId: string;
  assetId: string;
  stepIndex: number;
  recordIds: string[]; // stable UUIDs of linked BUY records (supports partial buys)
  triggeredAtMs?: number;
  updatedAt: number;
}

export type AlertRuleScope = 'PUBLIC_MARKET' | 'PORTFOLIO_LOCAL';

export type PublicAlertCondition = 'PRICE_ABOVE' | 'PRICE_BELOW';
export type PortfolioAlertCondition =
  | 'PORTFOLIO_VALUE_ABOVE'
  | 'PORTFOLIO_VALUE_BELOW'
  | 'ASSET_UNREALIZED_GAIN_PCT_ABOVE'
  | 'ASSET_UNREALIZED_LOSS_PCT_ABOVE'
  | 'STALE_PRICE'
  | 'NEEDS_REVIEW';

export type AlertConditionKind = PublicAlertCondition | PortfolioAlertCondition;

export interface AlertRule {
  id: string; // UUID v4
  portfolioId: string;
  scope: AlertRuleScope;
  name: string;
  enabled: boolean;
  instrumentKey?: string; // for PUBLIC_MARKET rules
  assetId?: string; // for PORTFOLIO_LOCAL asset rules
  condition: AlertConditionKind;
  thresholdValue?: string; // Rial integer string or percentage string
  staleAfterHours?: number; // for STALE_PRICE or price guard
  cooldownMinutes: number;
  lastTriggeredAtMs?: number;
  lastTriggeredObservedAtMs?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AlertEventLog {
  id: string; // UUID v4
  ruleId: string;
  scope: AlertRuleScope;
  title: string;
  publicMessage: string; // Safe for lock-screen (contains no portfolio balances)
  detailedMessage: string; // Shown only inside unlocked/unhidden UI
  observedAtMs?: number;
  triggeredAtMs: number;
}

export type AllocationCategory =
  | 'GOLD'
  | 'SILVER'
  | 'CURRENCY'
  | 'CRYPTO'
  | 'OTHER'
  | 'CASH_RESERVE';

export interface TargetAllocation {
  id: string; // UUID v4
  portfolioId: string;
  name: string;
  targetsPct: Partial<Record<AllocationCategory, number>>;
  cashReserveAccountIds: number[];
  manualCashReserveRial?: string;
  concentrationWarningPct: number;
  createdAt: number;
  updatedAt: number;
}
