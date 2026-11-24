import type { Table } from 'dexie';
import { backupFormat, decryptBackup, encryptBackup } from './crypto';
import { db, SYNC_TABLES, type SyncTableName } from './db';
import { protectRow, revealRows } from './db/protectedRows';

type BackupRow = { id: number };
const table = (name: SyncTableName): Table<BackupRow, number> => db.table(name);

export async function exportBackup(password: string): Promise<string> {
  const data = await db.transaction('r', SYNC_TABLES.map(table), async () =>
    Promise.all(SYNC_TABLES.map(async name => [name, await table(name).toArray()] as const)),
  );
  const entries = await Promise.all(data.map(async ([name, rows]) => [name, await revealRows(name, rows)]));
  return encryptBackup(JSON.stringify({
    version: 1, exportedAt: Date.now(), data: Object.fromEntries(entries),
  }), password);
}

export async function restoreBackup(text: string, password: string): Promise<void> {
  const envelope = JSON.parse(text);
  const backup = envelope?.format === backupFormat ? JSON.parse(await decryptBackup(envelope, password)) : envelope;
  if (backup?.version !== 1 || !backup.data || typeof backup.data !== 'object') throw new Error('Invalid backup');
  for (const name of ['accounts', 'cards', 'categories', 'txns']) {
    if (!Array.isArray(backup.data[name])) throw new Error('Invalid backup');
  }

  const data = new Map<SyncTableName, BackupRow[]>();
  for (const name of SYNC_TABLES) {
    if (!Object.hasOwn(backup.data, name)) continue;
    const rows: unknown = backup.data[name];
    if (!Array.isArray(rows) || rows.some(row => !row || !Number.isSafeInteger(row.id) || row.id < 1 || Object.hasOwn(row, 'privateData'))) {
      throw new Error('Invalid backup');
    }
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate backup row');
    data.set(name, await Promise.all(rows.map(row => protectRow(name, row))));
  }

  await db.transaction('rw', [...[...data.keys()].map(table), db.outbox], async () => {
    for (const [name, rows] of data) {
      const target = table(name);
      await target.clear();
      await target.bulkAdd(rows);
    }
  });
}
