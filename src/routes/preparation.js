// ═══════════════════════════════════════════
// Routes API : commandes a preparer (recapitulatif + exports PDF/Excel)
// ═══════════════════════════════════════════
const express = require('express');
const { query } = require('../db');
const { whereFrom } = require('../helpers');
const { writePreparationPDF, writePreparationExcel } = require('../exports/preparation');

const router = express.Router();

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

module.exports = router;
