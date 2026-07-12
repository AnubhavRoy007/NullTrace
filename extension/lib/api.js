import { loadSettings, serverBaseUrl } from './settings.js';

/** Server is optional — only used for health check and pitch deck. No user data is sent. */
export async function getServerUrl() {
  const settings = await loadSettings();
  return serverBaseUrl(settings);
}

export async function checkServer() {
  try {
    const server = await getServerUrl();
    const res = await fetch(`${server}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
