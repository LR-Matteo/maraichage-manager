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

// ========== UTILITIES ==========
function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMonth(m) {
  const [y, mo] = m.split('-');
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return months[parseInt(mo) - 1] + ' ' + y;
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
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
  const stats = await api('/stats/dashboard');
  const topClients = await api('/stats/top-clients?limit=5');
  const topProduits = await api('/stats/top-produits?limit=5');
  const recent = await api('/commandes');
  const recentCmd = recent.slice(0, 5);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Tableau de bord</h2>
        <p class="subtitle">Vue d'ensemble de votre activité</p>
      </div>
    </div>

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
              <div class="rank-value">${fmt(c.ca_total)}</div>
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
                <div class="rank-detail">${p.quantite_totale} ${p.unite === 'kg' ? 'kg vendus' : 'unités vendues'}</div>
              </div>
              <div class="rank-value">${fmt(p.ca_total)}</div>
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
  try {
    if (id) { await api('/produits/' + id, 'PUT', { nom, prix, unite }); toast('Produit modifié'); }
    else { await api('/produits', 'POST', { nom, prix, unite }); toast('Produit créé'); }
    closeModal();
    renderProduits();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteProduit(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  try { await api('/produits/' + id, 'DELETE'); toast('Produit supprimé'); renderProduits(); }
  catch (e) { toast(e.message, 'error'); }
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
    <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th class="text-right">Actions</th></tr></thead>
    <tbody>
      ${list.map(c => `
        <tr>
          <td><strong>${esc(c.nom)}</strong></td>
          <td>${c.telephone ? esc(c.telephone) : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>${c.email ? esc(c.email) : '<span style="color:var(--text-muted)">—</span>'}</td>
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
  if (!nom) { toast('Le nom est requis', 'error'); return; }
  try {
    if (id) { await api('/clients/' + id, 'PUT', { nom, telephone, email }); toast('Client modifié'); }
    else { await api('/clients', 'POST', { nom, telephone, email }); toast('Client créé'); }
    closeModal();
    renderClients();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteClient(id) {
  if (!confirm('Supprimer ce client ?')) return;
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

    <div class="search-bar">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher par client ou lieu de livraison..." oninput="filterCommandes(this.value)">
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-container" id="commandes-table">
        ${renderCommandesTable(commandes)}
      </div>
    </div>
  `;
}

function renderCommandesTable(list) {
  if (list.length === 0) return '<div class="empty-state"><div class="icon">🛒</div><p>Aucune commande enregistrée</p><button class="btn btn-primary" onclick="openCommandeModal()">Créer une commande</button></div>';
  return `<table>
    <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Produits</th><th>Livraison</th><th class="text-right">Total</th><th class="text-right">Actions</th></tr></thead>
    <tbody>
      ${list.map(c => `
        <tr class="cmd-row" onclick="openCommandeDetail(${c.id})" style="cursor:pointer">
          <td><span class="badge badge-blue">#${c.id}</span></td>
          <td>${fmtDate(c.date_commande)}</td>
          <td><strong>${esc(c.client_nom)}</strong></td>
          <td><span class="badge badge-green">${c.lignes.length} produit${c.lignes.length > 1 ? 's' : ''}</span></td>
          <td>${c.livraison ? `<span class="badge badge-livraison">${esc(c.livraison)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td class="text-right price-display">${fmt(c.prix_total)}${c.prix_manuel != null ? ' <span class="badge badge-gold" title="Prix modifié manuellement">Promo</span>' : ''}</td>
          <td class="table-actions" onclick="event.stopPropagation()">
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
  
  const totalCalc = c.lignes.reduce((s, l) => s + l.prix_ligne, 0);
  const hasPromo = c.prix_manuel != null && c.prix_manuel !== totalCalc;
  
  openModal(`
    <div class="modal-header">
      <h3>Commande #${c.id}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="detail-meta">
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
                <td class="text-right">${l.quantite}${l.produit_unite === 'kg' ? ' kg' : 'x'}</td>
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
        ${hasPromo ? `
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
  q = q.toLowerCase();
  const filtered = commandes.filter(c => c.client_nom.toLowerCase().includes(q) || (c.livraison || '').toLowerCase().includes(q));
  document.getElementById('commandes-table').innerHTML = renderCommandesTable(filtered);
}

async function openCommandeModal(id) {
  const allProduits = await api('/produits');
  const allClients = await api('/clients');
  produits = allProduits;
  clients = allClients;
  
  const cmd = id ? commandes.find(x => x.id === id) : null;
  
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
            ${allClients.map(c => `<option value="${c.id}" ${cmd && cmd.client_id === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input id="cmd-date" type="date" class="form-control" value="${cmd ? cmd.date_commande : new Date().toISOString().slice(0,10)}">
        </div>
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
  commandeLignes[i].quantite = parseFloat(val) || 0;
  renderLignes();
}

function updateLignePrix(i, val) {
  commandeLignes[i].prix_unitaire = parseFloat(val) || 0;
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
  
  if (!client_id || !date_commande || commandeLignes.length === 0) {
    toast('Veuillez remplir tous les champs obligatoires', 'error');
    return;
  }
  
  const lignes = commandeLignes.map(l => ({
    produit_id: l.produit_id,
    quantite: l.quantite,
    prix_unitaire: l.prix_unitaire
  }));
  
  try {
    if (id) {
      await api('/commandes/' + id, 'PUT', { client_id, date_commande, lignes, prix_manuel, livraison });
      toast('Commande modifiée');
    } else {
      await api('/commandes', 'POST', { client_id, date_commande, lignes, prix_manuel, livraison });
      toast('Commande créée');
    }
    closeModal();
    renderCommandes();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCommande(id) {
  if (!confirm('Supprimer cette commande ?')) return;
  try { await api('/commandes/' + id, 'DELETE'); toast('Commande supprimée'); renderCommandes(); }
  catch (e) { toast(e.message, 'error'); }
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
          <input id="d-date" type="date" class="form-control" value="${d ? d.date_depense : new Date().toISOString().slice(0,10)}">
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
  const debut = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);
  const fin = now.toISOString().slice(0, 10);

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
          <button class="btn btn-primary btn-sm" onclick="refreshStats()">Actualiser</button>
        </div>
      </div>
    </div>

    <div id="stats-content">
      <div style="text-align:center;padding:40px;color:var(--text-muted)">Chargement des statistiques...</div>
    </div>
  `;

  await refreshStats();
}

async function refreshStats() {
  destroyCharts();
  const debut = document.getElementById('stat-debut').value;
  const fin = document.getElementById('stat-fin').value;
  const qs = `debut=${debut}&fin=${fin}`;
  
  const [dashboard, topClients, topProduits, mensuel, parSemaine, parMois, evoClients, catDep, livraisons] = await Promise.all([
    api(`/stats/dashboard?${qs}`),
    api(`/stats/top-clients?${qs}&limit=10`),
    api(`/stats/top-produits?${qs}&limit=10`),
    api(`/stats/mensuel?${qs}`),
    api(`/stats/commandes-par-semaine?${qs}`),
    api(`/stats/commandes-par-mois?${qs}`),
    api(`/stats/evolution-clients?${qs}`),
    api(`/stats/categories-depenses?${qs}`),
    api(`/stats/livraisons?${qs}`)
  ]);

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
        <div class="card-header"><h3>📊 CA / Dépenses / Bénéfice par mois</h3></div>
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
              <div class="rank-value">${fmt(c.ca_total)}</div>
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
                <div class="rank-detail">${p.quantite_totale} ${p.unite === 'kg' ? 'kg' : 'unités'}</div>
              </div>
              <div class="rank-value">${fmt(p.ca_total)}</div>
            </li>
          `).join('')}
        </ul>`}
      </div>

      <div class="card">
        <div class="card-header"><h3>📦 Commandes par mois</h3></div>
        <div class="chart-wrapper"><canvas id="chart-cmd-mois"></canvas></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>👥 Clients actifs par mois</h3></div>
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
        labels: mensuel.map(m => fmtMonth(m.mois)),
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
        labels: parMois.map(m => fmtMonth(m.mois)),
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
        labels: evoClients.map(m => fmtMonth(m.mois)),
        datasets: [{
          label: 'Clients actifs',
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
    a.download = `maraichage_backup_${new Date().toISOString().slice(0,10)}.db`;
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
      a.download = `${name}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast('Export CSV terminé');
  } catch (e) { toast('Erreur export CSV: ' + e.message, 'error'); }
}

// ========== ESCAPE HTML ==========
function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
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
    } else if (data.status === 'error' || data.status === 'up-to-date' || data.status === 'idle') {
      // No update or error - remove banner if present, stop polling
      const existing = document.getElementById('update-banner');
      if (existing && data.status !== 'idle') existing.remove();
      if (data.status !== 'idle' && data.status !== 'checking') {
        clearInterval(updatePollInterval);
        updatePollInterval = null;
      }
    }
  } catch (e) {
    // Silently ignore
  }
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
        <button class="btn btn-secondary btn-sm" onclick="this.closest('#update-banner').remove()">Plus tard</button>
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
        <button class="btn btn-secondary btn-sm" onclick="this.closest('#update-banner').remove()">Plus tard</button>
      </div>
    </div>`;
    clearInterval(updatePollInterval);
    updatePollInterval = null;
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
