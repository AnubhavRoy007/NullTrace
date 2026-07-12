export const MAX_HISTORY = 5;
export const MAX_VISITED_TABS = 15;
export const CACHE_WINDOW_MS = 15 * 60 * 1000;
/** Passkey auto-rotation interval (minutes). */
export const PASSKEY_ROTATE_MINUTES = 30;

export const PASSKEY_HASH_KEY = 'cv_passkey_hash';
export const PASSKEY_ROTATED_KEY = 'cv_rotated_passkey';
export const ROTATION_PENDING_KEY = 'cv_rotation_pending';

export const STORAGE_KEYS = {
  history: 'cv_history',
  visitedTabs: 'cv_visited_tabs',
  settings: 'cv_settings',
};

export const SEARCH_REGIONS = [
  { id: 'off', label: 'Default / Global' },
  { id: 'us', label: 'United States' },
  { id: 'uk', label: 'United Kingdom' },
  { id: 'de', label: 'Germany' },
  { id: 'fr', label: 'France' },
  { id: 'nl', label: 'Netherlands' },
  { id: 'ca', label: 'Canada' },
  { id: 'jp', label: 'Japan' },
  { id: 'sg', label: 'Singapore' },
  { id: 'in', label: 'India' },
  { id: 'au', label: 'Australia' },
  { id: 'br', label: 'Brazil' },
  { id: 'se', label: 'Sweden' },
  { id: 'ch', label: 'Switzerland' },
];

export const DEFAULT_SETTINGS = {
  serverHost: '127.0.0.1:3847',
  searchEngine: 'duckduckgo',
  saveLocalHistory: true,
  stripBrowserHistory: true,
  incognitoShield: true,
  proxyCountry: 'off',
  
  // Custom Proxy Settings
  useCustomProxy: false,
  proxyScheme: 'http',
  proxyHost: '',
  proxyPort: '',
  proxyUsername: '',
  proxyPassword: '',

  // New Features Settings
  historyRetention: '5', // '5', '10', '25', 'unlimited'
  autoVaultDomains: '', // comma or newline separated
  customSearchEngines: [
    { id: 'duckduckgo', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    { id: 'google', label: 'Google', url: 'https://www.google.com/search?q=' },
    { id: 'bing', label: 'Bing', url: 'https://www.bing.com/search?q=' }
  ]
};

export const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
};

/** Origins wiped on tab close / manual purge (Chrome “delete browsing data” equivalent). */
export const SEARCH_ENGINE_ORIGINS = [
  'https://www.google.com',
  'https://google.com',
  'https://duckduckgo.com',
  'https://www.bing.com',
  'https://bing.com',
  'https://search.yahoo.com',
];
