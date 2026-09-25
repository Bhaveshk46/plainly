/**
 * End-to-end encryption for shared briefs (WebCrypto: identical in browsers
 * and Node). The browser encrypts with a fresh AES-256-GCM key and puts the key
 * in the URL *fragment*, which browsers never send to a server. The server only
 * ever stores opaque ciphertext, so even a full database leak reveals nothing.
 */

const ALGORITHM = 'AES-GCM';
const KEY_BITS = 256;
const IV_BYTES = 12;
// Binds ciphertexts to this feature/version so they cannot be replayed elsewhere.
const CONTEXT = new TextEncoder().encode('plainly-share-v1');

export interface EncryptedPayload {
  /** 12-byte IV, base64url. */
  iv: string;
  /** Ciphertext with the GCM tag appended, base64url. */
  ciphertext: string;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A fresh, exportable AES-256-GCM key. */
export function generateShareKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_BITS }, true, ['encrypt', 'decrypt']);
}

/** The key as base64url, for the URL fragment. */
export async function exportShareKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importShareKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded);
  if (raw.length !== KEY_BITS / 8) throw new Error('Invalid share key.');
  return crypto.subtle.importKey('raw', raw, ALGORITHM, false, ['decrypt']);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv, additionalData: CONTEXT }, key, plaintext);
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
}

/** Throws if the key is wrong or the data was tampered with (GCM authenticates). */
export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: fromBase64Url(payload.iv), additionalData: CONTEXT },
    key,
    fromBase64Url(payload.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
