/* ═══════════════════════════════════════════ */
/* Page Tableau de bord */
/* ═══════════════════════════════════════════ */

// ========== DASHBOARD ==========
async function renderDashboard() {
  const main = document.getElementById('main-content');
  const bodyHTML = await dashboardBodyHTML();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Tableau de bord${estToutesAnnees() ? '' : ' ' + anneeSelectionnee}</h2>
        <p class="subtitle">${estToutesAnnees() ? 'Vue d\'ensemble de toute votre activité' : `Vue d'ensemble de votre activité ${libelleAnnee()}`}</p>
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

// Indicateurs, tops et commandes recentes de l'annee affichee. Les clients a
// relancer restent volontairement tous ans confondus : un client venu en
// decembre ne doit pas disparaitre de la liste le 1er janvier.
async function dashboardBodyHTML() {
  const n1 = periodeN1();
  const [stats, statsN1, topClients, topProduits, recentCmd, clientsRelance] = await Promise.all([
    api(avecAnnee('/stats/dashboard')),
    n1 ? api(`/stats/dashboard?debut=${n1.debut}&fin=${n1.fin}`) : null,
    api(avecAnnee('/stats/top-clients?limit=5')),
    api(avecAnnee('/stats/top-produits?limit=5')),
    api(avecAnnee('/commandes?limit=5')),
    api('/stats/clients-a-relancer?limit=' + relanceLimit)
  ]);

  // Pastille d'evolution vs N-1 sous un indicateur (rien en "toutes annees")
  const evo = (cle, inverse = false) => statsN1
    ? `<span title="Comparé au ${fmtDate(n1.debut)} – ${fmtDate(n1.fin)}">${deltaBadge(deltaPct(stats[cle], statsN1[cle]), n1.libelle, inverse)}</span>`
    : '';

  return `
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-label">Chiffre d'affaires</div>
        <div class="stat-value green">${fmt(stats.chiffre_affaires)}</div>
        ${evo('chiffre_affaires')}
      </div>
      <div class="stat-card red">
        <div class="stat-label">Dépenses totales</div>
        <div class="stat-value red">${fmt(stats.depenses)}</div>
        ${evo('depenses', true)}
      </div>
      <div class="stat-card ${stats.benefice >= 0 ? 'blue' : 'red'}">
        <div class="stat-label">Bénéfice net</div>
        <div class="stat-value ${stats.benefice >= 0 ? 'blue' : 'red'}">${fmt(stats.benefice)}</div>
        ${evo('benefice')}
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Commandes</div>
        <div class="stat-value gold">${stats.nb_commandes}</div>
        ${evo('nb_commandes')}
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Clients actifs</div>
        <div class="stat-value blue">${stats.nb_clients_actifs}</div>
        <div class="form-hint" style="margin:6px 0 0;">Fiches clients marquées actives</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Panier moyen</div>
        <div class="stat-value green">${fmt(stats.panier_moyen)}</div>
        ${evo('panier_moyen')}
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
        ${recentCmd.length === 0 ? `<p style="color:var(--text-muted);font-size:14px;">Aucune commande ${libelleAnnee()}</p>` : `
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
