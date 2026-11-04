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
let commandeModalContext = 'commandes';
let commandesStatutFilter = 'toutes';
