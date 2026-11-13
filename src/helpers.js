// ═══════════════════════════════════════════
// Fonctions utilitaires partagees par les routes API
// (validation, filtres de periode, calculs de dates)
// ═══════════════════════════════════════════

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
function daysBetween(a, b) {
  return Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
}

// Numero de semaine (1 a 52) d'une date dans son annee civile, compte par
// blocs de 7 jours depuis le 1er janvier : S1 = 1er-7 janvier, S2 = 8-14...
// Contrairement aux semaines ISO, une meme semaine couvre ainsi les memes
// dates d'une annee sur l'autre, ce qui rend les comparaisons justes. Le ou
// les 1-2 derniers jours de l'annee sont rattaches a la S52 (qui va donc du
// 24 au 31 decembre, du 23 les annees bissextiles) plutot que de former une
// S53 quasi vide.
function semaineDansAnnee(str) {
  const jour = daysBetween(`${str.slice(0, 4)}-01-01`, str); // 0 = 1er janvier
  return Math.min(52, Math.floor(jour / 7) + 1);
}

// Decale une date "YYYY-MM-DD" de n annees, en ramenant le 29 fevrier au 28
// si l'annee cible n'est pas bissextile.
function shiftYear(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const ty = y + n;
  const dernierJour = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return `${ty}-${String(m).padStart(2, '0')}-${String(Math.min(d, dernierJour)).padStart(2, '0')}`;
}

// Evolution en % de `actuel` par rapport a `reference`, arrondie a l'entier.
// null si la reference est nulle (pas de base de comparaison). Denominateur
// en valeur absolue pour rester lisible avec un benefice negatif.
function deltaPct(actuel, reference) {
  if (!reference) return null;
  return Math.round((actuel - reference) / Math.abs(reference) * 100);
}

module.exports = {
  isValidNumber,
  isValidStatut,
  isValidUnite,
  validateLignes,
  buildDateFilter,
  whereFrom,
  strftimeFormat,
  parseISODate,
  daysBetween,
  semaineDansAnnee,
  shiftYear,
  deltaPct
};
