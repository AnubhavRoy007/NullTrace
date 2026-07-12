import { ext } from './browser.js';

/** Open search in a normal tab with vault privacy (15m cache clear, no Chrome history). */
export async function openSearch(query) {
  try {
    const res = await ext.runtime.sendMessage({
      type: 'OPEN_PRIVATE_SEARCH',
      query: query.trim(),
    });
    if (res?.ok === false) throw new Error(res.error || 'Could not open search');
    return res;
  } catch (err) {
    if (String(err?.message || '').includes('Receiving end')) {
      const { openVaultSearch } = await import('./vault-browse.js');
      return openVaultSearch(query);
    }
    throw err;
  }
}
