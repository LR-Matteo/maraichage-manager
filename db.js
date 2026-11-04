// ═══════════════════════════════════════════
// Couche d'acces base de donnees (partagee entre server.js et main.js)
// ═══════════════════════════════════════════
const fs = require('fs');
const initSqlJs = require('sql.js');

let db = null;
let SQL = null;
let dbPath = null;

async function initDB(path) {
  dbPath = path;
  SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
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
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // NB: client_id / produit_id ne portent volontairement pas de contrainte
  // d'integrite referentielle stricte cote appli : un client ou un produit
  // supprime doit continuer d'exister dans l'historique des commandes deja
  // passees (voir COALESCE dans api.js). Les FOREIGN KEY declarees ci-dessous
  // documentent juste la relation ; sql.js n'applique PRAGMA foreign_keys
  // par defaut, donc elles ne bloquent pas la suppression.
  db.run(`CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date_commande TEXT NOT NULL,
    prix_total REAL NOT NULL DEFAULT 0,
    prix_manuel REAL,
    livraison TEXT,
    statut TEXT NOT NULL DEFAULT 'vendu' CHECK(statut IN ('en_cours', 'vendu')),
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

  // --- Migrations (bases deja existantes creees avant l'ajout de certaines colonnes) ---
  const clientCols = query('PRAGMA table_info(clients)').map(c => c.name);
  if (!clientCols.includes('actif')) {
    db.run('ALTER TABLE clients ADD COLUMN actif INTEGER NOT NULL DEFAULT 1');
    console.log('Migration: colonne actif ajoutee a clients');
  }

  // Pas de CHECK sur cet ALTER (SQLite le permet difficilement de façon
  // fiable sur une colonne ajoutee apres coup) : la validation de la valeur
  // est faite cote API (voir isValidStatut). Le defaut 'vendu' preserve le
  // comportement des commandes deja existantes (deja des ventes conclues),
  // qui continuent donc de compter dans les statistiques comme avant.
  const commandeCols = query('PRAGMA table_info(commandes)').map(c => c.name);
  if (!commandeCols.includes('statut')) {
    db.run("ALTER TABLE commandes ADD COLUMN statut TEXT NOT NULL DEFAULT 'vendu'");
    console.log('Migration: colonne statut ajoutee a commandes (defaut vendu)');
  }

  // Index sur les colonnes utilisees dans les JOIN/WHERE des statistiques
  // (dashboard, fiche produit, top clients/produits...) : garde ces requetes
  // rapides a mesure que le nombre de commandes augmente.
  db.run('CREATE INDEX IF NOT EXISTS idx_commande_lignes_produit ON commande_lignes(produit_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_commande_lignes_commande ON commande_lignes(commande_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_commandes_client ON commandes(client_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_commandes_date ON commandes(date_commande)');
  db.run('CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(statut)');
  db.run('CREATE INDEX IF NOT EXISTS idx_depenses_date ON depenses(date_depense)');

  saveDB();
  console.log('Base de donnees initialisee:', dbPath);
}

// Attente synchrone (bloquante) sans dependance externe : Atomics.wait sur
// un buffer partage. saveDB() doit rester synchrone (les routes Express de
// api.js le sont toutes), donc pas de setTimeout/Promise ici.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Sur Windows, un antivirus ou l'indexeur de fichiers peut verrouiller
// brievement le fichier de destination juste apres une ecriture (EPERM/EBUSY
// transitoire), en particulier lors d'ecritures rapprochees. On retente
// plusieurs fois avec un delai croissant plutot que de faire planter la
// requete en cours : la duree totale reste tres courte (quelques dizaines de
// ms) et invisible pour l'utilisateur, sauf en cas de vrai probleme durable.
function renameWithRetry(src, dest, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (err) {
      const transient = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (!transient || attempt === maxAttempts) throw err;
      sleepSync(15 * attempt);
    }
  }
}

// Ecriture atomique : on ecrit dans un fichier temporaire puis on renomme,
// pour eviter de corrompre maraichage.db si le process est interrompu
// (crash, coupure) pendant l'ecriture.
function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = dbPath + '.tmp';
  fs.writeFileSync(tmpPath, buffer);
  renameWithRetry(tmpPath, dbPath);
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

// Execute une requete d'ecriture SANS persister sur disque. A utiliser pour
// grouper plusieurs ecritures (ex: une commande + ses lignes) et n'appeler
// saveDB() qu'une seule fois a la fin, au lieu d'une ecriture disque complete
// par instruction SQL.
function runNoSave(sql, params = []) {
  const safeParams = params.map(p => (p === undefined ? null : p));
  db.run(sql, safeParams);
  const res = db.exec('SELECT last_insert_rowid()');
  const lastId = res.length > 0 ? res[0].values[0][0] : 0;
  const changes = db.getRowsModified();
  return { changes, lastId };
}

function run(sql, params = []) {
  const result = runNoSave(sql, params);
  saveDB();
  return result;
}

function replaceDatabase(newDb) {
  db.close();
  db = newDb;
  saveDB();
}

function exportDatabase() {
  return db.export();
}

function getSQL() {
  return SQL;
}

module.exports = { initDB, query, run, runNoSave, saveDB, replaceDatabase, exportDatabase, getSQL };
