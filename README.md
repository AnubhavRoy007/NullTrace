# NullTrace 2.0

NullTrace is a zero-knowledge, privacy-focused browser extension that keeps searches out of native browser history, encrypts a rolling history client-side, and routes network traffic through user-configured proxies.

## Extension Architecture

NullTrace consists of two primary components:
1. **Browser Extension (`extension/` / `dist/`)**: Handles all user interactions, search interception, client-side encryption, and browser history/cache pruning.
2. **Local Express Server (`server/`)**: A local server serving a project showcase/pitch deck and a health endpoint. It operates on a **zero-knowledge** basis; it has no access to user queries, passphrases, or histories. All data is processed client-side.

### Build and Package Structure
* **Source Folder**: The extension code is housed in `/extension`.
* **Canonical Manifest**: Located at `/extension/manifest.json`.
* **Build Target**: Running the build script packages the extension into the `/dist` directory. Load the unpacked extension from `/dist` inside Chrome or Firefox.

## Cryptography & Threat Model

### Cryptography (AES-256-GCM)
In version 2.0, NullTrace features simplified and audited cryptography:
* **Key Derivation**: Passkeys are derived into 256-bit AES keys using PBKDF2 with SHA-256 and **600,000 iterations** (OWASP recommendation).
* **Encryption**: A single AES-256-GCM envelope (12-byte random IV/nonce, 16-byte authentication tag).
* **Domain Binding**: Bound using `"v3"` as Additional Authenticated Data (AAD) to ensure integrity and prevent decryption cross-contamination.
* **Legacy Compatibility**: Decrypts old version 2 multi-layered vaults and migrates them automatically on-the-fly to the version 3 format upon successful unlock.

### Threat Model
* **Native History Protection**: Intercepts search queries before the browser records them, keeping query strings off native history and Recent tabs.
* **Cryptographic Vault**: Encrypts a rolling history on the browser home page. If the device is stolen or inspected, the queries remain unreadable without the passphrase.
* **Passphrase Volatility**: The plaintext passphrase is held in short-lived session storage (`chrome.storage.session`) and is wiped upon browser closure or session timeout.

## Host Permissions Audit

NullTrace requires the following high-privilege permissions in its manifest:

### 1. `<all_urls>` (Host Permissions)
* **Custom Proxy Routing**: Required to route all browser-wide network requests through the user's custom proxy server. Without matching all URLs, proxy rules cannot capture arbitrary external traffic.
* **Incognito-like Data Stripping**: When a user closes a private search tab, NullTrace clears the cookies, local storage, and cache for *any* external site visited through search result links in that tab to enforce isolation.
* **Global Search Engines**: Intercepts search queries across any TLD variant of major search engines (e.g., `google.com`, `google.co.uk`, `google.de`).

### 2. `"webRequest"` and `"webRequestAuthProvider"`
* **Proxy Authentication**: Required to listen to the `onAuthRequired` challenge when routing traffic through password-protected HTTP, HTTPS, or SOCKS proxies. This is the only compliant way to perform authenticated proxying in Manifest V3.

## Getting Started

### Prerequisites
* **Node.js**: Version 16.7.0 or higher.

### Development and Setup
1. **Install Server Dependencies**:
   ```bash
   cd server
   npm install
   ```
2. **Start the Local Server**:
   Run the batch script:
   ```bash
   start-server.bat
   ```
   Or manually:
   ```bash
   cd server
   npm start
   ```
3. **Build the Extension**:
   From the project root:
   ```bash
   npm run build
   ```
4. **Load the Extension**:
   * Open Chrome and navigate to `chrome://extensions/`.
   * Enable **Developer mode** (top-right).
   * Click **Load unpacked** (top-left) and select the `/dist` directory.





# Do give a star and support us
