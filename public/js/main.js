/* ═══════════════════════════════════════════ */
/* Demarrage de l'application */
/* ═══════════════════════════════════════════ */

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  navigate('dashboard');
  // Load version
  api('/version').then(data => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = 'v' + data.version;
  }).catch(() => {});
  // Check for updates after delay, then poll occasionally
  setTimeout(function() {
    checkForUpdates();
    updatePollInterval = setInterval(checkForUpdates, 10000);
  }, 3000);
});
