import { ext } from './browser.js';
import { MAX_HISTORY, PASSKEY_HASH_KEY, STORAGE_KEYS } from './config.js';
import { loadSettings } from './settings.js';

const PASS_KEY = 'cv_pass';
const UNLOCK_EXPIRES_KEY = 'cv_unlock_expires';

export async function getPassphrase() {
  const { [PASS_KEY]: pass = '' } = await ext.storage.session.get(PASS_KEY);
  return pass;
}

export async function setPassphrase(pass, ttlMs = null) {
  const patch = { [PASS_KEY]: pass };
  if (ttlMs) {
    patch[UNLOCK_EXPIRES_KEY] = Date.now() + ttlMs;
  }
  await ext.storage.session.set(patch);
}

export async function clearPassphrase() {
  await ext.storage.session.remove([PASS_KEY, UNLOCK_EXPIRES_KEY]);
}

/** Returns passphrase only if session unlock has not expired. */
export async function getValidPassphrase() {
  const data = await ext.storage.session.get([PASS_KEY, UNLOCK_EXPIRES_KEY]);
  const pass = data[PASS_KEY] || '';
  const expires = data[UNLOCK_EXPIRES_KEY];
  if (!pass) return '';
  if (expires && Date.now() > expires) {
    await clearPassphrase();
    return '';
  }
  return pass;
}

export async function loadHistory() {
  const { [STORAGE_KEYS.history]: history = [] } = await ext.storage.local.get(STORAGE_KEYS.history);
  return Array.isArray(history) ? history : [];
}

export async function saveEncryptedEntry(encrypted, timestamp) {
  const settings = await loadSettings();
  if (settings.saveLocalHistory === false) return [];

  const history = await loadHistory();
  const entry = {
    id: crypto.randomUUID(),
    encrypted,
    timestamp: timestamp || Date.now(),
  };
  
  let updated = [entry, ...history];
  const retention = settings.historyRetention ?? '5';
  if (retention !== 'unlimited') {
    const limit = parseInt(retention, 10) || 5;
    updated = updated.slice(0, limit);
  }
  
  await ext.storage.local.set({ [STORAGE_KEYS.history]: updated });
  
  try {
    const stored = await ext.storage.local.get('cv_bypass_counter');
    const count = parseInt(stored.cv_bypass_counter, 10) || 0;
    await ext.storage.local.set({ cv_bypass_counter: count + 1 });
  } catch (err) {
    console.error('Failed to increment bypass counter:', err);
  }

  return updated;
}

export async function clearHistory() {
  await ext.storage.local.set({ [STORAGE_KEYS.history]: [] });
  await ext.storage.local.remove(PASSKEY_HASH_KEY);
}
