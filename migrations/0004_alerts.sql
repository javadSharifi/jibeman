-- Phase 4-C: Public market-only alert subscriptions (zero portfolio data)
CREATE TABLE public_alert_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  rules_json TEXT NOT NULL, -- strictly public instrumentKey + threshold rules only
  last_evaluated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
