import { webcrypto } from 'crypto';
import { applyLayer } from '../extension/lib/layers.js';

// Setup WebCrypto for Node environment if needed
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Mock chrome storage BEFORE importing the modules
let mockStorage = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => mockStorage,
      set: async (obj) => {
        mockStorage = { ...mockStorage, ...obj };
      }
    }
  }
};

// Now import the cryptovault modules
const { encryptVault, decryptVault, decryptHistoryBatch } = await import('../extension/lib/crypto-vault.js');

function toBase64(buf) {
  return btoa(String.fromCharCode(...buf));
}

// Replicate legacy key derivation for mock generation
async function deriveKeyLegacy(passphrase, salt, info) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt + info),
      iterations: 120000,
      hash: 'SHA-512',
    },
    base,
    256
  );
  return new Uint8Array(bits);
}

async function createLegacyV2Blob(plaintext, passphrase) {
  const salt = '1234567890abcdef1234567890abcdef'; // Fixed salt for mock
  const stack = [1, 4, 12, 17, 21]; // Standard test stack containing some layers
  
  const keys = {};
  for (const n of [1, 3, 9, 15, 21, 'xor']) {
    keys[n] = await deriveKeyLegacy(passphrase, salt, `layer-${n}`);
  }
  const keyMaterial = { keys };

  let data = new TextEncoder().encode(plaintext);
  for (const layerId of stack) {
    data = await applyLayer(layerId, data, keyMaterial, 'enc');
  }

  return {
    v: 2,
    salt,
    stack,
    payload: toBase64(data)
  };
}

async function runTests() {
  console.log('Running NullTrace 2.0 Cryptography tests...');
  let failed = false;

  const assert = (condition, message) => {
    if (!condition) {
      console.error(`  FAIL: ${message}`);
      failed = true;
    } else {
      console.log(`  PASS: ${message}`);
    }
  };

  const passphrase = 'test-secure-passphrase';
  const query = 'secret data to encrypt';

  // Test 1: V3 Round-trip encrypt/decrypt
  try {
    const encrypted = await encryptVault(query, passphrase);
    assert(encrypted.v === 3, 'Encrypted blob version is 3');
    assert(encrypted.iv !== undefined, 'Encrypted blob contains IV');
    assert(encrypted.payload !== undefined, 'Encrypted blob contains payload');

    const decrypted = await decryptVault(encrypted, passphrase);
    assert(decrypted === query, 'V3 Round-trip decrypted matches plaintext');
  } catch (err) {
    assert(false, `V3 Round-trip encryption failed: ${err.message}`);
  }

  // Test 2: Tamper detection (modified payload should fail decrypt)
  try {
    const encrypted = await encryptVault(query, passphrase);
    const tamperedPayload = encrypted.payload.slice(0, -4) + 'AAAA';
    const tamperedBlob = { ...encrypted, payload: tamperedPayload };
    
    let threw = false;
    try {
      await decryptVault(tamperedBlob, passphrase);
    } catch {
      threw = true;
    }
    assert(threw, 'Decryption of tampered ciphertext fails (Tamper Detection)');
  } catch (err) {
    assert(false, `Tamper detection test errored: ${err.message}`);
  }

  // Test 3: Wrong passphrase handling (should fail decrypt)
  try {
    const encrypted = await encryptVault(query, passphrase);
    let threw = false;
    try {
      await decryptVault(encrypted, 'wrong-password');
    } catch {
      threw = true;
    }
    assert(threw, 'Decryption with incorrect passphrase fails');
  } catch (err) {
    assert(false, `Wrong passphrase test errored: ${err.message}`);
  }

  // Test 4: Legacy decryption and on-the-fly migration to V3
  try {
    const legacyBlob = await createLegacyV2Blob(query, passphrase);
    
    // Decrypt directly using legacy fallback
    const decryptedLegacy = await decryptVault(legacyBlob, passphrase);
    assert(decryptedLegacy === query, 'Legacy fallback decrypts V2 blob successfully');

    // Run decryptHistoryBatch to test migration triggers
    mockStorage = { cv_history: [{ id: 'test-id', encrypted: legacyBlob, timestamp: Date.now() }] };
    
    const results = await decryptHistoryBatch(mockStorage.cv_history, passphrase);
    assert(results[0].query === query, 'Batch decryption recovers plaintext from legacy blob');
    
    // Check if the history has been migrated to v3 in storage
    const migratedHistory = mockStorage.cv_history;
    assert(migratedHistory[0].encrypted.v === 3, 'Legacy entry was successfully migrated to V3 in storage');
    assert(migratedHistory[0].encrypted.iv !== undefined, 'Migrated entry has IV');
    
    // Check that we can decrypt the migrated entry directly
    const decryptedMigrated = await decryptVault(migratedHistory[0].encrypted, passphrase);
    assert(decryptedMigrated === query, 'Migrated V3 entry can be decrypted directly');
  } catch (err) {
    assert(false, `Legacy migration test failed: ${err.message}`);
  }

  if (failed) {
    console.error('\nTests failed.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
