-- One account per sync key; only the SHA-256 of the key is stored.
CREATE TABLE accounts (
  hash TEXT PRIMARY KEY,
  clock INTEGER NOT NULL DEFAULT 0, -- bumped once per push; clients pull "server_at > their last clock"
  created_at INTEGER NOT NULL
);

-- B1: rate limits for endpoints to prevent brute force / flooding
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL
);

-- Rows synced across devices
CREATE TABLE rows (
  account TEXT NOT NULL,
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  server_at INTEGER NOT NULL,
  PRIMARY KEY (account, tbl, id)
) WITHOUT ROWID;

CREATE INDEX rows_pull ON rows (account, server_at);
