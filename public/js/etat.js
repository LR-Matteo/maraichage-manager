/* ═══════════════════════════════════════════ */
/* Etat global partage entre les pages */
/* ═══════════════════════════════════════════ */

// ========== STATE ==========
let currentPage = 'dashboard';
let produits = [];
let clients = [];
let commandes = [];
let depenses = [];
let chartInstances = {};
let relanceLimit = 8;
let produitStatsChart = null;
let currentProduitStatsId = null;
let statsGranularite = 'mois';
let produitStatsGranularite = 'mois';
// Comparaison par annee de la fiche produit : annees cochees, mesure du
// graphique (quantite | ca) et decoupage (mois | semaine).
let produitCmpAnnees = [];
let produitCmpMesure = 'quantite';
let produitCmpGranularite = 'mois';
let produitCmpChart = null;
let commandeModalContext = 'commandes';
let commandesStatutFilter = 'toutes';

// Annee civile affichee (nombre, ou 'toutes'). Toujours l'annee en cours au
// lancement : c'est ce qui fait "repartir de 0" chaque 1er janvier.
let anneeSelectionnee = new Date().getFullYear();
// true tant que l'utilisateur n'a pas choisi une autre annee : l'affichage
// suit alors l'annee en cours, meme si l'application reste ouverte pendant
// le passage au 1er janvier.
let anneeAuto = true;
let anneesDisponibles = [];
// Graphiques des sections de comparaison (page Statistiques), detruits au
// changement de page mais pas lors d'un simple "Actualiser" de la periode.
let chartsComparaison = {};
