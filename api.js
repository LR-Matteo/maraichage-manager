// ═══════════════════════════════════════════
// Routes API mutualisees (utilisees par server.js ET main.js)
// ═══════════════════════════════════════════
const express = require('express');
const dbLayer = require('./db');
const { writePreparationPDF, writePreparationExcel } = require('./exports');

function isValidNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidStatut(s) {
  return s === 'en_cours' || s === 'vendu';
}

function isValidUnite(u) {
  return u === 'kg' || u === 'unite';
}

// Verifie que chaque ligne de commande reference un produit et a une
// quantite > 0 et un prix >= 0.
// Retourne un message d'erreur (string) ou null si tout est valide.
function validateLignes(lignes) {
  for (const l of lignes) {
    if (!Number.isInteger(l.produit_id) || l.produit_id <= 0) {
      return 'Chaque ligne de commande doit avoir un produit';
    }
    if (!isValidNumber(l.quantite) || l.quantite <= 0) {
      return 'La quantite de chaque produit doit etre un nombre superieur a 0';
    }
    if (!isValidNumber(l.prix_unitaire) || l.prix_unitaire < 0) {
      return 'Le prix unitaire de chaque produit doit etre un nombre positif ou nul';
    }
  }
  return null;
}

// Construit la clause WHERE de periode pour les statistiques basees sur la
// table commandes. `alias` est l'alias SQL de la table commandes dans la
// requete appelante (ex: 'c' ou 'co'). N'inclut TOUJOURS que les commandes
// "vendu" : une commande "en_cours" est une anticipation, pas une vente
// confirmee, elle ne doit compter dans aucune statistique tant qu'elle n'est
// pas validee (voir /commandes/:id/valider et le panneau "a preparer").
function buildDateFilter(req, alias) {
  const { debut, fin } = req.query;
  const clauses = [`${alias}.statut = 'vendu'`];
  const params = [];

  if (debut && fin) {
    clauses.push(`${alias}.date_commande BETWEEN ? AND ?`);
    params.push(debut, fin);
  }

  return { clauses, params };
}

function whereFrom(clauses) {
  return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
}

// Format strftime a utiliser pour grouper une serie temporelle par mois ou
// par semaine, selon le parametre ?granularite=mois|semaine (mois par defaut).
function strftimeFormat(req) {
  return req.query.granularite === 'semaine' ? '%Y-W%W' : '%Y-%m';
}

// --- Aide au calcul de dates calendaires (UTC pur, jamais melange avec une
// heure locale : evite les pieges de fuseau horaire pour de simples diffs
// de jours entre deux chaines "YYYY-MM-DD"). ---
function parseISODate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function formatISODate(utcMs) {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysBetween(a, b) {
  return Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
}

function createApiRouter() {
  const router = express.Router();
  const { query, run, runNoSave, saveDB, replaceDatabase, exportDatabase, getSQL } = dbLayer;

  // ========== PRODUITS ==========
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
  // produit sont conservees (voir LEFT JOIN plus bas), seul le nom du
  // produit apparait comme "Produit supprime" dans leur historique.
  router.delete('/produits/:id', (req, res) => {
    run('DELETE FROM produits WHERE id=?', [req.params.id]);
    res.json({ success: true });
  });

  // ========== CLIENTS ==========
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

  // ========== COMMANDES ==========
  // LEFT JOIN (et non INNER JOIN comme avant) : une commande dont le client
  // ou un produit a ete supprime depuis reste visible, avec un nom de
  // remplacement, au lieu de disparaitre silencieusement des listes et des
  // statistiques.
  // Filtres optionnels ?statut=en_cours|vendu et ?debut=&fin= (utilises par
  // le panneau "commandes a preparer") ; sans filtre, comportement inchange
  // (toutes les commandes, pour l'onglet Commandes).
  router.get('/commandes', (req, res) => {
    const { statut, debut, fin } = req.query;
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
      ORDER BY c.date_commande DESC
    `, params);

    // Toutes les lignes de toutes les commandes en UNE requete (au lieu
    // d'une requete par commande) puis regroupees en memoire : evite un
    // profil N+1 qui deviendrait sensible avec plusieurs centaines/milliers
    // de commandes.
    const allLignes = query(`
      SELECT cl.*, COALESCE(p.nom, 'Produit supprimé') as produit_nom, COALESCE(p.unite, 'unite') as produit_unite
      FROM commande_lignes cl
      LEFT JOIN produits p ON cl.produit_id = p.id
    `);
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

  // ========== DEPENSES ==========
  router.get('/depenses', (req, res) => {
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

  // ========== STATISTIQUES ==========
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

  // ========== COMMANDES A PREPARER ==========
  // Recapitulatif des commandes "en_cours" : quantite totale par produit
  // (kg/unite) et nombre de commandes distinctes qui le contiennent, pour
  // anticiper ce qu'il faut preparer/recolter avant livraison.
  function getPreparationRecap(debut, fin) {
    let dateClause = '';
    const params = [];
    if (debut && fin) {
      dateClause = ' AND co.date_commande BETWEEN ? AND ?';
      params.push(debut, fin);
    }

    const produits = query(`
      SELECT p.id as produit_id, p.nom, p.unite, COALESCE(SUM(cl.quantite),0) as quantite_totale, COUNT(DISTINCT cl.commande_id) as nb_commandes
      FROM produits p
      JOIN commande_lignes cl ON p.id = cl.produit_id
      JOIN commandes co ON cl.commande_id = co.id AND co.statut = 'en_cours'
      WHERE 1=1${dateClause}
      GROUP BY p.id
      HAVING quantite_totale > 0
      ORDER BY p.nom
    `, params);

    const nbCommandesRow = query(`
      SELECT COUNT(*) as total FROM commandes co WHERE co.statut = 'en_cours'${dateClause}
    `, params);

    return { produits, nb_commandes: nbCommandesRow[0].total };
  }

  router.get('/stats/a-preparer', (req, res) => {
    res.json(getPreparationRecap(req.query.debut, req.query.fin));
  });

  // Export PDF ou Excel du panneau "a preparer" (recapitulatif + detail de
  // chaque commande en cours), sur la meme periode que celle affichee.
  router.get('/export/preparation', (req, res) => {
    const { debut, fin, format } = req.query;
    if (format !== 'pdf' && format !== 'xlsx') {
      return res.status(400).json({ error: 'Format invalide (pdf ou xlsx attendu)' });
    }

    const recap = getPreparationRecap(debut, fin).produits;

    const clauses = ["c.statut = 'en_cours'"];
    const params = [];
    if (debut && fin) {
      clauses.push('c.date_commande BETWEEN ? AND ?');
      params.push(debut, fin);
    }
    const commandes = query(`
      SELECT c.*, COALESCE(cl.nom, 'Client supprimé') as client_nom
      FROM commandes c
      LEFT JOIN clients cl ON c.client_id = cl.id
      ${whereFrom(clauses)}
      ORDER BY c.date_commande ASC
    `, params);
    for (const cmd of commandes) {
      cmd.lignes = query(`
        SELECT cl.*, COALESCE(p.nom, 'Produit supprimé') as produit_nom, COALESCE(p.unite, 'unite') as produit_unite
        FROM commande_lignes cl
        LEFT JOIN produits p ON cl.produit_id = p.id
        WHERE cl.commande_id = ?
      `, [cmd.id]);
    }

    if (format === 'pdf') {
      writePreparationPDF(res, { recap, commandes, debut, fin });
    } else {
      writePreparationExcel(res, { recap, commandes, debut, fin }).catch(e => {
        console.error('Export Excel error:', e);
        if (!res.headersSent) res.status(500).json({ error: 'Erreur lors de la génération du fichier' });
      });
    }
  });

  // ========== VERSION ==========
  router.get('/version', (req, res) => {
    res.json({ version: require('./package.json').version });
  });

  // ========== EXPORT / IMPORT ==========
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

  return router;
}

// Gestionnaire d'erreurs a monter APRES toutes les routes /api (dans
// server.js et main.js) : renvoie toujours du JSON { error } au lieu de la
// page HTML par defaut d'Express (avec la trace de la pile), que le frontend
// ne savait pas lire. Couvre aussi les erreurs de express.json() (corps
// invalide ou trop volumineux), levees avant meme d'atteindre le routeur.
function apiErrorHandler(err, req, res, next) {
  console.error('API error:', req.method, req.originalUrl, err);
  if (res.headersSent) return next(err);
  // sql.js leve parfois une simple chaine plutot qu'un objet Error.
  const message = (err && err.message) || String(err);
  const status = (err && (err.status || err.statusCode)) || 500;
  res.status(status).json({ error: status === 500 ? 'Erreur serveur : ' + message : message });
}

module.exports = { createApiRouter, apiErrorHandler };
