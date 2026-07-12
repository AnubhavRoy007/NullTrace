const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

function deriveKey(passphrase, salt, info) {
  return crypto.pbkdf2Sync(passphrase, salt + info, 120000, KEY_LEN, 'sha512');
}

function aesEncrypt(plaintext, key) {
  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function aesDecrypt(blob, key, asString = false) {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return asString ? out.toString('utf8') : out;
}

function xorLayer(buf, key) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key[i % key.length];
  }
  return out;
}

function shuffleBase64(buf) {
  const b64 = buf.toString('base64');
  const map = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210+/';
  const std = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  return [...b64].map((c) => (c === '=' ? '=' : map[std.indexOf(c)])).join('');
}

function unshuffleBase64(str) {
  const map = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210+/';
  const std = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b64 = [...str].map((c) => (c === '=' ? '=' : std[map.indexOf(c)])).join('');
  return Buffer.from(b64, 'base64');
}

function rotLayer(text, shift) {
  return [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + shift) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + shift) % 26) + 97);
    return ch;
  }).join('');
}

function reverseBuffer(buf) {
  return Buffer.from(buf).reverse();
}

/**
 * 7-layer encryption stack (encrypt order L1→L7, decrypt L7→L1)
 * L1: PBKDF2 key derivation envelope
 * L2: AES-256-GCM
 * L3: XOR stream with derived key
 * L4: AES-256-GCM (second key)
 * L5: Custom base64 alphabet shuffle
 * L6: ROT cipher on shuffled payload
 * L7: Reverse bytes + final AES-256-GCM seal
 */
function encrypt7Layers(plaintext, passphrase) {
  const salt = crypto.randomBytes(16).toString('hex');
  const k1 = deriveKey(passphrase, salt, 'layer1');
  const k2 = deriveKey(passphrase, salt, 'layer2');
  const kXor = deriveKey(passphrase, salt, 'xor');
  const k7 = deriveKey(passphrase, salt, 'layer7');

  let data = Buffer.from(plaintext, 'utf8');

  // Layer 1: initial AES
  data = aesEncrypt(data, k1);

  // Layer 2: XOR obfuscation
  data = xorLayer(data, kXor);

  // Layer 3: second AES
  data = aesEncrypt(data, k2);

  // Layer 4: byte reversal
  data = reverseBuffer(data);

  // Layer 5: shuffled base64 encoding
  const shuffled = shuffleBase64(data);

  // Layer 6: ROT on string
  const rot = rotLayer(shuffled, 7);

  // Layer 7: final AES seal
  const sealed = aesEncrypt(Buffer.from(rot, 'utf8'), k7);

  return {
    salt,
    payload: sealed.toString('base64'),
    version: 1,
  };
}

function decrypt7Layers(encrypted, passphrase) {
  const { salt, payload } = encrypted;
  const k1 = deriveKey(passphrase, salt, 'layer1');
  const k2 = deriveKey(passphrase, salt, 'layer2');
  const kXor = deriveKey(passphrase, salt, 'xor');
  const k7 = deriveKey(passphrase, salt, 'layer7');

  let rot = aesDecrypt(Buffer.from(payload, 'base64'), k7, true);

  // Layer 6
  let shuffled = rotLayer(rot, 26 - 7);

  // Layer 5
  let data = unshuffleBase64(shuffled);

  // Layer 4
  data = reverseBuffer(data);

  // Layer 3
  data = aesDecrypt(data, k2);

  // Layer 2
  data = xorLayer(data, kXor);

  // Layer 1
  return aesDecrypt(data, k1, true);
}

module.exports = { encrypt7Layers, decrypt7Layers };
