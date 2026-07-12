import { ext } from './browser.js';

const ENABLED_KEY = 'cv_vault_enabled';

export async function isVaultEnabled() {
  const { [ENABLED_KEY]: enabled } = await ext.storage.local.get(ENABLED_KEY);
  return enabled !== false;
}

export async function setVaultEnabled(on) {
  await ext.storage.local.set({ [ENABLED_KEY]: !!on });
  return !!on;
}
