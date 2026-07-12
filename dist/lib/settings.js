import { ext } from './browser.js';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './config.js';

export async function loadSettings() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEYS.settings] || {}) };
}

export async function saveSettings(partial) {
  const current = await loadSettings();
  const next = { ...current, ...partial };
  await ext.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export function serverBaseUrl(settings) {
  const host = settings.serverHost.replace(/\/$/, '');
  return host.startsWith('http') ? host : `http://${host}`;
}
