/* ═══════════════════════════════════════════ */
/* Page Clients */
/* ═══════════════════════════════════════════ */

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
