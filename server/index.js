const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3847;
const HOST = '127.0.0.1';

app.use(cors({ origin: [/chrome-extension:\/\//, /moz-extension:\/\//, 'null'] }));

/** Zero-knowledge: this server never receives queries, passphrases, or history. */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'NullTrace',
    zeroKnowledge: true,
    message: 'Encryption runs only in your browser. Creators cannot read your history.',
  });
});

app.get('/demo', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'demo', 'pitch.html'));
});

app.use('/demo', express.static(path.join(__dirname, '..', 'demo')));

function launchGuestBrowser(url) {
  const platform = process.platform;
  let cmd = '';

  if (platform === 'win32') {
    cmd = `start chrome --guest "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open -a "Google Chrome" --args --guest "${url}"`;
  } else {
    cmd = `google-chrome --guest "${url}"`;
  }

  exec(cmd, (error) => {
    if (error) {
      console.log('Failed to open Chrome in guest mode. Opening default browser...');
      if (platform === 'win32') {
        exec(`start "" "${url}"`);
      } else if (platform === 'darwin') {
        exec(`open "${url}"`);
      } else {
        exec(`xdg-open "${url}"`);
      }
    }
  });
}

const server = app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/demo`;
  console.log(`NullTrace server (zero-knowledge) at ${url}`);
  console.log('No encrypt/decrypt APIs — user data never touches this process.');
  console.log('Opening a new browser in guest mode...');
  launchGuestBrowser(url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error('Server is probably already running — open http://127.0.0.1:3847/demo');
    console.error('Or close the other server window and try again.\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
