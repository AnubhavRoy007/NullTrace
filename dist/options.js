import { loadSettings, saveSettings } from './lib/settings.js';
import { checkServer, getServerUrl } from './lib/api.js';
import { clearHistory, clearPassphrase } from './lib/storage.js';
import { clearVisitedTabs } from './lib/visited-tabs.js';
import { resetSessionStack } from './lib/session-stack.js';
import { SEARCH_REGIONS } from './lib/config.js';
import { syncProxyFromVaultState, clearSystemProxy } from './lib/proxy.js';
import { purgeAllSearchBrowsingData } from './lib/privacy.js';

const form = document.getElementById('settings-form');
const serverHost = document.getElementById('server-host');
const searchEngine = document.getElementById('search-engine');
const proxyCountry = document.getElementById('proxy-country');
const useCustomProxy = document.getElementById('use-custom-proxy');
const proxyConfigFields = document.getElementById('proxy-config-fields');
const proxyPaste = document.getElementById('proxy-paste');
const proxyScheme = document.getElementById('proxy-scheme');
const proxyHost = document.getElementById('proxy-host');
const proxyPort = document.getElementById('proxy-port');
const proxyUser = document.getElementById('proxy-user');
const proxyPass = document.getElementById('proxy-pass');

const incognitoShield = document.getElementById('incognito-shield');
const stripHistory = document.getElementById('strip-history');
const saveLocalHistory = document.getElementById('save-local-history');
const statusEl = document.getElementById('status');
const testBtn = document.getElementById('test-server');
const lockBtn = document.getElementById('lock-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const clearVisitedBtn = document.getElementById('clear-visited-btn');
const purgeChromeBtn = document.getElementById('purge-chrome-history-btn');
const pitchLink = document.getElementById('pitch-link');
const browserLabel = document.getElementById('browser-label');

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function renderCountryDropdown(selectedId) {
  proxyCountry.innerHTML = SEARCH_REGIONS.map(
    (r) => `<option value="${r.id}"${r.id === selectedId ? ' selected' : ''}>${r.label}</option>`
  ).join('');
}

function parseProxyConfig(raw) {
  raw = raw.trim();
  if (!raw) return null;
  try {
    if (/^[a-zA-Z0-9]+:\/\//.test(raw)) {
      const url = new URL(raw);
      return {
        scheme: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
        username: decodeURIComponent(url.username) || '',
        password: decodeURIComponent(url.password) || ''
      };
    }
  } catch (e) {}
  const parts = raw.split(':');
  if (parts.length >= 2) {
    const host = parts[0];
    const port = parseInt(parts[1], 10);
    if (!isNaN(port)) {
      return {
        scheme: 'http',
        host,
        port,
        username: parts[2] || '',
        password: parts[3] || ''
      };
    }
  }
  return null;
}

function readFormSettings() {
  return {
    serverHost: serverHost.value.trim() || '127.0.0.1:3847',
    searchEngine: searchEngine.value,
    proxyCountry: proxyCountry.value || 'off',
    useCustomProxy: useCustomProxy.checked,
    proxyScheme: proxyScheme.value,
    proxyHost: proxyHost.value.trim(),
    proxyPort: proxyPort.value ? parseInt(proxyPort.value, 10) : '',
    proxyUsername: proxyUser.value.trim(),
    proxyPassword: proxyPass.value,
    incognitoShield: incognitoShield.checked,
    stripBrowserHistory: stripHistory.checked,
    saveLocalHistory: saveLocalHistory.checked,
    historyRetention: document.getElementById('history-retention').value,
    autoVaultDomains: document.getElementById('auto-vault-domains').value.trim()
  };
}

async function refreshPitchLink() {
  const base = await getServerUrl();
  pitchLink.href = `${base}/demo`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveSettings(readFormSettings());
  await syncProxyFromVaultState();
  setStatus('Settings saved', 'ok');
  await refreshPitchLink();
});

testBtn.addEventListener('click', async () => {
  await saveSettings(readFormSettings());
  await syncProxyFromVaultState();
  const ok = await checkServer();
  setStatus(ok ? 'Server reachable ✓' : 'Cannot reach server — is it running?', ok ? 'ok' : 'error');
});

lockBtn.addEventListener('click', async () => {
  await clearPassphrase();
  await resetSessionStack();
  setStatus('Vault locked — unlock with your passkey (rotates every 30 min when active)', 'ok');
});

clearHistoryBtn.addEventListener('click', async () => {
  await clearHistory();
  setStatus('Encrypted homepage history cleared', 'ok');
});

clearVisitedBtn.addEventListener('click', async () => {
  await clearVisitedTabs();
  setStatus('Visited tabs list cleared', 'ok');
});

purgeChromeBtn.addEventListener('click', async () => {
  await purgeAllSearchBrowsingData();
  setStatus('Search history removed from Chrome — check History → Recent tabs', 'ok');
});

useCustomProxy.addEventListener('change', () => {
  if (useCustomProxy.checked) {
    proxyConfigFields.classList.remove('hidden');
  } else {
    proxyConfigFields.classList.add('hidden');
  }
});

proxyPaste.addEventListener('input', () => {
  const parsed = parseProxyConfig(proxyPaste.value);
  if (parsed) {
    proxyScheme.value = parsed.scheme;
    proxyHost.value = parsed.host;
    proxyPort.value = parsed.port;
    proxyUser.value = parsed.username;
    proxyPass.value = parsed.password;
    proxyPaste.value = '';
    setStatus('Proxy credentials auto-filled from paste string', 'ok');
  }
});

function renderSearchEngineSelect(engines, selectedId) {
  searchEngine.innerHTML = engines.map(
    (e) => `<option value="${e.id}"${e.id === selectedId ? ' selected' : ''}>${e.label}</option>`
  ).join('');
}

function renderSearchEnginesList(engines) {
  const listEl = document.getElementById('search-engines-list');
  if (!engines || !engines.length) {
    listEl.innerHTML = '<li class="empty" style="padding: 10px; border: 1px dashed var(--border); border-radius: var(--radius); text-align: center; color: var(--muted); font-size: 12px;">No custom search engines</li>';
    return;
  }
  listEl.innerHTML = engines.map(e => `
    <li style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 6px; font-size: 13px;">
      <div>
        <strong>${escapeHtml(e.label)}</strong>
        <div style="font-size: 11px; color: var(--muted); font-family: monospace; word-break: break-all;">${escapeHtml(e.url)}</div>
      </div>
      <button type="button" class="btn ghost danger delete-engine-btn" data-id="${escapeAttr(e.id)}" style="padding: 2px 8px; border-color: rgba(248,113,113,0.2);">Delete</button>
    </li>
  `).join('');

  listEl.querySelectorAll('.delete-engine-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const settings = await loadSettings();
      const nextEngines = (settings.customSearchEngines || []).filter(e => e.id !== id);
      
      let nextDefault = settings.searchEngine;
      if (nextDefault === id) {
        nextDefault = nextEngines[0]?.id || 'duckduckgo';
      }
      
      await saveSettings({
        customSearchEngines: nextEngines,
        searchEngine: nextDefault
      });
      
      const updatedSettings = await loadSettings();
      renderSearchEnginesList(updatedSettings.customSearchEngines);
      renderSearchEngineSelect(updatedSettings.customSearchEngines, updatedSettings.searchEngine);
      setStatus('Search engine deleted', 'ok');
    });
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return s.replace(/"/g, '&quot;');
}

const addEngineBtn = document.getElementById('add-engine-btn');
const newEngineName = document.getElementById('new-engine-name');
const newEngineUrl = document.getElementById('new-engine-url');

addEngineBtn.addEventListener('click', async () => {
  const name = newEngineName.value.trim();
  const url = newEngineUrl.value.trim();
  
  if (!name || !url) {
    setStatus('Please enter both name and query URL', 'error');
    return;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    setStatus('URL must start with http:// or https://', 'error');
    return;
  }
  
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const settings = await loadSettings();
  const engines = settings.customSearchEngines || [];
  
  if (engines.some(e => e.id === id)) {
    setStatus('A search engine with that name already exists', 'error');
    return;
  }
  
  const nextEngines = [...engines, { id, label: name, url }];
  await saveSettings({ customSearchEngines: nextEngines });
  
  newEngineName.value = '';
  newEngineUrl.value = '';
  
  renderSearchEnginesList(nextEngines);
  renderSearchEngineSelect(nextEngines, settings.searchEngine);
  setStatus('Search engine added successfully', 'ok');
});

// Backup Export/Import
const exportBtn = document.getElementById('export-backup-btn');
const importBtn = document.getElementById('import-backup-btn');
const importFileInput = document.getElementById('import-file-input');

exportBtn.addEventListener('click', async () => {
  try {
    const { ext } = await import('./lib/browser.js');
    const { STORAGE_KEYS, PASSKEY_HASH_KEY } = await import('./lib/config.js');
    
    const stored = await ext.storage.local.get([
      STORAGE_KEYS.history,
      STORAGE_KEYS.settings,
      PASSKEY_HASH_KEY
    ]);
    
    const backup = {
      type: 'NullTraceBackup',
      version: 3,
      passkeyHash: stored[PASSKEY_HASH_KEY] || null,
      history: stored[STORAGE_KEYS.history] || [],
      settings: stored[STORAGE_KEYS.settings] || {}
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nulltrace_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup exported successfully', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Export failed: ' + err.message, 'error');
  }
});

importBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const backup = JSON.parse(event.target.result);
      if (backup.type !== 'NullTraceBackup') {
        setStatus('Invalid backup file: wrong type tag', 'error');
        return;
      }
      
      const { ext } = await import('./lib/browser.js');
      const { STORAGE_KEYS, PASSKEY_HASH_KEY } = await import('./lib/config.js');
      
      const stored = await ext.storage.local.get(PASSKEY_HASH_KEY);
      const currentHash = stored[PASSKEY_HASH_KEY];
      
      if (currentHash && backup.passkeyHash && currentHash !== backup.passkeyHash) {
        setStatus('Import rejected: Backup uses a different passkey passphrase. Please lock/clear your current vault first.', 'error');
        return;
      }
      
      // Save backup settings, history, and passkey hash
      const patch = {};
      if (backup.passkeyHash) patch[PASSKEY_HASH_KEY] = backup.passkeyHash;
      if (backup.history) patch[STORAGE_KEYS.history] = backup.history;
      if (backup.settings) patch[STORAGE_KEYS.settings] = backup.settings;
      
      await ext.storage.local.set(patch);
      setStatus('Backup restored successfully!', 'ok');
      
      // Re-initialize settings UI
      await init();
    } catch (err) {
      console.error(err);
      setStatus('Import failed: invalid JSON structure', 'error');
    }
  };
  reader.readAsText(file);
  importFileInput.value = '';
});

async function init() {
  await clearSystemProxy();
  const settings = await loadSettings();
  serverHost.value = settings.serverHost;
  const country =
    settings.proxyCountry ||
    (settings.proxyEnabled ? settings.selectedProxyId : 'off') ||
    'off';
  renderCountryDropdown(country);
  
  useCustomProxy.checked = settings.useCustomProxy === true;
  if (useCustomProxy.checked) {
    proxyConfigFields.classList.remove('hidden');
  } else {
    proxyConfigFields.classList.add('hidden');
  }
  proxyScheme.value = settings.proxyScheme || 'http';
  proxyHost.value = settings.proxyHost || '';
  proxyPort.value = settings.proxyPort || '';
  proxyUser.value = settings.proxyUsername || '';
  proxyPass.value = settings.proxyPassword || '';

  // History retention
  document.getElementById('history-retention').value = settings.historyRetention || '5';
  
  // Auto vault domains
  document.getElementById('auto-vault-domains').value = settings.autoVaultDomains || '';

  incognitoShield.checked = settings.incognitoShield !== false;
  stripHistory.checked = settings.stripBrowserHistory !== false;
  saveLocalHistory.checked = settings.saveLocalHistory !== false;

  // Render Extensible Search Engines
  renderSearchEngineSelect(settings.customSearchEngines || [], settings.searchEngine);
  renderSearchEnginesList(settings.customSearchEngines || []);

  const isFirefox = typeof browser !== 'undefined' && typeof chrome === 'undefined';
  browserLabel.textContent = isFirefox ? 'Firefox' : 'Chromium';

  await refreshPitchLink();
}

init();
