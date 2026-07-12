import { getServerUrl } from './lib/api.js';
import {
  getValidPassphrase,
  setPassphrase,
  loadHistory,
  saveEncryptedEntry,
  clearHistory,
} from './lib/storage.js';
import { isVaultEnabled } from './lib/vault-state.js';
import { encryptVault, decryptHistoryBatch } from './lib/crypto-vault.js';
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
import { openSearch } from './lib/search.js';
import { loadVisitedTabs, clearVisitedTabs, pruneVisitedTabs } from './lib/visited-tabs.js';
import { loadSettings } from './lib/settings.js';
import { getCountryLabel } from './lib/proxy.js';
import { PASSKEY_ROTATE_MINUTES } from './lib/config.js';
import { ext } from './lib/browser.js';

const unlockPanel = document.getElementById('unlock-panel');
const searchPanel = document.getElementById('search-panel');
const historyPanel = document.getElementById('history-panel');
const visitedPanel = document.getElementById('visited-panel');
const offPanel = document.getElementById('off-panel');
const countryInfo = document.getElementById('country-info');
const rotationBanner = document.getElementById('rotation-banner');
const generatePasskeyBtn = document.getElementById('generate-passkey-btn');
const passkeySuggestedBox = document.getElementById('passkey-suggested-box');
const passkeySuggested = document.getElementById('passkey-suggested');
const copySuggestedBtn = document.getElementById('copy-suggested');
const passInput = document.getElementById('pass-input');
const unlockBtn = document.getElementById('unlock-btn');
const unlockStatusEl = document.getElementById('unlock-status');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const statusEl = document.getElementById('status');
const historyList = document.getElementById('history-list');
const visitedList = document.getElementById('visited-list');
const clearBtn = document.getElementById('clear-btn');
const clearVisitedBtn = document.getElementById('clear-visited-btn');
const stackInfo = document.getElementById('stack-info');
const firstTimeWarningBox = document.getElementById('first-time-warning-box');
const confirmPassphraseLoss = document.getElementById('confirm-passphrase-loss');

function setUnlockStatus(msg, type = '') {
  unlockStatusEl.textContent = msg;
  unlockStatusEl.className = `status ${type}`;
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function showPanels(unlocked, vaultOn) {
  offPanel?.classList.toggle('hidden', vaultOn);
  unlockPanel.classList.toggle('hidden', !vaultOn || unlocked);
  searchPanel.classList.toggle('hidden', !vaultOn || !unlocked);
  historyPanel.classList.toggle('hidden', !vaultOn);
  visitedPanel.classList.toggle('hidden', !vaultOn || !unlocked);
}

async function showRotationUI() {
  const rotated = await getRotatedPasskeyDisplay();
  const pending = await isRotationPending();
  if (!rotated || !pending) {
    rotationBanner?.classList.add('hidden');
    return false;
  }

  rotationBanner?.classList.remove('hidden');
  passkeySuggested.textContent = rotated;
  passkeySuggestedBox.classList.remove('hidden');
  generatePasskeyBtn.classList.add('hidden');
  const hintEl = unlockPanel.querySelector('.hint');
  if (hintEl) {
    hintEl.textContent = `Your passkey rotated automatically (every ${PASSKEY_ROTATE_MINUTES} min). Enter the new passkey below.`;
  }
  showPanels(false, true);
  setUnlockStatus('Vault locked — enter your new passkey to continue', 'ok');
  return true;
}

async function renderCountryInfo() {
  const settings = await loadSettings();
  if (!countryInfo) return;
  if (settings.proxyCountry && settings.proxyCountry !== 'off') {
    countryInfo.textContent = `Search region: ${getCountryLabel(settings.proxyCountry)} (location hidden in URLs)`;
    countryInfo.classList.remove('hidden');
  } else {
    countryInfo.textContent = 'Direct connection — pick a search region in Settings to hide location';
    countryInfo.classList.remove('hidden');
  }
}

async function renderVisitedTabs() {
  await pruneVisitedTabs();
  const items = await loadVisitedTabs();

  if (!items.length) {
    visitedList.innerHTML = '<li class="empty">No vault tabs in the last 15 minutes</li>';
    return;
  }

  visitedList.innerHTML = items
    .map(
      (v) => `
    <li class="visited-row">
      <span class="query">${escapeHtml(v.query || v.title)}</span>
      ${v.countryLabel ? `<span class="country-badge">${escapeHtml(v.countryLabel)}</span>` : ''}
      <span class="time">${formatTime(v.timestamp)}</span>
      <a class="btn ghost visit-link" href="${escapeAttr(v.url)}" target="_blank" rel="noopener">Open</a>
    </li>`
    )
    .join('');
}

function formatTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;');
}

function formatEncryptedPreview(encrypted) {
  const payload = encrypted?.payload || '';
  const preview = payload.length > 56 ? `${payload.slice(0, 56)}…` : payload;
  if (encrypted?.v === 3) {
    return `v3 · AES-256-GCM · ${preview}`;
  }
  const stack = encrypted?.stack?.join(',') || '?';
  return `v${encrypted?.v || '?'} · layers [${stack}] · ${preview}`;
}

async function renderStackInfo() {
  if (!stackInfo) return;
  stackInfo.textContent = 'Active encryption: AES-256-GCM (OWASP recommended)';
}

async function renderHistory() {
  const pass = await getValidPassphrase();
  const items = await loadHistory();

  if (!items.length) {
    historyList.innerHTML = '<li class="empty">No encrypted searches yet</li>';
    return;
  }

  if (!pass) {
    historyList.innerHTML = items
      .map(
        (item) => `
      <li class="encrypted-row">
        <span class="cipher">${escapeHtml(formatEncryptedPreview(item.encrypted))}</span>
        <span class="time">${formatTime(item.timestamp)}</span>
      </li>`
      )
      .join('');
    return;
  }

  try {
    const results = await decryptHistoryBatch(items, pass);
    historyList.innerHTML = results
      .map((r) => {
        const item = items.find((i) => i.id === r.id);
        const cipher = item ? formatEncryptedPreview(item.encrypted) : '';
        const query =
          r.query === '[locked]'
            ? '<span class="locked-label">Unlock with correct passkey to read</span>'
            : `<span class="query">${escapeHtml(r.query)}</span>`;
        return `
      <li>
        ${query}
        <span class="cipher sub">${escapeHtml(cipher)}</span>
        <span class="time">${formatTime(r.timestamp)}</span>
        ${r.query !== '[locked]' ? `<button type="button" data-q="${escapeAttr(r.query)}">↗</button>` : ''}
      </li>`;
      })
      .join('');

    historyList.querySelectorAll('button[data-q]').forEach((btn) => {
      btn.addEventListener('click', () => runSearch(btn.dataset.q));
    });
  } catch {
    historyList.innerHTML = '<li class="empty">Could not read encrypted history</li>';
  }
}

generatePasskeyBtn.addEventListener('click', async () => {
  const suggested = generatePasskey();
  passkeySuggested.textContent = suggested;
  passkeySuggestedBox.classList.remove('hidden');
  try {
    await registerPasskey(suggested);
  } catch (err) {
    console.error('Error saving generated passkey hash:', err);
  }
  setUnlockStatus('Passkey generated — enter it below to unlock (wrong passkeys are rejected)', 'ok');
  passInput.focus();
});

copySuggestedBtn.addEventListener('click', async () => {
  const text = passkeySuggested.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setUnlockStatus('Copied — paste into the passkey field', 'ok');
  } catch {
    setUnlockStatus('Copy failed — select the passkey manually', 'error');
  }
});

unlockBtn.addEventListener('click', async () => {
  const pass = passInput.value.trim();
  if (pass.length < PASSKEY_MIN_LENGTH) {
    setUnlockStatus(`Passkey must be at least ${PASSKEY_MIN_LENGTH} characters`, 'error');
    return;
  }

  try {
    const { valid, isFirstSetup } = await verifyPasskey(pass);
    if (!valid) {
      setUnlockStatus('Incorrect passkey — access denied. Wrong passkeys cannot unlock the vault.', 'error');
      return;
    }

    if (isFirstSetup) {
      if (!confirmPassphraseLoss.checked) {
        setUnlockStatus('Please confirm that you understand the recovery warning', 'error');
        return;
      }
      await registerPasskey(pass);
    }

    const newFromDeferred = await applyDeferredRotationIfNeeded(pass);
    if (newFromDeferred) {
      passInput.value = '';
      await showRotationUI();
      setUnlockStatus('Passkey rotated for security — enter the NEW passkey shown above', 'ok');
      return;
    }

    const rotatedDisplay = await getRotatedPasskeyDisplay();
    if (rotatedDisplay && pass !== rotatedDisplay) {
      setUnlockStatus('Enter the new passkey shown above (your passkey rotates every 30 minutes)', 'error');
      return;
    }
  } catch (err) {
    console.error('Error verifying passkey:', err);
    setUnlockStatus('Passkey verification failed', 'error');
    return;
  }

  await resetSessionStack(pass);
  await setPassphrase(pass, PASSKEY_ROTATE_MINUTES * 60 * 1000);
  await clearRotatedPasskeyDisplay();
  passInput.value = '';
  rotationBanner?.classList.add('hidden');
  showPanels(true, true);
  setUnlockStatus('');
  await renderStackInfo();
  await renderCountryInfo();
  await renderHistory();
  await renderVisitedTabs();
  searchInput.focus();
});

confirmPassphraseLoss.addEventListener('change', () => {
  unlockBtn.disabled = !confirmPassphraseLoss.checked;
});

async function runSearch(query) {
  const pass = await getValidPassphrase();
  if (!pass) {
    setStatus('Enter your passkey and unlock before searching', 'error');
    await showRotationUI();
    return;
  }
  if (!query.trim()) return;

  if (!(await isVaultEnabled())) {
    setStatus('Turn vault ON from the extension icon', 'error');
    return;
  }

  setStatus('Encrypting search query with AES-256-GCM (client-side)…');

  try {
    const encrypted = await encryptVault(query.trim(), pass);
    await saveEncryptedEntry(encrypted, Date.now());

    const opened = await openSearch(query);
    if (opened?.ok === false) {
      throw new Error(opened.error || 'Could not open search tab');
    }
    setStatus('Tab opened — cache clears within 15 min. See lists below.', 'ok');
    searchInput.value = '';
    await renderHistory();
    await renderVisitedTabs();
  } catch (err) {
    const msg = err?.message || 'Search failed';
    if (msg.includes('proxy') || msg.includes('PROXY')) {
      setStatus('Proxy error — Settings: turn off “Experimental country proxy”', 'error');
    } else {
      setStatus(msg, 'error');
    }
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch(searchInput.value);
});

clearBtn.addEventListener('click', async () => {
  await clearHistory();
  await renderHistory();
});

clearVisitedBtn.addEventListener('click', async () => {
  await clearVisitedTabs();
  await renderVisitedTabs();
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.cv_visited_tabs) {
    renderVisitedTabs();
  }
  if (
    area === 'session' &&
    (changes.cv_rotation_pending || changes.cv_rotated_passkey || changes.cv_pass)
  ) {
    showRotationUI().then((locked) => {
      if (locked) renderHistory();
    });
  }
});

async function init() {
  const pitchLink = document.getElementById('pitch-link');
  if (pitchLink) {
    try {
      pitchLink.href = `${await getServerUrl()}/demo`;
    } catch {
      /* optional */
    }
  }

  const vaultOn = await isVaultEnabled();
  await renderStackInfo();
  await renderCountryInfo();

  const rotationLocked = await showRotationUI();
  const pass = await getValidPassphrase();

  if (vaultOn && pass && !rotationLocked) {
    showPanels(true, true);
    searchInput.focus();
  } else if (vaultOn) {
    showPanels(false, true);
    try {
      const hasHistory = (await loadHistory()).length > 0;
      const storedHash = await getStoredPasskeyHash();
      const hintEl = unlockPanel.querySelector('.hint');
      if (storedHash) {
        firstTimeWarningBox.classList.add('hidden');
        unlockBtn.disabled = false;
        if (hasHistory && !rotationLocked) {
          generatePasskeyBtn.classList.add('hidden');
          if (hintEl) hintEl.textContent = 'Enter your passkey below to unlock your private vault.';
        }
      } else if (!rotationLocked) {
        generatePasskeyBtn.classList.remove('hidden');
        firstTimeWarningBox.classList.remove('hidden');
        unlockBtn.disabled = !confirmPassphraseLoss.checked;
        if (hintEl) hintEl.textContent = 'Generate a passkey, then type or paste it below before you can search.';
      }
    } catch (err) {
      console.error('Error loading passkey hash:', err);
    }
  } else {
    showPanels(false, false);
    setStatus('Vault is OFF — enable it from the extension icon', 'error');
  }

  await renderHistory();
  await renderVisitedTabs();
}

init();
