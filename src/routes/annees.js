// ═══════════════════════════════════════════
// Routes API : vue par annee civile et comparaisons entre annees
// ═══════════════════════════════════════════
// Aucune donnee n'est jamais effacee au changement d'annee : chaque commande
// et depense etant datee, "repartir de 0" consiste simplement a filtrer sur
// l'annee voulue. Les annees passees restent donc consultables et
// comparables a tout moment.
const express = require('express');
const { query } = require('../db');
const { semaineDansAnnee } = require('../helpers');

const router = express.Router();

// Annees pour lesquelles il existe au moins une commande ou une depense,
// plus l'annee en cours (toujours proposee, meme vide), de la plus recente
// a la plus ancienne.
router.get('/annees', (req, res) => {
  const rows = query(`
    SELECT DISTINCT CAST(substr(date_commande, 1, 4) AS INTEGER) as annee FROM commandes
    UNION
    SELECT DISTINCT CAST(substr(date_depense, 1, 4) AS INTEGER) as annee FROM depenses
  `);
  const annees = new Set(rows.map(r => r.annee).filter(a => a > 0));
  annees.add(new Date().getFullYear());
  res.json([...annees].sort((a, b) => b - a));
});

// Detail mois par mois (janvier a decembre, mois vides inclus) d'une annee :
// CA, depenses, benefice, nombre de commandes, panier moyen. Avec
// ?produit_id=, ajoute la quantite vendue et le CA de ce produit.
// Utilise par la comparaison annuelle (un appel par annee comparee).
router.get('/stats/annuel', (req, res) => {
  const annee = parseInt(req.query.annee, 10);
  if (!(annee >= 1900 && annee <= 9999)) return res.status(400).json({ error: 'Annee invalide' });
  const produitId = req.query.produit_id ? parseInt(req.query.produit_id, 10) : null;
  const periode = [`${annee}-01-01`, `${annee}-12-31`];

  const cmd = query(`
    SELECT CAST(strftime('%m', date_commande) AS INTEGER) as mois, SUM(prix_total) as ca, COUNT(*) as nb_commandes
    FROM commandes
    WHERE statut = 'vendu' AND date_commande BETWEEN ? AND ?
    GROUP BY mois
  `, periode);

  const dep = query(`
    SELECT CAST(strftime('%m', date_depense) AS INTEGER) as mois, SUM(prix) as depenses
    FROM depenses
    WHERE date_depense BETWEEN ? AND ?
    GROUP BY mois
  `, periode);

  const prod = produitId ? query(`
    SELECT CAST(strftime('%m', co.date_commande) AS INTEGER) as mois, SUM(cl.quantite) as quantite, SUM(cl.prix_ligne) as ca
    FROM commande_lignes cl
    JOIN commandes co ON cl.commande_id = co.id AND co.statut = 'vendu'
    WHERE cl.produit_id = ? AND co.date_commande BETWEEN ? AND ?
    GROUP BY mois
  `, [produitId, ...periode]) : [];

  const mois = [];
  for (let m = 1; m <= 12; m++) {
    const c = cmd.find(r => r.mois === m);
    const d = dep.find(r => r.mois === m);
    const ca = c ? c.ca : 0;
    const depenses = d ? d.depenses : 0;
    const nb = c ? c.nb_commandes : 0;
    const ligne = { mois: m, ca, depenses, benefice: ca - depenses, nb_commandes: nb, panier_moyen: nb ? ca / nb : 0 };
    if (produitId) {
      const p = prod.find(r => r.mois === m);
      ligne.quantite_produit = p ? p.quantite : 0;
      ligne.ca_produit = p ? p.ca : 0;
    }
    mois.push(ligne);
  }

  res.json({ annee, mois });
});

// Ventes d'un produit (quantite + CA) mois par mois ou semaine par semaine,
// pour plusieurs annees a la fois : ?annees=2026,2025&granularite=mois|semaine
// Chaque annee a toutes ses periodes (12 mois ou 52 semaines, vides
// comprises) pour pouvoir etre superposee aux autres.
router.get('/stats/produit/:id/annees', (req, res) => {
  const produitId = parseInt(req.params.id, 10);
  const produit = query('SELECT * FROM produits WHERE id = ?', [produitId])[0];
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

  const annees = [...new Set(String(req.query.annees || '').split(',').map(a => parseInt(a, 10)))]
    .filter(a => a >= 1900 && a <= 9999);
  if (annees.length === 0 || annees.length > 6) return res.status(400).json({ error: 'Indiquez de 1 a 6 annees' });
  const parSemaine = req.query.granularite === 'semaine';
  const nbPeriodes = parSemaine ? 52 : 12;

  const ventes = query(`
    SELECT co.date_commande as date, cl.quantite, cl.prix_ligne
    FROM commande_lignes cl
    JOIN commandes co ON cl.commande_id = co.id AND co.statut = 'vendu'
    WHERE cl.produit_id = ?
      AND CAST(substr(co.date_commande, 1, 4) AS INTEGER) IN (${annees.map(() => '?').join(',')})
  `, [produitId, ...annees]);

  const resultat = annees.map(annee => ({
    annee,
    periodes: Array.from({ length: nbPeriodes }, (_, i) => ({ numero: i + 1, quantite: 0, ca: 0 })),
    total: { quantite: 0, ca: 0 }
  }));
  const parAnnee = new Map(resultat.map(r => [r.annee, r]));

  for (const v of ventes) {
    const r = parAnnee.get(parseInt(v.date.slice(0, 4), 10));
    const numero = parSemaine ? semaineDansAnnee(v.date) : parseInt(v.date.slice(5, 7), 10);
    const p = r.periodes[numero - 1];
    p.quantite += v.quantite;
    p.ca += v.prix_ligne;
    r.total.quantite += v.quantite;
    r.total.ca += v.prix_ligne;
  }

  res.json({ produit, granularite: parSemaine ? 'semaine' : 'mois', annees: resultat });
});

module.exports = router;
