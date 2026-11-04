var electron = require('electron');
var appElectron = electron.app;
var BrowserWindow = electron.BrowserWindow;
var dialog = electron.dialog;
var Menu = electron.Menu;
var ipcMain = electron.ipcMain;
var path = require('path');
var expressLib = require('express');
var dbLayer = require('./db');
var apiLib = require('./api');

var PORT = 3847;
var mainWindow = null;
var httpServer = null;

// ========== AUTO-UPDATER ==========
var autoUpdater = null;
var updateStatus = { status: 'idle', info: null, error: null, progress: null };

function initAutoUpdater() {
  try {
    autoUpdater = require('electron-updater').autoUpdater;

    // Do not auto-download, let us control flow
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', function() {
      console.log('[Updater] Checking for update...');
      updateStatus = { status: 'checking', info: null, error: null, progress: null };
    });

    autoUpdater.on('update-available', function(info) {
      console.log('[Updater] Update available:', info.version);
      updateStatus = { status: 'available', info: { version: info.version, releaseNotes: info.releaseNotes || '' }, error: null, progress: null };
    });

    autoUpdater.on('update-not-available', function(info) {
      console.log('[Updater] Up to date:', info.version);
      updateStatus = { status: 'up-to-date', info: { version: info.version }, error: null, progress: null };
    });

    autoUpdater.on('download-progress', function(progress) {
      updateStatus = { status: 'downloading', info: updateStatus.info, error: null, progress: { percent: Math.round(progress.percent), speed: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total } };
    });

    autoUpdater.on('update-downloaded', function(info) {
      console.log('[Updater] Update downloaded:', info.version);
      updateStatus = { status: 'ready', info: { version: info.version, releaseNotes: info.releaseNotes || '' }, error: null, progress: null };
    });

    autoUpdater.on('error', function(err) {
      console.log('[Updater] Error:', err.message);
      updateStatus = { status: 'error', info: null, error: err.message, progress: null };
    });

    // Check after a delay
    setTimeout(function() {
      autoUpdater.checkForUpdates().catch(function(e) {
        console.log('[Updater] Check failed:', e.message);
      });
    }, 5000);

  } catch (e) {
    console.log('[Updater] Not available:', e.message);
  }
}

// ========== PATH RESOLUTION ==========
function getPublicPath() {
  return path.join(__dirname, 'public');
}

function getDBPath() {
  if (appElectron.isPackaged) {
    return path.join(appElectron.getPath('userData'), 'maraichage.db');
  }
  return path.join(__dirname, 'maraichage.db');
}

// ========== EXPRESS SERVER ==========
function startServer() {
  return new Promise(function(resolve, reject) {
    var srv = expressLib();
    srv.use(expressLib.json({ limit: '50mb' }));
    srv.use(expressLib.static(getPublicPath()));
    srv.use('/api', apiLib.createApiRouter());

    // --- VERSION & UPDATE (specifique Electron : pilote electron-updater) ---
    var APP_VERSION = require('./package.json').version;

    srv.get('/api/check-update', function(req, res) {
      res.json({ current: APP_VERSION, status: updateStatus.status, info: updateStatus.info, error: updateStatus.error, progress: updateStatus.progress });
    });

    srv.post('/api/download-update', function(req, res) {
      if (autoUpdater && updateStatus.status === 'available') {
        autoUpdater.downloadUpdate().catch(function(e) { console.error('Download error:', e); });
        res.json({ success: true, message: 'Telechargement lance' });
      } else {
        res.json({ success: false, message: 'Pas de mise a jour disponible' });
      }
    });

    srv.post('/api/install-update', function(req, res) {
      if (autoUpdater && updateStatus.status === 'ready') {
        res.json({ success: true, message: 'Installation en cours...' });
        setTimeout(function() { autoUpdater.quitAndInstall(false, true); }, 1000);
      } else {
        res.json({ success: false, message: 'Mise a jour non prete' });
      }
    });

    srv.use(apiLib.apiErrorHandler);

    // --- LISTEN ---
    httpServer = srv.listen(PORT, '127.0.0.1', function() {
      console.log('Server OK on port ' + PORT);
      resolve();
    });
    httpServer.on('error', function(err) { reject(err); });
  });
}

// ========== ELECTRON WINDOW ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    title: 'Maraichage Manager',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#F7F5F0',
    show: false
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Fichier', submenu: [
      { label: 'Recharger', accelerator: 'CmdOrCtrl+R', click: function() { mainWindow.reload(); } },
      { type: 'separator' },
      { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: function() { appElectron.quit(); } }
    ]},
    { label: 'Edition', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ]},
    { label: 'Affichage', submenu: [
      { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: function() { mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5); } },
      { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: function() { mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5); } },
      { label: 'Zoom 100%', accelerator: 'CmdOrCtrl+0', click: function() { mainWindow.webContents.setZoomLevel(0); } },
      { type: 'separator' },
      { label: 'Plein ecran', accelerator: 'F11', click: function() { mainWindow.setFullScreen(!mainWindow.isFullScreen()); } },
      { type: 'separator' },
      { label: 'DevTools', accelerator: 'F12', click: function() { mainWindow.webContents.toggleDevTools(); } }
    ]}
  ]));

  mainWindow.loadURL('http://127.0.0.1:' + PORT);
  mainWindow.once('ready-to-show', function() { mainWindow.show(); });
  mainWindow.on('closed', function() { mainWindow = null; });
}

// ========== APP LIFECYCLE ==========
appElectron.whenReady().then(function() {
  dbLayer.initDB(getDBPath()).then(function() {
    return startServer();
  }).then(function() {
    createWindow();
    initAutoUpdater();
  }).catch(function(err) {
    dialog.showErrorBox('Erreur', String(err.message || err));
    appElectron.quit();
  });
});

appElectron.on('window-all-closed', function() {
  if (httpServer) httpServer.close();
  appElectron.quit();
});

appElectron.on('activate', function() {
  if (mainWindow === null) createWindow();
});
