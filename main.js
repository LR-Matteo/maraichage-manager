var electron = require('electron');
var appElectron = electron.app;
var BrowserWindow = electron.BrowserWindow;
var dialog = electron.dialog;
var Menu = electron.Menu;
var ipcMain = electron.ipcMain;
var path = require('path');
var expressLib = require('express');
var fs = require('fs');
var initSqlJs = require('sql.js');

var PORT = 3847;
var mainWindow = null;
var db = null;
var SQL = null;
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

// ========== DATABASE ==========
function saveDB() {
  var data = db.export();
  var buffer = Buffer.from(data);
  fs.writeFileSync(getDBPath(), buffer);
}

function query(sql, params) {
  if (!params) params = [];
  var stmt = db.prepare(sql);
  stmt.bind(params);
  var results = [];
  while (stmt.step()) { results.push(stmt.getAsObject()); }
  stmt.free();
  return results;
}

function run(sql, params) {
  if (!params) params = [];
  var safeParams = params.map(function(p) { return p === undefined ? null : p; });
  db.run(sql, safeParams);
  var res = db.exec("SELECT last_insert_rowid()");
  var lastId = res.length > 0 ? res[0].values[0][0] : 0;
  var changes = db.getRowsModified();
  saveDB();
  return { changes: changes, lastId: lastId };
}

async function initDB() {
  SQL = await initSqlJs();
  var dbPath = getDBPath();
  console.log('DB path:', dbPath);

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  } else {
    db = new SQL.Database();
  }

  db.run("CREATE TABLE IF NOT EXISTS produits (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, prix REAL NOT NULL, unite TEXT NOT NULL CHECK(unite IN ('kg', 'unite')), created_at TEXT DEFAULT (datetime('now')))");
  db.run("CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, telephone TEXT, email TEXT, created_at TEXT DEFAULT (datetime('now')))");
  db.run("CREATE TABLE IF NOT EXISTS commandes (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, date_commande TEXT NOT NULL, prix_total REAL NOT NULL DEFAULT 0, prix_manuel REAL, livraison TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES clients(id))");
  db.run("CREATE TABLE IF NOT EXISTS commande_lignes (id INTEGER PRIMARY KEY AUTOINCREMENT, commande_id INTEGER NOT NULL, produit_id INTEGER NOT NULL, quantite REAL NOT NULL, prix_unitaire REAL NOT NULL, prix_ligne REAL NOT NULL, FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE, FOREIGN KEY (produit_id) REFERENCES produits(id))");
  db.run("CREATE TABLE IF NOT EXISTS depenses (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, date_depense TEXT NOT NULL, prix REAL NOT NULL, categorie TEXT, created_at TEXT DEFAULT (datetime('now')))");

  saveDB();
  console.log('DB initialized');
}

// ========== EXPRESS SERVER ==========
function startServer() {
  return new Promise(function(resolve, reject) {
    var srv = expressLib();
    srv.use(expressLib.json({ limit: '50mb' }));
    srv.use(expressLib.static(getPublicPath()));

    // --- PRODUITS ---
    srv.get('/api/produits', function(req, res) { res.json(query('SELECT * FROM produits ORDER BY nom')); });
    srv.post('/api/produits', function(req, res) {
      var b = req.body;
      if (!b.nom || b.prix == null || !b.unite) return res.status(400).json({ error: 'Champs requis' });
      var r = run('INSERT INTO produits (nom, prix, unite) VALUES (?, ?, ?)', [b.nom, b.prix, b.unite]);
      res.json({ id: r.lastId, nom: b.nom, prix: b.prix, unite: b.unite });
    });
    srv.put('/api/produits/:id', function(req, res) {
      var b = req.body;
      run('UPDATE produits SET nom=?, prix=?, unite=? WHERE id=?', [b.nom, b.prix, b.unite, req.params.id]);
      res.json({ success: true });
    });
    srv.delete('/api/produits/:id', function(req, res) { run('DELETE FROM produits WHERE id=?', [req.params.id]); res.json({ success: true }); });

    // --- CLIENTS ---
    srv.get('/api/clients', function(req, res) { res.json(query('SELECT * FROM clients ORDER BY nom')); });
    srv.post('/api/clients', function(req, res) {
      var b = req.body;
      if (!b.nom) return res.status(400).json({ error: 'Nom requis' });
      var r = run('INSERT INTO clients (nom, telephone, email) VALUES (?, ?, ?)', [b.nom, b.telephone || null, b.email || null]);
      res.json({ id: r.lastId, nom: b.nom, telephone: b.telephone, email: b.email });
    });
    srv.put('/api/clients/:id', function(req, res) {
      var b = req.body;
      run('UPDATE clients SET nom=?, telephone=?, email=? WHERE id=?', [b.nom, b.telephone || null, b.email || null, req.params.id]);
      res.json({ success: true });
    });
    srv.delete('/api/clients/:id', function(req, res) { run('DELETE FROM clients WHERE id=?', [req.params.id]); res.json({ success: true }); });

    // --- COMMANDES ---
    srv.get('/api/commandes', function(req, res) {
      var commandes = query('SELECT c.*, cl.nom as client_nom FROM commandes c JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC');
      for (var i = 0; i < commandes.length; i++) {
        commandes[i].lignes = query('SELECT cl.*, p.nom as produit_nom, p.unite as produit_unite FROM commande_lignes cl JOIN produits p ON cl.produit_id = p.id WHERE cl.commande_id = ?', [commandes[i].id]);
      }
      res.json(commandes);
    });
    srv.post('/api/commandes', function(req, res) {
      var b = req.body;
      if (!b.client_id || !b.date_commande || !b.lignes || b.lignes.length === 0) return res.status(400).json({ error: 'Champs requis' });
      var prix = 0;
      for (var i = 0; i < b.lignes.length; i++) prix += b.lignes[i].quantite * b.lignes[i].prix_unitaire;
      var fp = b.prix_manuel != null ? b.prix_manuel : prix;
      var r = run('INSERT INTO commandes (client_id, date_commande, prix_total, prix_manuel, livraison) VALUES (?, ?, ?, ?, ?)', [b.client_id, b.date_commande, fp, b.prix_manuel, b.livraison || null]);
      for (var j = 0; j < b.lignes.length; j++) {
        var l = b.lignes[j];
        run('INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, prix_ligne) VALUES (?, ?, ?, ?, ?)', [r.lastId, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]);
      }
      res.json({ id: r.lastId, prix_total: fp });
    });
    srv.put('/api/commandes/:id', function(req, res) {
      var b = req.body;
      var prix = 0;
      for (var i = 0; i < b.lignes.length; i++) prix += b.lignes[i].quantite * b.lignes[i].prix_unitaire;
      var fp = b.prix_manuel != null ? b.prix_manuel : prix;
      run('UPDATE commandes SET client_id=?, date_commande=?, prix_total=?, prix_manuel=?, livraison=? WHERE id=?', [b.client_id, b.date_commande, fp, b.prix_manuel, b.livraison || null, req.params.id]);
      run('DELETE FROM commande_lignes WHERE commande_id=?', [req.params.id]);
      for (var j = 0; j < b.lignes.length; j++) {
        var l = b.lignes[j];
        run('INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, prix_ligne) VALUES (?, ?, ?, ?, ?)', [req.params.id, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]);
      }
      res.json({ success: true });
    });
    srv.delete('/api/commandes/:id', function(req, res) {
      run('DELETE FROM commande_lignes WHERE commande_id=?', [req.params.id]);
      run('DELETE FROM commandes WHERE id=?', [req.params.id]);
      res.json({ success: true });
    });

    // --- DEPENSES ---
    srv.get('/api/depenses', function(req, res) { res.json(query('SELECT * FROM depenses ORDER BY date_depense DESC')); });
    srv.post('/api/depenses', function(req, res) {
      var b = req.body;
      if (!b.nom || !b.date_depense || b.prix == null) return res.status(400).json({ error: 'Champs requis' });
      var r = run('INSERT INTO depenses (nom, date_depense, prix, categorie) VALUES (?, ?, ?, ?)', [b.nom, b.date_depense, b.prix, b.categorie || null]);
      res.json({ id: r.lastId });
    });
    srv.put('/api/depenses/:id', function(req, res) {
      var b = req.body;
      run('UPDATE depenses SET nom=?, date_depense=?, prix=?, categorie=? WHERE id=?', [b.nom, b.date_depense, b.prix, b.categorie || null, req.params.id]);
      res.json({ success: true });
    });
    srv.delete('/api/depenses/:id', function(req, res) { run('DELETE FROM depenses WHERE id=?', [req.params.id]); res.json({ success: true }); });

    // --- STATS ---
    srv.get('/api/stats/dashboard', function(req, res) {
      var d = req.query.debut, f = req.query.fin, df = '', dfd = '', p = [], pd = [];
      if (d && f) { df = ' WHERE c.date_commande BETWEEN ? AND ?'; dfd = ' WHERE d.date_depense BETWEEN ? AND ?'; p.push(d, f); pd.push(d, f); }
      var ca = query('SELECT COALESCE(SUM(c.prix_total), 0) as total FROM commandes c' + df, p);
      var dep = query('SELECT COALESCE(SUM(d.prix), 0) as total FROM depenses d' + dfd, pd);
      var nc = query('SELECT COUNT(*) as total FROM commandes c' + df, p);
      var ncl = query('SELECT COUNT(DISTINCT client_id) as total FROM commandes c' + df, p);
      var pm = query('SELECT COALESCE(AVG(c.prix_total), 0) as total FROM commandes c' + df, p);
      res.json({ chiffre_affaires: ca[0].total, depenses: dep[0].total, benefice: ca[0].total - dep[0].total, nb_commandes: nc[0].total, nb_clients_actifs: ncl[0].total, panier_moyen: pm[0].total });
    });

    srv.get('/api/stats/top-clients', function(req, res) {
      var d = req.query.debut, f = req.query.fin, lim = parseInt(req.query.limit) || 10;
      if (d && f) { res.json(query('SELECT cl.id, cl.nom, COUNT(c.id) as nb_commandes, COALESCE(SUM(c.prix_total), 0) as ca_total FROM clients cl LEFT JOIN commandes c ON cl.id = c.client_id AND c.date_commande BETWEEN ? AND ? GROUP BY cl.id HAVING ca_total > 0 ORDER BY ca_total DESC LIMIT ?', [d, f, lim])); }
      else { res.json(query('SELECT cl.id, cl.nom, COUNT(c.id) as nb_commandes, COALESCE(SUM(c.prix_total), 0) as ca_total FROM clients cl LEFT JOIN commandes c ON cl.id = c.client_id GROUP BY cl.id HAVING ca_total > 0 ORDER BY ca_total DESC LIMIT ?', [lim])); }
    });

    srv.get('/api/stats/top-produits', function(req, res) {
      var d = req.query.debut, f = req.query.fin, lim = parseInt(req.query.limit) || 10;
      if (d && f) { res.json(query('SELECT p.id, p.nom, p.unite, COALESCE(SUM(cl.quantite), 0) as quantite_totale, COALESCE(SUM(cl.prix_ligne), 0) as ca_total FROM produits p LEFT JOIN commande_lignes cl ON p.id = cl.produit_id LEFT JOIN commandes co ON cl.commande_id = co.id AND co.date_commande BETWEEN ? AND ? GROUP BY p.id HAVING ca_total > 0 ORDER BY ca_total DESC LIMIT ?', [d, f, lim])); }
      else { res.json(query('SELECT p.id, p.nom, p.unite, COALESCE(SUM(cl.quantite), 0) as quantite_totale, COALESCE(SUM(cl.prix_ligne), 0) as ca_total FROM produits p LEFT JOIN commande_lignes cl ON p.id = cl.produit_id LEFT JOIN commandes co ON cl.commande_id = co.id GROUP BY p.id HAVING ca_total > 0 ORDER BY ca_total DESC LIMIT ?', [lim])); }
    });

    srv.get('/api/stats/mensuel', function(req, res) {
      var d = req.query.debut, f = req.query.fin, dfc = '', dfd = '', pc = [], pd = [];
      if (d && f) { dfc = ' WHERE date_commande BETWEEN ? AND ?'; dfd = ' WHERE date_depense BETWEEN ? AND ?'; pc.push(d, f); pd.push(d, f); }
      var ca = query("SELECT strftime('%Y-%m', date_commande) as mois, SUM(prix_total) as total FROM commandes" + dfc + " GROUP BY mois ORDER BY mois", pc);
      var dep = query("SELECT strftime('%Y-%m', date_depense) as mois, SUM(prix) as total FROM depenses" + dfd + " GROUP BY mois ORDER BY mois", pd);
      var allM = {}; ca.forEach(function(r) { allM[r.mois] = true; }); dep.forEach(function(r) { allM[r.mois] = true; });
      res.json(Object.keys(allM).sort().map(function(m) { var c = 0, dd = 0; ca.forEach(function(r) { if (r.mois === m) c = r.total; }); dep.forEach(function(r) { if (r.mois === m) dd = r.total; }); return { mois: m, ca: c, depenses: dd, benefice: c - dd }; }));
    });

    srv.get('/api/stats/commandes-par-semaine', function(req, res) {
      var d = req.query.debut, f = req.query.fin, df = '', p = [];
      if (d && f) { df = ' WHERE date_commande BETWEEN ? AND ?'; p.push(d, f); }
      var r = query("SELECT strftime('%Y-W%W', date_commande) as semaine, COUNT(*) as nb FROM commandes" + df + " GROUP BY semaine ORDER BY semaine", p);
      var avg = r.length > 0 ? r.reduce(function(s, x) { return s + x.nb; }, 0) / r.length : 0;
      res.json({ semaines: r, moyenne: Math.round(avg * 100) / 100 });
    });

    srv.get('/api/stats/commandes-par-mois', function(req, res) {
      var d = req.query.debut, f = req.query.fin, df = '', p = [];
      if (d && f) { df = ' WHERE date_commande BETWEEN ? AND ?'; p.push(d, f); }
      res.json(query("SELECT strftime('%Y-%m', date_commande) as mois, COUNT(*) as nb FROM commandes" + df + " GROUP BY mois ORDER BY mois", p));
    });

    srv.get('/api/stats/evolution-clients', function(req, res) {
      var d = req.query.debut, f = req.query.fin, df = '', p = [];
      if (d && f) { df = ' WHERE date_commande BETWEEN ? AND ?'; p.push(d, f); }
      res.json(query("SELECT strftime('%Y-%m', date_commande) as mois, COUNT(DISTINCT client_id) as nb_clients FROM commandes" + df + " GROUP BY mois ORDER BY mois", p));
    });

    srv.get('/api/stats/categories-depenses', function(req, res) {
      var d = req.query.debut, f = req.query.fin, df = '', p = [];
      if (d && f) { df = ' WHERE date_depense BETWEEN ? AND ?'; p.push(d, f); }
      res.json(query("SELECT COALESCE(categorie, 'Non categorise') as categorie, SUM(prix) as total FROM depenses" + df + " GROUP BY categorie ORDER BY total DESC", p));
    });

    srv.get('/api/stats/livraisons', function(req, res) {
      var d = req.query.debut, f = req.query.fin, df = '', p = [];
      if (d && f) { df = ' WHERE date_commande BETWEEN ? AND ?'; p.push(d, f); }
      res.json(query("SELECT COALESCE(livraison, 'Non specifie') as livraison, COUNT(*) as nb_commandes, COALESCE(SUM(prix_total), 0) as ca_total FROM commandes" + df + " GROUP BY livraison ORDER BY nb_commandes DESC", p));
    });

    // --- EXPORT / IMPORT ---
    srv.get('/api/export', function(req, res) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename=maraichage_backup.db');
      res.send(Buffer.from(db.export()));
    });

    srv.post('/api/import', function(req, res) {
      try {
        var d = req.body.data;
        if (!d) return res.status(400).json({ error: 'Aucune donnee fournie' });
        var uint8 = new Uint8Array(Buffer.from(d, 'base64'));
        var newDb = new SQL.Database(uint8);
        var tables = [];
        var rows = newDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
        if (rows.length > 0) rows[0].values.forEach(function(r) { tables.push(r[0]); });
        var req2 = ['produits', 'clients', 'commandes', 'commande_lignes', 'depenses'];
        for (var i = 0; i < req2.length; i++) {
          if (tables.indexOf(req2[i]) === -1) { newDb.close(); return res.status(400).json({ error: 'Table manquante: ' + req2[i] }); }
        }
        db.close();
        db = newDb;
        saveDB();
        res.json({ success: true });
      } catch (e) { console.error('Import error:', e); res.status(400).json({ error: 'Fichier invalide: ' + e.message }); }
    });

    srv.get('/api/export-csv', function(req, res) {
      var toCSV = function(arr) {
        if (arr.length === 0) return '';
        var h = Object.keys(arr[0]);
        return [h.join(',')].concat(arr.map(function(r) { return h.map(function(k) { return '"' + String(r[k] || '').replace(/"/g, '""') + '"'; }).join(','); })).join('\n');
      };
      res.json({
        produits: toCSV(query('SELECT * FROM produits')),
        clients: toCSV(query('SELECT * FROM clients')),
        commandes: toCSV(query('SELECT c.*, cl.nom as client_nom FROM commandes c JOIN clients cl ON c.client_id = cl.id')),
        depenses: toCSV(query('SELECT * FROM depenses')),
        lignes_commandes: toCSV(query('SELECT cl.*, p.nom as produit_nom FROM commande_lignes cl JOIN produits p ON cl.produit_id = p.id'))
      });
    });

    // --- VERSION & UPDATE ---
    var APP_VERSION = require('./package.json').version;

    srv.get('/api/version', function(req, res) {
      res.json({ version: APP_VERSION });
    });

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
  initDB().then(function() {
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
