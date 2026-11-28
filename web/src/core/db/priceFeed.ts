import { db } from './index';
import { DEFAULT_SYNC_URL, getCfg } from '../sync';
import {
  mergePriceSnapshots,
  type PriceSnapshot,
  type QuoteSide,
  type TradeUnit,
} from '../investment';

const FEED_ENABLED_KEY = 'jibeman_market_feed_enabled';
const FEED_META_KEY = 'jibeman_market_feed_meta';

export interface MarketSourceHealth {
  source_id: string;
  status: 'HEALTHY' | 'BACKOFF_429' | 'ERROR' | 'UNCONFIGURED' | 'DISABLED' | string;
  last_attempt_at?: number | null;
  last_success_at?: number | null;
  last_http_status?: number | null;
  last_latency_ms?: number | null;
  backoff_until_ms?: number | null;
  consecutive_errors?: number;
  last_error?: string | null;
  updated_at?: number;
}

export interface MarketPriceDiscrepancy {
  instrument_key: string;
  quote_side: string;
  source_a: string;
  source_b: string;
  amount_a: string;
  amount_b: string;
  diff_bps: number;
  observed_at_ms: number;
}

export interface MarketFeedMeta {
  lastFetchedAt?: number;
  lastError?: string | null;
  sources: MarketSourceHealth[];
  discrepancies: MarketPriceDiscrepancy[];
  cachedCount: number;
}

interface WorkerPriceRow {
  id: string;
  instrument_key: string;
  source_id: string;
  market: string;
  quote_side: QuoteSide;
  currency: 'IRR';
  unit: TradeUnit;
  fineness?: number | null;
  amount: string;
  observed_at_ms: number;
  fetched_at_ms: number;
}

export function isMarketFeedEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(FEED_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMarketFeedEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FEED_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
}

export function getCachedFeedMeta(): MarketFeedMeta {
  try {
    if (typeof localStorage === 'undefined') {
      return { sources: [], discrepancies: [], cachedCount: 0 };
    }
    const raw = localStorage.getItem(FEED_META_KEY);
    if (!raw) return { sources: [], discrepancies: [], cachedCount: 0 };
    return JSON.parse(raw) as MarketFeedMeta;
  } catch {
    return { sources: [], discrepancies: [], cachedCount: 0 };
  }
}

function saveCachedFeedMeta(meta: MarketFeedMeta): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FEED_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage failures
  }
}

function resolvePriceServerUrl(): string {
  return (getCfg()?.url || DEFAULT_SYNC_URL).replace(/\/$/, '');
}

function mapWorkerRowToSnapshot(row: WorkerPriceRow): PriceSnapshot {
  return {
    id: row.id,
    instrumentKey: row.instrument_key,
    sourceId: row.source_id,
    market: row.market || 'tehran',
    quoteSide: row.quote_side,
    currency: 'IRR',
    unit: row.unit,
    fineness: row.fineness ?? undefined,
    amount: row.amount,
    observedAtMs: row.observed_at_ms,
    fetchedAtMs: row.fetched_at_ms,
    method: 'MARKET_FEED',
  };
}

async function cacheFeedSnapshotsInDb(snapshots: PriceSnapshot[]): Promise<number> {
  if (snapshots.length === 0) return 0;
  await db.transaction('rw', db.priceSnapshots, async () => {
    const byKey = new Map<string, PriceSnapshot[]>();
    for (const s of snapshots) {
      const list = byKey.get(s.instrumentKey) ?? [];
      list.push(s);
      byKey.set(s.instrumentKey, list);
    }

    for (const [instrumentKey, incomingList] of byKey) {
      let existing = await db.priceSnapshots
        .where('instrumentKey')
        .equals(instrumentKey)
        .toArray();
      for (const incoming of incomingList) {
        existing = mergePriceSnapshots(existing, incoming);
      }
      await db.priceSnapshots.bulkPut(existing);
    }
  });
  return snapshots.length;
}

export async function refreshMarketPriceFeed(): Promise<MarketFeedMeta> {
  const baseUrl = resolvePriceServerUrl();
  const prevMeta = getCachedFeedMeta();
  try {
    const res = await fetch(`${baseUrl}/api/prices/latest`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      ok?: boolean;
      prices?: WorkerPriceRow[];
      sources?: MarketSourceHealth[];
      discrepancies?: MarketPriceDiscrepancy[];
    };

    const incoming = (body.prices ?? []).map(mapWorkerRowToSnapshot);
    const cachedCount = await cacheFeedSnapshotsInDb(incoming);

    const nextMeta: MarketFeedMeta = {
      lastFetchedAt: Date.now(),
      lastError: null,
      sources: body.sources ?? [],
      discrepancies: body.discrepancies ?? [],
      cachedCount,
    };
    saveCachedFeedMeta(nextMeta);
    return nextMeta;
  } catch (err) {
    const fallbackMeta: MarketFeedMeta = {
      ...prevMeta,
      lastError:
        err instanceof Error
          ? `خطا در ارتباط با فید قیمت (${err.message}) — نمایش از کش محلی و نرخ دستی`
          : 'خطا در ارتباط با فید قیمت',
    };
    saveCachedFeedMeta(fallbackMeta);
    return fallbackMeta;
  }
}

export async function fetchInstrumentHistoryFromFeed(
  instrumentKey: string,
  days = 30
): Promise<{ imported: number; error?: string }> {
  const baseUrl = resolvePriceServerUrl();
  try {
    const res = await fetch(
      `${baseUrl}/api/prices/history?instrumentKey=${encodeURIComponent(instrumentKey)}&days=${days}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return { imported: 0, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { prices?: WorkerPriceRow[] };
    const incoming = (body.prices ?? []).map(mapWorkerRowToSnapshot);
    const imported = await cacheFeedSnapshotsInDb(incoming);
    return { imported };
  } catch (err) {
    return {
      imported: 0,
      error: err instanceof Error ? err.message : 'خطا در دریافت تاریخچهٔ قیمت',
    };
  }
}
