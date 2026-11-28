// Cloudflare Worker Sync & Public Market Price Collector for Jibeman
interface Env {
  DB: D1Database;
  // Worker-only Secrets (never exposed to frontend):
  NAVASAN_API_KEY?: string;
  BONBAST_API_KEY?: string;
  COINGECKO_API_KEY?: string;
  GOLDAPI_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  DISABLE_NERKHARA_FEED?: string;
  DISABLE_IRAN_MARKET_FEED?: string;
}

const INVESTMENT_TABLES = new Set([
  'portfolios',
  'assets',
  'ledgerEvents',
  'cashLinks',
  'priceSnapshots',
  'dcaPlans',
  'dcaStepLinks',
  'alertRules',
  'targetAllocations',
]);

const BASE_TABLES = new Set([
  'accounts',
  'cards',
  'categories',
  'txns',
  'loans',
  'installments',
  'debts',
  'debtPayments',
  'persons',
  'goals',
  'goalEntries',
  'splitGroups',
  'splitMembers',
  'splitExpenses',
  'splitShares',
  'rules',
  'savingsCommitments',
  'savingsPayments',
  'compareSessions',
  'compareCriteria',
  'compareItems',
  'compareChecks',
  'impulseSessions',
]);

const TABLES = new Set([...BASE_TABLES, ...INVESTMENT_TABLES]);

const MAX_CHANGES = 200; // per request
const MAX_ROW_BYTES = 100_000;
const MAX_ROWS_PER_ACCOUNT = 50_000;
const MAX_SYNC_REQUEST = 6_000_000;
const MAX_JSON_REQUEST = 8_000;
const SERVER_MAX_VERSION = 3;
const CAPABILITIES = ['investment-sync-v1', 'public-market-prices-v1', 'public-alerts-v1'] as const;

const LIMITS = {
  register: { max: 10, windowMs: 60 * 60_000 },
  login: { max: 30, windowMs: 10 * 60_000 },
  sync: { max: 300, windowMs: 60 * 60_000 },
  prices: { max: 120, windowMs: 60 * 60_000 },
} as const;
type LimitName = keyof typeof LIMITS;

const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

async function allow(env: Env, name: LimitName, bucket: string): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const { max, windowMs } = LIMITS[name];
  const now = Date.now();
  const key = `${name}|${bucket}`;
  const row = await env.DB.prepare('SELECT window_start, hits FROM rate_limits WHERE bucket = ?').bind(key).first<{ window_start: number; hits: number }>();
  if (!row || now - row.window_start >= windowMs) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON CONFLICT (bucket) DO UPDATE SET window_start = excluded.window_start, hits = 1',
    )
      .bind(key, now)
      .run();
    return { ok: true };
  }
  if (row.hits >= max) return { ok: false, retryAfter: Math.ceil((row.window_start + windowMs - now) / 1000) };
  await env.DB.prepare('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?').bind(key).run();
  return { ok: true };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });

async function readJson(req: Request, max: number): Promise<unknown | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  try {
    const all = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    return null;
  }
}

async function accountHash(req: Request): Promise<string | null> {
  const m = /^Bearer ([\w-]{20,64})$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m[1]));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Change = { t: string; id: string; updatedAt: number; deleted?: 0 | 1; legacy?: 1; data?: string };

const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

function validChange(c: Change): boolean {
  if (!TABLES.has(c?.t)) return false;
  if (c.t === 'ledgerEvents' && c.deleted === 1) return false;
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    c.id.length <= 100 &&
    Number.isSafeInteger(c.updatedAt) &&
    c.updatedAt > 0 &&
    c.updatedAt <= Date.now() + MAX_CLOCK_SKEW_MS &&
    (c.legacy === undefined || (c.legacy === 1 && !c.deleted)) &&
    (c.deleted === 1
      ? c.data === undefined
      : (c.deleted === undefined || c.deleted === 0) && typeof c.data === 'string' &&
        c.data.length <= MAX_ROW_BYTES && /^jms2\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(c.data))
  );
}

async function getAccountSyncState(
  env: Env,
  hash: string,
): Promise<{ exists: boolean; minSyncVersion: number }> {
  try {
    const acc = await env.DB.prepare('SELECT min_sync_version FROM accounts WHERE hash = ?')
      .bind(hash)
      .first<{ min_sync_version?: number }>();
    if (!acc) return { exists: false, minSyncVersion: 2 };
    if ((acc.min_sync_version ?? 2) >= 3) return { exists: true, minSyncVersion: 3 };
  } catch {
    const acc = await env.DB.prepare('SELECT 1 FROM accounts WHERE hash = ?').bind(hash).first();
    if (!acc) return { exists: false, minSyncVersion: 2 };
  }
  const hasInv = await env.DB.prepare(
    `SELECT 1 FROM rows WHERE account = ? AND tbl IN ('portfolios', 'assets', 'ledgerEvents', 'cashLinks', 'priceSnapshots') LIMIT 1`,
  )
    .bind(hash)
    .first();
  return { exists: true, minSyncVersion: hasInv ? 3 : 2 };
}

// --- Phase 2: Public Market Price Collector (Cron + Cached D1 Read API) ---

interface CollectedQuote {
  instrumentKey: string;
  sourceId: string;
  market: string;
  quoteSide: 'DEALER_BID' | 'DEALER_ASK' | 'REFERENCE';
  unit: 'GRAM' | 'MESGHAL' | 'TROY_OUNCE' | 'COUNT' | 'UNIT';
  fineness?: number;
  amountRial: string;
  observedAtMs: number;
}

const COLLECTOR_TIMEOUT_MS = 10_000;
const FEED_FETCH_HEADERS = {
  accept: 'application/json',
  'user-agent': 'Jibeman-Sync/1.0 (+https://nerkhara.com)',
};

interface FreeSourceInstrumentSpec {
  instrumentKey: string;
  unit: CollectedQuote['unit'];
  fineness?: number;
  nerkharaId: string;
  iranMarketSymbol: string;
}

const FREE_INSTRUMENT_SOURCES: FreeSourceInstrumentSpec[] = [
  { instrumentKey: 'gold_18k_gram', unit: 'GRAM', fineness: 750, nerkharaId: 'gold-18k', iranMarketSymbol: 'GOLD_18K_IRR' },
  { instrumentKey: 'gold_mazaneh', unit: 'MESGHAL', fineness: 705, nerkharaId: 'gold-mesghal', iranMarketSymbol: 'GOLD_MESGHAL_IRR' },
  { instrumentKey: 'coin_emami', unit: 'COUNT', nerkharaId: 'coin-emami', iranMarketSymbol: 'COIN_EMAMI_IRR' },
  { instrumentKey: 'coin_bahar', unit: 'COUNT', nerkharaId: 'coin-bahar-azadi', iranMarketSymbol: 'COIN_BAHAR_IRR' },
  { instrumentKey: 'coin_nim', unit: 'COUNT', nerkharaId: 'coin-half', iranMarketSymbol: 'COIN_HALF_IRR' },
  { instrumentKey: 'coin_rob', unit: 'COUNT', nerkharaId: 'coin-quarter', iranMarketSymbol: 'COIN_QUARTER_IRR' },
  { instrumentKey: 'coin_gerami', unit: 'COUNT', nerkharaId: 'coin-gram', iranMarketSymbol: 'COIN_GRAMI_IRR' },
  { instrumentKey: 'silver_999_gram', unit: 'GRAM', fineness: 999, nerkharaId: 'silver-999', iranMarketSymbol: 'SILVER_999_IRR' },
  { instrumentKey: 'usd_cash', unit: 'UNIT', nerkharaId: 'usd', iranMarketSymbol: 'USD_IRR_FREE' },
  { instrumentKey: 'eur_cash', unit: 'UNIT', nerkharaId: 'eur', iranMarketSymbol: 'EUR_IRR_FREE' },
  { instrumentKey: 'gbp_cash', unit: 'UNIT', nerkharaId: 'gbp', iranMarketSymbol: 'GBP_IRR_FREE' },
  { instrumentKey: 'aed_cash', unit: 'UNIT', nerkharaId: 'aed', iranMarketSymbol: 'AED_IRR_FREE' },
  { instrumentKey: 'usdt', unit: 'UNIT', nerkharaId: 'usdt', iranMarketSymbol: 'USDT_IRR' },
];

async function fetchJsonWithTimeout(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COLLECTOR_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const latencyMs = Date.now() - start;
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, latencyMs, headers: res.headers, data };
  } finally {
    clearTimeout(timer);
  }
}

function parseTimestampMs(raw: unknown, fallbackMs: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const trimmed = raw.trim();
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num > 1e12 ? Math.floor(num) : Math.floor(num * 1000);
    // NerkhAra timestamps are UTC without trailing 'Z' (e.g. "2026-11-28T07:07:07")
    const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)
      ? `${trimmed}Z`
      : trimmed;
    const parsed = Date.parse(isoUtc);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

function tomanValueToRialString(v: unknown): string | null {
  const raw = typeof v === 'object' && v !== null && 'value' in v ? (v as any).value : v;
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 10));
}

function rialValueToRialString(v: unknown): string | null {
  const raw = typeof v === 'object' && v !== null && 'value' in v ? (v as any).value : v;
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n));
}

async function collectFromNavasan(apiKey: string, now: number): Promise<{
  status: number;
  latencyMs: number;
  retryAfterSec?: number;
  quotes: CollectedQuote[];
  rawSummary: string;
}> {
  // Secret stays strictly in Worker request; never logged or returned to client
  const url = `https://api.navasan.tech/latest/?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchJsonWithTimeout(url);
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? '900');
    return { status: 429, latencyMs: res.latencyMs, retryAfterSec: Number.isFinite(ra) ? ra : 900, quotes: [], rawSummary: '429' };
  }
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    return { status: res.status, latencyMs: res.latencyMs, quotes: [], rawSummary: `HTTP ${res.status}` };
  }

  const d = res.data as Record<string, any>;
  const quotes: CollectedQuote[] = [];
  const mapping: Array<{
    key: string;
    instrumentKey: string;
    unit: CollectedQuote['unit'];
    fineness?: number;
    quoteSide: CollectedQuote['quoteSide'];
  }> = [
    { key: '18ayar', instrumentKey: 'gold_18k_gram', unit: 'GRAM', fineness: 750, quoteSide: 'REFERENCE' },
    { key: 'abshodeh', instrumentKey: 'gold_mazaneh', unit: 'MESGHAL', fineness: 705, quoteSide: 'REFERENCE' },
    { key: 'sekkeh', instrumentKey: 'coin_emami', unit: 'COUNT', quoteSide: 'REFERENCE' },
    { key: 'bahar', instrumentKey: 'coin_bahar', unit: 'COUNT', quoteSide: 'REFERENCE' },
    { key: 'nim', instrumentKey: 'coin_nim', unit: 'COUNT', quoteSide: 'REFERENCE' },
    { key: 'rob', instrumentKey: 'coin_rob', unit: 'COUNT', quoteSide: 'REFERENCE' },
    { key: 'gerami', instrumentKey: 'coin_gerami', unit: 'COUNT', quoteSide: 'REFERENCE' },
    { key: 'usd_buy', instrumentKey: 'usd_cash', unit: 'UNIT', quoteSide: 'DEALER_BID' },
    { key: 'usd_sell', instrumentKey: 'usd_cash', unit: 'UNIT', quoteSide: 'DEALER_ASK' },
    { key: 'usdt', instrumentKey: 'usdt', unit: 'UNIT', quoteSide: 'REFERENCE' },
  ];

  for (const item of mapping) {
    const entry = d[item.key];
    if (!entry) continue;
    const amountRial = tomanValueToRialString(entry);
    if (!amountRial) continue;
    const observedAtMs = parseTimestampMs(entry.timestamp ?? entry.date, now);
    quotes.push({
      instrumentKey: item.instrumentKey,
      sourceId: 'navasan',
      market: 'tehran',
      quoteSide: item.quoteSide,
      unit: item.unit,
      fineness: item.fineness,
      amountRial,
      observedAtMs,
    });
  }

  return {
    status: res.status,
    latencyMs: res.latencyMs,
    quotes,
    rawSummary: JSON.stringify({ count: quotes.length }),
  };
}

async function collectFromBonbast(apiKey: string, now: number): Promise<{
  status: number;
  latencyMs: number;
  retryAfterSec?: number;
  quotes: CollectedQuote[];
  rawSummary: string;
}> {
  const url = `https://www.bon-bast.com/api/${encodeURIComponent(apiKey)}`;
  const res = await fetchJsonWithTimeout(url);
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? '900');
    return { status: 429, latencyMs: res.latencyMs, retryAfterSec: Number.isFinite(ra) ? ra : 900, quotes: [], rawSummary: '429' };
  }
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    return { status: res.status, latencyMs: res.latencyMs, quotes: [], rawSummary: `HTTP ${res.status}` };
  }
  const d = res.data as Record<string, any>;
  const observedAtMs = parseTimestampMs(d.last_modified ?? d.timestamp, now);
  const quotes: CollectedQuote[] = [];
  const pairs: Array<{
    field: string;
    instrumentKey: string;
    unit: CollectedQuote['unit'];
    fineness?: number;
    quoteSide: CollectedQuote['quoteSide'];
  }> = [
    { field: 'gol18', instrumentKey: 'gold_18k_gram', unit: 'GRAM', fineness: 750, quoteSide: 'REFERENCE' },
    { field: 'mithqal', instrumentKey: 'gold_mazaneh', unit: 'MESGHAL', fineness: 705, quoteSide: 'REFERENCE' },
    { field: 'emami1', instrumentKey: 'coin_emami', unit: 'COUNT', quoteSide: 'DEALER_ASK' },
    { field: 'emami2', instrumentKey: 'coin_emami', unit: 'COUNT', quoteSide: 'DEALER_BID' },
    { field: 'azadi1', instrumentKey: 'coin_bahar', unit: 'COUNT', quoteSide: 'DEALER_ASK' },
    { field: 'azadi2', instrumentKey: 'coin_bahar', unit: 'COUNT', quoteSide: 'DEALER_BID' },
    { field: 'usd1', instrumentKey: 'usd_cash', unit: 'UNIT', quoteSide: 'DEALER_ASK' },
    { field: 'usd2', instrumentKey: 'usd_cash', unit: 'UNIT', quoteSide: 'DEALER_BID' },
  ];
  for (const p of pairs) {
    const amountRial = tomanValueToRialString(d[p.field]);
    if (!amountRial) continue;
    quotes.push({
      instrumentKey: p.instrumentKey,
      sourceId: 'bonbast',
      market: 'tehran',
      quoteSide: p.quoteSide,
      unit: p.unit,
      fineness: p.fineness,
      amountRial,
      observedAtMs,
    });
  }
  return {
    status: res.status,
    latencyMs: res.latencyMs,
    quotes,
    rawSummary: JSON.stringify({ count: quotes.length }),
  };
}

async function collectFromNerkhAra(now: number): Promise<{
  status: number;
  latencyMs: number;
  retryAfterSec?: number;
  quotes: CollectedQuote[];
  rawSummary: string;
}> {
  const res = await fetchJsonWithTimeout('https://nerkhara.com/api/v1/latest.json', FEED_FETCH_HEADERS);
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? '600');
    return { status: 429, latencyMs: res.latencyMs, retryAfterSec: Number.isFinite(ra) ? ra : 600, quotes: [], rawSummary: '429' };
  }
  if (!res.ok || !res.data || !Array.isArray(res.data.items)) {
    return { status: res.status, latencyMs: res.latencyMs, quotes: [], rawSummary: `HTTP ${res.status}` };
  }

  const byId = new Map<string, any>();
  for (const item of res.data.items) {
    if (item && typeof item.id === 'string') {
      byId.set(item.id, item);
    }
  }

  const quotes: CollectedQuote[] = [];
  for (const spec of FREE_INSTRUMENT_SOURCES) {
    const item = byId.get(spec.nerkharaId);
    if (!item || item.stale === true) continue;
    if (item.unit !== 'IRT') continue;
    const amountRial = tomanValueToRialString(item.price);
    if (!amountRial) continue;
    const observedAtMs = parseTimestampMs(item.updated_utc ?? res.data.generated_utc, now);
    quotes.push({
      instrumentKey: spec.instrumentKey,
      sourceId: 'nerkhara',
      market: 'tehran',
      quoteSide: 'REFERENCE',
      unit: spec.unit,
      fineness: spec.fineness,
      amountRial,
      observedAtMs,
    });
  }

  return {
    status: res.status,
    latencyMs: res.latencyMs,
    quotes,
    rawSummary: JSON.stringify({ count: quotes.length, generated_utc: res.data.generated_utc ?? null }),
  };
}

async function collectFromIranMarket(now: number): Promise<{
  status: number;
  latencyMs: number;
  retryAfterSec?: number;
  quotes: CollectedQuote[];
  rawSummary: string;
}> {
  const res = await fetchJsonWithTimeout(
    'https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/latest.json',
    FEED_FETCH_HEADERS,
  );
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? '900');
    return { status: 429, latencyMs: res.latencyMs, retryAfterSec: Number.isFinite(ra) ? ra : 900, quotes: [], rawSummary: '429' };
  }
  const cats = res.data?.data?.categories;
  if (!res.ok || !cats || typeof cats !== 'object') {
    return { status: res.status, latencyMs: res.latencyMs, quotes: [], rawSummary: `HTTP ${res.status}` };
  }

  const bySymbol = new Map<string, any>();
  for (const cval of Object.values(cats as Record<string, unknown>)) {
    const list = Array.isArray(cval)
      ? cval
      : cval && typeof cval === 'object' && Array.isArray((cval as any).items)
        ? (cval as any).items
        : cval && typeof cval === 'object'
          ? Object.values(cval as Record<string, unknown>)
          : [];
    for (const item of list) {
      if (item && typeof item === 'object' && typeof (item as any).symbol === 'string') {
        bySymbol.set((item as any).symbol, item);
      }
    }
  }

  const quotes: CollectedQuote[] = [];
  for (const spec of FREE_INSTRUMENT_SOURCES) {
    const item = bySymbol.get(spec.iranMarketSymbol);
    if (!item || item.stale === true) continue;
    if (item.currency !== 'IRR') continue;
    const amountRial = rialValueToRialString(item.price);
    if (!amountRial) continue;
    const observedAtMs = parseTimestampMs(item.timestamp, now);
    quotes.push({
      instrumentKey: spec.instrumentKey,
      sourceId: 'iran_market',
      market: 'tehran',
      quoteSide: 'REFERENCE',
      unit: spec.unit,
      fineness: spec.fineness,
      amountRial,
      observedAtMs,
    });
  }

  return {
    status: res.status,
    latencyMs: res.latencyMs,
    quotes,
    rawSummary: JSON.stringify({ count: quotes.length, published_at: res.data?.meta?.published_at ?? null }),
  };
}

async function upsertSourceHealth(
  env: Env,
  row: {
    sourceId: string;
    status: string;
    lastAttemptAt: number;
    lastSuccessAt?: number;
    lastHttpStatus?: number;
    lastLatencyMs?: number;
    backoffUntilMs?: number | null;
    consecutiveErrors: number;
    lastError?: string | null;
    lastPayloadJson?: string | null;
  },
) {
  await env.DB.prepare(
    `INSERT INTO market_source_health
      (source_id, status, last_attempt_at, last_success_at, last_http_status, last_latency_ms, backoff_until_ms, consecutive_errors, last_error, last_payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (source_id) DO UPDATE SET
      status = excluded.status,
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = COALESCE(excluded.last_success_at, market_source_health.last_success_at),
      last_http_status = excluded.last_http_status,
      last_latency_ms = excluded.last_latency_ms,
      backoff_until_ms = excluded.backoff_until_ms,
      consecutive_errors = excluded.consecutive_errors,
      last_error = excluded.last_error,
      last_payload_json = COALESCE(excluded.last_payload_json, market_source_health.last_payload_json),
      updated_at = excluded.updated_at`,
  )
    .bind(
      row.sourceId,
      row.status,
      row.lastAttemptAt,
      row.lastSuccessAt ?? null,
      row.lastHttpStatus ?? null,
      row.lastLatencyMs ?? null,
      row.backoffUntilMs ?? null,
      row.consecutiveErrors,
      row.lastError ?? null,
      row.lastPayloadJson ?? null,
      Date.now(),
    )
    .run();
}

async function persistCollectedQuotes(env: Env, quotes: CollectedQuote[], now: number) {
  if (quotes.length === 0) return;
  const stmts: D1PreparedStatement[] = [];
  const stmt = env.DB.prepare(
    `INSERT INTO market_price_series
      (id, instrument_key, source_id, market, quote_side, currency, unit, fineness, amount, observed_at_ms, fetched_at_ms, schema_version)
     VALUES (?, ?, ?, ?, ?, 'IRR', ?, ?, ?, ?, ?, 1)
     ON CONFLICT (instrument_key, source_id, quote_side, observed_at_ms) DO UPDATE SET
      fetched_at_ms = excluded.fetched_at_ms`,
  );

  for (const q of quotes) {
    stmts.push(
      stmt.bind(
        crypto.randomUUID(),
        q.instrumentKey,
        q.sourceId,
        q.market,
        q.quoteSide,
        q.unit,
        q.fineness ?? null,
        q.amountRial,
        q.observedAtMs,
        now,
      ),
    );
  }
  await env.DB.batch(stmts);

  // Record same-definition cross-source discrepancies
  const byKeyAndSide = new Map<string, CollectedQuote[]>();
  for (const q of quotes) {
    const k = `${q.instrumentKey}|${q.quoteSide}`;
    const list = byKeyAndSide.get(k) ?? [];
    list.push(q);
    byKeyAndSide.set(k, list);
  }
  for (const [, list] of byKeyAndSide) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.sourceId === b.sourceId) continue;
        const na = Number(a.amountRial);
        const nb = Number(b.amountRial);
        if (na <= 0 || nb <= 0) continue;
        const diffBps = Math.round((Math.abs(na - nb) / Math.min(na, nb)) * 10_000);
        // Log material cross-source differences (>= 0.5%) while deduplicating unchanged readings
        if (diffBps < 50) continue;
        const obsMax = Math.max(a.observedAtMs, b.observedAtMs);
        const existingDisc = await env.DB.prepare(
          `SELECT 1 FROM market_price_discrepancies
           WHERE instrument_key = ? AND quote_side = ? AND source_a = ? AND source_b = ? AND observed_at_ms = ?
           LIMIT 1`,
        )
          .bind(a.instrumentKey, a.quoteSide, a.sourceId, b.sourceId, obsMax)
          .first();
        if (existingDisc) continue;
        await env.DB.prepare(
          `INSERT INTO market_price_discrepancies
            (id, instrument_key, quote_side, source_a, source_b, amount_a, amount_b, diff_bps, observed_at_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            crypto.randomUUID(),
            a.instrumentKey,
            a.quoteSide,
            a.sourceId,
            b.sourceId,
            a.amountRial,
            b.amountRial,
            diffBps,
            obsMax,
            now,
          )
          .run();
      }
    }
  }
}

async function collectMarketPrices(env: Env): Promise<void> {
  const now = Date.now();
  const sources: Array<{
    sourceId: string;
    enabled: boolean;
    disabledReason?: string;
    collector: (nowMs: number) => Promise<{
      status: number;
      latencyMs: number;
      retryAfterSec?: number;
      quotes: CollectedQuote[];
      rawSummary: string;
    }>;
  }> = [
    {
      sourceId: 'nerkhara',
      enabled: env.DISABLE_NERKHARA_FEED !== 'true',
      disabledReason: env.DISABLE_NERKHARA_FEED === 'true' ? 'Disabled via DISABLE_NERKHARA_FEED' : undefined,
      collector: (nowMs) => collectFromNerkhAra(nowMs),
    },
    {
      sourceId: 'iran_market',
      enabled: env.DISABLE_IRAN_MARKET_FEED !== 'true',
      disabledReason: env.DISABLE_IRAN_MARKET_FEED === 'true' ? 'Disabled via DISABLE_IRAN_MARKET_FEED' : undefined,
      collector: (nowMs) => collectFromIranMarket(nowMs),
    },
    {
      sourceId: 'navasan',
      enabled: Boolean(env.NAVASAN_API_KEY),
      disabledReason: 'Secret API key not configured in Worker',
      collector: (nowMs) => collectFromNavasan(env.NAVASAN_API_KEY!, nowMs),
    },
    {
      sourceId: 'bonbast',
      enabled: Boolean(env.BONBAST_API_KEY),
      disabledReason: 'Secret API key not configured in Worker',
      collector: (nowMs) => collectFromBonbast(env.BONBAST_API_KEY!, nowMs),
    },
  ];

  const allQuotes: CollectedQuote[] = [];
  for (const src of sources) {
    if (!src.enabled) {
      try {
        await upsertSourceHealth(env, {
          sourceId: src.sourceId,
          status: src.sourceId === 'navasan' || src.sourceId === 'bonbast' ? 'UNCONFIGURED' : 'DISABLED',
          lastAttemptAt: now,
          consecutiveErrors: 0,
          lastError: src.disabledReason ?? 'Disabled',
        });
      } catch {
        // Migration 0003 not yet applied
      }
      continue;
    }

    let existingHealth: { backoff_until_ms?: number | null; consecutive_errors?: number } | null = null;
    try {
      existingHealth = await env.DB.prepare(
        'SELECT backoff_until_ms, consecutive_errors FROM market_source_health WHERE source_id = ?',
      )
        .bind(src.sourceId)
        .first();
    } catch {
      return; // Migration 0003 not yet applied
    }

    if (existingHealth?.backoff_until_ms && now < existingHealth.backoff_until_ms) {
      continue;
    }

    const prevErrors = existingHealth?.consecutive_errors ?? 0;
    try {
      const res = await src.collector(now);
      if (res.status === 429) {
        const delayMs = Math.min(6 * 3600_000, Math.max((res.retryAfterSec ?? 900) * 1000, 900_000 * 2 ** prevErrors));
        await upsertSourceHealth(env, {
          sourceId: src.sourceId,
          status: 'BACKOFF_429',
          lastAttemptAt: now,
          lastHttpStatus: 429,
          lastLatencyMs: res.latencyMs,
          backoffUntilMs: now + delayMs,
          consecutiveErrors: prevErrors + 1,
          lastError: 'HTTP 429 rate limited',
        });
        continue;
      }

      if (res.status < 200 || res.status >= 300 || res.quotes.length === 0) {
        const delayMs = Math.min(2 * 3600_000, 300_000 * 2 ** prevErrors);
        await upsertSourceHealth(env, {
          sourceId: src.sourceId,
          status: 'ERROR',
          lastAttemptAt: now,
          lastHttpStatus: res.status,
          lastLatencyMs: res.latencyMs,
          backoffUntilMs: now + delayMs,
          consecutiveErrors: prevErrors + 1,
          lastError: `Unexpected response (${res.rawSummary})`,
        });
        continue;
      }

      allQuotes.push(...res.quotes);
      await upsertSourceHealth(env, {
        sourceId: src.sourceId,
        status: 'HEALTHY',
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastHttpStatus: res.status,
        lastLatencyMs: res.latencyMs,
        backoffUntilMs: null,
        consecutiveErrors: 0,
        lastError: null,
        lastPayloadJson: res.rawSummary,
      });
    } catch (err) {
      const delayMs = Math.min(2 * 3600_000, 300_000 * 2 ** prevErrors);
      await upsertSourceHealth(env, {
        sourceId: src.sourceId,
        status: 'ERROR',
        lastAttemptAt: now,
        backoffUntilMs: now + delayMs,
        consecutiveErrors: prevErrors + 1,
        lastError: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  if (allQuotes.length > 0) {
    await persistCollectedQuotes(env, allQuotes, now);
  }
}

async function backfillHistoryFromFreeSources(
  env: Env,
  instrumentKey: string,
  fromMs: number,
  now: number,
): Promise<void> {
  const spec = FREE_INSTRUMENT_SOURCES.find((s) => s.instrumentKey === instrumentKey);
  if (!spec) return;

  const rowsToInsert: Array<{ amountRial: string; observedAtMs: number; sourceId: string }> = [];

  if (env.DISABLE_NERKHARA_FEED !== 'true') {
    try {
      const res = await fetchJsonWithTimeout(
        `https://nerkhara.com/api/v1/history/${encodeURIComponent(spec.nerkharaId)}.json`,
        FEED_FETCH_HEADERS,
      );
      if (res.ok && res.data && res.data.unit === 'toman' && Array.isArray(res.data.points)) {
        for (const pt of res.data.points) {
          if (!Array.isArray(pt) || pt.length < 2) continue;
          const dateStr = String(pt[0]);
          const obsMs = Date.parse(`${dateStr}T12:00:00Z`);
          if (!Number.isFinite(obsMs) || obsMs < fromMs) continue;
          const amountRial = tomanValueToRialString(pt[1]);
          if (!amountRial) continue;
          rowsToInsert.push({ amountRial, observedAtMs: obsMs, sourceId: 'nerkhara' });
        }
      }
    } catch {
      // Fallback to secondary history source below
    }
  }

  if (rowsToInsert.length === 0 && env.DISABLE_IRAN_MARKET_FEED !== 'true') {
    try {
      const res = await fetchJsonWithTimeout(
        `https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/history/${encodeURIComponent(spec.iranMarketSymbol)}.json`,
        FEED_FETCH_HEADERS,
      );
      const unit = res.data?.meta?.unit;
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      if (res.ok && (unit === 'toman' || unit === 'rial') && list.length > 0) {
        for (const row of list) {
          const obsMs = parseTimestampMs(row?.t, 0);
          if (!obsMs || obsMs < fromMs) continue;
          const amountRial = unit === 'toman' ? tomanValueToRialString(row?.close) : rialValueToRialString(row?.close);
          if (!amountRial) continue;
          rowsToInsert.push({ amountRial, observedAtMs: obsMs, sourceId: 'iran_market' });
        }
      }
    } catch {
      // ignore fallback failure
    }
  }

  if (rowsToInsert.length === 0) return;

  const insertStmt = env.DB.prepare(
    `INSERT INTO market_price_series
      (id, instrument_key, source_id, market, quote_side, currency, unit, fineness, amount, observed_at_ms, fetched_at_ms, schema_version)
     VALUES (?, ?, ?, 'tehran', 'REFERENCE', 'IRR', ?, ?, ?, ?, ?, 1)
     ON CONFLICT (instrument_key, source_id, quote_side, observed_at_ms) DO NOTHING`,
  );

  // Batch in chunks of 80 statements for D1 reliability
  for (let i = 0; i < rowsToInsert.length; i += 80) {
    const chunk = rowsToInsert.slice(i, i + 80).map((r) =>
      insertStmt.bind(
        crypto.randomUUID(),
        spec.instrumentKey,
        r.sourceId,
        spec.unit,
        spec.fineness ?? null,
        r.amountRial,
        r.observedAtMs,
        now,
      ),
    );
    await env.DB.batch(chunk);
  }
}

async function loadLatestMarketBatch(env: Env) {
  return env.DB.batch([
    env.DB.prepare(
      `SELECT p.id, p.instrument_key, p.source_id, p.market, p.quote_side, p.currency, p.unit, p.fineness, p.amount, p.observed_at_ms, p.fetched_at_ms
       FROM market_price_series p
       INNER JOIN (
         SELECT instrument_key, source_id, quote_side, MAX(observed_at_ms) AS max_obs
         FROM market_price_series
         GROUP BY instrument_key, source_id, quote_side
       ) latest
       ON p.instrument_key = latest.instrument_key
         AND p.source_id = latest.source_id
         AND p.quote_side = latest.quote_side
         AND p.observed_at_ms = latest.max_obs`,
    ),
    env.DB.prepare(
      `SELECT source_id, status, last_attempt_at, last_success_at, last_http_status, last_latency_ms, backoff_until_ms, consecutive_errors, last_error, updated_at
       FROM market_source_health`,
    ),
    env.DB.prepare(
      `SELECT instrument_key, quote_side, source_a, source_b, amount_a, amount_b, diff_bps, observed_at_ms
       FROM market_price_discrepancies
       ORDER BY created_at DESC LIMIT 20`,
    ),
  ]);
}

async function handleGetLatestPrices(req: Request, env: Env) {
  const limit = await allow(env, 'prices', clientIp(req));
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);

  try {
    let [pricesRes, healthRes, discRes] = await loadLatestMarketBatch(env);
    if ((pricesRes.results?.length ?? 0) === 0 && (healthRes.results?.length ?? 0) === 0) {
      await collectMarketPrices(env);
      [pricesRes, healthRes, discRes] = await loadLatestMarketBatch(env);
    }

    return json(
      {
        ok: true,
        manualDefault: true,
        prices: pricesRes.results ?? [],
        sources: healthRes.results ?? [],
        discrepancies: discRes.results ?? [],
      },
      200,
      { 'cache-control': 'public, max-age=60' },
    );
  } catch {
    return json({ ok: true, manualDefault: true, prices: [], sources: [], discrepancies: [], migrationPending: true });
  }
}

async function handleGetPriceHistory(req: Request, env: Env) {
  const limit = await allow(env, 'prices', clientIp(req));
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);

  const url = new URL(req.url);
  const instrumentKey = url.searchParams.get('instrumentKey')?.trim() ?? '';
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') ?? '30') || 30));
  if (!instrumentKey || instrumentKey.length > 64) {
    return json({ error: 'invalid instrumentKey' }, 400);
  }
  const now = Date.now();
  const fromMs = now - days * 24 * 3600_000;

  try {
    const querySql = `SELECT id, instrument_key, source_id, market, quote_side, currency, unit, fineness, amount, observed_at_ms, fetched_at_ms
       FROM market_price_series
       WHERE instrument_key = ? AND observed_at_ms >= ?
       ORDER BY observed_at_ms ASC
       LIMIT 2000`;
    let res = await env.DB.prepare(querySql).bind(instrumentKey, fromMs).all();
    if ((res.results?.length ?? 0) < Math.min(days, 10)) {
      await backfillHistoryFromFreeSources(env, instrumentKey, fromMs, now);
      res = await env.DB.prepare(querySql).bind(instrumentKey, fromMs).all();
    }

    return json(
      { ok: true, instrumentKey, days, prices: res.results ?? [] },
      200,
      { 'cache-control': 'public, max-age=120' },
    );
  } catch {
    return json({ ok: true, instrumentKey, days, prices: [], migrationPending: true });
  }
}

const FORBIDDEN_PORTFOLIO_KEYS = new Set([
  'portfolioId',
  'assetId',
  'quantity',
  'costBasis',
  'costBasisRial',
  'balance',
  'holdings',
  'accountId',
  'txns',
  'ledgerEvents',
]);

function containsPortfolioFields(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  if (Array.isArray(val)) return val.some(containsPortfolioFields);
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (FORBIDDEN_PORTFOLIO_KEYS.has(k)) return true;
    if (v && typeof v === 'object' && containsPortfolioFields(v)) return true;
  }
  return false;
}

async function handleEvaluatePublicAlerts(req: Request, env: Env) {
  const limit = await allow(env, 'prices', clientIp(req));
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);

  const body = (await readJson(req, MAX_JSON_REQUEST)) as {
    rules?: Array<{
      id?: string;
      instrumentKey?: string;
      condition?: string;
      thresholdRial?: string;
      cooldownMinutes?: number;
      lastTriggeredAtMs?: number;
      lastTriggeredObservedAtMs?: number;
    }>;
  } | null;

  if (!body || !Array.isArray(body.rules) || body.rules.length > 50) {
    return json({ error: 'bad request' }, 400);
  }
  // Enforce strict privacy boundary: reject any request carrying portfolio data
  if (containsPortfolioFields(body)) {
    return json({ error: 'portfolio data is forbidden on public alert endpoints' }, 400);
  }

  const now = Date.now();
  const staleCutoffMs = now - 24 * 3600_000;
  try {
    const latestRes = await env.DB.prepare(
      `SELECT p.instrument_key, p.quote_side, p.amount, p.observed_at_ms
       FROM market_price_series p
       INNER JOIN (
         SELECT instrument_key, MAX(observed_at_ms) AS max_obs
         FROM market_price_series
         WHERE quote_side != 'DEALER_ASK'
         GROUP BY instrument_key
       ) m ON p.instrument_key = m.instrument_key AND p.observed_at_ms = m.max_obs`,
    ).all<{ instrument_key: string; quote_side: string; amount: string; observed_at_ms: number }>();

    const priceMap = new Map<string, { amount: string; observedAtMs: number }>();
    for (const row of latestRes.results ?? []) {
      if (!priceMap.has(row.instrument_key)) {
        priceMap.set(row.instrument_key, { amount: row.amount, observedAtMs: row.observed_at_ms });
      }
    }

    const triggered: Array<{ ruleId: string; instrumentKey: string; observedAtMs: number; amount: string }> = [];
    for (const r of body.rules) {
      if (!r?.id || !r.instrumentKey || !r.thresholdRial) continue;
      if (r.condition !== 'PRICE_ABOVE' && r.condition !== 'PRICE_BELOW') continue;
      const latest = priceMap.get(r.instrumentKey);
      if (!latest || latest.observedAtMs < staleCutoffMs) continue;
      const cooldownMs = Math.max(1, Number(r.cooldownMinutes ?? 60)) * 60_000;
      if (r.lastTriggeredAtMs && now - r.lastTriggeredAtMs < cooldownMs) continue;
      if (r.lastTriggeredObservedAtMs && latest.observedAtMs <= r.lastTriggeredObservedAtMs) continue;

      const cur = Number(latest.amount);
      const thr = Number(r.thresholdRial);
      if (!Number.isFinite(cur) || !Number.isFinite(thr)) continue;
      const hit =
        (r.condition === 'PRICE_ABOVE' && cur >= thr) ||
        (r.condition === 'PRICE_BELOW' && cur <= thr);
      if (hit) {
        triggered.push({
          ruleId: r.id,
          instrumentKey: r.instrumentKey,
          observedAtMs: latest.observedAtMs,
          amount: latest.amount,
        });
      }
    }

    return json({ ok: true, triggered, evaluatedAtMs: now });
  } catch {
    return json({ ok: true, triggered: [], evaluatedAtMs: now, migrationPending: true });
  }
}

async function handlePublicAlertSubscription(req: Request, env: Env) {
  const limit = await allow(env, 'prices', clientIp(req));
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);
  const body = (await readJson(req, MAX_JSON_REQUEST)) as {
    id?: string;
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    rules?: unknown[];
  } | null;
  if (!body || !body.id || containsPortfolioFields(body)) {
    return json({ error: 'invalid or non-public subscription payload' }, 400);
  }
  try {
    if (req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM public_alert_subscriptions WHERE id = ?').bind(body.id).run();
      return json({ ok: true });
    }
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      return json({ ok: false, error: 'push not configured on worker' }, 501);
    }
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO public_alert_subscriptions (id, endpoint, p256dh, auth, rules_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
         rules_json = excluded.rules_json, updated_at = excluded.updated_at`,
    )
      .bind(
        body.id,
        body.endpoint ?? null,
        body.p256dh ?? null,
        body.auth ?? null,
        JSON.stringify(body.rules ?? []),
        now,
        now,
      )
      .run();
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'migration pending' }, 503);
  }
}

// User registration / login
async function register(req: Request, env: Env, hash: string, ip: string) {
  const parsed = (await readJson(req, MAX_JSON_REQUEST)) as { mode?: string; version?: number } | null;
  if (parsed === null) return json({ error: 'bad request' }, 400);
  const { mode, version } = parsed;
  const reqVersion = version === 3 ? 3 : 2;
  const limit = await allow(env, mode === 'login' ? 'login' : 'register', ip);
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);

  const state = await getAccountSyncState(env, hash);
  if (mode === 'login') {
    if (!state.exists) return json({ error: 'unknown account' }, 401);
    if (state.minSyncVersion >= 3 && reqVersion < 3) {
      return json({ error: 'client update required for investment sync', version: 3 }, 426);
    }
    return json({ ok: true, version: reqVersion, maxVersion: SERVER_MAX_VERSION, capabilities: CAPABILITIES });
  }
  if (state.exists) return json({ error: 'exists' }, 409);

  try {
    await env.DB.prepare('INSERT INTO accounts (hash, created_at, min_sync_version) VALUES (?, ?, ?)')
      .bind(hash, Date.now(), reqVersion)
      .run();
  } catch {
    await env.DB.prepare('INSERT INTO accounts (hash, created_at) VALUES (?, ?)')
      .bind(hash, Date.now())
      .run();
  }
  return json({ ok: true, version: reqVersion, maxVersion: SERVER_MAX_VERSION, capabilities: CAPABILITIES });
}

// Sync changes push & pull
async function sync(req: Request, env: Env, hash: string, ip: string) {
  const state = await getAccountSyncState(env, hash);
  if (!state.exists) {
    return json({ error: 'unknown key' }, 401);
  }
  const limit = await allow(env, 'sync', `${ip}|${hash.slice(0, 16)}`);
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);
  const body = (await readJson(req, MAX_SYNC_REQUEST)) as { version?: number; since?: number; changes?: Change[] } | null;
  if (!body) return json({ error: 'bad request' }, 400);
  if (body.version !== 2 && body.version !== 3) {
    return json({ error: 'encrypted sync required', version: 2, maxVersion: SERVER_MAX_VERSION }, 426);
  }

  const clientVersion = body.version;
  const since = body?.since;
  const changes = body?.changes ?? [];
  if (!body || !Number.isSafeInteger(since) || !Array.isArray(changes) || changes.length > MAX_CHANGES || !changes.every(validChange)) {
    return json({ error: 'bad request' }, 400);
  }

  if (clientVersion === 2) {
    if (state.minSyncVersion >= 3 || changes.some((c) => INVESTMENT_TABLES.has(c.t))) {
      return json({ error: 'client update required for investment sync', version: 3 }, 426);
    }
  }

  const stmts: D1PreparedStatement[] = [];
  let upgradedAccountToV3 = false;
  if (changes.length) {
    const ordinaryCount = changes.filter((c) => !c.legacy).length;
    if (ordinaryCount) {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rows WHERE account = ?').bind(hash).first<{ n: number }>();
      if ((n?.n ?? 0) + ordinaryCount > MAX_ROWS_PER_ACCOUNT) return json({ error: 'full' }, 413);
    }
    stmts.push(env.DB.prepare('UPDATE accounts SET clock = clock + 1 WHERE hash = ?').bind(hash));

    if (clientVersion === 3 && state.minSyncVersion < 3 && changes.some((c) => INVESTMENT_TABLES.has(c.t))) {
      upgradedAccountToV3 = true;
    }

    const upsert = env.DB.prepare(
      `INSERT INTO rows (account, tbl, id, data, updated_at, deleted, server_at)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT clock FROM accounts WHERE hash = ?))
       ON CONFLICT (account, tbl, id) DO UPDATE SET
         data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, server_at = excluded.server_at
       WHERE excluded.updated_at > rows.updated_at`,
    );
    const insertImmutableEvent = env.DB.prepare(
      `INSERT INTO rows (account, tbl, id, data, updated_at, deleted, server_at)
       VALUES (?, ?, ?, ?, ?, 0, (SELECT clock FROM accounts WHERE hash = ?))
       ON CONFLICT (account, tbl, id) DO NOTHING`,
    );
    const upgrade = env.DB.prepare(
      `UPDATE rows SET data = ?, server_at = (SELECT clock FROM accounts WHERE hash = ?)
       WHERE account = ? AND tbl = ? AND id = ? AND updated_at = ? AND deleted = 0
         AND data NOT LIKE 'jms2.%'`,
    );
    for (const c of changes) {
      if (c.legacy) {
        stmts.push(upgrade.bind(c.data, hash, hash, c.t, c.id, c.updatedAt));
      } else if (c.t === 'ledgerEvents') {
        stmts.push(insertImmutableEvent.bind(hash, c.t, c.id, c.data, c.updatedAt, hash));
      } else {
        stmts.push(upsert.bind(hash, c.t, c.id, c.deleted ? null : c.data, c.updatedAt, c.deleted ? 1 : 0, hash));
      }
    }
  }

  const pageClock = `SELECT COALESCE(
    (SELECT server_at FROM rows WHERE account = ? AND server_at > ? ORDER BY server_at LIMIT 1 OFFSET 199),
    (SELECT clock FROM accounts WHERE hash = ?)
  )`;
  const tblFilter =
    clientVersion === 2
      ? ` AND tbl NOT IN ('portfolios', 'assets', 'ledgerEvents', 'cashLinks', 'priceSnapshots', 'dcaPlans', 'dcaStepLinks', 'alertRules', 'targetAllocations')`
      : '';
  stmts.push(
    env.DB.prepare(`SELECT tbl, id, data, updated_at, deleted FROM rows
      WHERE account = ? AND server_at > ? AND server_at <= (${pageClock})${tblFilter} ORDER BY server_at`)
      .bind(hash, since, hash, since, hash),
    env.DB.prepare(`SELECT (${pageClock}) AS page_clock, clock FROM accounts WHERE hash = ?`)
      .bind(hash, since, hash, hash),
  );
  const res = await env.DB.batch(stmts);
  if (upgradedAccountToV3) {
    try {
      await env.DB.prepare('UPDATE accounts SET min_sync_version = 3 WHERE hash = ? AND min_sync_version < 3')
        .bind(hash)
        .run();
    } catch {
      // Migration 0002 not yet applied on DB
    }
  }
  const pulled = res[res.length - 2].results;
  const position = res[res.length - 1].results[0] as { page_clock: number; clock: number };
  return json({
    version: clientVersion,
    maxVersion: SERVER_MAX_VERSION,
    capabilities: CAPABILITIES,
    changes: pulled,
    clock: position.page_clock,
    more: position.page_clock < position.clock,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname === '/health' || pathname === '/') {
      return json({
        ok: true,
        service: 'jibeman-sync',
        version: 2,
        maxVersion: SERVER_MAX_VERSION,
        capabilities: CAPABILITIES,
      });
    }

    if (req.method === 'GET' && pathname === '/api/prices/latest') {
      return handleGetLatestPrices(req, env);
    }
    if (req.method === 'GET' && pathname === '/api/prices/history') {
      return handleGetPriceHistory(req, env);
    }
    if (req.method === 'GET' && pathname === '/api/alerts/public-capabilities') {
      return json({
        ok: true,
        publicAlertsSupported: true,
        pushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
        vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
      });
    }
    if (req.method === 'POST' && pathname === '/api/alerts/evaluate-public') {
      return handleEvaluatePublicAlerts(req, env);
    }
    if ((req.method === 'POST' || req.method === 'DELETE') && pathname === '/api/alerts/public-subscription') {
      return handlePublicAlertSubscription(req, env);
    }

    const cap = pathname === '/api/sync' ? MAX_SYNC_REQUEST : MAX_JSON_REQUEST;
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > cap) return json({ error: 'too large' }, 413);

    const hash = await accountHash(req);
    if (!hash) return json({ error: 'unauthorized' }, 401);
    const ip = clientIp(req);

    if (req.method !== 'POST' || (pathname !== '/api/register' && pathname !== '/api/sync')) {
      return json({ error: 'not found' }, 404);
    }
    return pathname === '/api/register' ? register(req, env, hash, ip) : sync(req, env, hash, ip);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(collectMarketPrices(env));
  },
};
