// ═══════════════════════════════════════════
// Routes API : commandes
// ═══════════════════════════════════════════
const express = require('express');
const { query, run, runNoSave, saveDB } = require('../db');
const { isValidNumber, isValidStatut, validateLignes, whereFrom } = require('../helpers');

const router = express.Router();

// LEFT JOIN (et non INNER JOIN comme avant) : une commande dont le client
// ou un produit a ete supprime depuis reste visible, avec un nom de
// remplacement, au lieu de disparaitre silencieusement des listes et des
// statistiques.
// Filtres optionnels ?statut=en_cours|vendu, ?debut=&fin= (annee affichee,
// panneau "commandes a preparer") et ?limit=N (N plus recentes, ex: tableau
// de bord) ; sans filtre, toutes les commandes.
router.get('/commandes', (req, res) => {
  const { statut, debut, fin } = req.query;
  const limit = parseInt(req.query.limit, 10);
  const clauses = [];
  const params = [];
  if (statut) {
    if (!isValidStatut(statut)) return res.status(400).json({ error: 'Statut invalide' });
    clauses.push('c.statut = ?');
    params.push(statut);
  }
  if (debut && fin) {
    clauses.push('c.date_commande BETWEEN ? AND ?');
    params.push(debut, fin);
  }
  const where = whereFrom(clauses);

  const commandes = query(`
    SELECT c.*, COALESCE(cl.nom, 'Client supprimé') as client_nom
    FROM commandes c
    LEFT JOIN clients cl ON c.client_id = cl.id
    ${where}
    ORDER BY c.date_commande DESC, c.id DESC
    ${limit > 0 ? 'LIMIT ?' : ''}
  `, limit > 0 ? [...params, limit] : params);

  // Toutes les lignes en UNE requete (au lieu d'une requete par commande)
  // puis regroupees en memoire : evite un profil N+1 qui deviendrait
  // sensible avec plusieurs centaines/milliers de commandes. Avec ?limit,
  // seules les lignes des quelques commandes retenues sont chargees.
  const limitClause = limit > 0 ? ` WHERE cl.commande_id IN (${commandes.map(() => '?').join(',') || 'NULL'})` : '';
  const allLignes = query(`
    SELECT cl.*, COALESCE(p.nom, 'Produit supprimé') as produit_nom, COALESCE(p.unite, 'unite') as produit_unite
    FROM commande_lignes cl
    LEFT JOIN produits p ON cl.produit_id = p.id${limitClause}
  `, limit > 0 ? commandes.map(c => c.id) : []);
  const lignesByCommande = new Map();
  for (const l of allLignes) {
    if (!lignesByCommande.has(l.commande_id)) lignesByCommande.set(l.commande_id, []);
    lignesByCommande.get(l.commande_id).push(l);
  }

  for (const cmd of commandes) {
    cmd.lignes = lignesByCommande.get(cmd.id) || [];
  }
  res.json(commandes);
});

router.post('/commandes', (req, res) => {
  const { client_id, date_commande, lignes, prix_manuel, livraison, statut } = req.body;
  if (!client_id || !date_commande || !lignes || lignes.length === 0) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  const lignesError = validateLignes(lignes);
  if (lignesError) return res.status(400).json({ error: lignesError });
  if (prix_manuel != null && (!isValidNumber(prix_manuel) || prix_manuel < 0)) {
    return res.status(400).json({ error: 'Le prix manuel doit etre un nombre positif ou nul' });
  }
  const finalStatut = statut != null ? statut : 'en_cours';
  if (!isValidStatut(finalStatut)) return res.status(400).json({ error: 'Statut invalide' });

  let prix_total = 0;
  for (const l of lignes) prix_total += l.quantite * l.prix_unitaire;
  const finalPrice = prix_manuel != null ? prix_manuel : prix_total;

  // Toutes les ecritures de cette commande (entete + lignes) sont groupees
  // et persistees en une seule fois sur disque (voir saveDB() plus bas)
  // au lieu d'une ecriture complete de la base par ligne inseree.
  const result = runNoSave(
    'INSERT INTO commandes (client_id, date_commande, prix_total, prix_manuel, livraison, statut) VALUES (?, ?, ?, ?, ?, ?)',
    [client_id, date_commande, finalPrice, prix_manuel, livraison || null, finalStatut]
  );

  for (const l of lignes) {
    runNoSave(
      'INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, prix_ligne) VALUES (?, ?, ?, ?, ?)',
      [result.lastId, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]
    );
  }
  saveDB();

  res.json({ id: result.lastId, prix_total: finalPrice, statut: finalStatut });
});

router.put('/commandes/:id', (req, res) => {
  const { client_id, date_commande, lignes, prix_manuel, livraison, statut } = req.body;
  if (!client_id || !date_commande || !lignes || lignes.length === 0) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  const lignesError = validateLignes(lignes);
  if (lignesError) return res.status(400).json({ error: lignesError });
  if (prix_manuel != null && (!isValidNumber(prix_manuel) || prix_manuel < 0)) {
    return res.status(400).json({ error: 'Le prix manuel doit etre un nombre positif ou nul' });
  }
  const existing = query('SELECT statut FROM commandes WHERE id = ?', [req.params.id])[0];
  if (!existing) return res.status(404).json({ error: 'Commande introuvable' });
  // Sans statut explicite, une modification conserve le statut actuel (une
  // commande deja vendue ne doit pas repasser "en cours" par defaut).
  const finalStatut = statut != null ? statut : existing.statut;
  if (!isValidStatut(finalStatut)) return res.status(400).json({ error: 'Statut invalide' });

  let prix_total = 0;
  for (const l of lignes) prix_total += l.quantite * l.prix_unitaire;
  const finalPrice = prix_manuel != null ? prix_manuel : prix_total;

  runNoSave('UPDATE commandes SET client_id=?, date_commande=?, prix_total=?, prix_manuel=?, livraison=?, statut=? WHERE id=?',
    [client_id, date_commande, finalPrice, prix_manuel, livraison || null, finalStatut, req.params.id]);

  runNoSave('DELETE FROM commande_lignes WHERE commande_id=?', [req.params.id]);

  for (const l of lignes) {
    runNoSave(
      'INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, prix_ligne) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]
    );
  }
  saveDB();

  res.json({ success: true });
});

// Bascule rapide "En cours de preparation" -> "Vendu" (bouton "Valider" du
// panneau de preparation), sans avoir a resoumettre tout le formulaire.
router.post('/commandes/:id/valider', (req, res) => {
  const existing = query('SELECT id FROM commandes WHERE id = ?', [req.params.id]);
  if (existing.length === 0) return res.status(404).json({ error: 'Commande introuvable' });
  run("UPDATE commandes SET statut = 'vendu' WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

router.delete('/commandes/:id', (req, res) => {
  runNoSave('DELETE FROM commande_lignes WHERE commande_id=?', [req.params.id]);
  runNoSave('DELETE FROM commandes WHERE id=?', [req.params.id]);
  saveDB();
  res.json({ success: true });
});

module.exports = router;
