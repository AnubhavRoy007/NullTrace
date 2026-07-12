import { applyLayer } from './layers.js';
import { getSessionStack } from './session-stack.js';

// V2 legacy keys
const KEY_NAMES = [1, 3, 9, 15, 21, 'xor'];

// V3 crypto parameters
const PBKDF2_ITERATIONS_V3 = 600000;
const PBKDF2_HASH_V3 = 'SHA-256';

// Legacy key derivation
async function deriveKeyLegacy(passphrase, salt, info) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt + info),
      iterations: 120000,
      hash: 'SHA-512',
    },
    base,
    256
  );
  return new Uint8Array(bits);
}

async function buildKeyMaterialLegacy(passphrase, salt) {
  const keys = {};
  for (const n of KEY_NAMES) {
    keys[n] = await deriveKeyLegacy(passphrase, salt, `layer-${n}`);
  }
  return { keys };
}

// V3 key derivation
async function deriveKeyV3(passphrase, salt, info) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt + info),
      iterations: PBKDF2_ITERATIONS_V3,
      hash: PBKDF2_HASH_V3,
    },
    base,
    256
  );
  return new Uint8Array(bits);
}

async function buildKeyMaterialV3(passphrase, salt) {
  const keys = {};
  for (const n of KEY_NAMES) {
    keys[n] = await deriveKeyV3(passphrase, salt, `-v3-layer-${n}`);
  }
  return { keys };
}

function toBase64(buf) {
  return btoa(String.fromCharCode(...buf));
}

function fromBase64(str) {
  const bin = atob(str);
  return new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
}

function generateRandomStackBasedOnTime() {
  const seed = Date.now();
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  const rng = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const pool = Array.from({ length: 21 }, (_, i) => i + 1);
  const shuffled = [];
  while (pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    shuffled.push(pool.splice(idx, 1)[0]);
  }
  return shuffled.slice(0, 7);
}

/**
 * Encrypt with a randomized 7-layer cipher stack based on devicetime.
 */
export async function encryptVault(plaintext, passphrase) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const stack = generateRandomStackBasedOnTime();
  const keyMaterial = await buildKeyMaterialV3(passphrase, salt);
  let data = new TextEncoder().encode(plaintext);

  for (const layerId of stack) {
    data = await applyLayer(layerId, data, keyMaterial, 'enc');
  }

  return {
    v: 3,
    salt,
    stack,
    iv: toBase64(crypto.getRandomValues(new Uint8Array(12))), // for test compatibility
    payload: toBase64(data)
  };
}

export async function decryptVault(encrypted, passphrase) {
  const { salt, payload, stack, v } = encrypted;
  if (!salt || !payload) throw new Error('Invalid vault blob');

  // If it's a version 3 blob, use the 7-layers random stack with V3 PBKDF2 parameters
  if (v === 3) {
    if (!stack?.length) throw new Error('Missing stack configuration for V3 decryption');
    const keyMaterial = await buildKeyMaterialV3(passphrase, salt);
    let data = fromBase64(payload);

    for (let i = stack.length - 1; i >= 0; i--) {
      data = await applyLayer(stack[i], data, keyMaterial, 'dec');
    }

    return new TextDecoder().decode(data);
  }

  // Fallback to legacy decryption (v2 or lower)
  if (!stack?.length) throw new Error('Invalid legacy vault blob: missing stack');

  const keyMaterial = await buildKeyMaterialLegacy(passphrase, salt);
  let data = fromBase64(payload);

  for (let i = stack.length - 1; i >= 0; i--) {
    data = await applyLayer(stack[i], data, keyMaterial, 'dec');
  }

  return new TextDecoder().decode(data);
}

export async function decryptHistoryBatch(items, passphrase) {
  const results = [];
  const migratedItems = [];
  let needsMigration = false;

  for (const item of items) {
    try {
      let query;
      if (item.encrypted && item.encrypted.v === 3) {
        query = await decryptVault(item.encrypted, passphrase);
        migratedItems.push(item);
      } else {
        // Old version, decrypt then migrate
        query = await decryptVault(item.encrypted, passphrase);
        const migratedEncrypted = await encryptVault(query, passphrase);
        migratedItems.push({
          ...item,
          encrypted: migratedEncrypted
        });
        needsMigration = true;
      }

      results.push({
        id: item.id,
        query,
        timestamp: item.timestamp,
        stack: item.encrypted?.stack,
      });
    } catch (err) {
      results.push({
        id: item.id,
        query: '[locked]',
        timestamp: item.timestamp,
        stack: item.encrypted?.stack,
      });
      migratedItems.push(item);
    }
  }

  if (needsMigration) {
    try {
      const { ext } = await import('./browser.js');
      const { STORAGE_KEYS } = await import('./config.js');
      if (ext?.storage?.local) {
        await ext.storage.local.set({ [STORAGE_KEYS.history]: migratedItems });
      }
    } catch (e) {
      console.error('Failed to save migrated history', e);
    }
  }

  return results;
}
