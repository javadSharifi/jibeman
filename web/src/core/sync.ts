import { liveQuery } from 'dexie';
import { db, SYNC_TABLES, type SyncTableName, markSyncTransaction } from './db';
import { cloudDataKey, forgetCloudKey, loadCloudKey, saveCloudKey, seal, unseal } from './crypto';
import { protectRow, revealRow } from './db/protectedRows';

export type SyncCfg = {
  url: string;
  key: string;
  since: number;
  at: number;
  email: string;
  version?: 2;
};

export const DEFAULT_SYNC_URL = 'https://jibeman-sync.mohammadjavadsharifi98.workers.dev';
const LS_KEY = 'jibeman:sync';
const BATCH_SIZE = 50;
const encryptedPrefix = 'jms2.';
const keyScope = (cfg: SyncCfg) => `${cfg.url}|${cfg.email}`;
const STALE_MS = 5 * 60_000; // sync on resume if older than 5 min

export const getCfg = (): SyncCfg | null => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
  } catch {
    return null;
  }
};

const setCfg = (c: SyncCfg | null) => {
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

/** Enqueue all existing local records to push them to the cloud */
async function enqueueAll() {
  const now = Date.now();
  for (const t of SYNC_TABLES) {
    const rows = await (db as any)[t].toArray();
    for (const r of rows) {
      if (r && r.id != null) {
        await db.outbox.put({
          key: `${t}|${r.id}`,
          t,
          id: String(r.id),
          deleted: 0,
          updatedAt: r.updatedAt || r.createdAt || r.occurredAt || now,
        });
      }
    }
  }
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
  const health = await fetch(url.replace(/\/$/, '') + '/health', { cache: 'no-store' });
  if (!health.ok || (await health.json()).version !== 2) throw new SyncHttpError(426, 'Secure sync server required');
  const [key, dataKey] = await Promise.all([deriveKey(email, pass), cloudDataKey(email, pass)]);
  const cfg: SyncCfg = {
    url,
    key,
    since: 0,
    at: 0,
    email: email.trim().toLowerCase(),
    version: 2,
  };

  const server = await callApi<{ version?: number }>(cfg, '/api/register', { mode, version: 2 });
  if (server.version !== 2) throw new SyncHttpError(426, 'Secure sync server required');
  await saveCloudKey(keyScope(cfg), dataKey);
  setCfg(cfg);

  if (mode === 'register') await enqueueAll();
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

const recordId = (id: string) => Number.isNaN(Number(id)) ? id : Number(id);

async function encodeRemote(key: CryptoKey, table: string, id: string, at: number, row: object) {
  return encryptedPrefix + await seal(key, JSON.stringify(row), rowContext(table, id, at));
}

async function applyRemote(key: CryptoKey, changes: RemoteRow[]): Promise<Change[]> {
  const upgrades: Change[] = [];
  const incoming: { change: RemoteRow; row: object | null }[] = [];
  for (const change of changes) {
    if (!SYNC_TABLES.includes(change.tbl)) continue;
    if (change.deleted) {
      incoming.push({ change, row: null });
      continue;
    }
    if (!change.data) throw new Error('Missing sync data');
    const encrypted = change.data.startsWith(encryptedPrefix);
    const plaintext = encrypted
      ? await unseal(key, change.data.slice(encryptedPrefix.length), rowContext(change.tbl, change.id, change.updated_at))
      : change.data;
    const row = JSON.parse(plaintext);
    if (!row || typeof row !== 'object' || String(row.id) !== change.id || Object.hasOwn(row, 'privateData')) {
      throw new Error('Invalid sync data');
    }
    if (!encrypted) {
      upgrades.push({
        t: change.tbl, id: change.id, updatedAt: change.updated_at, legacy: 1,
        data: await encodeRemote(key, change.tbl, change.id, change.updated_at, row),
      });
    }
    incoming.push({ change, row: await protectRow(change.tbl, row) });
  }

  if (incoming.length) {
    await db.transaction('rw', [...SYNC_TABLES.map(name => db.table(name)), db.outbox], async () => {
      markSyncTransaction();
      for (const { change, row } of incoming) {
        const pending = await db.outbox.get(`${change.tbl}|${change.id}`);
        if (pending && pending.updatedAt >= change.updated_at) continue;
        const table = db.table(change.tbl);
        if (row) await table.put(row);
        else await table.delete(recordId(change.id));
      }
    });
  }
  return upgrades;
}

async function runSync() {
  const cfg = getCfg();
  if (!cfg) return;
  if (cfg.version !== 2) throw new SyncHttpError(428, 'Sign in again for encrypted sync');
  const key = await loadCloudKey(keyScope(cfg));
  if (!key) throw new SyncHttpError(428, 'Sign in again for encrypted sync');

  const exchange = async (since: number, changes: Change[]) => {
    const result = await callApi<{ version?: number; changes: RemoteRow[]; clock: number; more?: boolean }>(
      cfg, '/api/sync', { version: 2, since, changes },
    );
    if (result.version !== 2) throw new SyncHttpError(426, 'Secure sync server required');
    if (!Number.isSafeInteger(result.clock) || result.clock < since || !Array.isArray(result.changes)) {
      throw new Error('Invalid sync response');
    }
    return result;
  };

  for (;;) {
    const pending = await db.outbox.limit(BATCH_SIZE).toArray();
    const changes: Change[] = [];
    for (const entry of pending) {
      if (entry.deleted) {
        changes.push({ t: entry.t, id: entry.id, updatedAt: entry.updatedAt, deleted: 1 });
      } else {
        const stored = await db.table(entry.t).get(recordId(entry.id));
        if (stored) {
          const row = await revealRow(entry.t, stored);
          changes.push({
            t: entry.t, id: entry.id, updatedAt: entry.updatedAt,
            data: await encodeRemote(key, entry.t, entry.id, entry.updatedAt, row),
          });
        }
      }
    }

    const response = await exchange(cfg.since, changes);
    const upgrades = await applyRemote(key, response.changes);
    for (let i = 0; i < upgrades.length; i += BATCH_SIZE) {
      await exchange(response.clock, upgrades.slice(i, i + BATCH_SIZE));
    }

    await db.transaction('rw', db.outbox, async () => {
      for (const entry of pending) {
        const current = await db.outbox.get(entry.key);
        if (current && current.updatedAt === entry.updatedAt && current.deleted === entry.deleted) {
          await db.outbox.delete(entry.key);
        }
      }
    });

    cfg.since = response.clock;
    cfg.at = Date.now();
    setCfg(cfg);
    if (!response.more && pending.length < BATCH_SIZE) break;
  }
}

let runningPromise: Promise<void> | null = null;
export const syncNow = () => (runningPromise ??= runSync().finally(() => (runningPromise = null)));

export const isConnected = () => getCfg()?.version === 2;

/** Background periodic sync listener */
export function startSync() {
  let timer: any;
  const scheduleSoon = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(() => {}), ms);
  };

  const resume = () => {
    const c = getCfg();
    if (c?.version === 2 && Date.now() - c.at > STALE_MS) {
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
