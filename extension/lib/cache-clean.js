import { ext } from './browser.js';
import { CACHE_WINDOW_MS } from './config.js';

function browsingDataApi() {
  return ext.browsingData;
}

/** Wipe site data when a vault tab closes (incognito-like). */
export async function clearOriginsOnTabClose(origins = []) {
  const api = browsingDataApi();
  if (!api?.remove) return;

  const uniqueOrigins = [...new Set(origins.filter(Boolean))];
  if (!uniqueOrigins.length) return;

  const removal = {
    cache: true,
    cacheStorage: true,
    cookies: true,
    localStorage: true,
    indexedDB: true,
    serviceWorkers: true,
    fileSystems: true,
    webSQL: true,
  };

  await api.remove({ origins: uniqueOrigins }, removal).catch(() => {});
  if (api.removePasswords) {
    await api.removePasswords({ origins: uniqueOrigins }).catch(() => {});
  }
  if (api.removeFormData) {
    await api.removeFormData({ origins: uniqueOrigins }).catch(() => {});
  }
}

/** Background sweep: old cache only (do not delete cookies for open tabs). */
export async function sweepStaleVaultCache() {
  const api = browsingDataApi();
  if (!api?.remove) return;

  const since = Date.now() - CACHE_WINDOW_MS;
  await api
    .remove({ since }, { cache: true, cacheStorage: true, serviceWorkers: true })
    .catch(() => {});
}

export function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
