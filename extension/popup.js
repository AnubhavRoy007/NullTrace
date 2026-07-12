import { ext } from './lib/browser.js';
import { getValidPassphrase, setPassphrase } from './lib/storage.js';
import { isVaultEnabled, setVaultEnabled } from './lib/vault-state.js';
import { getSessionStack, resetSessionStack } from './lib/session-stack.js';
import {
  generatePasskey,
  registerPasskey,
  verifyPasskey,
  getStoredPasskeyHash,
  getRotatedPasskeyDisplay,
  clearRotatedPasskeyDisplay,
  isRotationPending,
  PASSKEY_MIN_LENGTH,
} from './lib/passkey.js';
import { applyDeferredRotationIfNeeded } from './lib/passkey-rotate.js';
import { LAYER_NAMES } from './lib/layers.js';
import { PASSKEY_ROTATE_MINUTES } from './lib/config.js';

const toggleBtn = document.getElementById('vault-toggle');
const toggleText = document.getElementById('toggle-text');
const offPanel = document.getElementById('off-panel');
const unlockPanel = document.getElementById('unlock-panel');
const unlockedPanel = document.getElementById('unlocked-panel');
const generatePasskeyBtn = document.getElementById('generate-passkey-btn');
const passkeySuggestedBox = document.getElementById('passkey-suggested-box');
const passkeySuggested = document.getElementById('passkey-suggested');
const copySuggestedBtn = document.getElementById('copy-suggested');
const passInput = document.getElementById('pass-input');
const unlockBtn = document.getElementById('unlock-btn');
const statusEl = document.getElementById('status');
const stackInfo = document.getElementById('stack-info');
const firstTimeWarningBox = document.getElementById('first-time-warning-box');
const confirmPassphraseLoss = document.getElementById('confirm-passphrase-loss');

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

async function showRotationState() {
  const rotated = await getRotatedPasskeyDisplay();
  const pending = await isRotationPending();
  if (!rotated || !pending) return false;

  passkeySuggested.textContent = rotated;
  passkeySuggestedBox.classList.remove('hidden');
  generatePasskeyBtn.classList.add('hidden');
  unlockPanel.classList.remove('hidden');
  unlockedPanel.classList.add('hidden');
  setStatus('Passkey rotated — enter the new passkey below', 'ok');
  return true;
}

async function updateToggleUI(enabled) {
  toggleBtn.classList.toggle('off', !enabled);
  toggleBtn.setAttribute('aria-pressed', String(enabled));
  toggleText.textContent = enabled ? 'ON' : 'OFF';
  offPanel.classList.toggle('hidden', enabled);
  unlockPanel.classList.toggle('hidden', !enabled);
  unlockedPanel.classList.add('hidden');
  passkeySuggestedBox.classList.add('hidden');

  if (enabled) {
    stackInfo.textContent = 'Active encryption: AES-256-GCM (OWASP recommended)';
    stackInfo.classList.remove('hidden');

    const rotationLocked = await showRotationState();
    const pass = await getValidPassphrase();
    if (pass && !rotationLocked) {
      unlockPanel.classList.add('hidden');
      unlockedPanel.classList.remove('hidden');
    } else {
      const storedHash = await getStoredPasskeyHash();
      if (storedHash) {
        generatePasskeyBtn.classList.add('hidden');
        firstTimeWarningBox.classList.add('hidden');
        unlockBtn.disabled = false;
      } else {
        generatePasskeyBtn.classList.remove('hidden');
        firstTimeWarningBox.classList.remove('hidden');
        unlockBtn.disabled = !confirmPassphraseLoss.checked;
      }
    }
  } else {
    stackInfo.textContent = '';
    stackInfo.classList.add('hidden');
  }
}

generatePasskeyBtn.addEventListener('click', async () => {
  const suggested = generatePasskey();
  passkeySuggested.textContent = suggested;
  passkeySuggestedBox.classList.remove('hidden');
  try {
    await registerPasskey(suggested);
  } catch (err) {
    console.error('Error registering passkey:', err);
  }
  setStatus('Enter the passkey below to unlock (wrong passkeys rejected)', 'ok');
  passInput.focus();
});

copySuggestedBtn.addEventListener('click', async () => {
  const text = passkeySuggested.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Copied — paste to unlock', 'ok');
  } catch {
    setStatus('Copy failed', 'error');
  }
});

unlockBtn.addEventListener('click', async () => {
  const pass = passInput.value.trim();
  if (pass.length < PASSKEY_MIN_LENGTH) {
    setStatus(`Min ${PASSKEY_MIN_LENGTH} characters`, 'error');
    return;
  }

  const { valid, isFirstSetup } = await verifyPasskey(pass);
  if (!valid) {
    setStatus('Incorrect passkey — access denied', 'error');
    return;
  }

  if (isFirstSetup) {
    if (!confirmPassphraseLoss.checked) {
      setStatus('Please confirm that you understand the recovery warning', 'error');
      return;
    }
    await registerPasskey(pass);
  }

  const newFromDeferred = await applyDeferredRotationIfNeeded(pass);
  if (newFromDeferred) {
    passInput.value = '';
    await showRotationState();
    setStatus('Passkey rotated — enter the NEW passkey shown above', 'ok');
    return;
  }

  const rotatedDisplay = await getRotatedPasskeyDisplay();
  if (rotatedDisplay && pass !== rotatedDisplay) {
    setStatus('Enter the new passkey shown above (rotates every 30 min)', 'error');
    return;
  }

  await resetSessionStack(pass);
  await setPassphrase(pass, PASSKEY_ROTATE_MINUTES * 60 * 1000);
  await clearRotatedPasskeyDisplay();
  passInput.value = '';
  unlockPanel.classList.add('hidden');
  unlockedPanel.classList.remove('hidden');
  setStatus('Unlocked — use the new tab page to search', 'ok');
  await updateToggleUI(true);
});

confirmPassphraseLoss.addEventListener('change', () => {
  unlockBtn.disabled = !confirmPassphraseLoss.checked;
});

toggleBtn.addEventListener('click', async () => {
  const next = !(await isVaultEnabled());
  await setVaultEnabled(next);
  await updateToggleUI(next);
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  ext.runtime.openOptionsPage();
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && (changes.cv_rotation_pending || changes.cv_rotated_passkey || changes.cv_pass)) {
    updateToggleUI(true);
  }
});

async function renderBypassCounter() {
  const counterVal = document.getElementById('counter-val');
  if (!counterVal) return;
  try {
    const stored = await ext.storage.local.get('cv_bypass_counter');
    const count = parseInt(stored.cv_bypass_counter, 10) || 0;
    counterVal.textContent = count.toLocaleString();
  } catch (err) {
    console.error('Failed to load bypass counter:', err);
    counterVal.textContent = '0';
  }
}

async function init() {
  await updateToggleUI(await isVaultEnabled());
  await renderBypassCounter();
}

init();
