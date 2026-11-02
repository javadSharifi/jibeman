// Jibeman Web Security & Biometrics (PIN + WebAuthn)

const KEY_LOCK_ENABLED = 'jibeman_lock_enabled';
const KEY_PIN_HASH = 'jibeman_pin_hash';
const KEY_PIN_SALT = 'jibeman_pin_salt';
const KEY_BIOMETRIC_ENABLED = 'jibeman_biometric_enabled';
const KEY_BIOMETRIC_CRED_ID = 'jibeman_biometric_cred_id';
const KEY_LOCK_TIMEOUT = 'jibeman_lock_timeout';
const KEY_LAST_ACTIVE = 'jibeman_last_active';

export const TIMEOUT_OPTIONS = [
  { label: 'بلافاصله', value: 0 },
  { label: '۳۰ ثانیه', value: 30_000 },
  { label: '۱ دقیقه', value: 60_000 },
  { label: '۵ دقیقه', value: 300_000 },
  { label: '۱۵ دقیقه', value: 900_000 },
];

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${pin}:jibeman_salt`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToBase64(hashBuffer);
}

export function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bufferToBase64(arr.buffer);
}

export function isLockEnabled(): boolean {
  return localStorage.getItem(KEY_LOCK_ENABLED) === 'true' && !!localStorage.getItem(KEY_PIN_HASH);
}

export async function setPin(pin: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  localStorage.setItem(KEY_PIN_SALT, salt);
  localStorage.setItem(KEY_PIN_HASH, hash);
  localStorage.setItem(KEY_LOCK_ENABLED, 'true');
  recordActivity();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(KEY_PIN_HASH);
  const storedSalt = localStorage.getItem(KEY_PIN_SALT);
  if (!storedHash || !storedSalt) return false;
  const computedHash = await hashPin(pin, storedSalt);
  return computedHash === storedHash;
}

export function removePin(): void {
  localStorage.removeItem(KEY_LOCK_ENABLED);
  localStorage.removeItem(KEY_PIN_HASH);
  localStorage.removeItem(KEY_PIN_SALT);
  localStorage.removeItem(KEY_BIOMETRIC_ENABLED);
  localStorage.removeItem(KEY_BIOMETRIC_CRED_ID);
}

export function isBiometricEnabled(): boolean {
  return isLockEnabled() && localStorage.getItem(KEY_BIOMETRIC_ENABLED) === 'true';
}

export function setBiometricEnabled(enabled: boolean): void {
  if (!enabled) {
    localStorage.removeItem(KEY_BIOMETRIC_ENABLED);
  } else {
    localStorage.setItem(KEY_BIOMETRIC_ENABLED, 'true');
  }
}

export function getLockTimeout(): number {
  const v = localStorage.getItem(KEY_LOCK_TIMEOUT);
  return v !== null ? parseInt(v, 10) : 30_000; // default 30s
}

export function setLockTimeout(ms: number): void {
  localStorage.setItem(KEY_LOCK_TIMEOUT, ms.toString());
}

export function recordActivity(): void {
  localStorage.setItem(KEY_LAST_ACTIVE, Date.now().toString());
}

export function shouldLock(): boolean {
  if (!isLockEnabled()) return false;
  const timeout = getLockTimeout();
  if (timeout === 0) return true;
  const lastActive = parseInt(localStorage.getItem(KEY_LAST_ACTIVE) || '0', 10);
  if (!lastActive) return true;
  return Date.now() - lastActive > timeout;
}

// ----------------- WebAuthn Biometrics -----------------

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const supported = await isBiometricSupported();
    if (!supported) return false;

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'جیب من',
          id: window.location.hostname || undefined,
        },
        user: {
          id: userId,
          name: 'user@jibeman.local',
          displayName: 'کاربر جیب من',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (credential && credential.id) {
      localStorage.setItem(KEY_BIOMETRIC_CRED_ID, credential.id);
      setBiometricEnabled(true);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Biometric registration cancelled or failed:', err);
    return false;
  }
}

export async function verifyBiometric(): Promise<boolean> {
  try {
    const credId = localStorage.getItem(KEY_BIOMETRIC_CRED_ID);
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const allowCredentials: PublicKeyCredentialDescriptor[] | undefined = credId
      ? [
          {
            id: base64ToUint8Array(credId).buffer as ArrayBuffer,
            type: 'public-key',
          },
        ]
      : undefined;

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials,
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return !!assertion;
  } catch (err) {
    console.warn('Biometric verification cancelled or failed:', err);
    return false;
  }
}
