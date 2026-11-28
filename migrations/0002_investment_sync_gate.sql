-- Sync Gate v3: track minimum client sync protocol version per account
ALTER TABLE accounts ADD COLUMN min_sync_version INTEGER NOT NULL DEFAULT 2;
