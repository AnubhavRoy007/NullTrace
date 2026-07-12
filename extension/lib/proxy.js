import { ext } from './browser.js';
import { loadSettings } from './settings.js';
import { isVaultEnabled } from './vault-state.js';
import { SEARCH_REGIONS } from './config.js';

export function getCountryLabel(countryId) {
  const id = countryId || 'off';
  const region = SEARCH_REGIONS.find((r) => r.id === id) || SEARCH_REGIONS[0];
  return region.label;
}

/** Always clear system proxy (fixes “site can’t be reached” from dead proxies). */
export async function clearSystemProxy() {
  const api = ext.proxy;
  if (!api?.settings) return;
  await api.settings.clear({ scope: 'regular' }).catch(() => {});
}

/** Only when user explicitly enables custom proxy routing. */
export async function syncProxyFromVaultState() {
  const api = ext.proxy;
  if (!api?.settings) return;

  const vaultOn = await isVaultEnabled();
  const settings = await loadSettings();

  const shouldUse =
    vaultOn &&
    settings.useCustomProxy === true &&
    settings.proxyHost &&
    settings.proxyPort;

  if (!shouldUse) {
    await clearSystemProxy();
    return;
  }

  const scheme = ['socks4', 'socks5', 'http', 'https'].includes(settings.proxyScheme)
    ? settings.proxyScheme
    : 'http';

  try {
    await api.settings.set({
      value: {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme,
            host: settings.proxyHost,
            port: parseInt(settings.proxyPort, 10),
          },
          bypassList: [
            '127.0.0.1',
            'localhost',
            '<local>',
            '*.google.com',
            '*.duckduckgo.com',
            '*.bing.com',
          ],
        },
      },
      scope: 'regular',
    });
  } catch (err) {
    console.error('Error setting proxy configuration:', err);
    await clearSystemProxy();
  }
}

/** If proxy fails, fall back to direct so searches still work. */
export async function disableProxyOnError() {
  await clearSystemProxy();
  const settings = await loadSettings();
  if (settings.useCustomProxy) {
    const { saveSettings } = await import('./settings.js');
    await saveSettings({ useCustomProxy: false });
  }
}
