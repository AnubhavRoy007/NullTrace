import { SEARCH_ENGINES } from './config.js';

/** Region params per country — masks location without requiring a live proxy. */
const COUNTRY_SEARCH_PARAMS = {
  off: { duckduckgo: 'kl=wt-wt', google: 'pws=0&nfpr=1', bing: 'cc=WT&setmkt=en-WW' },
  us: { duckduckgo: 'kl=us-en', google: 'pws=0&gl=us', bing: 'cc=US&setmkt=en-US' },
  uk: { duckduckgo: 'kl=uk-en', google: 'pws=0&gl=uk', bing: 'cc=GB&setmkt=en-GB' },
  de: { duckduckgo: 'kl=de-de', google: 'pws=0&gl=de', bing: 'cc=DE&setmkt=de-DE' },
  fr: { duckduckgo: 'kl=fr-fr', google: 'pws=0&gl=fr', bing: 'cc=FR&setmkt=fr-FR' },
  nl: { duckduckgo: 'kl=nl-nl', google: 'pws=0&gl=nl', bing: 'cc=NL&setmkt=nl-NL' },
  ca: { duckduckgo: 'kl=ca-en', google: 'pws=0&gl=ca', bing: 'cc=CA&setmkt=en-CA' },
  jp: { duckduckgo: 'kl=jp-jp', google: 'pws=0&gl=jp', bing: 'cc=JP&setmkt=ja-JP' },
  sg: { duckduckgo: 'kl=wt-wt', google: 'pws=0&gl=sg', bing: 'cc=SG&setmkt=en-SG' },
  in: { duckduckgo: 'kl=in-en', google: 'pws=0&gl=in', bing: 'cc=IN&setmkt=en-IN' },
  au: { duckduckgo: 'kl=au-en', google: 'pws=0&gl=au', bing: 'cc=AU&setmkt=en-AU' },
  br: { duckduckgo: 'kl=br-pt', google: 'pws=0&gl=br', bing: 'cc=BR&setmkt=pt-BR' },
  se: { duckduckgo: 'kl=se-sv', google: 'pws=0&gl=se', bing: 'cc=SE&setmkt=sv-SE' },
  ch: { duckduckgo: 'kl=de-ch', google: 'pws=0&gl=ch', bing: 'cc=CH&setmkt=de-CH' },
};

/** Build search URL — country affects URL region only (works without proxy). */
export function buildSearchUrl(engine, query, proxyCountry = 'off', customSearchEngines = []) {
  const q = encodeURIComponent(query.trim());
  
  // Find engine URL in settings first
  const customEngine = Array.isArray(customSearchEngines) ? customSearchEngines.find(e => e.id === engine) : null;
  const base = customEngine ? customEngine.url : (SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo);
  
  const country = COUNTRY_SEARCH_PARAMS[proxyCountry] || COUNTRY_SEARCH_PARAMS.off;
  // Fallback to engine ID or duckduckgo if not in default params
  const extra = country[engine] || country.duckduckgo || 'kl=wt-wt';
  
  return `${base}${q}&${extra}`;
}
