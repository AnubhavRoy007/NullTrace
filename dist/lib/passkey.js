import { ext } from './browser.js';
import { PASSKEY_HASH_KEY, PASSKEY_ROTATED_KEY, ROTATION_PENDING_KEY } from './config.js';

export const PASSKEY_MIN_LENGTH = 4;

/** Cryptographically random vault passkey (32 bytes, base64url). */
export function generatePasskey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text) {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time hex string comparison — prevents timing side-channels. */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function getStoredPasskeyHash() {
  const { [PASSKEY_HASH_KEY]: hash } = await ext.storage.local.get(PASSKEY_HASH_KEY);
  return hash || null;
}

export async function registerPasskey(passkey) {
  const hash = await sha256(passkey);
  await ext.storage.local.set({
    [PASSKEY_HASH_KEY]: hash,
    cv_passkey_set_at: Date.now(),
  });
  return hash;
}

/**
 * Verify passkey against stored hash.
 * Returns { valid, isFirstSetup } — wrong passkeys are always rejected once a hash exists.
 */
export async function verifyPasskey(passkey) {
  const storedHash = await getStoredPasskeyHash();
  if (!storedHash) {
    return { valid: true, isFirstSetup: true };
  }
  const currentHash = await sha256(passkey);
  return { valid: timingSafeEqual(storedHash, currentHash), isFirstSetup: false };
}

export async function getRotatedPasskeyDisplay() {
  const data = await ext.storage.session.get([PASSKEY_ROTATED_KEY, ROTATION_PENDING_KEY]);
  return data[PASSKEY_ROTATED_KEY] || null;
}

export async function clearRotatedPasskeyDisplay() {
  await ext.storage.session.remove([PASSKEY_ROTATED_KEY, ROTATION_PENDING_KEY, 'cv_rotated_at']);
}

export async function setRotatedPasskeyDisplay(passkey) {
  await ext.storage.session.set({
    [PASSKEY_ROTATED_KEY]: passkey,
    [ROTATION_PENDING_KEY]: true,
    cv_rotated_at: Date.now(),
  });
}

export async function isRotationPending() {
  const { [ROTATION_PENDING_KEY]: pending } = await ext.storage.session.get(ROTATION_PENDING_KEY);
  return pending === true;
}
