import { ext } from './browser.js';
import { SEARCH_ENGINE_ORIGINS } from './config.js';

/** History search terms — URLs and page titles (e.g. “Pesquisa Google”). */
const HISTORY_SEARCH_QUERIES = [
  'google.com/search',
  'google.pt/search',
  'google.co.uk/search',
  'google.de/search',
  'google.fr/search',
  'google.it/search',
  'google.es/search',
  'google.co.in/search',
  'google.com.br/search',
  'google.ca/search',
  'google.com.au/search',
  'bing.com/search',
  'duckduckgo.com',
  'search.yahoo.com',
  'Pesquisa Google',
  'Google Search',
  'Búsqueda de Google',
  'Recherche Google',
  'Suche Google',
];

/** Mirrors Chrome Settings → Delete browsing data (cached files, cookies, history, site storage). */
const FULL_BROWSING_DATA_REMOVAL = {
  cache: true,
  cacheStorage: true,
  cookies: true,
  localStorage: true,
  indexedDB: true,
  serviceWorkers: true,
  fileSystems: true,
  pluginData: true,
  history: true,
  webSQL: true,
};

function historyApi() {
  return ext.history;
}

function browsingDataApi() {
  return ext.browsingData;
}

function sessionsApi() {
  return ext.sessions;
}

/** Match Google (any TLD), Bing, DuckDuckGo, Yahoo search URLs. */
export function isSearchEngineUrl(url) {
  if (!url || !/^https?:/i.test(url)) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    if (/^(:?www\.)?google\.[a-z.]{2,}$/.test(host) && path.startsWith('/search')) return true;
    if (/^(:?www\.)?bing\.[a-z.]{2,}$/.test(host) && path.includes('/search')) return true;
    if ((host === 'duckduckgo.com' || host === 'www.duckduckgo.com') && (path === '/' || path.startsWith('/?'))) {
      return u.search.includes('q=');
    }
    if (/^(:?www\.)?search\.yahoo\.[a-z.]{2,}$/.test(host)) return true;

    return false;
  } catch {
    return false;
  }
}

/** Match search result page titles shown in Chrome Recent tabs. */
export function isSearchResultTitle(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return (
    t.includes('google search') ||
    t.includes('pesquisa google') ||
    t.includes('búsqueda de google') ||
    t.includes('recherche google') ||
    t.includes('google-suche') ||
    t.includes('suche google') ||
    /\s-\s(bing|duckduckgo)\b/i.test(title)
  );
}

export async function isCustomSearchEngineUrl(url) {
  if (!url) return false;
  try {
    const { loadSettings } = await import('./settings.js');
    const settings = await loadSettings();
    const engines = settings.customSearchEngines || [];
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    
    return engines.some(e => {
      try {
        const engineUrl = new URL(e.url);
        return host === engineUrl.hostname.toLowerCase();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function shouldPurgeHistoryEntry(url, title = '') {
  const isDefaultSearch = isSearchEngineUrl(url);
  const isCustomSearch = await isCustomSearchEngineUrl(url);
  return isDefaultSearch || isCustomSearch || isSearchResultTitle(title);
}

/** Remove a URL from Chrome history (history menu + Recent tabs). */
export async function purgeUrlFromHistory(url) {
  if (!url || !/^https?:/i.test(url)) return;
  const api = historyApi();
  if (!api) return;

  const variants = new Set();
  try {
    const u = new URL(url);
    variants.add(u.origin + u.pathname);
    variants.add(`${u.origin}${u.pathname}${u.search}`);
    if (u.pathname.endsWith('/')) {
      variants.add(u.origin + u.pathname.slice(0, -1));
    } else {
      variants.add(`${u.origin}${u.pathname}/`);
    }
    if (u.search) {
      variants.add(u.origin + u.pathname);
    }
  } catch {
    /* ignore */
  }

  await Promise.all([...variants].map((u) => api.deleteUrl({ url: u }).catch(() => {})));

  if (api.search) {
    try {
      const u = new URL(url);
      const byHost = await api.search({ text: u.hostname, maxResults: 300, startTime: 0 });
      const matches = await Promise.all(
        byHost.map(async (h) => (await shouldPurgeHistoryEntry(h.url, h.title)) ? h : null)
      );
      await Promise.all(
        matches
          .filter(Boolean)
          .map((h) => api.deleteUrl({ url: h.url }).catch(() => {}))
      );
    } catch {
      /* optional */
    }
  }
}

/** Wipe every search-engine URL/title from Chrome history. */
export async function purgeAllSearchHistory() {
  const api = historyApi();
  if (!api?.search) return;

  const seen = new Set();

  for (const text of HISTORY_SEARCH_QUERIES) {
    try {
      const hits = await api.search({ text, maxResults: 500, startTime: 0 });
      await Promise.all(
        hits.map(async (h) => {
          if (!(await shouldPurgeHistoryEntry(h.url, h.title))) return;
          if (seen.has(h.url)) return;
          seen.add(h.url);
          await api.deleteUrl({ url: h.url }).catch(() => {});
        })
      );
    } catch {
      /* optional */
    }
  }
}

/**
 * Delete history entries for search pages in Chrome’s recently-closed session list.
 * Extensions cannot remove session entries directly; deleting their history URLs clears Recent tabs.
 */
export async function purgeRecentlyClosedSearchTabs() {
  const api = sessionsApi();
  if (!api?.getRecentlyClosed) return;

  try {
    const closed = await api.getRecentlyClosed({ maxResults: 50 });
    await Promise.all(
      closed.map(async (session) => {
        const url = session.tab?.url;
        const title = session.tab?.title;
        if (!url || !(await shouldPurgeHistoryEntry(url, title))) return;
        await purgeUrlFromHistory(url);
      })
    );
  } catch {
    /* optional */
  }
}

/**
 * Block a search visit the instant Chrome records it — stops Recent tabs from listing it.
 */
export async function blockSearchHistoryVisit(item) {
  if (!item?.url) return;
  if (!(await shouldPurgeHistoryEntry(item.url, item.title))) return;

  await purgeUrlFromHistory(item.url);
  setTimeout(() => purgeUrlFromHistory(item.url), 0);
  setTimeout(() => purgeAllSearchHistory(), 100);
  setTimeout(() => purgeRecentlyClosedSearchTabs(), 200);
}

/**
 * Delete browsing data for origins — same categories as Chrome “Delete browsing data”.
 */
export async function purgeOriginsBrowsingData(origins = []) {
  const api = browsingDataApi();
  if (!api?.remove) return;

  const uniqueOrigins = [...new Set(origins.filter(Boolean))];
  if (!uniqueOrigins.length) return;

  await api.remove({ origins: uniqueOrigins }, FULL_BROWSING_DATA_REMOVAL).catch(() => {});
  if (api.removePasswords) {
    await api.removePasswords({ origins: uniqueOrigins }).catch(() => {});
  }
  if (api.removeFormData) {
    await api.removeFormData({ origins: uniqueOrigins }).catch(() => {});
  }
}

/** Full purge for vault search tab close. */
export async function purgeVaultTabOnClose({ origins = [], urls = [] } = {}) {
  const uniqueUrls = [...new Set(urls.filter((u) => u && /^https?:/i.test(u)))];
  await Promise.all(uniqueUrls.map((url) => purgeUrlFromHistory(url)));
  await purgeAllSearchHistory();
  await purgeRecentlyClosedSearchTabs();

  const allOrigins = [...new Set([...origins, ...SEARCH_ENGINE_ORIGINS])];
  await purgeOriginsBrowsingData(allOrigins);
}

/** Manual purge + clear anything still shown under History → Recent tabs. */
export async function purgeAllSearchBrowsingData() {
  await purgeAllSearchHistory();
  await purgeRecentlyClosedSearchTabs();
  await purgeOriginsBrowsingData(SEARCH_ENGINE_ORIGINS);
  setTimeout(() => purgeAllSearchHistory(), 300);
  setTimeout(() => purgeRecentlyClosedSearchTabs(), 600);
}

/** Incognito-like: no saved logins/cookies/cache for this origin after visit. */
export async function clearSiteSecrets(url) {
  if (!url || !/^https?:/i.test(url)) return;
  const api = browsingDataApi();
  if (!api?.remove) return;

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }

  const removal = {
    cookies: true,
    cache: true,
    localStorage: true,
    indexedDB: true,
    serviceWorkers: true,
    cacheStorage: true,
    fileSystems: true,
    pluginData: true,
  };

  await api.remove({ origins: [origin] }, removal).catch(() => {});
  if (api.removePasswords) {
    await api.removePasswords({ origins: [origin] }).catch(() => {});
  }
  if (api.removeFormData) {
    await api.removeFormData({ origins: [origin] }).catch(() => {});
  }
}
