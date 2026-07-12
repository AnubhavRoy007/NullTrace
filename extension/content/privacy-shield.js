/**
 * Incognito-like page shield while vault is ON:
 * - block geolocation (no “home location”)
 * - hide location widgets on search pages
 * - discourage saved credentials on forms
 * - replace user profile picture with Sign in button on Google Search
 */
(async () => {
  const api = globalThis.chrome ?? globalThis.browser;
  if (!api?.storage) return;

  const { cv_vault_enabled: vaultOn } = await api.storage.local.get('cv_vault_enabled');
  if (vaultOn === false) return;

  const isGoogle = location.hostname.includes('google.');

  const style = document.createElement('style');
  let css = `
    [data-attrid*="location"],
    #fe_greeting,
    .BZPZfd,
    #locsft,
    .geo,
    .detected-location,
    .location-chrome,
    #swml,
    .map-first-column,
    .vt_m,
    [aria-label*="location" i],
    [aria-label*="Your location" i],
    .b_hide[id*="location"] {
      display: none !important;
      visibility: hidden !important;
    }
  `;

  if (isGoogle) {
    css += `
      /* Hide Google Account PFP to prevent flickering before JS replacement */
      a[href*="SignOutOptions"],
      a[aria-label*="Google Account" i],
      a[title*="Google Account" i] {
        display: none !important;
      }

      .nulltrace-signin-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background-color: #1a73e8 !important;
        color: #ffffff !important;
        border: 1px solid transparent !important;
        font-family: "Google Sans", Roboto, Helvetica, Arial, sans-serif !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        letter-spacing: .25px !important;
        padding: 8px 16px !important;
        border-radius: 4px !important;
        text-decoration: none !important;
        cursor: pointer !important;
        margin-left: 8px !important;
        margin-right: 8px !important;
        height: 36px !important;
        box-sizing: border-box !important;
      }
      .nulltrace-signin-btn:hover {
        background-color: #1557b0 !important;
        box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15) !important;
      }
      .nulltrace-signin-dark {
        background-color: #8ab4f8 !important;
        color: #202124 !important;
      }
      .nulltrace-signin-dark:hover {
        background-color: #93bbf9 !important;
        box-shadow: 0 1px 2px 0 rgba(0,0,0,0.3), 0 1px 3px 1px rgba(0,0,0,0.15) !important;
      }
    `;
  }

  style.textContent = css;
  (document.documentElement || document.head)?.appendChild(style);

  if (navigator.geolocation) {
    const deny = (_s, onError) => {
      onError?.({ code: 1, message: 'NullTrace: location blocked' });
    };
    try {
      navigator.geolocation.getCurrentPosition = deny;
      navigator.geolocation.watchPosition = deny;
    } catch {
      /* ignore */
    }
  }

  function shieldForms(root = document) {
    root.querySelectorAll?.('form').forEach((form) => {
      form.setAttribute('autocomplete', 'off');
    });
    root.querySelectorAll?.('input[type="password"]').forEach((input) => {
      input.setAttribute('autocomplete', 'new-password');
      input.setAttribute('data-lpignore', 'true');
      input.setAttribute('data-form-type', 'other');
    });
    root.querySelectorAll?.('input[type="email"], input[name*="user" i], input[name*="login" i]').forEach((input) => {
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('data-lpignore', 'true');
    });
  }

  function replaceGooglePfp() {
    if (!isGoogle) return;
    try {
      const profileLinks = new Set();

      // 1. Matches SignOutOptions links
      document.querySelectorAll('a[href*="SignOutOptions"]').forEach(el => profileLinks.add(el));

      // 2. Matches elements with aria-label or title matching Google Account
      document.querySelectorAll('a[aria-label*="Google Account" i], a[title*="Google Account" i]').forEach(el => profileLinks.add(el));

      // 3. Matches links to accounts.google.com containing a googleusercontent image
      document.querySelectorAll('a[href*="accounts.google.com"]').forEach(link => {
        const img = link.querySelector('img[src*="googleusercontent.com"]');
        if (img) profileLinks.add(link);
      });

      profileLinks.forEach(link => {
        if (link.dataset.nulltraceReplaced) return;
        if (!link.parentNode) return;

        const signInBtn = document.createElement('a');
        signInBtn.href = 'https://accounts.google.com/ServiceLogin';
        signInBtn.textContent = 'Sign in';
        signInBtn.dataset.nulltraceReplaced = 'true';
        signInBtn.className = 'nulltrace-signin-btn';

        const body = document.body;
        const isDark = body ? (window.getComputedStyle(body).backgroundColor.match(/\d+/g)?.slice(0, 3).reduce((sum, val) => sum + parseInt(val), 0) < 300) : false;
        if (isDark) {
          signInBtn.classList.add('nulltrace-signin-dark');
        }

        link.parentNode.replaceChild(signInBtn, link);
      });
    } catch (e) {
      console.error('NullTrace: Failed to replace PFP:', e);
    }
  }

  shieldForms();
  replaceGooglePfp();
  const observer = new MutationObserver(() => {
    shieldForms();
    replaceGooglePfp();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener(
    'beforeunload',
    () => {
      api.runtime.sendMessage({ type: 'CLEAR_SITE_SECRETS', url: location.href }).catch(() => {});
    },
    { capture: true }
  );
})();
