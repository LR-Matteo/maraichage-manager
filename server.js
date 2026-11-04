const express = require('express');
const path = require('path');
const dbLayer = require('./db');
const { createApiRouter, apiErrorHandler } = require('./api');

const app = express();
const PORT = 3847;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'maraichage.db');

app.use('/api', createApiRouter());

// ========== VERSION & UPDATE (mode navigateur uniquement) ==========
// NB: ce endpoint n'est utilise qu'en mode "npm start" (hors Electron).
// L'application packagee (main.js) gere ses mises a jour via electron-updater
// et la config "publish" de package.json, independamment de ce endpoint.
const APP_VERSION = require('./package.json').version;
const pkg = require('./package.json');
const UPDATE_URL = `https://raw.githubusercontent.com/${pkg.build.publish.owner}/${pkg.build.publish.repo}/main/update.json`;

app.get('/api/check-update', (req, res) => {
  const https = require('https');

  https.get(UPDATE_URL, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        const remote = JSON.parse(data);
        const hasUpdate = compareVersions(remote.version, APP_VERSION) > 0;
        res.json({
          current: APP_VERSION,
          latest: remote.version,
          hasUpdate,
          downloadUrl: remote.downloadUrl || '',
          changelog: remote.changelog || ''
        });
      } catch (e) {
        res.json({ current: APP_VERSION, latest: APP_VERSION, hasUpdate: false, error: 'Impossible de verifier' });
      }
    });
  }).on('error', () => {
    res.json({ current: APP_VERSION, latest: APP_VERSION, hasUpdate: false, error: 'Pas de connexion' });
  });
});

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

app.use(apiErrorHandler);

// ========== START ==========
dbLayer.initDB(DB_PATH).then(() => {
  app.listen(PORT, () => {
    console.log(`\n  ================================================`);
    console.log(`   Maraichage Manager`);
    console.log(`   Application demarree avec succes !`);
    console.log(`   Ouvrez: http://localhost:${PORT}`);
    console.log(`  ================================================\n`);

    // Auto-open browser only when NOT running under Electron
    if (!process.env.ELECTRON_MODE) {
      const { exec } = require('child_process');
      const url = `http://localhost:${PORT}`;
      switch (process.platform) {
        case 'win32': exec(`start ${url}`); break;
        case 'darwin': exec(`open ${url}`); break;
        default: exec(`xdg-open ${url}`); break;
      }
    }
  });
}).catch(err => {
  console.error('Erreur au demarrage de la base de donnees:', err);
  process.exit(1);
});
