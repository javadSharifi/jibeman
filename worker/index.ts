// Cloudflare Worker Sync Backend for Jibeman
interface Env {
  DB: D1Database;
}

const TABLES = new Set([
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
]);

const MAX_CHANGES = 200; // per request
const MAX_ROW_BYTES = 100_000; // allows AES-GCM/base64 overhead for previously accepted Unicode JSON
const MAX_ROWS_PER_ACCOUNT = 50_000;
const MAX_SYNC_REQUEST = 6_000_000;
const MAX_JSON_REQUEST = 8_000;

const LIMITS = {
  register: { max: 10, windowMs: 60 * 60_000 }, // 10 new accounts per hour per IP
  login: { max: 30, windowMs: 10 * 60_000 }, // 30 login attempts per 10 minutes per IP
  sync: { max: 300, windowMs: 60 * 60_000 }, // runaway loop guard
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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });

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
  return (
    TABLES.has(c?.t) &&
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

// User registration / login
async function register(req: Request, env: Env, hash: string, ip: string) {
  const parsed = (await readJson(req, MAX_JSON_REQUEST)) as { mode?: string } | null;
  if (parsed === null) return json({ error: 'bad request' }, 400);
  const { mode } = parsed;
  const limit = await allow(env, mode === 'login' ? 'login' : 'register', ip);
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);
  const exists = !!(await env.DB.prepare('SELECT 1 FROM accounts WHERE hash = ?').bind(hash).first());
  if (mode === 'login') return exists ? json({ ok: true, version: 2 }) : json({ error: 'unknown account' }, 401);
  if (exists) return json({ error: 'exists' }, 409);
  await env.DB.prepare('INSERT INTO accounts (hash, created_at) VALUES (?, ?)').bind(hash, Date.now()).run();
  return json({ ok: true, version: 2 });
}

// Sync changes push & pull
async function sync(req: Request, env: Env, hash: string, ip: string) {
  if (!(await env.DB.prepare('SELECT 1 FROM accounts WHERE hash = ?').bind(hash).first())) {
    return json({ error: 'unknown key' }, 401);
  }
  const limit = await allow(env, 'sync', `${ip}|${hash.slice(0, 16)}`);
  if (!limit.ok) return json({ error: 'rate limited', retryAfter: limit.retryAfter }, 429);
  const body = (await readJson(req, MAX_SYNC_REQUEST)) as { version?: number; since?: number; changes?: Change[] } | null;
  if (!body) return json({ error: 'bad request' }, 400);
  if (body.version !== 2) return json({ error: 'encrypted sync required', version: 2 }, 426);
  const since = body?.since;
  const changes = body?.changes ?? [];
  if (!body || !Number.isSafeInteger(since) || !Array.isArray(changes) || changes.length > MAX_CHANGES || !changes.every(validChange)) {
    return json({ error: 'bad request' }, 400);
  }

  const stmts: D1PreparedStatement[] = [];
  if (changes.length) {
    const ordinaryCount = changes.filter(c => !c.legacy).length;
    if (ordinaryCount) {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rows WHERE account = ?').bind(hash).first<{ n: number }>();
      if ((n?.n ?? 0) + ordinaryCount > MAX_ROWS_PER_ACCOUNT) return json({ error: 'full' }, 413);
    }
    stmts.push(env.DB.prepare('UPDATE accounts SET clock = clock + 1 WHERE hash = ?').bind(hash));
    const upsert = env.DB.prepare(
      `INSERT INTO rows (account, tbl, id, data, updated_at, deleted, server_at)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT clock FROM accounts WHERE hash = ?))
       ON CONFLICT (account, tbl, id) DO UPDATE SET
         data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, server_at = excluded.server_at
       WHERE excluded.updated_at > rows.updated_at`,
    );
    const upgrade = env.DB.prepare(
      `UPDATE rows SET data = ?, server_at = (SELECT clock FROM accounts WHERE hash = ?)
       WHERE account = ? AND tbl = ? AND id = ? AND updated_at = ? AND deleted = 0
         AND data NOT LIKE 'jms2.%'`,
    );
    for (const c of changes) {
      stmts.push(c.legacy
        ? upgrade.bind(c.data, hash, hash, c.t, c.id, c.updatedAt)
        : upsert.bind(hash, c.t, c.id, c.deleted ? null : c.data, c.updatedAt, c.deleted ? 1 : 0, hash));
    }
  }

  // End each page on a whole server clock so no rows from one push are skipped.
  const pageClock = `SELECT COALESCE(
    (SELECT server_at FROM rows WHERE account = ? AND server_at > ? ORDER BY server_at LIMIT 1 OFFSET 199),
    (SELECT clock FROM accounts WHERE hash = ?)
  )`;
  stmts.push(
    env.DB.prepare(`SELECT tbl, id, data, updated_at, deleted FROM rows
      WHERE account = ? AND server_at > ? AND server_at <= (${pageClock}) ORDER BY server_at`)
      .bind(hash, since, hash, since, hash),
    env.DB.prepare(`SELECT (${pageClock}) AS page_clock, clock FROM accounts WHERE hash = ?`)
      .bind(hash, since, hash, hash),
  );
  const res = await env.DB.batch(stmts);
  const pulled = res[res.length - 2].results;
  const position = res[res.length - 1].results[0] as { page_clock: number; clock: number };
  return json({ version: 2, changes: pulled, clock: position.page_clock, more: position.page_clock < position.clock });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname === '/health' || pathname === '/') {
      return json({ ok: true, service: 'jibeman-sync', version: 2 });
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
};
