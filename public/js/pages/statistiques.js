/* ═══════════════════════════════════════════ */
/* Page Statistiques */
/* ═══════════════════════════════════════════ */

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
