// ═══════════════════════════════════════════
// Routes API : clients
// ═══════════════════════════════════════════
const express = require('express');
const { query, run } = require('../db');

const router = express.Router();

router.get('/clients', (req, res) => {
  res.json(query('SELECT * FROM clients ORDER BY nom'));
});

router.post('/clients', (req, res) => {
  const { nom, telephone, email, actif } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const actifVal = actif != null ? (actif ? 1 : 0) : 1;
  const result = run('INSERT INTO clients (nom, telephone, email, actif) VALUES (?, ?, ?, ?)', [nom, telephone || null, email || null, actifVal]);
  res.json({ id: result.lastId, nom, telephone, email, actif: actifVal });
});

router.put('/clients/:id', (req, res) => {
  const { nom, telephone, email, actif } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const actifVal = actif != null ? (actif ? 1 : 0) : 1;
  run('UPDATE clients SET nom=?, telephone=?, email=?, actif=? WHERE id=?', [nom, telephone || null, email || null, actifVal, req.params.id]);
  res.json({ success: true });
});

// Idem produits : suppression dure, mais les commandes existantes du
// client sont conservees (LEFT JOIN + "Client supprime").
router.delete('/clients/:id', (req, res) => {
  run('DELETE FROM clients WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
