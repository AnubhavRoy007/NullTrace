import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'extension');
const destDir = path.join(__dirname, 'dist');

console.log('Building NullTrace 2.0 extension...');

// Clean dest
if (fs.existsSync(destDir)) {
  console.log('Cleaning old build...');
  fs.rmSync(destDir, { recursive: true, force: true });
}

// Copy extension to dist
console.log('Copying extension files...');
fs.mkdirSync(destDir);
fs.cpSync(srcDir, destDir, { recursive: true });

console.log('Build completed! Output is in the "dist" directory.');
