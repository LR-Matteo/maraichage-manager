/* ═══════════════════════════════════════════ */
/* Page Depenses */
/* ═══════════════════════════════════════════ */

// ========== DEPENSES ==========
async function renderDepenses() {
  depenses = await api(avecAnnee('/depenses'));
  const main = document.getElementById('main-content');
  const total = depenses.reduce((s, d) => s + d.prix, 0);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Dépenses${estToutesAnnees() ? '' : ' ' + anneeSelectionnee}</h2>
        <p class="subtitle">${depenses.length} dépense${depenses.length > 1 ? 's' : ''} ${libelleAnnee()} — Total : ${fmt(total)}</p>
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
      ${selecteurAnneeHTML()}
    </div>

    <div class="card" style="padding:0">
      <div class="table-container" id="depenses-table">
        ${renderDepensesTable(depenses)}
      </div>
    </div>
  `;
}

function renderDepensesTable(list) {
  if (list.length === 0) return `<div class="empty-state"><div class="icon">💸</div><p>Aucune dépense ${libelleAnnee()}</p><button class="btn btn-primary" onclick="openDepenseModal()">Ajouter une dépense</button></div>`;
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
    signalerHorsAnnee(date_depense, 'Dépense');
    await chargerAnnees();
    renderDepenses();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteDepense(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  try { await api('/depenses/' + id, 'DELETE'); toast('Dépense supprimée'); renderDepenses(); }
  catch (e) { toast(e.message, 'error'); }
}
