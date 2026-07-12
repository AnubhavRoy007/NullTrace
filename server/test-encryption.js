const { encrypt7Layers, decrypt7Layers } = require('./encryption');

const pass = 'hackathon-vault';
const query = 'how does 7 layer encryption work';

const enc = encrypt7Layers(query, pass);
const dec = decrypt7Layers(enc, pass);

if (dec !== query) {
  console.error('FAIL', { dec, query });
  process.exit(1);
}
console.log('OK — 7-layer round-trip passed');
console.log('Encrypted payload length:', enc.payload.length);
