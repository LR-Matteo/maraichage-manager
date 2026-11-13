/* ═══════════════════════════════════════════ */
/* Utilitaires (formatage, dates, appels API, modale, echappement HTML) */
/* ═══════════════════════════════════════════ */

// ========== UTILITIES ==========
function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

// Quantite (kg ou unites) arrondie a 3 decimales : les sommes de REAL faites
// en SQL donnent sinon des affichages du type "0.30000000000000004 kg".
function fmtQty(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(Math.round((n || 0) * 1000) / 1000);
}

// Une commande a un vrai prix promotionnel si le prix manuel differe du
// total des lignes (tolerance d'un demi-centime pour les erreurs d'arrondi
// flottant). Partage entre la liste des commandes et la fiche detail.
function lignesTotal(c) {
  return c.lignes.reduce((s, l) => s + l.prix_ligne, 0);
}
function hasPromo(c) {
  return c.prix_manuel != null && Math.abs(c.prix_manuel - lignesTotal(c)) > 0.005;
}

// Parse une date "YYYY-MM-DD" comme une date locale (minuit heure locale),
// au lieu de laisser `new Date(str)` l'interpreter comme minuit UTC : cette
// derniere interpretation peut faire glisser la date d'un jour a l'affichage
// selon le fuseau horaire de l'utilisateur.
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Renvoie la date du jour au format "YYYY-MM-DD" en heure LOCALE.
// `new Date().toISOString().slice(0,10)` renvoie la date en UTC : en France
// (UTC+1/+2), cela peut afficher la veille comme date par defaut pendant les
// toutes premieres heures de la journee locale.
function todayLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(d) {
  if (!d) return '';
  return parseLocalDate(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Pourcentage qu'une valeur represente par rapport a un total, arrondi a
// l'entier. Renvoie null si le total est nul/absent (pas de pourcentage a afficher).
function pct(value, total) {
  if (!total || total <= 0) return null;
  return Math.round((value / total) * 100);
}

function fmtMonth(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return months[parseInt(mo) - 1] + ' ' + y;
}

function fmtWeek(w) {
  if (!w) return '';
  const [y, wk] = w.split('-W');
  return `S${parseInt(wk, 10)} ${y}`;
}

// Formatte une "periode" (mois "YYYY-MM" ou semaine "YYYY-Www") selon la
// granularite courante. Tolerant a une valeur manquante (ex: donnee mal
// formee cote base) plutot que de planter tout l'affichage des graphiques.
function fmtPeriode(p, granularite) {
  return granularite === 'semaine' ? fmtWeek(p) : fmtMonth(p);
}

const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Evolution en % de `actuel` par rapport a `reference` (null si pas de
// reference). Denominateur en valeur absolue pour un benefice negatif.
function deltaPct(actuel, reference) {
  if (!reference) return null;
  return Math.round((actuel - reference) / Math.abs(reference) * 100);
}

// Pastille d'evolution "+12% vs 2025". `inverse` : une hausse est mauvaise
// (depenses), elle s'affiche alors en rouge et une baisse en vert.
function deltaBadge(pctVal, libelle, inverse = false) {
  if (pctVal == null) return `<span class="stat-delta flat">${libelle} : —</span>`;
  const bon = inverse ? pctVal < 0 : pctVal > 0;
  const cls = pctVal === 0 ? 'flat' : bon ? 'up' : 'down';
  const sign = pctVal > 0 ? '+' : '';
  return `<span class="stat-delta ${cls}">${sign}${pctVal}% ${libelle}</span>`;
}

// Pastille "+12%" seule, pour une cellule de tableau de comparaison
// ("—" s'il n'y a pas de reference).
function celluleEvolution(a, b, inverse = false) {
  const p = deltaPct(a, b);
  if (p == null) return '<span style="color:var(--text-muted)">—</span>';
  const bon = inverse ? p < 0 : p > 0;
  const cls = p === 0 ? 'flat' : bon ? 'up' : 'down';
  return `<span class="stat-delta ${cls}" style="margin:0">${p > 0 ? '+' : ''}${p}%</span>`;
}

function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + url, opts);
  // Tolere une reponse non-JSON (page d'erreur, proxy...) au lieu d'afficher
  // un obscur "Unexpected token <" a l'utilisateur.
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Erreur serveur (${res.status})`);
  if (data === null) throw new Error('Réponse invalide du serveur');
  return data;
}

function openModal(html, opts = {}) {
  const modalEl = document.getElementById('modal-content');
  modalEl.innerHTML = html;
  modalEl.classList.toggle('modal-lg', !!opts.large);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (produitStatsChart) { produitStatsChart.destroy(); produitStatsChart = null; }
  if (produitCmpChart) { produitCmpChart.destroy(); produitCmpChart = null; }
}

function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

// ========== ESCAPE HTML ==========
// Remplacement de caracteres plutot qu'un aller-retour par le DOM
// (createElement + textContent + innerHTML) : beaucoup plus rapide sur des
// tableaux de plusieurs centaines de lignes, puisqu'on evite de creer un
// element DOM a chaque appel. Echappe aussi les guillemets ("'), ce que
// l'ancienne version via innerHTML ne faisait pas dans un noeud texte : une
// valeur contenant un " pouvait casser hors d'un attribut HTML comme
// value="${esc(...)}" (ex: nom de produit).
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}
