import { liveQuery } from 'dexie';
import { db, SYNC_TABLES, type SyncTableName, markSyncTransaction } from './db';
import { cloudDataKey, forgetCloudKey, loadCloudKey, saveCloudKey, seal, unseal } from './crypto';
import { protectRow, revealRow } from './db/protectedRows';
import {
  R,
  canonicalEventFingerprint,
  computeTradeSettlementRial,
  replayAssetLedger,
  type Asset,
  type LedgerEvent,
} from './investment';

export type SyncCfg = {
  url: string;
  key: string;
  since: number;
  at: number;
  email: string;
  version?: 2 | 3;
  investmentSync?: boolean;
};

export const DEFAULT_SYNC_URL = 'https://jibeman-sync.mohammadjavadsharifi98.workers.dev';
const LS_KEY = 'jibeman:sync';
const BATCH_SIZE = 50;
const encryptedPrefix = 'jms2.';
const keyScope = (cfg: SyncCfg) => `${cfg.url}|${cfg.email}`;
const STALE_MS = 5 * 60_000; // sync on resume if older than 5 min

const INVESTMENT_TABLES = new Set<SyncTableName>([
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

export const getCfg = (): SyncCfg | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
  } catch {
    return null;
  }
};

const setCfg = (c: SyncCfg | null) => {
  if (typeof localStorage === 'undefined') return;
  if (c) {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } else {
    localStorage.removeItem(LS_KEY);
  }
};

export class SyncHttpError extends Error {
  constructor(public status: number, message?: string) {
    super(message || `HTTP ${status}`);
  }
}

async function callApi<T>(cfg: SyncCfg, path: string, body: unknown): Promise<T> {
  const url = cfg.url.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errBody: any = null;
    try {
      errBody = await res.json();
    } catch {}
    throw new SyncHttpError(res.status, errBody?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Retain the legacy authentication credential so existing accounts can sign in.
export async function deriveKey(email: string, pass: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(`jibeman|${cleanEmail}`),
      iterations: 200_000,
    },
    base,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function enqueueTables(tables: readonly SyncTableName[]) {
  const now = Date.now();
  for (const t of tables) {
    const rows = await (db as any)[t].toArray();
    for (const r of rows) {
      if (r && r.id != null) {
        await db.outbox.put({
          key: `${t}|${r.id}`,
          t,
          id: String(r.id),
          deleted: 0,
          updatedAt: r.updatedAt || r.createdAt || r.occurredAt || r.recordedAtMs || r.observedAtMs || now,
        });
      }
    }
  }
}

/** Enqueue all existing local records to push them to the cloud */
async function enqueueAll(includeInvestments: boolean) {
  const targets = includeInvestments
    ? SYNC_TABLES
    : SYNC_TABLES.filter((t) => !INVESTMENT_TABLES.has(t));
  await enqueueTables(targets);
}

async function probeServerCapabilities(url: string): Promise<{
  supportsV3: boolean;
}> {
  const health = await fetch(url.replace(/\/$/, '') + '/health', { cache: 'no-store' });
  if (!health.ok) throw new SyncHttpError(426, 'Secure sync server required');
  const body = (await health.json()) as {
    version?: number;
    maxVersion?: number;
    capabilities?: string[];
  };
  if (body.version !== 2 && body.version !== 3) {
    throw new SyncHttpError(426, 'Secure sync server required');
  }
  const supportsV3 =
    (typeof body.maxVersion === 'number' && body.maxVersion >= 3) ||
    (Array.isArray(body.capabilities) && body.capabilities.includes('investment-sync-v1'));
  return { supportsV3 };
}

/** Connect (Register or Login) and immediately sync */
export async function connect(
  email: string,
  pass: string,
  mode: 'register' | 'login',
  url: string = DEFAULT_SYNC_URL,
) {
  if (runningPromise) await runningPromise.catch(() => {});
  const endpoint = new URL(url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
    throw new Error('Secure sync endpoint required');
  }
  const { supportsV3 } = await probeServerCapabilities(url);
  const clientVersion: 2 | 3 = supportsV3 ? 3 : 2;
  const [key, dataKey] = await Promise.all([deriveKey(email, pass), cloudDataKey(email, pass)]);
  const cfg: SyncCfg = {
    url,
    key,
    since: 0,
    at: 0,
    email: email.trim().toLowerCase(),
    version: clientVersion,
    investmentSync: supportsV3,
  };

  const server = await callApi<{ version?: number; maxVersion?: number; capabilities?: string[] }>(
    cfg,
    '/api/register',
    { mode, version: clientVersion },
  );
  if (server.version !== 2 && server.version !== 3) {
    throw new SyncHttpError(426, 'Secure sync server required');
  }
  if (server.version === 3) {
    cfg.version = 3;
    cfg.investmentSync = true;
  }
  await saveCloudKey(keyScope(cfg), dataKey);
  setCfg(cfg);

  if (mode === 'register') await enqueueAll(Boolean(cfg.investmentSync));
  await syncNow();
}

export async function disconnect() {
  if (runningPromise) await runningPromise.catch(() => {});
  const cfg = getCfg();
  setCfg(null);
  if (cfg) await forgetCloudKey(keyScope(cfg));
  await db.outbox.clear();
}

type RemoteRow = {
  tbl: SyncTableName;
  id: string;
  data: string | null;
  updated_at: number;
  deleted: 0 | 1;
};

type Change = {
  t: string;
  id: string;
  updatedAt: number;
  deleted?: 1;
  legacy?: 1;
  data?: string;
};

const rowContext = (table: string, id: string, updatedAt: number) =>
  JSON.stringify(['jibeman', 'sync', 2, table, id, updatedAt]);

const recordId = (id: string) => (Number.isNaN(Number(id)) ? id : Number(id));

async function encodeRemote(key: CryptoKey, table: string, id: string, at: number, row: object) {
  return encryptedPrefix + (await seal(key, JSON.stringify(row), rowContext(table, id, at)));
}

async function decodeRemoteChanges(
  key: CryptoKey,
  changes: RemoteRow[],
): Promise<{
  upgrades: Change[];
  incoming: Array<{ change: RemoteRow; rawRow: Record<string, unknown> | null; protectedRow: object | null }>;
}> {
  const upgrades: Change[] = [];
  const incoming: Array<{
    change: RemoteRow;
    rawRow: Record<string, unknown> | null;
    protectedRow: object | null;
  }> = [];

  for (const change of changes) {
    if (!SYNC_TABLES.includes(change.tbl)) continue;
    if (change.deleted) {
      incoming.push({ change, rawRow: null, protectedRow: null });
      continue;
    }
    if (!change.data) throw new Error('Missing sync data');
    const encrypted = change.data.startsWith(encryptedPrefix);
    const plaintext = encrypted
      ? await unseal(
          key,
          change.data.slice(encryptedPrefix.length),
          rowContext(change.tbl, change.id, change.updated_at),
        )
      : change.data;
    const row = JSON.parse(plaintext) as Record<string, unknown>;
    if (!row || typeof row !== 'object' || String(row.id) !== change.id || Object.hasOwn(row, 'privateData')) {
      throw new Error('Invalid sync data');
    }
    if (!encrypted) {
      upgrades.push({
        t: change.tbl,
        id: change.id,
        updatedAt: change.updated_at,
        legacy: 1,
        data: await encodeRemote(key, change.tbl, change.id, change.updated_at, row),
      });
    }
    incoming.push({
      change,
      rawRow: row,
      protectedRow: await protectRow(change.tbl, row),
    });
  }

  return { upgrades, incoming };
}

async function reconcileSyncedInvestmentsInTx(
  affectedAssetIds: Set<string>,
  newlyPulledTxnIds: Set<number>,
) {
  if (affectedAssetIds.size === 0) return;
  const now = Date.now();

  for (const assetId of affectedAssetIds) {
    const asset = (await db.assets.get(assetId)) as Asset | undefined;
    if (!asset) continue;

    const events = await db.ledgerEvents.where('assetId').equals(assetId).toArray();
    const replay = replayAssetLedger(asset, events);
    const persistedConflicts = await db.syncConflicts.where('assetId').equals(assetId).count();
    const hasConflict = replay.status === 'NEEDS_REVIEW' || persistedConflicts > 0;

    const recordIds = Array.from(
      new Set([
        ...events.map((e) => e.recordId),
        ...replay.effectiveRecords.map((r) => r.recordId),
        ...replay.voidedRecords.map((r) => r.recordId),
      ]),
    );

    if (hasConflict) {
      for (const recId of recordIds) {
        const links = await db.cashLinks.where('recordId').equals(recId).toArray();
        for (const link of links) {
          if (
            link.origin === 'CREATED_BY_PORTFOLIO' &&
            link.bankTxnId != null &&
            newlyPulledTxnIds.has(link.bankTxnId)
          ) {
            await db.txns.delete(link.bankTxnId);
          }
          if (link.status === 'ACTIVE') {
            await db.cashLinks.update(link.id, {
              status: 'NEEDS_REVIEW',
              updatedAt: now,
            });
          }
        }
      }
      continue;
    }

    // Valid replay: verify each active CashLink against local txns (do not leave broken links silent)
    for (const rec of replay.effectiveRecords) {
      const links = await db.cashLinks.where('recordId').equals(rec.recordId).toArray();
      const { settlementRial } = computeTradeSettlementRial(rec.snapshot, rec.effectiveKind);
      const expectedAmount = Number(R.roundHalfUp(settlementRial));

      for (const link of links) {
        if (link.status !== 'ACTIVE' || link.bankTxnId == null) continue;
        const txn = await db.txns.get(link.bankTxnId);
        if (!txn || txn.accountId !== link.accountId || txn.amount !== expectedAmount) {
          await db.cashLinks.update(link.id, {
            status: 'NEEDS_RELINK',
            updatedAt: now,
          });
        }
      }
    }
  }
}

async function applyAtomicPulledBatch(
  decoded: Array<{ change: RemoteRow; rawRow: Record<string, unknown> | null; protectedRow: object | null }>,
  pushedOutboxEntries: Array<{ key: string; updatedAt: number; deleted: 0 | 1 }>,
) {
  await db.transaction(
    'rw',
    [...SYNC_TABLES.map((name) => db.table(name)), db.syncConflicts, db.outbox],
    async () => {
      markSyncTransaction();
      const affectedAssetIds = new Set<string>();
      const newlyPulledTxnIds = new Set<number>();
      const touchedRecordIds = new Set<string>();

      // Apply non-ledger/non-cashlink tables first so assets exist when reconciling
      const deferredCashLinks: typeof decoded = [];

      for (const item of decoded) {
        const { change, rawRow, protectedRow } = item;

        if (change.tbl === 'cashLinks') {
          deferredCashLinks.push(item);
          continue;
        }

        if (change.tbl === 'ledgerEvents') {
          if (!rawRow) continue; // ledgerEvents cannot be deleted
          const remoteEv = rawRow as unknown as LedgerEvent;
          affectedAssetIds.add(remoteEv.assetId);
          const existing = await db.ledgerEvents.get(remoteEv.id);
          if (existing) {
            if (canonicalEventFingerprint(existing) !== canonicalEventFingerprint(remoteEv)) {
              await db.syncConflicts.put({
                id: `dup|${remoteEv.id}`,
                assetId: remoteEv.assetId,
                recordId: remoteEv.recordId,
                eventId: remoteEv.id,
                conflict: {
                  code: 'DUPLICATE_ID_MISMATCH',
                  message: 'نسخهٔ همگام‌سازی‌شده با شناسهٔ تکراری و محتوای متفاوت دریافت شد',
                  eventId: remoteEv.id,
                  recordId: remoteEv.recordId,
                },
                detectedAt: Date.now(),
              });
            }
            continue;
          }
          await db.ledgerEvents.put(remoteEv);
          continue;
        }

        const pending = await db.outbox.get(`${change.tbl}|${change.id}`);
        if (pending && pending.updatedAt >= change.updated_at) continue;

        const table = db.table(change.tbl);
        if (protectedRow) {
          if (change.tbl === 'txns') {
            const numId = recordId(change.id);
            if (typeof numId === 'number' && !(await table.get(numId))) {
              newlyPulledTxnIds.add(numId);
            }
          }
          if (change.tbl === 'assets') {
            affectedAssetIds.add(change.id);
          }
          await table.put(protectedRow);
        } else {
          await table.delete(recordId(change.id));
        }
      }

      for (const { change, protectedRow } of deferredCashLinks) {
        const pending = await db.outbox.get(`${change.tbl}|${change.id}`);
        if (pending && pending.updatedAt >= change.updated_at) continue;
        if (protectedRow) {
          await db.cashLinks.put(protectedRow as any);
          touchedRecordIds.add((protectedRow as { recordId: string }).recordId);
        } else {
          await db.cashLinks.delete(change.id);
        }
      }

      for (const recId of touchedRecordIds) {
        const ev = await db.ledgerEvents.where('recordId').equals(recId).first();
        if (ev) affectedAssetIds.add(ev.assetId);
      }

      await reconcileSyncedInvestmentsInTx(affectedAssetIds, newlyPulledTxnIds);

      for (const entry of pushedOutboxEntries) {
        const current = await db.outbox.get(entry.key);
        if (current && current.updatedAt === entry.updatedAt && current.deleted === entry.deleted) {
          await db.outbox.delete(entry.key);
        }
      }
    },
  );
}

async function runSync() {
  const cfg = getCfg();
  if (!cfg) return;
  if (cfg.version !== 2 && cfg.version !== 3) {
    throw new SyncHttpError(428, 'Sign in again for encrypted sync');
  }
  const key = await loadCloudKey(keyScope(cfg));
  if (!key) throw new SyncHttpError(428, 'Sign in again for encrypted sync');

  // Auto-upgrade legacy v2 client config if server now supports v3 investment sync gate
  if (cfg.version === 2 || !cfg.investmentSync) {
    try {
      const { supportsV3 } = await probeServerCapabilities(cfg.url);
      if (supportsV3) {
        cfg.version = 3;
        cfg.investmentSync = true;
        setCfg(cfg);
        await enqueueTables([...INVESTMENT_TABLES]);
      }
    } catch {
      // Keep v2 if health probe fails offline; sync request will still handle errors
    }
  }

  const syncVersion: 2 | 3 = cfg.version === 3 && cfg.investmentSync ? 3 : 2;

  const exchange = async (since: number, changes: Change[]) => {
    const result = await callApi<{
      version?: number;
      maxVersion?: number;
      capabilities?: string[];
      changes: RemoteRow[];
      clock: number;
      more?: boolean;
    }>(cfg, '/api/sync', { version: syncVersion, since, changes });

    if (result.version !== 2 && result.version !== 3) {
      throw new SyncHttpError(426, 'Secure sync server required');
    }
    if (!Number.isSafeInteger(result.clock) || result.clock < since || !Array.isArray(result.changes)) {
      throw new Error('Invalid sync response');
    }
    return result;
  };

  // Collect all outbox batches (excluding investment tables if server is still v2)
  const allPending = await db.outbox.toArray();
  const pushable = syncVersion === 3
    ? allPending
    : allPending.filter((e) => !INVESTMENT_TABLES.has(e.t as SyncTableName));

  let cursorSince = cfg.since;
  const allPulled: RemoteRow[] = [];
  const pushedEntries: Array<{ key: string; updatedAt: number; deleted: 0 | 1 }> = [];

  let offset = 0;
  for (;;) {
    const batch = pushable.slice(offset, offset + BATCH_SIZE);
    offset += batch.length;

    const changes: Change[] = [];
    for (const entry of batch) {
      if (entry.deleted) {
        changes.push({ t: entry.t, id: entry.id, updatedAt: entry.updatedAt, deleted: 1 });
      } else {
        const stored = await db.table(entry.t).get(recordId(entry.id));
        if (stored) {
          const row = await revealRow(entry.t, stored);
          changes.push({
            t: entry.t,
            id: entry.id,
            updatedAt: entry.updatedAt,
            data: await encodeRemote(key, entry.t, entry.id, entry.updatedAt, row),
          });
        }
      }
      pushedEntries.push({ key: entry.key, updatedAt: entry.updatedAt, deleted: entry.deleted });
    }

    const response = await exchange(cursorSince, changes);
    for (const r of response.changes) allPulled.push(r);
    cursorSince = response.clock;

    if (!response.more && offset >= pushable.length) break;
  }

  // Decrypt all pulled pages before touching local Dexie (atomic pull commit)
  const { upgrades, incoming } = await decodeRemoteChanges(key, allPulled);
  await applyAtomicPulledBatch(incoming, pushedEntries);

  for (let i = 0; i < upgrades.length; i += BATCH_SIZE) {
    await exchange(cursorSince, upgrades.slice(i, i + BATCH_SIZE));
  }

  cfg.since = cursorSince;
  cfg.at = Date.now();
  setCfg(cfg);
}

let runningPromise: Promise<void> | null = null;
export const syncNow = () => (runningPromise ??= runSync().finally(() => (runningPromise = null)));

export const isConnected = () => {
  const v = getCfg()?.version;
  return v === 2 || v === 3;
};

export const isInvestmentSyncReady = () => {
  const c = getCfg();
  return c?.version === 3 && c?.investmentSync === true;
};

/** Background periodic sync listener */
export function startSync() {
  let timer: any;
  const scheduleSoon = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(() => {}), ms);
  };

  const resume = () => {
    const c = getCfg();
    if ((c?.version === 2 || c?.version === 3) && Date.now() - c.at > STALE_MS) {
      scheduleSoon(500);
    }
  };

  const sub = liveQuery(() => db.outbox.count()).subscribe({
    next: (n) => {
      if (n && isConnected()) scheduleSoon(5_000);
    },
  });

  const onOnline = () => {
    if (isConnected()) scheduleSoon(1000);
  };

  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', onOnline);
  resume();

  return () => {
    clearTimeout(timer);
    sub.unsubscribe();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', onOnline);
  };
}
