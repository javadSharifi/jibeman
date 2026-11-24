import Dexie from 'dexie';
import { deviceKey, seal, unseal } from '../crypto';

const fields = {
  accounts: ['accountNo', 'cardNumber', 'cardExpiry', 'cardCvv2', 'iban'],
  cards: ['last4'],
  persons: ['name', 'cardNo'],
} as const;

function sensitiveFields(table: string): readonly string[] {
  return Object.hasOwn(fields, table) ? fields[table as keyof typeof fields] : [];
}

function context(table: string): string {
  return `jibeman|device|1|${table}`;
}

export function hasRawCardData(table: string, row: object): boolean {
  return sensitiveFields(table).some(field => Object.hasOwn(row, field));
}

export async function protectRow<T extends object>(table: string, row: T): Promise<T> {
  if (!hasRawCardData(table, row)) return row;
  const record = { ...row } as Record<string, unknown>;
  const secret: Record<string, unknown> = {};
  for (const field of sensitiveFields(table)) {
    if (record[field] != null && record[field] !== '') secret[field] = record[field];
    delete record[field];
  }
  delete record.privateData;
  if (Object.keys(secret).length) {
    record.privateData = await seal(await deviceKey(), JSON.stringify(secret), context(table));
  }
  return record as T;
}

export async function revealRow<T extends object>(table: string, row: T): Promise<T> {
  const record = { ...row } as Record<string, unknown>;
  if (!sensitiveFields(table).length || typeof record.privateData !== 'string') return row;
  const secret: Record<string, unknown> = JSON.parse(await unseal(await deviceKey(), record.privateData, context(table)));
  delete record.privateData;
  for (const field of sensitiveFields(table)) {
    if (Object.hasOwn(secret, field)) record[field] = secret[field];
  }
  return record as T;
}

export async function revealRows<T extends object>(table: string, rows: T[]): Promise<T[]> {
  return Promise.all(rows.map(row => revealRow(table, row)));
}

export function protectInTransaction<T extends object>(table: string, row: T): Promise<T> {
  return Dexie.waitFor(Dexie.ignoreTransaction(() => protectRow(table, row)));
}
