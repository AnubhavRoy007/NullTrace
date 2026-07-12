import { ext } from './lib/browser.js';
import { isVaultEnabled } from './lib/vault-state.js';
import { loadSettings } from './lib/settings.js';
import { purgeUrlFromHistory, purgeAllSearchHistory, clearSiteSecrets, purgeVaultTabOnClose, blockSearchHistoryVisit, isSearchEngineUrl } from './lib/privacy.js';
import { openVaultSearch, registerVaultTabNavigation } from './lib/vault-browse.js';
import {
  syncProxyFromVaultState,
  clearSystemProxy,
  disableProxyOnError,
} from './lib/proxy.js';
import { clearOriginsOnTabClose, sweepStaleVaultCache } from './lib/cache-clean.js';
import { updateVisitedTabTitle, pruneVisitedTabs, clearVisitedTabs } from './lib/visited-tabs.js';
import { getPassphrase, clearPassphrase, clearHistory } from './lib/storage.js';
import { rotatePasskey, deferPasskeyRotation } from './lib/passkey-rotate.js';
import { PASSKEY_ROTATE_MINUTES } from './lib/config.js';

const storage = ext.storage;

/** tabId -> { query, origins: Set, urls: Set, openedAt } */
const vaultTabs = new Map();

let cachedProxyCredentials = null;

async function updateCachedProxyCredentials() {
  try {
    const settings = await loadSettings();
    const vaultOn = await isVaultEnabled();
    if (
      vaultOn &&
      settings.useCustomProxy === true &&
      settings.proxyHost &&
      settings.proxyPort &&
      settings.proxyUsername &&
      settings.proxyPassword
    ) {
      cachedProxyCredentials = {
        username: settings.proxyUsername,
        password: settings.proxyPassword,
      };
    } else {
      cachedProxyCredentials = null;
    }
  } catch (e) {
    console.error('Error updating cached proxy credentials:', e);
    cachedProxyCredentials = null;
  }
}

async function bootstrap() {
  await clearSystemProxy();

  const data = await storage.local.get(['cv_history', 'cv_vault_enabled', 'cv_visited_tabs', 'cv_settings']);
  const patch = {};
  if (!data.cv_history) patch.cv_history = [];
  if (data.cv_vault_enabled === undefined) patch.cv_vault_enabled = true;
  if (!data.cv_visited_tabs) patch.cv_visited_tabs = [];

  const { DEFAULT_SETTINGS } = await import('./lib/config.js');
  const merged = { ...DEFAULT_SETTINGS, ...(data.cv_settings || {}) };
  if (merged.useCountryProxy === undefined) merged.useCountryProxy = false;
  if (merged.useCountryProxy !== true) merged.useCountryProxy = false;
  patch.cv_settings = merged;

  if (Object.keys(patch).length) await storage.local.set(patch);

  await syncProxyFromVaultState();
  await updateCachedProxyCredentials();
  await pruneVisitedTabs();
}

bootstrap();

async function onInstalled() {
  await clearSystemProxy();
  const { DEFAULT_SETTINGS } = await import('./lib/config.js');
  const data = await storage.local.get(['cv_settings']);
  if (!data.cv_settings) {
    await storage.local.set({ cv_settings: DEFAULT_SETTINGS });
  }
  await syncProxyFromVaultState();
}

ext.runtime?.onInstalled?.addListener?.(onInstalled);

async function registerCookieStrippingRule(tabId) {
  if (!ext.declarativeNetRequest) return;
  const ruleId = tabId + 100000;
  const rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'cookie', operation: 'remove' }
      ],
      responseHeaders: [
        { header: 'set-cookie', operation: 'remove' }
      ]
    },
    condition: {
      tabIds: [tabId],
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'stylesheet',
        'script',
        'image',
        'font',
        'object',
        'xmlhttprequest',
        'ping',
        'csp_report',
        'media',
        'websocket',
        'other'
      ]
    }
  };
  try {
    await ext.declarativeNetRequest.updateSessionRules({
      addRules: [rule],
      removeRuleIds: [ruleId]
    });
  } catch (err) {
    console.error('Error registering cookie stripping rule:', err);
  }
}

async function unregisterCookieStrippingRule(tabId) {
  if (!ext.declarativeNetRequest) return;
  const ruleId = tabId + 100000;
  try {
    await ext.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId]
    });
  } catch (err) {
    console.error('Error unregistering cookie stripping rule:', err);
  }
}

function trackVaultTab(tabId, query, url) {
  let info = vaultTabs.get(tabId);
  if (!info) {
    info = { query, origins: new Set(), urls: new Set(), openedAt: Date.now() };
    vaultTabs.set(tabId, info);
  }
  if (url && /^https?:/i.test(url)) {
    info.urls.add(url);
  }
  try {
    const origin = new URL(url).origin;
    if (origin) info.origins.add(origin);
  } catch {
    /* ignore */
  }
}

async function shouldUsePrivateShield() {
  if (!(await isVaultEnabled())) return false;
  const settings = await loadSettings();
  return settings.incognitoShield !== false;
}

async function shouldStripHistory() {
  if (!(await isVaultEnabled())) return false;
  const settings = await loadSettings();
  return settings.stripBrowserHistory !== false;
}

async function stripNavigation(url) {
  if (!(await shouldStripHistory())) return;
  if (!isSearchEngineUrl(url)) return;
  await purgeUrlFromHistory(url);
  await purgeAllSearchHistory();
}

async function sweepVaultCache() {
  if (!(await isVaultEnabled())) return;
  await sweepStaleVaultCache();
  await pruneVisitedTabs();
  if (await shouldStripHistory()) {
    const { purgeRecentlyClosedSearchTabs } = await import('./lib/privacy.js');
    await purgeAllSearchHistory();
    await purgeRecentlyClosedSearchTabs();
  }
}

async function handlePasskeyRotation() {
  if (!(await isVaultEnabled())) return;

  const pass = await getPassphrase();
  try {
    if (pass) {
      await rotatePasskey();
    } else {
      await deferPasskeyRotation();
    }
  } catch (err) {
    console.error('Passkey rotation failed:', err);
  }
}

ext.runtime?.onMessage?.addListener?.((msg, _sender, sendResponse) => {
  if (msg.type === 'OPEN_PRIVATE_SEARCH') {
    openVaultSearch(msg.query)
      .then((result) => {
        if (result.tabId) {
          vaultTabs.set(result.tabId, {
            query: msg.query,
            origins: new Set(),
            urls: new Set(),
            openedAt: Date.now(),
          });
          trackVaultTab(result.tabId, msg.query, result.url);
          registerCookieStrippingRule(result.tabId);
        }
        sendResponse({ ok: true, ...result });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'CLEAR_SITE_SECRETS') {
    clearSiteSecrets(msg.url).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

if (ext.proxy?.onProxyError) {
  ext.proxy.onProxyError.addListener(() => {
    disableProxyOnError();
  });
}

if (ext.alarms?.onAlarm) {
  ext.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cv-cache-sweep') sweepVaultCache();
    if (alarm.name === 'cv-passkey-rotate') handlePasskeyRotation();
  });
}

if (ext.alarms?.create) {
  ext.alarms.create('cv-cache-sweep', { periodInMinutes: 2 });
  ext.alarms.create('cv-passkey-rotate', { periodInMinutes: PASSKEY_ROTATE_MINUTES });
}

/** Delete search URLs the instant Chrome records them — prevents Recent tabs listing. */
if (ext.history?.onVisited) {
  ext.history.onVisited.addListener((item) => {
    shouldStripHistory().then((ok) => {
      if (ok) blockSearchHistoryVisit(item);
    });
  });
}

async function checkAndApplyAutoVault(tabId, url) {
  if (!url || !/^https?:/i.test(url)) return;
  try {
    const settings = await loadSettings();
    if (!settings.autoVaultDomains) return;

    const domains = settings.autoVaultDomains
      .split(/[\n,]/)
      .map(d => d.trim().toLowerCase())
      .filter(Boolean);

    if (domains.length === 0) return;

    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isMatched = domains.some(d => host === d || host.endsWith('.' + d));

    if (isMatched && !vaultTabs.has(tabId)) {
      vaultTabs.set(tabId, {
        query: 'Auto-Vault',
        origins: new Set(),
        urls: new Set(),
        openedAt: Date.now(),
      });
      trackVaultTab(tabId, 'Auto-Vault', url);
      await registerCookieStrippingRule(tabId);
    }
  } catch (e) {
    console.error('Error applying auto-vault rules:', e);
  }
}

if (ext.webNavigation?.onCommitted) {
  ext.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    stripNavigation(details.url);
    checkAndApplyAutoVault(details.tabId, details.url).then(() => {
      if (vaultTabs.has(details.tabId)) {
        trackVaultTab(details.tabId, vaultTabs.get(details.tabId).query, details.url);
        registerVaultTabNavigation(details.tabId, details.url, vaultTabs.get(details.tabId).query);
      }
      if (isSearchEngineUrl(details.url)) {
        purgeAllSearchHistory();
      }
    });
  });
}

if (ext.webNavigation?.onCompleted) {
  ext.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId !== 0) return;
    stripNavigation(details.url);
    checkAndApplyAutoVault(details.tabId, details.url).then(() => {
      if (vaultTabs.has(details.tabId)) {
        trackVaultTab(details.tabId, vaultTabs.get(details.tabId).query, details.url);
      }
    });
  });
}

if (ext.tabs?.onUpdated) {
  ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab?.url;
    if (!url) return;

    checkAndApplyAutoVault(tabId, url).then(() => {
      if (vaultTabs.has(tabId)) {
        trackVaultTab(tabId, vaultTabs.get(tabId).query, url);
        if (changeInfo.title) {
          updateVisitedTabTitle(url, changeInfo.title);
        }
      }

      if (changeInfo.url) {
        shouldStripHistory().then((ok) => {
          if (ok) stripNavigation(url);
        });
      }
      if (changeInfo.status === 'complete') {
        shouldStripHistory().then((ok) => {
          if (ok) {
            stripNavigation(url);
            purgeAllSearchHistory();
          }
        });
      }
    });
  });
}

if (ext.tabs?.onRemoved) {
  ext.tabs.onRemoved.addListener(async (tabId) => {
    unregisterCookieStrippingRule(tabId);
    const info = vaultTabs.get(tabId);
    vaultTabs.delete(tabId);
    if (!info) return;

    const origins = [...info.origins];
    const urls = [...info.urls];

    if (await shouldStripHistory()) {
      await purgeVaultTabOnClose({ origins, urls });
    } else {
      await clearOriginsOnTabClose(origins);
      if (await shouldUsePrivateShield()) {
        for (const o of origins) {
          await clearSiteSecrets(o + '/');
        }
      }
    }
  });
}

storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.cv_vault_enabled || changes.cv_settings) {
    syncProxyFromVaultState();
    updateCachedProxyCredentials();
  }
});

if (ext.webRequest?.onAuthRequired) {
  ext.webRequest.onAuthRequired.addListener(
    (details) => {
      if (details.isProxy && cachedProxyCredentials) {
        return {
          authCredentials: cachedProxyCredentials
        };
      }
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
}

async function runPanicWipe() {
  try {
    vaultTabs.clear();
    await clearPassphrase();
    await clearHistory();
    await clearVisitedTabs();
    await clearSystemProxy();
    cachedProxyCredentials = null;

    const { resetSessionStack } = await import('./lib/session-stack.js');
    await resetSessionStack();

    if (ext.browsingData?.remove) {
      await ext.browsingData.remove(
        { since: 0 },
        {
          cache: true,
          cookies: true,
          history: true,
          localStorage: true,
          indexedDB: true,
          serviceWorkers: true,
          webSQL: true,
          fileSystems: true,
          formData: true,
          passwords: true,
          downloads: true,
          pluginData: true,
          cacheStorage: true
        }
      ).catch(() => {});
    }
    console.log('NullTrace: Panic Wipe Completed.');
  } catch (err) {
    console.error('Error during panic wipe:', err);
  }
}

if (ext.commands?.onCommand) {
  ext.commands.onCommand.addListener((command) => {
    if (command === 'panic-wipe') {
      runPanicWipe();
    }
  });
}
