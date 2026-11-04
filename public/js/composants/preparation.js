/* ═══════════════════════════════════════════ */
/* Panneau "commandes a preparer" (partage Tableau de bord + Statistiques) */
/* ═══════════════════════════════════════════ */

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
