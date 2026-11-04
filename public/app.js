/* ═══════════════════════════════════════════ */
/* MARAÎCHAGE MANAGER - Frontend Application   */
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
}

function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

// ========== NAVIGATION ==========
function navigate(page) {
  destroyCharts();
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage();
}

async function renderPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);">Chargement...</div>';
  
  try {
    switch (currentPage) {
      case 'dashboard': await renderDashboard(); break;
      case 'commandes': await renderCommandes(); break;
      case 'clients': await renderClients(); break;
      case 'produits': await renderProduits(); break;
      case 'depenses': await renderDepenses(); break;
      case 'statistiques': await renderStatistiques(); break;
    }
  } catch (e) {
    main.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

// ========== DASHBOARD ==========
async function renderDashboard() {
  const main = document.getElementById('main-content');
  const bodyHTML = await dashboardBodyHTML();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Tableau de bord</h2>
        <p class="subtitle">Vue d'ensemble de votre activité</p>
      </div>
    </div>

    <div id="dashboard-body">${bodyHTML}</div>

    ${preparationPanelHTML()}
  `;

  initPreparationPanel();
}

// Recharge uniquement les indicateurs du tableau de bord (pas le panneau
// "a preparer" ni son filtre), ex: apres validation d'une commande.
async function refreshDashboardBody() {
  const html = await dashboardBodyHTML();
  const el = document.getElementById('dashboard-body');
  if (el) el.innerHTML = html;
}

async function dashboardBodyHTML() {
  const [stats, topClients, topProduits, recent, clientsRelance] = await Promise.all([
    api('/stats/dashboard'),
    api('/stats/top-clients?limit=5'),
    api('/stats/top-produits?limit=5'),
    api('/commandes'),
    api('/stats/clients-a-relancer?limit=' + relanceLimit)
  ]);
  const recentCmd = recent.slice(0, 5);

  return `
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-label">Chiffre d'affaires</div>
        <div class="stat-value green">${fmt(stats.chiffre_affaires)}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Dépenses totales</div>
        <div class="stat-value red">${fmt(stats.depenses)}</div>
      </div>
      <div class="stat-card ${stats.benefice >= 0 ? 'blue' : 'red'}">
        <div class="stat-label">Bénéfice net</div>
        <div class="stat-value ${stats.benefice >= 0 ? 'blue' : 'red'}">${fmt(stats.benefice)}</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Commandes</div>
        <div class="stat-value gold">${stats.nb_commandes}</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Clients actifs</div>
        <div class="stat-value blue">${stats.nb_clients_actifs}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Panier moyen</div>
        <div class="stat-value green">${fmt(stats.panier_moyen)}</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card full-width" id="relance-card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <h3>🔔 Clients à relancer en priorité</h3>
          <div style="display:flex;align-items:center;gap:8px;">
            <label for="relance-limit" style="font-size:13px;color:var(--text-secondary);font-weight:500;">Afficher</label>
            <input id="relance-limit" type="number" min="1" max="50" value="${relanceLimit}" class="form-control" style="width:64px;padding:6px 8px;" onchange="updateRelanceLimit(this.value)">
          </div>
        </div>
        <p class="form-hint" style="margin:-4px 0 12px;">Clients actifs classés du moins récent au plus récent achat — les premiers de la liste sont ceux à recontacter en priorité pour qu'ils recommandent.</p>
        <div id="relance-list-body">${renderRelanceList(clientsRelance)}</div>
      </div>

      <div class="card">
        <div class="card-header"><h3>🏆 Top Clients</h3></div>
        ${topClients.length === 0 ? '<p style="color:var(--text-muted);font-size:14px;">Aucune donnée</p>' : `
        <ul class="rank-list">
          ${topClients.map((c, i) => `
            <li class="rank-item">
              <div class="rank-number rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
              <div class="rank-info">
                <div class="rank-name">${esc(c.nom)}</div>
                <div class="rank-detail">${c.nb_commandes} commande${c.nb_commandes > 1 ? 's' : ''}</div>
              </div>
              <div class="rank-value">${fmt(c.ca_total)}${pct(c.ca_total, stats.chiffre_affaires) != null ? `<span class="rank-pct">${pct(c.ca_total, stats.chiffre_affaires)}% du CA</span>` : ''}</div>
            </li>
          `).join('')}
        </ul>`}
      </div>

      <div class="card">
        <div class="card-header"><h3>🥬 Top Produits</h3></div>
        ${topProduits.length === 0 ? '<p style="color:var(--text-muted);font-size:14px;">Aucune donnée</p>' : `
        <ul class="rank-list">
          ${topProduits.map((p, i) => `
            <li class="rank-item">
              <div class="rank-number rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
              <div class="rank-info">
                <div class="rank-name">${esc(p.nom)}</div>
                <div class="rank-detail">${fmtQty(p.quantite_totale)} ${p.unite === 'kg' ? 'kg vendus' : 'unités vendues'}</div>
              </div>
              <div class="rank-value">${fmt(p.ca_total)}${pct(p.ca_total, stats.chiffre_affaires) != null ? `<span class="rank-pct">${pct(p.ca_total, stats.chiffre_affaires)}% du CA</span>` : ''}</div>
            </li>
          `).join('')}
        </ul>`}
      </div>

      <div class="card full-width">
        <div class="card-header"><h3>📋 Commandes récentes</h3></div>
        ${recentCmd.length === 0 ? '<p style="color:var(--text-muted);font-size:14px;">Aucune commande</p>' : `
        <div class="table-container">
          <table>
            <thead><tr><th>Date</th><th>Client</th><th>Articles</th><th class="text-right">Total</th></tr></thead>
            <tbody>
              ${recentCmd.map(c => `
                <tr>
                  <td>${fmtDate(c.date_commande)}</td>
                  <td><strong>${esc(c.client_nom)}</strong></td>
                  <td>${c.lignes.length} produit${c.lignes.length > 1 ? 's' : ''}</td>
                  <td class="text-right price-display">${fmt(c.prix_total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>
  `;
}

function renderRelanceList(list) {
  if (list.length === 0) return '<p style="color:var(--text-muted);font-size:14px;">Aucun client actif avec un historique de commande pour le moment</p>';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return `<ul class="rank-list">
    ${list.map((c, i) => {
      const jours = Math.max(0, Math.round((today - parseLocalDate(c.derniere_commande)) / 86400000));
      const badgeClass = jours >= 30 ? 'badge-red' : jours >= 14 ? 'badge-gold' : 'badge-blue';
      return `
      <li class="rank-item">
        <div class="rank-number rank-other">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${esc(c.nom)}</div>
          <div class="rank-detail">Dernière commande le ${fmtDate(c.derniere_commande)} · ${c.nb_commandes} commande${c.nb_commandes > 1 ? 's' : ''} au total</div>
          <div class="rank-contact">
            ${c.telephone ? `<span>📞 ${esc(c.telephone)}</span>` : ''}
            ${c.email ? `<a href="mailto:${esc(c.email)}">✉️ ${esc(c.email)}</a>` : ''}
            ${!c.telephone && !c.email ? '<span class="no-contact">Aucune coordonnée enregistrée</span>' : ''}
          </div>
        </div>
        <div class="relance-meta">
          <span class="badge ${badgeClass}">${jours} j</span>
        </div>
      </li>`;
    }).join('')}
  </ul>`;
}

async function updateRelanceLimit(val) {
  relanceLimit = Math.max(1, parseInt(val) || 8);
  try {
    const list = await api('/stats/clients-a-relancer?limit=' + relanceLimit);
    document.getElementById('relance-list-body').innerHTML = renderRelanceList(list);
  } catch (e) { toast(e.message, 'error'); }
}

// ========== PRODUITS ==========
async function renderProduits() {
  produits = await api('/produits');
  const main = document.getElementById('main-content');
  
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Produits</h2>
        <p class="subtitle">${produits.length} produit${produits.length > 1 ? 's' : ''} enregistré${produits.length > 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="openProduitModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouveau produit
      </button>
    </div>

    <div class="search-bar">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher un produit..." oninput="filterProduits(this.value)">
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-container" id="produits-table">
        ${renderProduitsTable(produits)}
      </div>
    </div>
  `;
}

function renderProduitsTable(list) {
  if (list.length === 0) return '<div class="empty-state"><div class="icon">🌱</div><p>Aucun produit enregistré</p><button class="btn btn-primary" onclick="openProduitModal()">Ajouter un produit</button></div>';
  return `<table>
    <thead><tr><th>Nom</th><th>Prix</th><th>Unité</th><th class="text-right">Actions</th></tr></thead>
    <tbody>
      ${list.map(p => `
        <tr>
          <td><strong>${esc(p.nom)}</strong></td>
          <td class="price-display">${fmt(p.prix)}</td>
          <td><span class="badge badge-green">${p.unite === 'kg' ? 'au kg' : 'à l\'unité'}</span></td>
          <td class="table-actions">
            <button class="btn-icon" onclick="openProduitModal(${p.id})" title="Modifier">✏️</button>
            <button class="btn-icon" onclick="openProduitStats(${p.id})" title="Statistiques">📊</button>
            <button class="btn-icon danger" onclick="deleteProduit(${p.id})" title="Supprimer">🗑️</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

function filterProduits(q) {
  q = q.toLowerCase();
  const filtered = produits.filter(p => p.nom.toLowerCase().includes(q));
  document.getElementById('produits-table').innerHTML = renderProduitsTable(filtered);
}

function openProduitModal(id) {
  const p = id ? produits.find(x => x.id === id) : null;
  openModal(`
    <div class="modal-header">
      <h3>${p ? 'Modifier' : 'Nouveau'} produit</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nom du produit *</label>
        <input id="p-nom" class="form-control" value="${p ? esc(p.nom) : ''}" placeholder="Ex: Tomates cerises">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prix (€) *</label>
          <input id="p-prix" type="number" step="0.01" min="0" class="form-control" value="${p ? p.prix : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Unité de vente *</label>
          <select id="p-unite" class="form-control">
            <option value="kg" ${p && p.unite === 'kg' ? 'selected' : ''}>Au kilogramme</option>
            <option value="unite" ${p && p.unite === 'unite' ? 'selected' : ''}>À l'unité</option>
          </select>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveProduit(${id || 'null'})">${p ? 'Enregistrer' : 'Créer'}</button>
    </div>
  `);
}

async function saveProduit(id) {
  const nom = document.getElementById('p-nom').value.trim();
  const prix = parseFloat(document.getElementById('p-prix').value);
  const unite = document.getElementById('p-unite').value;
  if (!nom || isNaN(prix)) { toast('Veuillez remplir tous les champs obligatoires', 'error'); return; }
  if (prix < 0) { toast('Le prix ne peut pas être négatif', 'error'); return; }
  try {
    if (id) { await api('/produits/' + id, 'PUT', { nom, prix, unite }); toast('Produit modifié'); }
    else { await api('/produits', 'POST', { nom, prix, unite }); toast('Produit créé'); }
    closeModal();
    renderProduits();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteProduit(id) {
  if (!confirm('Supprimer ce produit ? Les commandes existantes qui l\'utilisent seront conservées (le produit y apparaîtra comme "Produit supprimé").')) return;
  try { await api('/produits/' + id, 'DELETE'); toast('Produit supprimé'); renderProduits(); }
  catch (e) { toast(e.message, 'error'); }
}

// ========== FICHE STATISTIQUE PRODUIT ==========
async function openProduitStats(id, debut, fin) {
  currentProduitStatsId = id;
  if (!debut || !fin) {
    const now = new Date();
    debut = todayLocal(new Date(now.getFullYear() - 1, now.getMonth(), 1));
    fin = todayLocal(now);
  }

  // On affiche tout de suite la coquille de la modale (entete + filtres +
  // etat "Chargement") au lieu d'attendre la reponse de l'API avant le
  // moindre retour visuel : le clic reagit instantanement, seul le contenu
  // chiffre apparait un instant apres.
  const p = produits.find(x => x.id === id);
  openModal(renderProduitStatsShell(p ? p.nom : '', debut, fin), { large: true });

  await loadProduitStatsBody(id, debut, fin);
}

async function refreshProduitStats() {
  const debut = document.getElementById('pf-debut').value;
  const fin = document.getElementById('pf-fin').value;
  await loadProduitStatsBody(currentProduitStatsId, debut, fin);
}

// Ne remplace que le contenu chiffre de la modale (pas l'entete ni les
// champs de filtre) : "Actualiser" ne recree plus toute la modale a chaque
// clic, ce qui evite un rendu complet inutile et rend le filtrage plus fluide.
async function loadProduitStatsBody(id, debut, fin) {
  const body = document.getElementById('produit-stats-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Chargement...</div>';

  let data;
  try {
    data = await api(`/stats/produit/${id}?debut=${debut}&fin=${fin}&granularite=${produitStatsGranularite}`);
  } catch (e) {
    if (body) body.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
    return;
  }

  const bodyEl = document.getElementById('produit-stats-body');
  if (!bodyEl) return; // la modale a ete fermee entre-temps
  bodyEl.innerHTML = renderProduitStatsBody(data);

  // On laisse le navigateur peindre la mise en page avant de creer le
  // graphique Chart.js (double requestAnimationFrame) : la creation du
  // canvas ne rentre plus en concurrence avec l'animation d'ouverture de la
  // modale (transform + flou d'arriere-plan), ce qui supprime l'a-coup
  // ressenti a l'ouverture.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    renderProduitStatsChart(data.evolution, data.produit.unite);
  }));
}

function setProduitStatsGranularite(val) {
  produitStatsGranularite = val;
  loadProduitStatsBody(currentProduitStatsId, document.getElementById('pf-debut').value, document.getElementById('pf-fin').value);
}

function deltaBadge(pctVal) {
  if (pctVal == null) return '<span class="stat-delta flat">vs période préc. : —</span>';
  const cls = pctVal > 0 ? 'up' : pctVal < 0 ? 'down' : 'flat';
  const sign = pctVal > 0 ? '+' : '';
  return `<span class="stat-delta ${cls}">${sign}${pctVal}% vs période préc.</span>`;
}

function renderProduitStatsShell(nom, debut, fin) {
  return `
    <div class="modal-header">
      <h3>📊 ${esc(nom)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="date-range-picker" style="margin-bottom:20px;">
        <div class="filter-group"><label>Du</label><input type="date" id="pf-debut" value="${debut}"></div>
        <div class="filter-group"><label>Au</label><input type="date" id="pf-fin" value="${fin}"></div>
        <button class="btn btn-primary btn-sm" onclick="refreshProduitStats()">Actualiser</button>
      </div>
      <div id="produit-stats-body">
        <div style="text-align:center;padding:40px;color:var(--text-muted);">Chargement...</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    </div>
  `;
}

function renderProduitStatsBody(data) {
  const p = data.produit;
  const uniteLabel = p.unite === 'kg' ? 'kg' : 'unités';
  const uniteShort = p.unite === 'kg' ? 'kg' : 'u';
  const comp = data.comparaison_precedente;

  return `
      <div class="stats-grid">
        <div class="stat-card green">
          <div class="stat-label">Quantité vendue</div>
          <div class="stat-value green">${fmtQty(data.quantite_totale)} ${uniteLabel}</div>
          ${comp ? deltaBadge(comp.delta_quantite_pct) : ''}
        </div>
        <div class="stat-card gold">
          <div class="stat-label">Chiffre d'affaires</div>
          <div class="stat-value gold">${fmt(data.ca_total)}</div>
          ${comp ? deltaBadge(comp.delta_ca_pct) : ''}
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Moyenne / semaine</div>
          <div class="stat-value blue">${fmtQty(Math.round(data.moyenne_semaine_quantite * 10) / 10)} ${uniteShort}</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">CA moyen / semaine</div>
          <div class="stat-value blue">${fmt(data.moyenne_semaine_ca)}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Prix moyen constaté</div>
          <div class="stat-value green">${data.prix_moyen_constate != null ? fmt(data.prix_moyen_constate) + '/' + uniteShort : '—'}</div>
          <div class="form-hint" style="margin:6px 0 0;">Prix catalogue actuel : ${fmt(p.prix)}/${uniteShort}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Commandes · Clients</div>
          <div class="stat-value">${data.nb_commandes} · ${data.nb_clients}</div>
        </div>
      </div>

      <div class="flex-between flex-wrap gap-sm" style="margin:8px 0 12px;">
        <h4 style="font-size:14px;font-weight:600;color:var(--text-secondary);margin:0;">Évolution ${produitStatsGranularite === 'semaine' ? 'hebdomadaire' : 'mensuelle'}</h4>
        <div class="segmented">
          <button class="${produitStatsGranularite === 'mois' ? 'active' : ''}" data-val="mois" onclick="setProduitStatsGranularite('mois')">Mois</button>
          <button class="${produitStatsGranularite === 'semaine' ? 'active' : ''}" data-val="semaine" onclick="setProduitStatsGranularite('semaine')">Semaine</button>
        </div>
      </div>
      <div class="chart-wrapper" style="height:220px;"><canvas id="chart-produit-mensuel"></canvas></div>

      <div class="mt-2">
        <h4 style="font-size:14px;font-weight:600;margin:20px 0 12px;color:var(--text-secondary)">🏆 Top clients acheteurs</h4>
        ${data.top_clients.length === 0 ? '<p style="color:var(--text-muted);font-size:14px;">Aucune donnée</p>' : `
        <ul class="rank-list">
          ${data.top_clients.map((c, i) => `
            <li class="rank-item">
              <div class="rank-number rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
              <div class="rank-info">
                <div class="rank-name">${esc(c.nom)}</div>
                <div class="rank-detail">${fmtQty(c.quantite)} ${uniteLabel} · ${c.nb_commandes} cmd</div>
              </div>
              <div class="rank-value">${fmt(c.ca_total)}</div>
            </li>
          `).join('')}
        </ul>`}
      </div>
  `;
}

function renderProduitStatsChart(evolution, unite) {
  if (produitStatsChart) { produitStatsChart.destroy(); produitStatsChart = null; }
  const canvas = document.getElementById('chart-produit-mensuel');
  if (!canvas || evolution.length === 0) return;

  produitStatsChart = new Chart(canvas, {
    data: {
      labels: evolution.map(m => fmtPeriode(m.periode, produitStatsGranularite)),
      datasets: [
        {
          type: 'bar',
          label: `Quantité (${unite === 'kg' ? 'kg' : 'u'})`,
          data: evolution.map(m => m.quantite),
          backgroundColor: 'rgba(61,124,71,0.7)',
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'CA (€)',
          data: evolution.map(m => m.ca),
          borderColor: '#2980B9',
          backgroundColor: 'rgba(41,128,185,0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#2980B9',
          pointRadius: 3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === 'y1' ? ctx.dataset.label + ': ' + fmt(ctx.raw) : ctx.dataset.label + ': ' + fmtQty(ctx.raw) } }
      },
      scales: {
        y: { position: 'left', beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
        y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: v => fmt(v) } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ========== COMMANDES A PREPARER (panneau partage Dashboard + Statistiques) ==========
function prepQS(debut, fin) {
  return (debut && fin) ? `debut=${debut}&fin=${fin}` : '';
}

function preparationPanelHTML() {
  return `
    <div class="card mb-2" id="preparation-panel">
      <div class="flex-between flex-wrap gap-sm">
        <h3 style="font-size:15px">🧺 Commandes à préparer</h3>
        <div class="date-range-picker">
          <label>Du</label>
          <input type="date" id="prep-debut" value="">
          <label>Au</label>
          <input type="date" id="prep-fin" value="">
          <button class="btn btn-primary btn-sm" onclick="refreshPreparationPanel()">Filtrer</button>
          <button class="btn btn-secondary btn-sm" onclick="resetPreparationFilter()">Tout afficher</button>
        </div>
      </div>
      <p class="form-hint" style="margin:10px 0 0;">Commandes "en cours de préparation" (pas encore validées comme vendues). Filtre indépendant de celui des statistiques ci-dessus — utile pour préparer par exemple "les livraisons de cette semaine".</p>
      <div id="preparation-body">
        <div style="text-align:center;padding:30px;color:var(--text-muted)">Chargement...</div>
      </div>
    </div>
  `;
}

function initPreparationPanel() {
  loadPreparationPanel('', '');
}

function refreshPreparationPanel() {
  const debut = document.getElementById('prep-debut')?.value || '';
  const fin = document.getElementById('prep-fin')?.value || '';
  loadPreparationPanel(debut, fin);
}

function resetPreparationFilter() {
  const d = document.getElementById('prep-debut');
  const f = document.getElementById('prep-fin');
  if (d) d.value = '';
  if (f) f.value = '';
  loadPreparationPanel('', '');
}

// Apres une action sur une commande du panneau (validation, modification,
// suppression) : recharge le panneau ET les indicateurs de la page qui
// l'heberge (CA, top, nb commandes...), qui restaient sinon perimes.
// Rechargement "silencieux" du panneau (sans etat "Chargement...") pour ne
// pas faire sauter le defilement de la page pendant la mise a jour.
function refreshAfterPreparationChange() {
  const debut = document.getElementById('prep-debut')?.value || '';
  const fin = document.getElementById('prep-fin')?.value || '';
  loadPreparationPanel(debut, fin, { silent: true });
  const refresh = currentPage === 'dashboard' ? refreshDashboardBody()
    : currentPage === 'statistiques' ? refreshStats()
    : null;
  if (refresh) refresh.catch(e => toast(e.message, 'error'));
}

async function loadPreparationPanel(debut, fin, { silent = false } = {}) {
  const body = document.getElementById('preparation-body');
  if (body && !silent) body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">Chargement...</div>';

  const qs = prepQS(debut, fin);
  let recap, commandesEnCours;
  try {
    [recap, commandesEnCours] = await Promise.all([
      api(`/stats/a-preparer${qs ? '?' + qs : ''}`),
      api(`/commandes?statut=en_cours${qs ? '&' + qs : ''}`)
    ]);
  } catch (e) {
    const bodyEl = document.getElementById('preparation-body');
    if (bodyEl) bodyEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
    return;
  }

  const bodyEl = document.getElementById('preparation-body');
  if (!bodyEl) return; // page changee entre-temps
  bodyEl.innerHTML = renderPreparationBody(recap, commandesEnCours, debut, fin);
}

function renderPreparationBody(recap, commandesEnCours, debut, fin) {
  return `
    <p class="form-hint" style="margin:12px 0 16px;">${recap.nb_commandes} commande${recap.nb_commandes > 1 ? 's' : ''} en cours de préparation${debut && fin ? ' sur la période sélectionnée' : ''}.</p>

    ${recap.produits.length === 0 ? '' : `
    <div class="table-container mb-2">
      <table>
        <thead><tr><th>Produit</th><th class="text-right">Quantité à préparer</th><th class="text-right">Commandes</th></tr></thead>
        <tbody>
          ${recap.produits.map(r => `
            <tr>
              <td><strong>${esc(r.nom)}</strong></td>
              <td class="text-right">${fmtQty(r.quantite_totale)} ${r.unite === 'kg' ? 'kg' : 'unité(s)'}</td>
              <td class="text-right">${r.nb_commandes}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}

    ${commandesEnCours.length === 0 ? '<div class="empty-state"><div class="icon">🧺</div><p>Aucune commande en cours de préparation.</p></div>' : `
    <div class="table-container">
      <table>
        <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Produits</th><th>Livraison</th><th class="text-right">Total</th><th class="text-right">Actions</th></tr></thead>
        <tbody>
          ${commandesEnCours.map(c => `
            <tr>
              <td><span class="badge badge-blue">#${c.id}</span></td>
              <td>${fmtDate(c.date_commande)}</td>
              <td><strong>${esc(c.client_nom)}</strong></td>
              <td>${c.lignes.map(l => esc(l.produit_nom)).join(', ')}</td>
              <td>${c.livraison ? esc(c.livraison) : '—'}</td>
              <td class="text-right price-display">${fmt(c.prix_total)}</td>
              <td class="table-actions">
                <button class="btn-icon" onclick="validerCommande(${c.id}, 'preparation')" title="Marquer comme vendue">✅</button>
                <button class="btn-icon" onclick="openCommandeModal(${c.id}, 'preparation')" title="Modifier">✏️</button>
                <button class="btn-icon danger" onclick="deleteCommande(${c.id}, 'preparation')" title="Supprimer">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="flex-between flex-wrap gap-sm mt-2">
      <span class="form-hint">Exporter le récapitulatif et le détail des commandes ci-dessus</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="exportPreparation('pdf')">📄 Export PDF</button>
        <button class="btn btn-secondary btn-sm" onclick="exportPreparation('xlsx')">📊 Export Excel</button>
      </div>
    </div>`}
  `;
}

async function exportPreparation(format) {
  const debut = document.getElementById('prep-debut')?.value || '';
  const fin = document.getElementById('prep-fin')?.value || '';
  const qs = prepQS(debut, fin);
  try {
    const res = await fetch(`/api/export/preparation?format=${format}${qs ? '&' + qs : ''}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erreur export');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commandes_a_preparer_${todayLocal()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export généré');
  } catch (e) { toast(e.message, 'error'); }
}

// ========== CLIENTS ==========
async function renderClients() {
  clients = await api('/clients');
  const main = document.getElementById('main-content');
  
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Clients</h2>
        <p class="subtitle">${clients.length} client${clients.length > 1 ? 's' : ''} enregistré${clients.length > 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="openClientModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouveau client
      </button>
    </div>

    <div class="search-bar">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher un client..." oninput="filterClients(this.value)">
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-container" id="clients-table">
        ${renderClientsTable(clients)}
      </div>
    </div>
  `;
}

function renderClientsTable(list) {
  if (list.length === 0) return '<div class="empty-state"><div class="icon">👤</div><p>Aucun client enregistré</p><button class="btn btn-primary" onclick="openClientModal()">Ajouter un client</button></div>';
  return `<table>
    <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
    <tbody>
      ${list.map(c => `
        <tr>
          <td><strong>${esc(c.nom)}</strong></td>
          <td>${c.telephone ? esc(c.telephone) : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>${c.email ? esc(c.email) : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>${c.actif ? '<span class="badge badge-green">Actif</span>' : '<span class="badge badge-gray">Inactif</span>'}</td>
          <td class="table-actions">
            <button class="btn-icon" onclick="openClientModal(${c.id})" title="Modifier">✏️</button>
            <button class="btn-icon danger" onclick="deleteClient(${c.id})" title="Supprimer">🗑️</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

function filterClients(q) {
  q = q.toLowerCase();
  const filtered = clients.filter(c => c.nom.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q));
  document.getElementById('clients-table').innerHTML = renderClientsTable(filtered);
}

function openClientModal(id) {
  const c = id ? clients.find(x => x.id === id) : null;
  openModal(`
    <div class="modal-header">
      <h3>${c ? 'Modifier' : 'Nouveau'} client</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nom *</label>
        <input id="c-nom" class="form-control" value="${c ? esc(c.nom) : ''}" placeholder="Nom du client">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Téléphone</label>
          <input id="c-tel" class="form-control" value="${c && c.telephone ? esc(c.telephone) : ''}" placeholder="06 12 34 56 78">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input id="c-email" type="email" class="form-control" value="${c && c.email ? esc(c.email) : ''}" placeholder="client@email.com">
        </div>
      </div>
      <div class="form-group">
        <label class="form-check">
          <input id="c-actif" type="checkbox" ${!c || c.actif ? 'checked' : ''}>
          Client actif
        </label>
        <span class="form-hint">Un client inactif reste sélectionnable pour une commande (marqué « inactif ») mais n'est plus compté dans les clients actifs ni proposé dans les clients à relancer</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveClient(${id || 'null'})">${c ? 'Enregistrer' : 'Créer'}</button>
    </div>
  `);
}

async function saveClient(id) {
  const nom = document.getElementById('c-nom').value.trim();
  const telephone = document.getElementById('c-tel').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const actif = document.getElementById('c-actif').checked;
  if (!nom) { toast('Le nom est requis', 'error'); return; }
  try {
    if (id) { await api('/clients/' + id, 'PUT', { nom, telephone, email, actif }); toast('Client modifié'); }
    else { await api('/clients', 'POST', { nom, telephone, email, actif }); toast('Client créé'); }
    closeModal();
    renderClients();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteClient(id) {
  if (!confirm('Supprimer ce client ? Ses commandes existantes seront conservées (il y apparaîtra comme "Client supprimé"). Pour le retirer sans perdre son historique, préférez le désactiver via "Modifier".')) return;
  try { await api('/clients/' + id, 'DELETE'); toast('Client supprimé'); renderClients(); }
  catch (e) { toast(e.message, 'error'); }
}

// ========== COMMANDES ==========
let commandeLignes = [];

async function renderCommandes() {
  commandes = await api('/commandes');
  const main = document.getElementById('main-content');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Commandes</h2>
        <p class="subtitle">${commandes.length} commande${commandes.length > 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="openCommandeModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouvelle commande
      </button>
    </div>

    <div class="search-bar" style="justify-content:space-between;">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher par client ou lieu de livraison..." oninput="filterCommandes(this.value)">
      </div>
      <div class="segmented">
        <button class="${commandesStatutFilter === 'toutes' ? 'active' : ''}" onclick="setCommandesStatutFilter('toutes')">Toutes</button>
        <button class="${commandesStatutFilter === 'en_cours' ? 'active' : ''}" onclick="setCommandesStatutFilter('en_cours')">En cours</button>
        <button class="${commandesStatutFilter === 'vendu' ? 'active' : ''}" onclick="setCommandesStatutFilter('vendu')">Vendu</button>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-container" id="commandes-table">
        ${renderCommandesTable(applyCommandesFilters(''))}
      </div>
    </div>
  `;
}

function setCommandesStatutFilter(val) {
  commandesStatutFilter = val;
  renderCommandes();
}

function applyCommandesFilters(searchQuery) {
  let list = commandes;
  if (commandesStatutFilter !== 'toutes') list = list.filter(c => c.statut === commandesStatutFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(c => c.client_nom.toLowerCase().includes(q) || (c.livraison || '').toLowerCase().includes(q));
  }
  return list;
}

function statutBadge(statut) {
  return statut === 'vendu'
    ? '<span class="badge badge-green">Vendu</span>'
    : '<span class="badge badge-gold">En cours</span>';
}

function renderCommandesTable(list) {
  if (list.length === 0) return '<div class="empty-state"><div class="icon">🛒</div><p>Aucune commande enregistrée</p><button class="btn btn-primary" onclick="openCommandeModal()">Créer une commande</button></div>';
  return `<table>
    <thead><tr><th>N°</th><th>Statut</th><th>Date</th><th>Client</th><th>Produits</th><th>Livraison</th><th class="text-right">Total</th><th class="text-right">Actions</th></tr></thead>
    <tbody>
      ${list.map(c => `
        <tr class="cmd-row" onclick="openCommandeDetail(${c.id})" style="cursor:pointer">
          <td><span class="badge badge-blue">#${c.id}</span></td>
          <td>${statutBadge(c.statut)}</td>
          <td>${fmtDate(c.date_commande)}</td>
          <td><strong>${esc(c.client_nom)}</strong></td>
          <td><span class="badge badge-green">${c.lignes.length} produit${c.lignes.length > 1 ? 's' : ''}</span></td>
          <td>${c.livraison ? `<span class="badge badge-livraison">${esc(c.livraison)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td class="text-right price-display">${fmt(c.prix_total)}${hasPromo(c) ? ' <span class="badge badge-gold" title="Prix modifié manuellement">Promo</span>' : ''}</td>
          <td class="table-actions" onclick="event.stopPropagation()">
            ${c.statut === 'en_cours' ? `<button class="btn-icon" onclick="validerCommande(${c.id})" title="Marquer comme vendue">✅</button>` : ''}
            <button class="btn-icon" onclick="openCommandeModal(${c.id})" title="Modifier">✏️</button>
            <button class="btn-icon danger" onclick="deleteCommande(${c.id})" title="Supprimer">🗑️</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

function openCommandeDetail(id) {
  const c = commandes.find(x => x.id === id);
  if (!c) return;
  
  const totalCalc = lignesTotal(c);
  const promo = hasPromo(c);

  openModal(`
    <div class="modal-header">
      <h3>Commande #${c.id}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="detail-meta">
        <div class="detail-meta-item">
          <span class="detail-meta-label">Statut</span>
          <span class="detail-meta-value">${statutBadge(c.statut)}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Client</span>
          <span class="detail-meta-value">${esc(c.client_nom)}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Date</span>
          <span class="detail-meta-value">${fmtDate(c.date_commande)}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Livraison</span>
          <span class="detail-meta-value">${c.livraison ? esc(c.livraison) : '—'}</span>
        </div>
      </div>

      <h4 style="font-size:14px;font-weight:600;margin:20px 0 12px;color:var(--text-secondary)">Détail des articles</h4>
      <div class="table-container">
        <table>
          <thead><tr><th>Produit</th><th>Unité</th><th class="text-right">Qté</th><th class="text-right">Prix unit.</th><th class="text-right">Sous-total</th></tr></thead>
          <tbody>
            ${c.lignes.map(l => `
              <tr>
                <td><strong>${esc(l.produit_nom)}</strong></td>
                <td><span class="badge badge-green">${l.produit_unite === 'kg' ? 'kg' : 'unité'}</span></td>
                <td class="text-right">${fmtQty(l.quantite)}${l.produit_unite === 'kg' ? ' kg' : 'x'}</td>
                <td class="text-right">${fmt(l.prix_unitaire)}</td>
                <td class="text-right price-display">${fmt(l.prix_ligne)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="detail-totals">
        <div class="detail-total-row">
          <span>Sous-total articles</span>
          <span class="price-display">${fmt(totalCalc)}</span>
        </div>
        ${promo ? `
        <div class="detail-total-row promo">
          <span>Prix promotionnel appliqué</span>
          <span class="price-display">${fmt(c.prix_manuel)}</span>
        </div>` : ''}
        <div class="detail-total-row final">
          <span>Total facturé</span>
          <span class="price-display">${fmt(c.prix_total)}</span>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
      <button class="btn btn-primary" onclick="closeModal();openCommandeModal(${c.id})">Modifier</button>
    </div>
  `);
}

function filterCommandes(q) {
  document.getElementById('commandes-table').innerHTML = renderCommandesTable(applyCommandesFilters(q));
}

async function openCommandeModal(id, context) {
  commandeModalContext = context || 'commandes';
  const allProduits = await api('/produits');
  const allClients = await api('/clients');
  produits = allProduits;
  clients = allClients;

  // Depuis le panneau "a preparer", la commande a modifier ne fait pas
  // forcement partie du tableau `commandes` (charge pour la page Commandes) :
  // on va la rechercher via l'API si besoin plutot que de supposer qu'elle
  // est deja en memoire.
  let cmd = id ? commandes.find(x => x.id === id) : null;
  if (id && !cmd) {
    const all = await api('/commandes');
    cmd = all.find(x => x.id === id) || null;
  }

  if (cmd) {
    commandeLignes = cmd.lignes.map(l => ({
      produit_id: l.produit_id,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire
    }));
  } else {
    commandeLignes = [{ produit_id: allProduits[0]?.id || '', quantite: 1, prix_unitaire: allProduits[0]?.prix || 0 }];
  }

  openModal(`
    <div class="modal-header">
      <h3>${cmd ? 'Modifier' : 'Nouvelle'} commande</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label>Client *</label>
          <select id="cmd-client" class="form-control">
            ${cmd && !allClients.find(c => c.id === cmd.client_id) ? `<option value="${cmd.client_id}" selected disabled>Client supprimé</option>` : ''}
            ${allClients.map(c => `<option value="${c.id}" ${cmd && cmd.client_id === c.id ? 'selected' : ''}>${esc(c.nom)}${!c.actif ? ' (inactif)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input id="cmd-date" type="date" class="form-control" value="${cmd ? cmd.date_commande : todayLocal()}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-check">
          <input id="cmd-statut-vendu" type="checkbox" ${cmd ? (cmd.statut === 'vendu' ? 'checked' : '') : ''}>
          Marquer comme vendue
        </label>
        <span class="form-hint">Décochée, la commande reste "En cours de préparation" : elle apparaît dans le panneau à préparer et ne compte dans aucune statistique tant qu'elle n'est pas validée.</span>
      </div>

      <div class="form-group">
        <label>Produits commandés</label>
        <div id="cmd-lignes"></div>
        <button class="add-ligne-btn" onclick="addLigne()">+ Ajouter un produit</button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:2px solid var(--border)">
        <strong>Total calculé :</strong>
        <span id="cmd-total-calc" class="price-display" style="font-size:18px;color:var(--accent)"></span>
      </div>

      <div class="form-row mt-2">
        <div class="form-group">
          <label>Prix manuel (promotions)</label>
          <input id="cmd-prix-manuel" type="number" step="0.01" min="0" class="form-control" value="${cmd && cmd.prix_manuel != null ? cmd.prix_manuel : ''}" placeholder="Laisser vide = prix auto">
          <span class="form-hint">Remplace le prix calculé si renseigné</span>
        </div>
        <div class="form-group">
          <label>Lieu de livraison</label>
          <input id="cmd-livraison" class="form-control" value="${cmd && cmd.livraison ? esc(cmd.livraison) : ''}" placeholder="Ex: Marché de Rungis, Ferme, Domicile...">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveCommande(${id || 'null'})">${cmd ? 'Enregistrer' : 'Créer'}</button>
    </div>
  `);
  
  renderLignes();
}

function renderLignes() {
  const container = document.getElementById('cmd-lignes');
  if (!container) return;
  
  container.innerHTML = `
    <div class="lignes-header">
      <span>Produit</span>
      <span>Quantité</span>
      <span>Prix unit.</span>
      <span>Sous-total</span>
      <span></span>
    </div>
    ${commandeLignes.map((l, i) => `
      <div class="ligne-item">
        <select class="form-control" onchange="updateLigneProduit(${i}, this.value)">
          ${!produits.find(p => p.id == l.produit_id) ? `<option value="${l.produit_id}" selected disabled>Produit supprimé</option>` : ''}
          ${produits.map(p => `<option value="${p.id}" ${l.produit_id == p.id ? 'selected' : ''}>${esc(p.nom)} (${fmt(p.prix)}/${p.unite})</option>`).join('')}
        </select>
        <input type="number" step="0.1" min="0.1" class="form-control" value="${l.quantite}" onchange="updateLigneQty(${i}, this.value)">
        <input type="number" step="0.01" min="0" class="form-control" value="${l.prix_unitaire}" onchange="updateLignePrix(${i}, this.value)">
        <div class="ligne-total">${fmt(l.quantite * l.prix_unitaire)}</div>
        <button class="btn-icon danger" onclick="removeLigne(${i})" ${commandeLignes.length <= 1 ? 'disabled style="opacity:0.3"' : ''}>×</button>
      </div>
    `).join('')}
  `;
  
  updateTotal();
}

function updateLigneProduit(i, produitId) {
  const p = produits.find(x => x.id == produitId);
  commandeLignes[i].produit_id = parseInt(produitId);
  commandeLignes[i].prix_unitaire = p ? p.prix : 0;
  renderLignes();
}

function updateLigneQty(i, val) {
  // Clamp a 0 : une quantite negative n'a pas de sens et fausserait les totaux.
  commandeLignes[i].quantite = Math.max(0, parseFloat(val) || 0);
  renderLignes();
}

function updateLignePrix(i, val) {
  commandeLignes[i].prix_unitaire = Math.max(0, parseFloat(val) || 0);
  renderLignes();
}

function addLigne() {
  const p = produits[0];
  commandeLignes.push({ produit_id: p?.id || '', quantite: 1, prix_unitaire: p?.prix || 0 });
  renderLignes();
}

function removeLigne(i) {
  if (commandeLignes.length <= 1) return;
  commandeLignes.splice(i, 1);
  renderLignes();
}

function updateTotal() {
  const total = commandeLignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  const el = document.getElementById('cmd-total-calc');
  if (el) el.textContent = fmt(total);
}

async function saveCommande(id) {
  const client_id = parseInt(document.getElementById('cmd-client').value);
  const date_commande = document.getElementById('cmd-date').value;
  const prixManuelVal = document.getElementById('cmd-prix-manuel').value;
  const prix_manuel = prixManuelVal !== '' ? parseFloat(prixManuelVal) : null;
  const livraison = document.getElementById('cmd-livraison').value.trim();
  const statut = document.getElementById('cmd-statut-vendu').checked ? 'vendu' : 'en_cours';

  if (!client_id || !date_commande || commandeLignes.length === 0) {
    toast('Veuillez remplir tous les champs obligatoires', 'error');
    return;
  }
  for (const l of commandeLignes) {
    if (!l.produit_id) { toast('Sélectionnez un produit pour chaque ligne (créez d\'abord un produit si la liste est vide)', 'error'); return; }
    if (!(l.quantite > 0)) { toast('La quantité de chaque produit doit être supérieure à 0', 'error'); return; }
    if (!(l.prix_unitaire >= 0)) { toast('Le prix unitaire ne peut pas être négatif', 'error'); return; }
  }
  if (prix_manuel != null && prix_manuel < 0) { toast('Le prix manuel ne peut pas être négatif', 'error'); return; }

  const lignes = commandeLignes.map(l => ({
    produit_id: l.produit_id,
    quantite: l.quantite,
    prix_unitaire: l.prix_unitaire
  }));

  try {
    if (id) {
      await api('/commandes/' + id, 'PUT', { client_id, date_commande, lignes, prix_manuel, livraison, statut });
      toast('Commande modifiée');
    } else {
      await api('/commandes', 'POST', { client_id, date_commande, lignes, prix_manuel, livraison, statut });
      toast(statut === 'vendu' ? 'Commande créée et marquée vendue' : 'Commande créée (en cours de préparation)');
    }
    closeModal();
    if (commandeModalContext === 'preparation') refreshAfterPreparationChange();
    else renderCommandes();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCommande(id, context) {
  if (!confirm('Supprimer cette commande ?')) return;
  try {
    await api('/commandes/' + id, 'DELETE');
    toast('Commande supprimée');
    if (context === 'preparation') refreshAfterPreparationChange();
    else renderCommandes();
  } catch (e) { toast(e.message, 'error'); }
}

async function validerCommande(id, context) {
  try {
    await api('/commandes/' + id + '/valider', 'POST');
    toast('Commande validée comme vendue');
    if (context === 'preparation') refreshAfterPreparationChange();
    else renderCommandes();
  } catch (e) { toast(e.message, 'error'); }
}

// ========== DEPENSES ==========
async function renderDepenses() {
  depenses = await api('/depenses');
  const main = document.getElementById('main-content');
  const total = depenses.reduce((s, d) => s + d.prix, 0);
  
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Dépenses</h2>
        <p class="subtitle">${depenses.length} dépense${depenses.length > 1 ? 's' : ''} — Total : ${fmt(total)}</p>
      </div>
      <button class="btn btn-primary" onclick="openDepenseModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouvelle dépense
      </button>
    </div>

    <div class="search-bar">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher une dépense..." oninput="filterDepenses(this.value)">
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-container" id="depenses-table">
        ${renderDepensesTable(depenses)}
      </div>
    </div>
  `;
}

function renderDepensesTable(list) {
  if (list.length === 0) return '<div class="empty-state"><div class="icon">💸</div><p>Aucune dépense enregistrée</p><button class="btn btn-primary" onclick="openDepenseModal()">Ajouter une dépense</button></div>';
  return `<table>
    <thead><tr><th>Date</th><th>Nom</th><th>Catégorie</th><th class="text-right">Montant</th><th class="text-right">Actions</th></tr></thead>
    <tbody>
      ${list.map(d => `
        <tr>
          <td>${fmtDate(d.date_depense)}</td>
          <td><strong>${esc(d.nom)}</strong></td>
          <td>${d.categorie ? `<span class="badge badge-gold">${esc(d.categorie)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td class="text-right price-display" style="color:var(--danger)">${fmt(d.prix)}</td>
          <td class="table-actions">
            <button class="btn-icon" onclick="openDepenseModal(${d.id})" title="Modifier">✏️</button>
            <button class="btn-icon danger" onclick="deleteDepense(${d.id})" title="Supprimer">🗑️</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

function filterDepenses(q) {
  q = q.toLowerCase();
  const filtered = depenses.filter(d => d.nom.toLowerCase().includes(q) || (d.categorie || '').toLowerCase().includes(q));
  document.getElementById('depenses-table').innerHTML = renderDepensesTable(filtered);
}

function openDepenseModal(id) {
  const d = id ? depenses.find(x => x.id === id) : null;
  openModal(`
    <div class="modal-header">
      <h3>${d ? 'Modifier' : 'Nouvelle'} dépense</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nom de la dépense *</label>
        <input id="d-nom" class="form-control" value="${d ? esc(d.nom) : ''}" placeholder="Ex: Achat semences">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date *</label>
          <input id="d-date" type="date" class="form-control" value="${d ? d.date_depense : todayLocal()}">
        </div>
        <div class="form-group">
          <label>Montant (€) *</label>
          <input id="d-prix" type="number" step="0.01" min="0" class="form-control" value="${d ? d.prix : ''}" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label>Catégorie</label>
        <input id="d-cat" class="form-control" value="${d && d.categorie ? esc(d.categorie) : ''}" placeholder="Ex: Semences, Matériel, Carburant...">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveDepense(${id || 'null'})">${d ? 'Enregistrer' : 'Créer'}</button>
    </div>
  `);
}

async function saveDepense(id) {
  const nom = document.getElementById('d-nom').value.trim();
  const date_depense = document.getElementById('d-date').value;
  const prix = parseFloat(document.getElementById('d-prix').value);
  const categorie = document.getElementById('d-cat').value.trim();
  if (!nom || !date_depense || isNaN(prix)) { toast('Veuillez remplir tous les champs obligatoires', 'error'); return; }
  if (prix < 0) { toast('Le montant ne peut pas être négatif', 'error'); return; }
  try {
    if (id) { await api('/depenses/' + id, 'PUT', { nom, date_depense, prix, categorie }); toast('Dépense modifiée'); }
    else { await api('/depenses', 'POST', { nom, date_depense, prix, categorie }); toast('Dépense créée'); }
    closeModal();
    renderDepenses();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteDepense(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  try { await api('/depenses/' + id, 'DELETE'); toast('Dépense supprimée'); renderDepenses(); }
  catch (e) { toast(e.message, 'error'); }
}

// ========== STATISTIQUES ==========
async function renderStatistiques() {
  const main = document.getElementById('main-content');

  // Default range: last 12 months
  const now = new Date();
  const debut = todayLocal(new Date(now.getFullYear() - 1, now.getMonth(), 1));
  const fin = todayLocal(now);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Statistiques</h2>
        <p class="subtitle">Analyse des performances de votre activité</p>
      </div>
    </div>

    <div class="card mb-2">
      <div class="flex-between flex-wrap gap-sm">
        <h3 style="font-size:15px">Période d'analyse</h3>
        <div class="date-range-picker">
          <label>Du</label>
          <input type="date" id="stat-debut" value="${debut}">
          <label>Au</label>
          <input type="date" id="stat-fin" value="${fin}">
          <div class="segmented">
            <button class="${statsGranularite === 'mois' ? 'active' : ''}" data-val="mois" onclick="setStatsGranularite('mois')">Mois</button>
            <button class="${statsGranularite === 'semaine' ? 'active' : ''}" data-val="semaine" onclick="setStatsGranularite('semaine')">Semaine</button>
          </div>
          <button class="btn btn-primary btn-sm" onclick="refreshStats()">Actualiser</button>
        </div>
      </div>
    </div>

    <div id="stats-content">
      <div style="text-align:center;padding:40px;color:var(--text-muted)">Chargement des statistiques...</div>
    </div>

    ${preparationPanelHTML()}
  `;

  await refreshStats();
  initPreparationPanel();
}

function setStatsGranularite(val) {
  statsGranularite = val;
  document.querySelectorAll('#main-content .segmented button').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
  refreshStats();
}

async function refreshStats() {
  destroyCharts();
  const debut = document.getElementById('stat-debut').value;
  const fin = document.getElementById('stat-fin').value;
  const qs = `debut=${debut}&fin=${fin}`;
  const qsG = `${qs}&granularite=${statsGranularite}`;

  const [dashboard, topClients, topProduits, mensuel, parSemaine, parClientsSemaine, parMois, evoClients, catDep, livraisons] = await Promise.all([
    api(`/stats/dashboard?${qs}`),
    api(`/stats/top-clients?${qs}&limit=10`),
    api(`/stats/top-produits?${qs}&limit=10`),
    api(`/stats/mensuel?${qsG}`),
    api(`/stats/commandes-par-semaine?${qs}`),
    api(`/stats/clients-par-semaine?${qs}`),
    api(`/stats/commandes-par-mois?${qsG}`),
    api(`/stats/evolution-clients?${qsG}`),
    api(`/stats/categories-depenses?${qs}`),
    api(`/stats/livraisons?${qs}`)
  ]);

  const periodeLabel = statsGranularite === 'semaine' ? 'semaine' : 'mois';

  const container = document.getElementById('stats-content');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-label">Chiffre d'affaires</div>
        <div class="stat-value green">${fmt(dashboard.chiffre_affaires)}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Dépenses</div>
        <div class="stat-value red">${fmt(dashboard.depenses)}</div>
      </div>
      <div class="stat-card ${dashboard.benefice >= 0 ? 'blue' : 'red'}">
        <div class="stat-label">Bénéfice</div>
        <div class="stat-value ${dashboard.benefice >= 0 ? 'blue' : 'red'}">${fmt(dashboard.benefice)}</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Moy. commandes/semaine</div>
        <div class="stat-value gold">${parSemaine.moyenne}</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Moy. clients/semaine</div>
        <div class="stat-value gold">${parClientsSemaine.moyenne}</div>
        <div class="form-hint" style="margin-top:6px;">Clients distincts ayant commandé, en moyenne par semaine</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Panier moyen</div>
        <div class="stat-value blue">${fmt(dashboard.panier_moyen)}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Marge bénéficiaire</div>
        <div class="stat-value green">${dashboard.chiffre_affaires > 0 ? Math.round(dashboard.benefice / dashboard.chiffre_affaires * 100) : 0}%</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card full-width">
        <div class="card-header"><h3>📊 CA / Dépenses / Bénéfice par ${periodeLabel}</h3></div>
        <div class="chart-wrapper"><canvas id="chart-mensuel"></canvas></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>🏆 Top 10 Clients</h3></div>
        ${topClients.length === 0 ? '<p style="color:var(--text-muted)">Aucune donnée</p>' : `
        <ul class="rank-list">
          ${topClients.map((c, i) => `
            <li class="rank-item">
              <div class="rank-number rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
              <div class="rank-info">
                <div class="rank-name">${esc(c.nom)}</div>
                <div class="rank-detail">${c.nb_commandes} cmd${c.nb_commandes > 1 ? 's' : ''}</div>
              </div>
              <div class="rank-value">${fmt(c.ca_total)}${pct(c.ca_total, dashboard.chiffre_affaires) != null ? `<span class="rank-pct">${pct(c.ca_total, dashboard.chiffre_affaires)}% du CA</span>` : ''}</div>
            </li>
          `).join('')}
        </ul>`}
      </div>

      <div class="card">
        <div class="card-header"><h3>🥬 Top 10 Produits</h3></div>
        ${topProduits.length === 0 ? '<p style="color:var(--text-muted)">Aucune donnée</p>' : `
        <ul class="rank-list">
          ${topProduits.map((p, i) => `
            <li class="rank-item">
              <div class="rank-number rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
              <div class="rank-info">
                <div class="rank-name">${esc(p.nom)}</div>
                <div class="rank-detail">${fmtQty(p.quantite_totale)} ${p.unite === 'kg' ? 'kg' : 'unités'}</div>
              </div>
              <div class="rank-value">${fmt(p.ca_total)}${pct(p.ca_total, dashboard.chiffre_affaires) != null ? `<span class="rank-pct">${pct(p.ca_total, dashboard.chiffre_affaires)}% du CA</span>` : ''}</div>
            </li>
          `).join('')}
        </ul>`}
      </div>

      <div class="card">
        <div class="card-header"><h3>📦 Commandes par ${periodeLabel}</h3></div>
        <div class="chart-wrapper"><canvas id="chart-cmd-mois"></canvas></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>👥 Clients qui commandent par ${periodeLabel}</h3></div>
        <div class="chart-wrapper"><canvas id="chart-clients"></canvas></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>💰 Répartition des dépenses</h3></div>
        <div class="chart-wrapper"><canvas id="chart-dep-cat"></canvas></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>📍 Répartition des livraisons</h3></div>
        ${livraisons.length === 0 ? '<p style="color:var(--text-muted)">Aucune donnée</p>' : `
        <div class="chart-wrapper"><canvas id="chart-livraisons"></canvas></div>
        <div class="mt-2">
          <ul class="rank-list">
            ${livraisons.map((l, i) => `
              <li class="rank-item">
                <div class="rank-number rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
                <div class="rank-info">
                  <div class="rank-name">${esc(l.livraison)}</div>
                  <div class="rank-detail">${l.nb_commandes} commande${l.nb_commandes > 1 ? 's' : ''}</div>
                </div>
                <div class="rank-value">${fmt(l.ca_total)}</div>
              </li>
            `).join('')}
          </ul>
        </div>`}
      </div>
    </div>
  `;

  // Chart.js global config
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.color = '#5C5C5C';

  // Monthly CA/Dep/Ben chart
  if (mensuel.length > 0) {
    chartInstances['mensuel'] = new Chart(document.getElementById('chart-mensuel'), {
      type: 'bar',
      data: {
        labels: mensuel.map(m => fmtPeriode(m.periode, statsGranularite)),
        datasets: [
          { label: "Chiffre d'affaires", data: mensuel.map(m => m.ca), backgroundColor: 'rgba(61,124,71,0.7)', borderRadius: 4 },
          { label: 'Dépenses', data: mensuel.map(m => m.depenses), backgroundColor: 'rgba(192,57,43,0.7)', borderRadius: 4 },
          { label: 'Bénéfice', data: mensuel.map(m => m.benefice), backgroundColor: 'rgba(41,128,185,0.7)', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.raw) } }
        },
        scales: {
          y: { ticks: { callback: v => fmt(v) }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Orders per month
  if (parMois.length > 0) {
    chartInstances['cmdMois'] = new Chart(document.getElementById('chart-cmd-mois'), {
      type: 'line',
      data: {
        labels: parMois.map(m => fmtPeriode(m.periode, statsGranularite)),
        datasets: [{
          label: 'Commandes',
          data: parMois.map(m => m.nb),
          borderColor: '#3D7C47',
          backgroundColor: 'rgba(61,124,71,0.1)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#3D7C47',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Active clients per month
  if (evoClients.length > 0) {
    chartInstances['clients'] = new Chart(document.getElementById('chart-clients'), {
      type: 'line',
      data: {
        labels: evoClients.map(m => fmtPeriode(m.periode, statsGranularite)),
        datasets: [{
          label: 'Clients qui commandent',
          data: evoClients.map(m => m.nb_clients),
          borderColor: '#2980B9',
          backgroundColor: 'rgba(41,128,185,0.1)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#2980B9',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Expense categories pie chart
  if (catDep.length > 0) {
    const colors = ['#3D7C47', '#2980B9', '#D4A017', '#C0392B', '#8E44AD', '#16A085', '#E67E22', '#2C3E50'];
    chartInstances['depCat'] = new Chart(document.getElementById('chart-dep-cat'), {
      type: 'doughnut',
      data: {
        labels: catDep.map(c => c.categorie),
        datasets: [{
          data: catDep.map(c => c.total),
          backgroundColor: catDep.map((_, i) => colors[i % colors.length]),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmt(ctx.raw) } }
        }
      }
    });
  }

  // Livraison distribution chart
  if (livraisons.length > 0) {
    const colorsLiv = ['#16A085', '#2980B9', '#8E44AD', '#D4A017', '#C0392B', '#3D7C47', '#E67E22', '#2C3E50'];
    chartInstances['livraisons'] = new Chart(document.getElementById('chart-livraisons'), {
      type: 'doughnut',
      data: {
        labels: livraisons.map(l => l.livraison),
        datasets: [{
          data: livraisons.map(l => l.nb_commandes),
          backgroundColor: livraisons.map((_, i) => colorsLiv[i % colorsLiv.length]),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw + ' commande' + (ctx.raw > 1 ? 's' : '') } }
        }
      }
    });
  }
}

// ========== EXPORT / IMPORT ==========
async function exportDB() {
  try {
    const res = await fetch('/api/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maraichage_backup_${todayLocal()}.db`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Base de données exportée');
  } catch (e) { toast('Erreur export: ' + e.message, 'error'); }
}

async function importDB(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm('Attention : cette action remplacera toutes les données actuelles. Continuer ?')) {
    input.value = '';
    return;
  }
  try {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const bytes = new Uint8Array(reader.result);
        // Convert to base64 in chunks to avoid call stack overflow
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        await api('/import', 'POST', { data: base64 });
        toast('Base de données importée avec succès');
        renderPage();
      } catch (e) {
        toast('Erreur import: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (e) { toast('Erreur import: ' + e.message, 'error'); }
  input.value = '';
}

async function exportCSV() {
  try {
    const data = await api('/export-csv');
    for (const [name, csv] of Object.entries(data)) {
      if (!csv) continue;
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_${todayLocal()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast('Export CSV terminé');
  } catch (e) { toast('Erreur export CSV: ' + e.message, 'error'); }
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

// ========== AUTO-UPDATE ==========
let updatePollInterval = null;

async function checkForUpdates() {
  try {
    const data = await api('/check-update');
    
    if (data.status === 'available') {
      showUpdateBanner('available', data);
    } else if (data.status === 'downloading') {
      showUpdateBanner('downloading', data);
    } else if (data.status === 'ready') {
      showUpdateBanner('ready', data);
    } else if (data.status === 'idle' || data.status === 'checking') {
      // Verification pas encore terminee cote Electron : on continue d'interroger.
    } else {
      // A jour, erreur, ou statut absent (mode navigateur "npm start", qui
      // n'expose pas electron-updater) : on retire le bandeau et on arrete
      // d'interroger, au lieu de solliciter GitHub toutes les 10 s.
      const existing = document.getElementById('update-banner');
      if (existing) existing.remove();
      stopUpdatePolling();
    }
  } catch (e) {
    // Silently ignore
  }
}

function stopUpdatePolling() {
  clearInterval(updatePollInterval);
  updatePollInterval = null;
}

// "Plus tard" : on arrete aussi l'interrogation, sinon le controle suivant
// (10 s plus tard) recreait aussitot le bandeau. Il reapparaitra au
// prochain lancement de l'application.
function dismissUpdateBanner() {
  const existing = document.getElementById('update-banner');
  if (existing) existing.remove();
  stopUpdatePolling();
}

function showUpdateBanner(state, data) {
  let existing = document.getElementById('update-banner');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'update-banner';
    document.body.prepend(existing);
  }

  const version = data.info ? data.info.version : '';
  const current = data.current || '';

  if (state === 'available') {
    existing.innerHTML = `<div class="update-banner-content">
      <div class="update-banner-text">
        <strong>Nouvelle version disponible : v${esc(version)}</strong>
        <span>Vous utilisez la v${esc(current)}</span>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="downloadUpdate()">Mettre a jour</button>
        <button class="btn btn-secondary btn-sm" onclick="dismissUpdateBanner()">Plus tard</button>
      </div>
    </div>`;
  } else if (state === 'downloading') {
    const pct = data.progress ? data.progress.percent : 0;
    existing.innerHTML = `<div class="update-banner-content">
      <div class="update-banner-text">
        <strong>Telechargement de la v${esc(version)}...</strong>
        <span>${pct}% termine</span>
      </div>
      <div class="update-progress-bar"><div class="update-progress-fill" style="width:${pct}%"></div></div>
    </div>`;
  } else if (state === 'ready') {
    existing.innerHTML = `<div class="update-banner-content">
      <div class="update-banner-text">
        <strong>v${esc(version)} prete !</strong>
        <span>Redemarrez pour appliquer la mise a jour</span>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="installUpdate()">Redemarrer maintenant</button>
        <button class="btn btn-secondary btn-sm" onclick="dismissUpdateBanner()">Plus tard</button>
      </div>
    </div>`;
    stopUpdatePolling();
  }
}

async function downloadUpdate() {
  try {
    await api('/download-update', 'POST');
    // Start polling for progress
    if (!updatePollInterval) {
      updatePollInterval = setInterval(checkForUpdates, 1500);
    }
  } catch (e) {
    toast('Erreur de telechargement', 'error');
  }
}

async function installUpdate() {
  try {
    await api('/install-update', 'POST');
    // App will quit and restart
  } catch (e) {
    toast('Erreur d\'installation', 'error');
  }
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  navigate('dashboard');
  // Load version
  api('/version').then(data => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = 'v' + data.version;
  }).catch(() => {});
  // Check for updates after delay, then poll occasionally
  setTimeout(function() {
    checkForUpdates();
    updatePollInterval = setInterval(checkForUpdates, 10000);
  }, 3000);
});
