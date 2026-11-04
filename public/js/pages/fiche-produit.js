/* ═══════════════════════════════════════════ */
/* Fiche statistique d'un produit (modale) */
/* ═══════════════════════════════════════════ */

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
