/* ═══════════════════════════════════════════ */
/* Mise a jour automatique (bandeau) */
/* ═══════════════════════════════════════════ */

// ========== AUTO-UPDATE ==========
let updatePollInterval = null;

async function checkForUpdates() {
  try {
    const data = await api('/check-update');
    
    if (data.status === 'available') {
      showUpdateBanner('available', data);
    } else if (data.status === 'downloading') {
      showUpdateBanner('downloading', data);
    } else if (data.status === 'ready') {
      showUpdateBanner('ready', data);
    } else if (data.status === 'idle' || data.status === 'checking') {
      // Verification pas encore terminee cote Electron : on continue d'interroger.
    } else {
      // A jour, erreur, ou statut absent (mode navigateur "npm start", qui
      // n'expose pas electron-updater) : on retire le bandeau et on arrete
      // d'interroger, au lieu de solliciter GitHub toutes les 10 s.
      const existing = document.getElementById('update-banner');
      if (existing) existing.remove();
      stopUpdatePolling();
    }
  } catch (e) {
    // Silently ignore
  }
}

function stopUpdatePolling() {
  clearInterval(updatePollInterval);
  updatePollInterval = null;
}

// "Plus tard" : on arrete aussi l'interrogation, sinon le controle suivant
// (10 s plus tard) recreait aussitot le bandeau. Il reapparaitra au
// prochain lancement de l'application.
function dismissUpdateBanner() {
  const existing = document.getElementById('update-banner');
  if (existing) existing.remove();
  stopUpdatePolling();
}

function showUpdateBanner(state, data) {
  let existing = document.getElementById('update-banner');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'update-banner';
    document.body.prepend(existing);
  }

  const version = data.info ? data.info.version : '';
  const current = data.current || '';

  if (state === 'available') {
    existing.innerHTML = `<div class="update-banner-content">
      <div class="update-banner-text">
        <strong>Nouvelle version disponible : v${esc(version)}</strong>
        <span>Vous utilisez la v${esc(current)}</span>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="downloadUpdate()">Mettre a jour</button>
        <button class="btn btn-secondary btn-sm" onclick="dismissUpdateBanner()">Plus tard</button>
      </div>
    </div>`;
  } else if (state === 'downloading') {
    const pct = data.progress ? data.progress.percent : 0;
    existing.innerHTML = `<div class="update-banner-content">
      <div class="update-banner-text">
        <strong>Telechargement de la v${esc(version)}...</strong>
        <span>${pct}% termine</span>
      </div>
      <div class="update-progress-bar"><div class="update-progress-fill" style="width:${pct}%"></div></div>
    </div>`;
  } else if (state === 'ready') {
    existing.innerHTML = `<div class="update-banner-content">
      <div class="update-banner-text">
        <strong>v${esc(version)} prete !</strong>
        <span>Redemarrez pour appliquer la mise a jour</span>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="installUpdate()">Redemarrer maintenant</button>
        <button class="btn btn-secondary btn-sm" onclick="dismissUpdateBanner()">Plus tard</button>
      </div>
    </div>`;
    stopUpdatePolling();
  }
}

async function downloadUpdate() {
  try {
    await api('/download-update', 'POST');
    // Start polling for progress
    if (!updatePollInterval) {
      updatePollInterval = setInterval(checkForUpdates, 1500);
    }
  } catch (e) {
    toast('Erreur de telechargement', 'error');
  }
}

async function installUpdate() {
  try {
    await api('/install-update', 'POST');
    // App will quit and restart
  } catch (e) {
    toast('Erreur d\'installation', 'error');
  }
}
