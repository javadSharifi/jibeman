import { liveQuery } from 'dexie';
import { db, SYNC_TABLES, type SyncTableName, setSyncingRemote } from './db';

export type SyncCfg = {
  url: string;
  key: string;
  since: number;
  at: number;
  email: string;
};

export const DEFAULT_SYNC_URL = 'https://jibeman-sync.mohammadjavadsharifi98.workers.dev';
const LS_KEY = 'jibeman:sync';
const BATCH_SIZE = 200;
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

/**
 * PBKDF2 Zero-Knowledge key derivation:
 * Derives a 256-bit base64url key from Gmail + Password.
 * Neither password nor raw key ever leaves the phone unencrypted.
 */
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
  const key = await deriveKey(email, pass);
  const cfg: SyncCfg = {
    url,
    key,
    since: 0,
    at: 0,
    email: email.trim().toLowerCase(),
  };

  await callApi(cfg, '/api/register', { mode });
  setCfg(cfg);

  try {
    if (mode === 'register') {
      // In register mode, push all local rows
      await enqueueAll();
    }
    await syncNow();
  } catch (err) {
    if (mode === 'register') {
      setCfg(null);
      await db.outbox.clear();
    }
    throw err;
  }
}

export async function disconnect() {
  setCfg(null);
  await db.outbox.clear();
}

type RemoteRow = {
  tbl: SyncTableName;
  id: string;
  data: string | null;
  updated_at: number;
  deleted: 0 | 1;
};

async function applyRemote(changes: RemoteRow[]) {
  if (!changes.length) return;

  setSyncingRemote(true);
  try {
    const tableObjects = SYNC_TABLES.map((t) => (db as any)[t]).filter(Boolean);
    await db.transaction('rw', [...tableObjects, db.outbox], async () => {
      for (const c of changes) {
        if (!SYNC_TABLES.includes(c.tbl)) continue;
        const targetTable = (db as any)[c.tbl];
        if (!targetTable) continue;

        const numId = Number(c.id);
        const recordId = Number.isNaN(numId) ? c.id : numId;

        if (c.deleted) {
          await targetTable.delete(recordId);
          continue;
        }

        if (c.data) {
          try {
            const parsed = JSON.parse(c.data);
            await targetTable.put(parsed);
          } catch {}
        }
      }
    });
  } finally {
    setSyncingRemote(false);
  }
}

async function runSync() {
  const cfg = getCfg();
  if (!cfg) return;

  for (;;) {
    const pending = await db.outbox.limit(BATCH_SIZE).toArray();
    const changes: Array<{
      t: string;
      id: string;
      updatedAt: number;
      deleted?: 0 | 1;
      data?: string;
    }> = [];

    for (const o of pending) {
      if (o.deleted) {
        changes.push({ t: o.t, id: o.id, updatedAt: o.updatedAt, deleted: 1 });
      } else {
        const table = (db as any)[o.t];
        if (table) {
          const numId = Number(o.id);
          const row = await table.get(Number.isNaN(numId) ? o.id : numId);
          if (row) {
            changes.push({
              t: o.t,
              id: o.id,
              updatedAt: o.updatedAt,
              data: JSON.stringify(row),
            });
          }
        }
      }
    }

    const res = await callApi<{ changes: RemoteRow[]; clock: number }>(
      cfg,
      '/api/sync',
      {
        since: cfg.since,
        changes,
      },
    );

    await applyRemote(res.changes);

    await db.transaction('rw', db.outbox, async () => {
      for (const o of pending) {
        const cur = await db.outbox.get(o.key);
        if (cur && cur.updatedAt === o.updatedAt && cur.deleted === o.deleted) {
          await db.outbox.delete(o.key);
        }
      }
    });

    cfg.since = res.clock;
    cfg.at = Date.now();
    setCfg(cfg);

    if (pending.length < BATCH_SIZE) break;
  }
}

let runningPromise: Promise<void> | null = null;
export const syncNow = () => (runningPromise ??= runSync().finally(() => (runningPromise = null)));

export const isConnected = () => !!getCfg();

/** Background periodic sync listener */
export function startSync() {
  let timer: any;
  const scheduleSoon = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(() => {}), ms);
  };

  const resume = () => {
    const c = getCfg();
    if (c && Date.now() - c.at > STALE_MS) {
      scheduleSoon(500);
    }
  };

  const sub = liveQuery(() => db.outbox.count()).subscribe({
    next: (n) => {
      if (n && getCfg()) scheduleSoon(5_000);
    },
  });

  const onOnline = () => {
    if (getCfg()) scheduleSoon(1000);
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
