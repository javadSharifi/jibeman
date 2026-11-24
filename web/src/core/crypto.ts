import Dexie, { type Table } from 'dexie';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const iterations = 600_000;
const backupContext = 'jibeman|backup|1';
export const backupFormat = 'jibeman-encrypted-backup';
export const minimumBackupPassword = 12;

const keyStore = new Dexie('jibeman_local_keys');
keyStore.version(1).stores({ keys: '' });
const keys: Table<CryptoKey, string> = keyStore.table('keys');

const encode = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function decode(encoded: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid encrypted data');
  return Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

export async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const passwordMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, passwordMaterial,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export function cloudDataKey(email: string, password: string): Promise<CryptoKey> {
  return passwordKey(password, encoder.encode(`jibeman|sync-data|2|${email.trim().toLowerCase()}`));
}

export const loadCloudKey = (scope: string) => keys.get(`cloud|${scope}`);
export const saveCloudKey = (scope: string, key: CryptoKey) => keys.put(key, `cloud|${scope}`);
export const forgetCloudKey = (scope: string) => keys.delete(`cloud|${scope}`);

let deviceKeyPromise: Promise<CryptoKey> | undefined;

export function deviceKey(): Promise<CryptoKey> {
  return deviceKeyPromise ??= (async () => {
    const existing = await keys.get('device');
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    try {
      await keys.add(key, 'device');
      return key;
    } catch (error) {
      const concurrentKey = await keys.get('device');
      if (concurrentKey) return concurrentKey;
      throw error;
    }
  })().catch(error => {
    deviceKeyPromise = undefined;
    throw error;
  });
}

export async function seal(key: CryptoKey, text: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, encoder.encode(text),
  );
  return `${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export async function unseal(key: CryptoKey, envelope: string, context: string): Promise<string> {
  const [nonce, data, extra] = envelope.split('.');
  if (!nonce || !data || extra !== undefined) throw new Error('Invalid encrypted data');
  const iv = decode(nonce);
  const ciphertext = decode(data);
  if (iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid encrypted data');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, ciphertext,
  );
  return decoder.decode(plaintext);
}

export async function encryptBackup(text: string, password: string): Promise<string> {
  if (Array.from(password).length < minimumBackupPassword) throw new Error('Backup password too short');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await passwordKey(password, salt);
  return JSON.stringify({ format: backupFormat, version: 1, salt: encode(salt), payload: await seal(key, text, backupContext) });
}

export async function decryptBackup(envelope: {
  version?: unknown;
  salt?: unknown;
  payload?: unknown;
}, password: string): Promise<string> {
  if (envelope.version !== 1 || typeof envelope.salt !== 'string' || envelope.salt.length !== 22 ||
      typeof envelope.payload !== 'string') throw new Error('Invalid backup');
  const salt = decode(envelope.salt);
  if (salt.length !== 16) throw new Error('Invalid backup');
  return unseal(await passwordKey(password, salt), envelope.payload, backupContext);
}
