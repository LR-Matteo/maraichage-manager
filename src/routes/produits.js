// ═══════════════════════════════════════════
// Routes API : produits
// ═══════════════════════════════════════════
const express = require('express');
const { query, run } = require('../db');
const { isValidNumber, isValidUnite } = require('../helpers');

const router = express.Router();

router.get('/produits', (req, res) => {
  res.json(query('SELECT * FROM produits ORDER BY nom'));
});

router.post('/produits', (req, res) => {
  const { nom, prix, unite } = req.body;
  if (!nom || prix == null || !unite) return res.status(400).json({ error: 'Champs requis manquants' });
  if (!isValidNumber(prix) || prix < 0) return res.status(400).json({ error: 'Le prix doit etre un nombre positif ou nul' });
  if (!isValidUnite(unite)) return res.status(400).json({ error: 'Unite invalide' });
  const result = run('INSERT INTO produits (nom, prix, unite) VALUES (?, ?, ?)', [nom, prix, unite]);
  res.json({ id: result.lastId, nom, prix, unite });
});

router.put('/produits/:id', (req, res) => {
  const { nom, prix, unite } = req.body;
  if (!nom || prix == null || !unite) return res.status(400).json({ error: 'Champs requis manquants' });
  if (!isValidNumber(prix) || prix < 0) return res.status(400).json({ error: 'Le prix doit etre un nombre positif ou nul' });
  if (!isValidUnite(unite)) return res.status(400).json({ error: 'Unite invalide' });
  run('UPDATE produits SET nom=?, prix=?, unite=? WHERE id=?', [nom, prix, unite, req.params.id]);
  res.json({ success: true });
});

// Suppression "dure" assumee : les commandes existantes qui referencent ce
// produit sont conservees (voir LEFT JOIN dans commandes.js), seul le nom du
// produit apparait comme "Produit supprime" dans leur historique.
router.delete('/produits/:id', (req, res) => {
  run('DELETE FROM produits WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
