import { ext } from './browser.js';
import { loadSettings } from './settings.js';
import { buildSearchUrl } from './search-url.js';
import { purgeAllSearchHistory, purgeUrlFromHistory } from './privacy.js';
import { addVisitedTab } from './visited-tabs.js';
import { getCountryLabel } from './proxy.js';

/** Open search in a normal tab (direct connection by default). */
export async function openVaultSearch(query) {
  const settings = await loadSettings();
  const url = buildSearchUrl(settings.searchEngine, query, settings.proxyCountry || 'off', settings.customSearchEngines || []);
  const countryLabel =
    settings.proxyCountry && settings.proxyCountry !== 'off'
      ? getCountryLabel(settings.proxyCountry)
      : '';

  if (!url.startsWith('https://')) {
    throw new Error('Invalid search URL');
  }

  const tab = await ext.tabs.create({ url, active: true });

  await addVisitedTab({
    query: query.trim(),
    url,
    title: query.trim(),
    countryLabel,
  });

  if (settings.stripBrowserHistory !== false) {
    await purgeUrlFromHistory(url);
    setTimeout(() => purgeAllSearchHistory(), 800);
    setTimeout(() => purgeAllSearchHistory(), 2500);
  }

  return { url, tabId: tab?.id };
}

export async function registerVaultTabNavigation(_tabId, url, query = '') {
  const settings = await loadSettings();
  if (!url || !/^https?:/i.test(url)) return;

  await addVisitedTab({
    query,
    url,
    title: url,
    countryLabel:
      settings.proxyCountry && settings.proxyCountry !== 'off'
        ? getCountryLabel(settings.proxyCountry)
        : '',
  });

  if (settings.stripBrowserHistory !== false) {
    await purgeUrlFromHistory(url);
  }
}
