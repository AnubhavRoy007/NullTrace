import { ext } from './browser.js';
import { CACHE_WINDOW_MS, MAX_VISITED_TABS, STORAGE_KEYS } from './config.js';
import { loadSettings } from './settings.js';

function withinWindow(ts) {
  return Date.now() - ts < CACHE_WINDOW_MS;
}

export async function loadVisitedTabs() {
  const { [STORAGE_KEYS.visitedTabs]: items = [] } = await ext.storage.local.get(STORAGE_KEYS.visitedTabs);
  const list = Array.isArray(items) ? items : [];
  return list.filter((i) => withinWindow(i.timestamp)).slice(0, MAX_VISITED_TABS);
}

export async function addVisitedTab({ query, url, title, countryLabel }) {
  const settings = await loadSettings();
  if (settings.saveLocalHistory === false) {
    return [];
  }
  const items = await loadVisitedTabs();
  const entry = {
    id: crypto.randomUUID(),
    query: query || '',
    url,
    title: title || url,
    countryLabel: countryLabel || '',
    timestamp: Date.now(),
  };
  const updated = [entry, ...items.filter((i) => i.url !== url)].slice(0, MAX_VISITED_TABS);
  await ext.storage.local.set({ [STORAGE_KEYS.visitedTabs]: updated });
  return updated;
}

export async function updateVisitedTabTitle(url, title) {
  const items = await loadVisitedTabs();
  const idx = items.findIndex((i) => i.url === url);
  if (idx === -1) return items;
  items[idx] = { ...items[idx], title: title || items[idx].title };
  await ext.storage.local.set({ [STORAGE_KEYS.visitedTabs]: items });
  return items;
}

export async function clearVisitedTabs() {
  await ext.storage.local.set({ [STORAGE_KEYS.visitedTabs]: [] });
}

export async function pruneVisitedTabs() {
  const items = await loadVisitedTabs();
  await ext.storage.local.set({ [STORAGE_KEYS.visitedTabs]: items });
  return items;
}
