/** 21 encryption transforms — all run client-side only. */
const B64_MAP = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210+/';
const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const LAYER_NAMES = {
  1: 'AES-256-GCM',
  2: 'XOR stream',
  3: 'AES-256-GCM (K2)',
  4: 'Byte reverse',
  5: 'Shuffled Base64',
  6: 'ROT-7',
  7: 'ROT-13',
  8: 'Pair swap',
  9: 'AES-256-GCM (K3)',
  10: 'Nibble swap',
  11: 'ROT-11',
  12: 'Bit invert',
  13: 'UTF-8 reverse',
  14: 'Block reverse (8B)',
  15: 'AES-256-GCM (K4)',
  16: 'Half swap',
  17: 'Constant XOR',
  18: 'Base64 encode',
  19: 'ROT-19',
  20: 'Matrix transpose',
  21: 'Final AES seal',
};
function bytesToString(buf) {
  let str = '';
  for (let i = 0; i < buf.length; i++) {
    str += String.fromCharCode(buf[i]);
  }
  return str;
}

function stringToBytes(str) {
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    buf[i] = str.charCodeAt(i);
  }
  return buf;
}

function rotText(text, shift) {
  return [...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCharCode(((c - 65 + shift) % 26) + 65);
    if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 + shift) % 26) + 97);
    return ch;
  }).join('');
}

function shuffleB64(buf) {
  const b64 = btoa(String.fromCharCode(...buf));
  return new TextEncoder().encode(
    [...b64].map((c) => (c === '=' ? '=' : B64_MAP[B64_STD.indexOf(c)])).join('')
  );
}

function unshuffleB64(buf) {
  const str = new TextDecoder().decode(buf);
  const b64 = [...str].map((c) => (c === '=' ? '=' : B64_STD[B64_MAP.indexOf(c)])).join('');
  const bin = atob(b64);
  return new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
}

async function aesEncrypt(buf, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, buf));
  const out = new Uint8Array(12 + enc.length);
  out.set(iv, 0);
  out.set(enc, 12);
  return out;
}

async function aesDecrypt(buf, key) {
  const iv = buf.slice(0, 12);
  const data = buf.slice(12);
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, data));
}

function xorBuf(buf, key) {
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

const LAYER_OPS = {
  1: {
    enc: (b, k) => aesEncrypt(b, k.keys[1]),
    dec: (b, k) => aesDecrypt(b, k.keys[1]),
  },
  2: {
    enc: (b, k) => xorBuf(b, k.keys.xor),
    dec: (b, k) => xorBuf(b, k.keys.xor),
  },
  3: {
    enc: (b, k) => aesEncrypt(b, k.keys[3]),
    dec: (b, k) => aesDecrypt(b, k.keys[3]),
  },
  4: {
    enc: (b) => b.slice().reverse(),
    dec: (b) => b.slice().reverse(),
  },
  5: {
    enc: (b) => shuffleB64(b),
    dec: (b) => unshuffleB64(b),
  },
  6: {
    enc: (b) => stringToBytes(rotText(bytesToString(b), 7)),
    dec: (b) => stringToBytes(rotText(bytesToString(b), 19)),
  },
  7: {
    enc: (b) => stringToBytes(rotText(bytesToString(b), 13)),
    dec: (b) => stringToBytes(rotText(bytesToString(b), 13)),
  },
  8: {
    enc: (b) => {
      const o = b.slice();
      for (let i = 0; i + 1 < o.length; i += 2) [o[i], o[i + 1]] = [o[i + 1], o[i]];
      return o;
    },
    dec: (b) => LAYER_OPS[8].enc(b),
  },
  9: {
    enc: (b, k) => aesEncrypt(b, k.keys[9]),
    dec: (b, k) => aesDecrypt(b, k.keys[9]),
  },
  10: {
    enc: (b) => {
      const o = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) o[i] = ((b[i] & 0x0f) << 4) | ((b[i] & 0xf0) >> 4);
      return o;
    },
    dec: (b) => LAYER_OPS[10].enc(b),
  },
  11: {
    enc: (b) => stringToBytes(rotText(bytesToString(b), 11)),
    dec: (b) => stringToBytes(rotText(bytesToString(b), 15)),
  },
  12: {
    enc: (b) => {
      const o = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) o[i] = b[i] ^ 0xff;
      return o;
    },
    dec: (b) => LAYER_OPS[12].enc(b),
  },
  13: {
    enc: (b) => stringToBytes([...bytesToString(b)].reverse().join('')),
    dec: (b) => LAYER_OPS[13].enc(b),
  },
  14: {
    enc: (b) => {
      const size = 8;
      const o = b.slice();
      for (let i = 0; i + size <= o.length; i += size) o.subarray(i, i + size).reverse();
      return o;
    },
    dec: (b) => LAYER_OPS[14].enc(b),
  },
  15: {
    enc: (b, k) => aesEncrypt(b, k.keys[15]),
    dec: (b, k) => aesDecrypt(b, k.keys[15]),
  },
  16: {
    enc: (b) => {
      const mid = Math.floor(b.length / 2);
      const o = new Uint8Array(b.length);
      o.set(b.subarray(mid), 0);
      o.set(b.subarray(0, mid), b.length - mid);
      return o;
    },
    dec: (b) => {
      const mid = Math.ceil(b.length / 2);
      const o = new Uint8Array(b.length);
      o.set(b.subarray(mid), 0);
      o.set(b.subarray(0, mid), b.length - mid);
      return o;
    },
  },
  17: {
    enc: (b) => xorBuf(b, new Uint8Array([0xa5, 0x5a, 0xc3, 0x3c])),
    dec: (b) => LAYER_OPS[17].enc(b),
  },
  18: {
    enc: (b) => stringToBytes(btoa(bytesToString(b))),
    dec: (b) => stringToBytes(atob(bytesToString(b))),
  },
  19: {
    enc: (b) => stringToBytes(rotText(bytesToString(b), 19)),
    dec: (b) => stringToBytes(rotText(bytesToString(b), 7)),
  },
  20: {
    enc: (b) => {
      const cols = 4;
      const pad = cols - (b.length % cols);
      const padded = new Uint8Array(b.length + pad);
      padded.set(b);
      padded.fill(pad, b.length);
      const rows = padded.length / cols;
      const o = new Uint8Array(padded.length);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) o[c * rows + r] = padded[r * cols + c];
      return o;
    },
    dec: (b) => {
      const cols = 4;
      const rows = b.length / cols;
      const o = new Uint8Array(b.length);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) o[r * cols + c] = b[c * rows + r];
      const pad = o[o.length - 1];
      if (pad > 0 && pad <= cols) {
        let valid = true;
        for (let i = o.length - pad; i < o.length; i++) {
          if (o[i] !== pad) {
            valid = false;
            break;
          }
        }
        if (valid) return o.subarray(0, o.length - pad);
      }
      return o;
    },
  },
  21: {
    enc: (b, k) => aesEncrypt(b, k.keys[21]),
    dec: (b, k) => aesDecrypt(b, k.keys[21]),
  },
};

export async function applyLayer(id, buf, keyMaterial, direction) {
  const op = LAYER_OPS[id];
  if (!op) throw new Error(`Unknown layer ${id}`);
  return direction === 'enc' ? op.enc(buf, keyMaterial) : op.dec(buf, keyMaterial);
}
