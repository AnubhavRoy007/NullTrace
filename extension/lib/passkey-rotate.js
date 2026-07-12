import { ext } from './browser.js';
import { STORAGE_KEYS } from './config.js';
import { decryptVault, encryptVault } from './crypto-vault.js';
import { generatePasskey, registerPasskey, setRotatedPasskeyDisplay } from './passkey.js';
import { clearPassphrase, getPassphrase, loadHistory } from './storage.js';
import { resetSessionStack } from './session-stack.js';

/**
 * Rotate passkey: re-encrypt history, register new hash, lock vault, show new passkey.
 * Only changes the stored hash when history is re-encrypted or history is empty.
 */
export async function rotatePasskey() {
  const oldPass = await getPassphrase();
  const history = await loadHistory();
  const newPasskey = generatePasskey();

  if (oldPass && history.length > 0) {
    const reencrypted = [];
    for (const item of history) {
      const plaintext = await decryptVault(item.encrypted, oldPass);
      const encrypted = await encryptVault(plaintext, newPasskey, item.encrypted.stack);
      reencrypted.push({ ...item, encrypted });
    }
    await ext.storage.local.set({ [STORAGE_KEYS.history]: reencrypted });
  }

  await registerPasskey(newPasskey);
  await clearPassphrase();
  await resetSessionStack();
  await setRotatedPasskeyDisplay(newPasskey);

  return { newPasskey, reencrypted: history.length };
}

/** Lock vault and defer hash change until user unlocks with the current passkey. */
export async function deferPasskeyRotation() {
  await clearPassphrase();
  await resetSessionStack();
  await ext.storage.session.set({ cv_rotation_deferred: true });
}

/** If rotation was deferred while locked, rotate now using the verified passkey. */
export async function applyDeferredRotationIfNeeded(passkey) {
  const { cv_rotation_deferred: deferred } = await ext.storage.session.get('cv_rotation_deferred');
  if (!deferred) return null;

  await ext.storage.session.remove('cv_rotation_deferred');
  await clearPassphrase();
  const oldPass = passkey;
  const history = await loadHistory();
  const newPasskey = generatePasskey();

  if (history.length > 0) {
    const reencrypted = [];
    for (const item of history) {
      const plaintext = await decryptVault(item.encrypted, oldPass);
      const encrypted = await encryptVault(plaintext, newPasskey, item.encrypted.stack);
      reencrypted.push({ ...item, encrypted });
    }
    await ext.storage.local.set({ [STORAGE_KEYS.history]: reencrypted });
  }

  await registerPasskey(newPasskey);
  await setRotatedPasskeyDisplay(newPasskey);
  return newPasskey;
}
