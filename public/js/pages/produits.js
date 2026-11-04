/* ═══════════════════════════════════════════ */
/* Page Produits */
/* ═══════════════════════════════════════════ */

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
