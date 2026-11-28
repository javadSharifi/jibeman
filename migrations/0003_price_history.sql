-- Phase 2: Public market price series, source health, and cross-source discrepancy log
CREATE TABLE market_price_series (
  id TEXT PRIMARY KEY,
  instrument_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  market TEXT NOT NULL,
  quote_side TEXT NOT NULL, -- DEALER_BID | DEALER_ASK | REFERENCE
  currency TEXT NOT NULL DEFAULT 'IRR',
  unit TEXT NOT NULL,
  fineness INTEGER,
  amount TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  fetched_at_ms INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (instrument_key, source_id, quote_side, observed_at_ms)
);

CREATE INDEX idx_market_price_lookup
  ON market_price_series (instrument_key, quote_side, observed_at_ms DESC);

CREATE TABLE market_source_health (
  source_id TEXT PRIMARY KEY,
  status TEXT NOT NULL, -- HEALTHY | BACKOFF_429 | ERROR | UNCONFIGURED | DISABLED
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  last_http_status INTEGER,
  last_latency_ms INTEGER,
  backoff_until_ms INTEGER,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_payload_json TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE market_price_discrepancies (
  id TEXT PRIMARY KEY,
  instrument_key TEXT NOT NULL,
  quote_side TEXT NOT NULL,
  source_a TEXT NOT NULL,
  source_b TEXT NOT NULL,
  amount_a TEXT NOT NULL,
  amount_b TEXT NOT NULL,
  diff_bps INTEGER NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
