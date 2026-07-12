import { ext } from './browser.js';

const STACK_KEY = 'cv_layer_stack';
const LAYER_COUNT = 21;
const ACTIVE_LAYERS = 7;

function shuffleWithRng(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mathRandomShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic PRNG from derived key bytes (Fisher-Yates seed). */
function rngFromBytes(bytes) {
  let state = 0;
  for (let i = 0; i < bytes.length; i++) {
    state = (state + bytes[i] * (i + 1)) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

async function deriveStackSeed(passphrase) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode('cv-layer-permutation-v1'),
      iterations: 100000,
      hash: 'SHA-512',
    },
    base,
    256
  );
  return new Uint8Array(bits);
}

/**
 * Pick 7 of 21 layers in a cryptographically seeded permutation order,
 * bound to the passkey so wrong keys cannot derive the same stack.
 */
export async function generateStackFromPasskey(passphrase) {
  const seed = await deriveStackSeed(passphrase);
  const pool = Array.from({ length: LAYER_COUNT }, (_, i) => i + 1);
  return shuffleWithRng(pool, rngFromBytes(seed)).slice(0, ACTIVE_LAYERS);
}

function generateRandomStack() {
  const pool = Array.from({ length: LAYER_COUNT }, (_, i) => i + 1);
  return mathRandomShuffle(pool).slice(0, ACTIVE_LAYERS);
}

/** 7-of-21 layer permutation — fixed until unlock resets it. */
export async function getSessionStack() {
  const stored = await ext.storage.session.get(STACK_KEY);
  if (stored[STACK_KEY]?.length === ACTIVE_LAYERS) return stored[STACK_KEY];
  const stack = generateRandomStack();
  await ext.storage.session.set({ [STACK_KEY]: stack });
  return stack;
}

/** Reset stack — uses passkey-derived permutation when passphrase is provided. */
export async function resetSessionStack(passphrase = null) {
  await ext.storage.session.remove(STACK_KEY);
  if (passphrase) {
    const stack = await generateStackFromPasskey(passphrase);
    await ext.storage.session.set({ [STACK_KEY]: stack });
    return stack;
  }
  return getSessionStack();
}

export { LAYER_COUNT, ACTIVE_LAYERS };
