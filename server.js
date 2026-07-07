const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3847;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let db;
let SQL;
const DB_PATH = path.join(__dirname, 'maraichage.db');

async function initDB() {
  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS produits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prix REAL NOT NULL,
    unite TEXT NOT NULL CHECK(unite IN ('kg', 'unite')),
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date_commande TEXT NOT NULL,
    prix_total REAL NOT NULL DEFAULT 0,
    prix_manuel REAL,
    livraison TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS commande_lignes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commande_id INTEGER NOT NULL,
    produit_id INTEGER NOT NULL,
    quantite REAL NOT NULL,
    prix_unitaire REAL NOT NULL,
    prix_ligne REAL NOT NULL,
    FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE,
    FOREIGN KEY (produit_id) REFERENCES produits(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS depenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    date_depense TEXT NOT NULL,
    prix REAL NOT NULL,
    categorie TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  saveDB();
  console.log('Base de donnees initialisee.');
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function run(sql, params = []) {
  // Convert undefined to null in params
  const safeParams = params.map(p => p === undefined ? null : p);
  db.run(sql, safeParams);
  // Capture last_insert_rowid immediately after the statement
  const res = db.exec("SELECT last_insert_rowid()");
  const lastId = res.length > 0 ? res[0].values[0][0] : 0;
  const changes = db.getRowsModified();
  saveDB();
  return { changes, lastId };
}

// ========== PRODUITS ==========
app.get('/api/produits', (req, res) => {
  res.json(query('SELECT * FROM produits ORDER BY nom'));
});

app.post('/api/produits', (req, res) => {
  const { nom, prix, unite } = req.body;
  if (!nom || prix == null || !unite) return res.status(400).json({ error: 'Champs requis manquants' });
  const result = run('INSERT INTO produits (nom, prix, unite) VALUES (?, ?, ?)', [nom, prix, unite]);
  res.json({ id: result.lastId, nom, prix, unite });
});

app.put('/api/produits/:id', (req, res) => {
  const { nom, prix, unite } = req.body;
  run('UPDATE produits SET nom=?, prix=?, unite=? WHERE id=?', [nom, prix, unite, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/produits/:id', (req, res) => {
  run('DELETE FROM produits WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ========== CLIENTS ==========
app.get('/api/clients', (req, res) => {
  res.json(query('SELECT * FROM clients ORDER BY nom'));
});

app.post('/api/clients', (req, res) => {
  const { nom, telephone, email } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const result = run('INSERT INTO clients (nom, telephone, email) VALUES (?, ?, ?)', [nom, telephone || null, email || null]);
  res.json({ id: result.lastId, nom, telephone, email });
});

app.put('/api/clients/:id', (req, res) => {
  const { nom, telephone, email } = req.body;
  run('UPDATE clients SET nom=?, telephone=?, email=? WHERE id=?', [nom, telephone || null, email || null, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/clients/:id', (req, res) => {
  run('DELETE FROM clients WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ========== COMMANDES ==========
app.get('/api/commandes', (req, res) => {
  const commandes = query(`
    SELECT c.*, cl.nom as client_nom 
    FROM commandes c 
    JOIN clients cl ON c.client_id = cl.id 
    ORDER BY c.date_commande DESC
  `);
  for (let cmd of commandes) {
    cmd.lignes = query(`
      SELECT cl.*, p.nom as produit_nom, p.unite as produit_unite
      FROM commande_lignes cl 
      JOIN produits p ON cl.produit_id = p.id 
      WHERE cl.commande_id = ?
    `, [cmd.id]);
  }
  res.json(commandes);
});

app.post('/api/commandes', (req, res) => {
  const { client_id, date_commande, lignes, prix_manuel, livraison } = req.body;
  if (!client_id || !date_commande || !lignes || lignes.length === 0) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  
  let prix_total = 0;
  for (const l of lignes) {
    prix_total += l.quantite * l.prix_unitaire;
  }
  
  const finalPrice = prix_manuel != null ? prix_manuel : prix_total;
  
  const result = run(
    'INSERT INTO commandes (client_id, date_commande, prix_total, prix_manuel, livraison) VALUES (?, ?, ?, ?, ?)',
    [client_id, date_commande, finalPrice, prix_manuel, livraison || null]
  );
  
  for (const l of lignes) {
    run(
      'INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, prix_ligne) VALUES (?, ?, ?, ?, ?)',
      [result.lastId, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]
    );
  }
  
  res.json({ id: result.lastId, prix_total: finalPrice });
});

app.put('/api/commandes/:id', (req, res) => {
  const { client_id, date_commande, lignes, prix_manuel, livraison } = req.body;
  
  let prix_total = 0;
  for (const l of lignes) {
    prix_total += l.quantite * l.prix_unitaire;
  }
  const finalPrice = prix_manuel != null ? prix_manuel : prix_total;
  
  run('UPDATE commandes SET client_id=?, date_commande=?, prix_total=?, prix_manuel=?, livraison=? WHERE id=?',
    [client_id, date_commande, finalPrice, prix_manuel, livraison || null, req.params.id]);
  
  run('DELETE FROM commande_lignes WHERE commande_id=?', [req.params.id]);
  
  for (const l of lignes) {
    run(
      'INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, prix_ligne) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]
    );
  }
  
  res.json({ success: true });
});

app.delete('/api/commandes/:id', (req, res) => {
  run('DELETE FROM commande_lignes WHERE commande_id=?', [req.params.id]);
  run('DELETE FROM commandes WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ========== DEPENSES ==========
app.get('/api/depenses', (req, res) => {
  res.json(query('SELECT * FROM depenses ORDER BY date_depense DESC'));
});

app.post('/api/depenses', (req, res) => {
  const { nom, date_depense, prix, categorie } = req.body;
  if (!nom || !date_depense || prix == null) return res.status(400).json({ error: 'Champs requis manquants' });
  const result = run('INSERT INTO depenses (nom, date_depense, prix, categorie) VALUES (?, ?, ?, ?)', 
    [nom, date_depense, prix, categorie || null]);
  res.json({ id: result.lastId });
});

app.put('/api/depenses/:id', (req, res) => {
  const { nom, date_depense, prix, categorie } = req.body;
  run('UPDATE depenses SET nom=?, date_depense=?, prix=?, categorie=? WHERE id=?',
    [nom, date_depense, prix, categorie || null, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/depenses/:id', (req, res) => {
  run('DELETE FROM depenses WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ========== STATISTIQUES ==========
app.get('/api/stats/dashboard', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilter = '';
  let dateFilterDep = '';
  const params = [];
  const paramsDep = [];
  
  if (debut && fin) {
    dateFilter = ' WHERE c.date_commande BETWEEN ? AND ?';
    dateFilterDep = ' WHERE d.date_depense BETWEEN ? AND ?';
    params.push(debut, fin);
    paramsDep.push(debut, fin);
  }
  
  const ca = query(`SELECT COALESCE(SUM(c.prix_total), 0) as total FROM commandes c${dateFilter}`, params);
  const dep = query(`SELECT COALESCE(SUM(d.prix), 0) as total FROM depenses d${dateFilterDep}`, paramsDep);
  const nbCommandes = query(`SELECT COUNT(*) as total FROM commandes c${dateFilter}`, params);
  const nbClients = query(`SELECT COUNT(DISTINCT client_id) as total FROM commandes c${dateFilter}`, params);
  const panierMoyen = query(`SELECT COALESCE(AVG(c.prix_total), 0) as total FROM commandes c${dateFilter}`, params);
  
  res.json({
    chiffre_affaires: ca[0].total,
    depenses: dep[0].total,
    benefice: ca[0].total - dep[0].total,
    nb_commandes: nbCommandes[0].total,
    nb_clients_actifs: nbClients[0].total,
    panier_moyen: panierMoyen[0].total
  });
});

app.get('/api/stats/top-clients', (req, res) => {
  const { debut, fin, limit } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' AND c.date_commande BETWEEN ? AND ?'; params.push(debut, fin); }
  params.push(parseInt(limit) || 10);
  
  res.json(query(`
    SELECT cl.id, cl.nom, COUNT(c.id) as nb_commandes, COALESCE(SUM(c.prix_total), 0) as ca_total
    FROM clients cl
    LEFT JOIN commandes c ON cl.id = c.client_id${dateFilter ? ' ' + dateFilter.replace('AND', 'WHERE') : ''}
    GROUP BY cl.id
    HAVING ca_total > 0
    ORDER BY ca_total DESC
    LIMIT ?
  `.replace('WHERE  AND', 'WHERE'), params));
});

app.get('/api/stats/top-produits', (req, res) => {
  const { debut, fin, limit } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' AND co.date_commande BETWEEN ? AND ?'; params.push(debut, fin); }
  params.push(parseInt(limit) || 10);
  
  res.json(query(`
    SELECT p.id, p.nom, p.unite, COALESCE(SUM(cl.quantite), 0) as quantite_totale, COALESCE(SUM(cl.prix_ligne), 0) as ca_total
    FROM produits p
    LEFT JOIN commande_lignes cl ON p.id = cl.produit_id
    LEFT JOIN commandes co ON cl.commande_id = co.id${dateFilter ? dateFilter : ''}
    GROUP BY p.id
    HAVING ca_total > 0
    ORDER BY ca_total DESC
    LIMIT ?
  `, params));
});

app.get('/api/stats/mensuel', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilterCmd = '';
  let dateFilterDep = '';
  const paramsCmd = [];
  const paramsDep = [];
  if (debut && fin) {
    dateFilterCmd = ' WHERE date_commande BETWEEN ? AND ?';
    dateFilterDep = ' WHERE date_depense BETWEEN ? AND ?';
    paramsCmd.push(debut, fin);
    paramsDep.push(debut, fin);
  }
  
  const ca = query(`
    SELECT strftime('%Y-%m', date_commande) as mois, SUM(prix_total) as total 
    FROM commandes${dateFilterCmd}
    GROUP BY mois ORDER BY mois
  `, paramsCmd);
  
  const dep = query(`
    SELECT strftime('%Y-%m', date_depense) as mois, SUM(prix) as total 
    FROM depenses${dateFilterDep}
    GROUP BY mois ORDER BY mois
  `, paramsDep);
  
  const allMonths = new Set([...ca.map(r => r.mois), ...dep.map(r => r.mois)]);
  const sorted = [...allMonths].sort();
  
  const result = sorted.map(mois => {
    const caVal = ca.find(r => r.mois === mois)?.total || 0;
    const depVal = dep.find(r => r.mois === mois)?.total || 0;
    return { mois, ca: caVal, depenses: depVal, benefice: caVal - depVal };
  });
  
  res.json(result);
});

app.get('/api/stats/commandes-par-semaine', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' WHERE date_commande BETWEEN ? AND ?'; params.push(debut, fin); }
  
  const result = query(`
    SELECT strftime('%Y-W%W', date_commande) as semaine, COUNT(*) as nb
    FROM commandes${dateFilter}
    GROUP BY semaine ORDER BY semaine
  `, params);
  
  const avg = result.length > 0 ? result.reduce((s, r) => s + r.nb, 0) / result.length : 0;
  
  res.json({ semaines: result, moyenne: Math.round(avg * 100) / 100 });
});

app.get('/api/stats/commandes-par-mois', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' WHERE date_commande BETWEEN ? AND ?'; params.push(debut, fin); }
  
  res.json(query(`
    SELECT strftime('%Y-%m', date_commande) as mois, COUNT(*) as nb
    FROM commandes${dateFilter}
    GROUP BY mois ORDER BY mois
  `, params));
});

app.get('/api/stats/evolution-clients', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' WHERE date_commande BETWEEN ? AND ?'; params.push(debut, fin); }
  
  res.json(query(`
    SELECT strftime('%Y-%m', date_commande) as mois, COUNT(DISTINCT client_id) as nb_clients
    FROM commandes${dateFilter}
    GROUP BY mois ORDER BY mois
  `, params));
});

app.get('/api/stats/categories-depenses', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' WHERE date_depense BETWEEN ? AND ?'; params.push(debut, fin); }
  
  res.json(query(`
    SELECT COALESCE(categorie, 'Non catégorisé') as categorie, SUM(prix) as total
    FROM depenses${dateFilter}
    GROUP BY categorie ORDER BY total DESC
  `, params));
});

app.get('/api/stats/livraisons', (req, res) => {
  const { debut, fin } = req.query;
  let dateFilter = '';
  const params = [];
  if (debut && fin) { dateFilter = ' WHERE date_commande BETWEEN ? AND ?'; params.push(debut, fin); }
  
  res.json(query(`
    SELECT COALESCE(livraison, 'Non spécifié') as livraison, COUNT(*) as nb_commandes, COALESCE(SUM(prix_total), 0) as ca_total
    FROM commandes${dateFilter}
    GROUP BY livraison ORDER BY nb_commandes DESC
  `, params));
});

// ========== VERSION & UPDATE ==========
const APP_VERSION = require('./package.json').version;
const UPDATE_URL = 'https://raw.githubusercontent.com/OWNER/REPO/main/update.json';

app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

app.get('/api/check-update', (req, res) => {
  const https = require('https');
  const http = require('http');
  const mod = UPDATE_URL.startsWith('https') ? https : http;

  mod.get(UPDATE_URL, (response) => {
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

// ========== EXPORT / IMPORT ==========
app.get('/api/export', (req, res) => {
  const data = db.export();
  const buffer = Buffer.from(data);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename=maraichage_backup.db');
  res.send(buffer);
});

app.post('/api/import', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Aucune donnee fournie' });
    const buffer = Buffer.from(data, 'base64');
    const uint8 = new Uint8Array(buffer);
    const newDb = new SQL.Database(uint8);
    const tables = [];
    const rows = newDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (rows.length > 0) {
      rows[0].values.forEach(r => tables.push(r[0]));
    }
    const required = ['produits', 'clients', 'commandes', 'commande_lignes', 'depenses'];
    for (const t of required) {
      if (!tables.includes(t)) {
        newDb.close();
        return res.status(400).json({ error: 'Table manquante: ' + t });
      }
    }
    db.close();
    db = newDb;
    saveDB();
    res.json({ success: true });
  } catch (e) {
    console.error('Import error:', e);
    res.status(400).json({ error: 'Fichier invalide: ' + e.message });
  }
});

app.get('/api/export-csv', (req, res) => {
  const produits = query('SELECT * FROM produits');
  const clients = query('SELECT * FROM clients');
  const commandes = query('SELECT c.*, cl.nom as client_nom FROM commandes c JOIN clients cl ON c.client_id = cl.id');
  const depenses = query('SELECT * FROM depenses');
  const lignes = query('SELECT cl.*, p.nom as produit_nom FROM commande_lignes cl JOIN produits p ON cl.produit_id = p.id');
  
  function toCSV(arr) {
    if (arr.length === 0) return '';
    const headers = Object.keys(arr[0]);
    const rows = arr.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','));
    return [headers.join(','), ...rows].join('\n');
  }
  
  res.json({
    produits: toCSV(produits),
    clients: toCSV(clients),
    commandes: toCSV(commandes),
    depenses: toCSV(depenses),
    lignes_commandes: toCSV(lignes)
  });
});

// ========== START ==========
initDB().then(() => {
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
});
