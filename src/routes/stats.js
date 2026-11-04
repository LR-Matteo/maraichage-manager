// ═══════════════════════════════════════════
// Routes API : statistiques (tableau de bord, graphiques, fiche produit)
// ═══════════════════════════════════════════
const express = require('express');
const { query } = require('../db');
const { buildDateFilter, whereFrom, strftimeFormat, parseISODate, formatISODate, daysBetween } = require('../helpers');

const router = express.Router();

router.get('/stats/dashboard', (req, res) => {
  const { clauses, params } = buildDateFilter(req, 'c');
  const dateFilter = whereFrom(clauses);

  const { debut, fin } = req.query;
  const paramsDep = [];
  let dateFilterDep = '';
  if (debut && fin) {
    dateFilterDep = ' WHERE d.date_depense BETWEEN ? AND ?';
    paramsDep.push(debut, fin);
  }

  const ca = query(`SELECT COALESCE(SUM(c.prix_total), 0) as total FROM commandes c${dateFilter}`, params);
  const dep = query(`SELECT COALESCE(SUM(d.prix), 0) as total FROM depenses d${dateFilterDep}`, paramsDep);
  const nbCommandes = query(`SELECT COUNT(*) as total FROM commandes c${dateFilter}`, params);
  const panierMoyen = query(`SELECT COALESCE(AVG(c.prix_total), 0) as total FROM commandes c${dateFilter}`, params);
  // Bug corrige : "Clients actifs" comptait le nombre de clients distincts
  // ayant commande sur la periode (ce qui n'a rien a voir avec le statut
  // actif/inactif du client, et ignorait le champ "actif" dedie a ca).
  // On compte desormais reellement les clients marques actifs dans la
  // table clients, independamment de toute periode.
  const nbClientsActifs = query(`SELECT COUNT(*) as total FROM clients WHERE actif = 1`);

  res.json({
    chiffre_affaires: ca[0].total,
    depenses: dep[0].total,
    benefice: ca[0].total - dep[0].total,
    nb_commandes: nbCommandes[0].total,
    nb_clients_actifs: nbClientsActifs[0].total,
    panier_moyen: panierMoyen[0].total
  });
});

router.get('/stats/clients-a-relancer', (req, res) => {
  const limit = parseInt(req.query.limit) || 8;
  res.json(query(`
    SELECT c.id, c.nom, c.telephone, c.email, MAX(co.date_commande) as derniere_commande, COUNT(co.id) as nb_commandes
    FROM clients c
    JOIN commandes co ON co.client_id = c.id AND co.statut = 'vendu'
    WHERE c.actif = 1
    GROUP BY c.id
    ORDER BY derniere_commande ASC
    LIMIT ?
  `, [limit]));
});

router.get('/stats/top-clients', (req, res) => {
  const { limit } = req.query;
  const { clauses, params } = buildDateFilter(req, 'c');
  const where = whereFrom(clauses);
  params.push(parseInt(limit) || 10);

  res.json(query(`
    SELECT cl.id, cl.nom, COUNT(DISTINCT c.id) as nb_commandes, COALESCE(SUM(c.prix_total), 0) as ca_total
    FROM clients cl
    JOIN commandes c ON cl.id = c.client_id${where}
    GROUP BY cl.id
    HAVING ca_total > 0
    ORDER BY ca_total DESC
    LIMIT ?
  `, params));
});

router.get('/stats/top-produits', (req, res) => {
  // Le filtre de periode est applique via un WHERE apres des INNER JOIN
  // (et non sur la condition d'un LEFT JOIN comme avant une precedente
  // correction) : les quantites/CA agreges reflettent bien la periode
  // choisie.
  const { limit } = req.query;
  const { clauses, params } = buildDateFilter(req, 'co');
  const where = whereFrom(clauses);
  params.push(parseInt(limit) || 10);

  res.json(query(`
    SELECT p.id, p.nom, p.unite, COALESCE(SUM(cl.quantite), 0) as quantite_totale, COALESCE(SUM(cl.prix_ligne), 0) as ca_total
    FROM produits p
    JOIN commande_lignes cl ON p.id = cl.produit_id
    JOIN commandes co ON cl.commande_id = co.id${where}
    GROUP BY p.id
    HAVING ca_total > 0
    ORDER BY ca_total DESC
    LIMIT ?
  `, params));
});

router.get('/stats/mensuel', (req, res) => {
  const fmt = strftimeFormat(req);
  const { clauses, params: paramsCmd } = buildDateFilter(req, 'c');
  const dateFilterCmd = whereFrom(clauses);

  const { debut, fin } = req.query;
  let dateFilterDep = '';
  const paramsDep = [];
  if (debut && fin) {
    dateFilterDep = ' WHERE date_depense BETWEEN ? AND ?';
    paramsDep.push(debut, fin);
  }

  const ca = query(`
    SELECT strftime('${fmt}', c.date_commande) as periode, SUM(c.prix_total) as total
    FROM commandes c${dateFilterCmd}
    GROUP BY periode ORDER BY periode
  `, paramsCmd);

  const dep = query(`
    SELECT strftime('${fmt}', date_depense) as periode, SUM(prix) as total
    FROM depenses${dateFilterDep}
    GROUP BY periode ORDER BY periode
  `, paramsDep);

  const allPeriodes = new Set([...ca.map(r => r.periode), ...dep.map(r => r.periode)]);
  const sorted = [...allPeriodes].sort();

  const result = sorted.map(periode => {
    const caVal = ca.find(r => r.periode === periode)?.total || 0;
    const depVal = dep.find(r => r.periode === periode)?.total || 0;
    return { periode, ca: caVal, depenses: depVal, benefice: caVal - depVal };
  });

  res.json(result);
});

router.get('/stats/commandes-par-semaine', (req, res) => {
  const { clauses, params } = buildDateFilter(req, 'c');
  const where = whereFrom(clauses);

  const result = query(`
    SELECT strftime('%Y-W%W', c.date_commande) as semaine, COUNT(*) as nb
    FROM commandes c${where}
    GROUP BY semaine ORDER BY semaine
  `, params);

  const avg = result.length > 0 ? result.reduce((s, r) => s + r.nb, 0) / result.length : 0;

  res.json({ semaines: result, moyenne: Math.round(avg * 100) / 100 });
});

// Nombre moyen de clients distincts ayant commande par semaine (meme
// methode de calcul que commandes-par-semaine : moyenne sur les semaines
// ayant eu au moins une commande). Compte tout client ayant reellement
// commande, sans lien avec le champ "actif" (un client marque inactif qui
// commande quand meme doit être compté ici).
router.get('/stats/clients-par-semaine', (req, res) => {
  const { clauses, params } = buildDateFilter(req, 'c');
  const where = whereFrom(clauses);

  const result = query(`
    SELECT strftime('%Y-W%W', c.date_commande) as semaine, COUNT(DISTINCT c.client_id) as nb_clients
    FROM commandes c${where}
    GROUP BY semaine ORDER BY semaine
  `, params);

  const avg = result.length > 0 ? result.reduce((s, r) => s + r.nb_clients, 0) / result.length : 0;

  res.json({ semaines: result, moyenne: Math.round(avg * 100) / 100 });
});

router.get('/stats/commandes-par-mois', (req, res) => {
  const fmt = strftimeFormat(req);
  const { clauses, params } = buildDateFilter(req, 'c');
  const where = whereFrom(clauses);

  res.json(query(`
    SELECT strftime('${fmt}', c.date_commande) as periode, COUNT(*) as nb
    FROM commandes c${where}
    GROUP BY periode ORDER BY periode
  `, params));
});

// "Clients qui commandent" (et non "clients actifs" : cette evolution
// compte les clients distincts ayant reellement passe commande sur chaque
// periode, sans lien avec le champ "actif" du client - voir aussi
// /stats/dashboard qui, lui, compte le roster de clients actifs).
router.get('/stats/evolution-clients', (req, res) => {
  const fmt = strftimeFormat(req);
  const { clauses, params } = buildDateFilter(req, 'c');
  const where = whereFrom(clauses);

  res.json(query(`
    SELECT strftime('${fmt}', c.date_commande) as periode, COUNT(DISTINCT c.client_id) as nb_clients
    FROM commandes c${where}
    GROUP BY periode ORDER BY periode
  `, params));
});

router.get('/stats/categories-depenses', (req, res) => {
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

router.get('/stats/livraisons', (req, res) => {
  const { clauses, params } = buildDateFilter(req, 'c');
  const where = whereFrom(clauses);

  res.json(query(`
    SELECT COALESCE(c.livraison, 'Non spécifié') as livraison, COUNT(*) as nb_commandes, COALESCE(SUM(c.prix_total), 0) as ca_total
    FROM commandes c${where}
    GROUP BY livraison ORDER BY nb_commandes DESC
  `, params));
});

// ========== FICHE STATISTIQUE PRODUIT ==========
router.get('/stats/produit/:id', (req, res) => {
  const produitId = parseInt(req.params.id, 10);
  const produit = query('SELECT * FROM produits WHERE id = ?', [produitId])[0];
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

  const { debut, fin } = req.query;
  let dateClause = '';
  const dateParams = [];
  if (debut && fin) {
    dateClause = ' AND co.date_commande BETWEEN ? AND ?';
    dateParams.push(debut, fin);
  }

  function totalsFor(pDebut, pFin) {
    let clause = '';
    const p = [produitId];
    if (pDebut && pFin) { clause = ' AND co.date_commande BETWEEN ? AND ?'; p.push(pDebut, pFin); }
    return query(`
      SELECT COALESCE(SUM(cl.quantite),0) as quantite_totale, COALESCE(SUM(cl.prix_ligne),0) as ca_total,
             COUNT(DISTINCT cl.commande_id) as nb_commandes, COUNT(DISTINCT co.client_id) as nb_clients,
             MIN(co.date_commande) as premiere_vente, MAX(co.date_commande) as derniere_vente
      FROM commande_lignes cl
      JOIN commandes co ON cl.commande_id = co.id AND co.statut = 'vendu'
      WHERE cl.produit_id = ?${clause}
    `, p)[0];
  }

  const totals = totalsFor(debut, fin);

  const fmt = strftimeFormat(req);
  const evolution = query(`
    SELECT strftime('${fmt}', co.date_commande) as periode, COALESCE(SUM(cl.quantite),0) as quantite, COALESCE(SUM(cl.prix_ligne),0) as ca
    FROM commande_lignes cl
    JOIN commandes co ON cl.commande_id = co.id AND co.statut = 'vendu'
    WHERE cl.produit_id = ?${dateClause}
    GROUP BY periode ORDER BY periode
  `, [produitId, ...dateParams]);

  const topClients = query(`
    SELECT c.id, c.nom, COUNT(DISTINCT co.id) as nb_commandes, COALESCE(SUM(cl.quantite),0) as quantite, COALESCE(SUM(cl.prix_ligne),0) as ca_total
    FROM clients c
    JOIN commandes co ON c.id = co.client_id AND co.statut = 'vendu'
    JOIN commande_lignes cl ON cl.commande_id = co.id AND cl.produit_id = ?
    WHERE 1=1${dateClause}
    GROUP BY c.id
    HAVING ca_total > 0
    ORDER BY ca_total DESC
    LIMIT 5
  `, [produitId, ...dateParams]);

  // Moyenne hebdomadaire calculee sur la duree reelle de la periode
  // consideree (periode filtree, ou a defaut duree entre 1ere et derniere
  // vente), et non sur les seules semaines ayant eu des ventes : donne un
  // taux moyen exploitable pour planifier la production.
  let semaines = 0;
  if (debut && fin) {
    semaines = Math.max(daysBetween(debut, fin) + 1, 7) / 7;
  } else if (totals.premiere_vente && totals.derniere_vente) {
    semaines = Math.max(daysBetween(totals.premiere_vente, totals.derniere_vente) + 1, 7) / 7;
  }
  const moyenneSemaineQuantite = semaines > 0 ? totals.quantite_totale / semaines : 0;
  const moyenneSemaineCA = semaines > 0 ? totals.ca_total / semaines : 0;

  const prixMoyenConstate = totals.quantite_totale > 0 ? totals.ca_total / totals.quantite_totale : null;

  // Comparaison avec la periode precedente de meme duree (juste avant le
  // debut de la periode filtree), pour donner une tendance immediate.
  let comparaisonPrecedente = null;
  if (debut && fin) {
    const periodDays = daysBetween(debut, fin) + 1;
    const prevFinMs = parseISODate(debut) - 86400000;
    const prevDebutMs = prevFinMs - (periodDays - 1) * 86400000;
    const prevDebut = formatISODate(prevDebutMs);
    const prevFin = formatISODate(prevFinMs);
    const prevTotals = totalsFor(prevDebut, prevFin);
    comparaisonPrecedente = {
      debut: prevDebut,
      fin: prevFin,
      quantite_totale: prevTotals.quantite_totale,
      ca_total: prevTotals.ca_total,
      delta_quantite_pct: prevTotals.quantite_totale > 0 ? Math.round((totals.quantite_totale - prevTotals.quantite_totale) / prevTotals.quantite_totale * 100) : null,
      delta_ca_pct: prevTotals.ca_total > 0 ? Math.round((totals.ca_total - prevTotals.ca_total) / prevTotals.ca_total * 100) : null
    };
  }

  res.json({
    produit,
    quantite_totale: totals.quantite_totale,
    ca_total: totals.ca_total,
    nb_commandes: totals.nb_commandes,
    nb_clients: totals.nb_clients,
    premiere_vente: totals.premiere_vente,
    derniere_vente: totals.derniere_vente,
    prix_moyen_constate: prixMoyenConstate,
    moyenne_semaine_quantite: moyenneSemaineQuantite,
    moyenne_semaine_ca: moyenneSemaineCA,
    evolution,
    top_clients: topClients,
    comparaison_precedente: comparaisonPrecedente
  });
});

module.exports = router;
