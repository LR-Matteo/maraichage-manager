/* ═══════════════════════════════════════════ */
/* Page Commandes (liste, detail, formulaire) */
/* ═══════════════════════════════════════════ */

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
