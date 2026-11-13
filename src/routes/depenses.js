// ═══════════════════════════════════════════
// Routes API : depenses
// ═══════════════════════════════════════════
const express = require('express');
const { query, run } = require('../db');
const { isValidNumber } = require('../helpers');

const router = express.Router();

// Filtre optionnel ?debut=&fin= (ex: une annee complete) ; sans filtre,
// toutes les depenses.
router.get('/depenses', (req, res) => {
  const { debut, fin } = req.query;
  if (debut && fin) {
    return res.json(query('SELECT * FROM depenses WHERE date_depense BETWEEN ? AND ? ORDER BY date_depense DESC', [debut, fin]));
  }
  res.json(query('SELECT * FROM depenses ORDER BY date_depense DESC'));
});

router.post('/depenses', (req, res) => {
  const { nom, date_depense, prix, categorie } = req.body;
  if (!nom || !date_depense || prix == null) return res.status(400).json({ error: 'Champs requis manquants' });
  if (!isValidNumber(prix) || prix < 0) return res.status(400).json({ error: 'Le montant doit etre un nombre positif ou nul' });
  const result = run('INSERT INTO depenses (nom, date_depense, prix, categorie) VALUES (?, ?, ?, ?)',
    [nom, date_depense, prix, categorie || null]);
  res.json({ id: result.lastId });
});

router.put('/depenses/:id', (req, res) => {
  const { nom, date_depense, prix, categorie } = req.body;
  if (!nom || !date_depense || prix == null) return res.status(400).json({ error: 'Champs requis manquants' });
  if (!isValidNumber(prix) || prix < 0) return res.status(400).json({ error: 'Le montant doit etre un nombre positif ou nul' });
  run('UPDATE depenses SET nom=?, date_depense=?, prix=?, categorie=? WHERE id=?',
    [nom, date_depense, prix, categorie || null, req.params.id]);
  res.json({ success: true });
});

router.delete('/depenses/:id', (req, res) => {
  run('DELETE FROM depenses WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
