// ═══════════════════════════════════════════
// Routes API : version, sauvegarde / restauration de la base, export CSV
// ═══════════════════════════════════════════
const express = require('express');
const { query, replaceDatabase, exportDatabase, getSQL } = require('../db');

const router = express.Router();

router.get('/version', (req, res) => {
  res.json({ version: require('../../package.json').version });
});

router.get('/export', (req, res) => {
  const buffer = Buffer.from(exportDatabase());
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename=maraichage_backup.db');
  res.send(buffer);
});

router.post('/import', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Aucune donnee fournie' });
    const buffer = Buffer.from(data, 'base64');
    const uint8 = new Uint8Array(buffer);
    const SQL = getSQL();
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
    replaceDatabase(newDb);
    res.json({ success: true });
  } catch (e) {
    console.error('Import error:', e);
    res.status(400).json({ error: 'Fichier invalide: ' + e.message });
  }
});

router.get('/export-csv', (req, res) => {
  const produits = query('SELECT * FROM produits');
  const clients = query('SELECT * FROM clients');
  const commandes = query(`
    SELECT c.*, COALESCE(cl.nom, 'Client supprimé') as client_nom
    FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
  `);
  const depenses = query('SELECT * FROM depenses');
  const lignes = query(`
    SELECT cl.*, COALESCE(p.nom, 'Produit supprimé') as produit_nom
    FROM commande_lignes cl LEFT JOIN produits p ON cl.produit_id = p.id
  `);

  function toCSV(arr) {
    if (arr.length === 0) return '';
    const headers = Object.keys(arr[0]);
    // `== null` et non `|| ''` : un 0 (client inactif, prix nul...) doit
    // rester "0" dans le CSV et non devenir une case vide.
    const rows = arr.map(r => headers.map(h => `"${String(r[h] == null ? '' : r[h]).replace(/"/g, '""')}"`).join(','));
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

module.exports = router;
