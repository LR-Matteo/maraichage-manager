/* ═══════════════════════════════════════════ */
/* Fiche statistique d'un produit (modale) */
/* ═══════════════════════════════════════════ */
// Deux parties :
// - le resume de la periode choisie (Du/Au) : chiffres cles + evolution ;
// - la comparaison par annee, independante de cette periode : ventes du
//   produit mois par mois ou semaine par semaine, une serie par annee.

// Couleurs des annees comparees, de la plus recente a la plus ancienne
const COULEURS_ANNEES = ['#3D7C47', '#D4A017', '#2980B9', '#8E44AD', '#7F8C8D', '#16A085'];

// ========== FICHE STATISTIQUE PRODUIT ==========
async function openProduitStats(id, debut, fin) {
  currentProduitStatsId = id;
  if (!debut || !fin) {
    // Periode par defaut = annee affichee (jusqu'a aujourd'hui pour l'annee
    // en cours : la moyenne hebdomadaire est calculee sur la duree de la
    // periode, des semaines futures la fausseraient). "Toutes les annees" :
    // 12 derniers mois.
    const now = new Date();
    if (estToutesAnnees()) {
      debut = todayLocal(new Date(now.getFullYear() - 1, now.getMonth(), 1));
      fin = todayLocal(now);
    } else {
      ({ debut, fin } = periodeAnnee());
      if (anneeSelectionnee === anneeCourante()) fin = todayLocal(now);
    }
  }

  // Annees comparees par defaut : l'annee affichee et les deux precedentes
  // (parmi celles qui ont des donnees).
  const reference = estToutesAnnees() ? anneeCourante() : anneeSelectionnee;
  produitCmpAnnees = anneesDisponibles.filter(a => a <= reference).slice(0, 3);
  if (produitCmpAnnees.length === 0) produitCmpAnnees = [reference];

  // On affiche tout de suite la coquille de la modale (entete + filtres +
  // etat "Chargement") au lieu d'attendre la reponse de l'API avant le
  // moindre retour visuel : le clic reagit instantanement, seul le contenu
  // chiffre apparait un instant apres.
  const p = produits.find(x => x.id === id);
  openModal(renderProduitStatsShell(p ? p.nom : '', debut, fin), { large: true });

  await Promise.all([loadProduitStatsBody(id, debut, fin), loadProduitComparaison()]);
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

      <div class="produit-cmp">
        <h4 class="produit-cmp-titre">📅 Comparaison par année</h4>
        <div class="flex-between flex-wrap gap-sm">
          <div class="chips" id="produit-cmp-annees"></div>
          <div class="flex-center gap-sm">
            <div class="segmented" id="produit-cmp-mesure"></div>
            <div class="segmented" id="produit-cmp-granularite"></div>
          </div>
        </div>
        <div id="produit-cmp-body">
          <div style="text-align:center;padding:40px;color:var(--text-muted);">Chargement...</div>
        </div>
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
  const n1 = data.comparaison_annee_precedente;
  const n1Titre = n1 ? `Comparé aux mêmes dates un an plus tôt : du ${fmtDate(n1.debut)} au ${fmtDate(n1.fin)}` : '';

  return `
      <div class="stats-grid">
        <div class="stat-card green">
          <div class="stat-label">Quantité vendue</div>
          <div class="stat-value green">${fmtQty(data.quantite_totale)} ${uniteLabel}</div>
          ${n1 ? `<span title="${n1Titre}">${deltaBadge(n1.delta_quantite_pct, 'vs N-1')}</span>` : ''}
        </div>
        <div class="stat-card gold">
          <div class="stat-label">Chiffre d'affaires</div>
          <div class="stat-value gold">${fmt(data.ca_total)}</div>
          ${n1 ? `<span title="${n1Titre}">${deltaBadge(n1.delta_ca_pct, 'vs N-1')}</span>` : ''}
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Moyenne / semaine</div>
          <div class="stat-value blue">${fmtQty(Math.round(data.moyenne_semaine_quantite * 10) / 10)} ${uniteShort}</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">CA moyen / semaine</div>
          <div class="stat-value blue">${fmt(data.moyenne_semaine_ca)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Commandes · Clients</div>
          <div class="stat-value">${data.nb_commandes} · ${data.nb_clients}</div>
        </div>
      </div>

      <div class="flex-between flex-wrap gap-sm" style="margin:8px 0 12px;">
        <h4 style="font-size:14px;font-weight:600;color:var(--text-secondary);margin:0;">Évolution ${produitStatsGranularite === 'semaine' ? 'hebdomadaire' : 'mensuelle'} sur la période</h4>
        <div class="segmented">
          <button class="${produitStatsGranularite === 'mois' ? 'active' : ''}" data-val="mois" onclick="setProduitStatsGranularite('mois')">Mois</button>
          <button class="${produitStatsGranularite === 'semaine' ? 'active' : ''}" data-val="semaine" onclick="setProduitStatsGranularite('semaine')">Semaine</button>
        </div>
      </div>
      <div class="chart-wrapper" style="height:220px;"><canvas id="chart-produit-mensuel"></canvas></div>
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

// ========== COMPARAISON PAR ANNEE ==========
function toggleProduitCmpAnnee(annee) {
  if (produitCmpAnnees.includes(annee)) {
    if (produitCmpAnnees.length === 1) return; // au moins une annee
    produitCmpAnnees = produitCmpAnnees.filter(a => a !== annee);
  } else {
    produitCmpAnnees = [...produitCmpAnnees, annee];
  }
  loadProduitComparaison();
}

function setProduitCmpMesure(val) {
  produitCmpMesure = val;
  loadProduitComparaison();
}

function setProduitCmpGranularite(val) {
  produitCmpGranularite = val;
  loadProduitComparaison();
}

// Libelle d'une semaine "S12" + ses dates ("19/03 – 25/03") dans une annee
function datesSemaine(numero, annee) {
  const debut = new Date(annee, 0, 1 + (numero - 1) * 7);
  const fin = numero === 52 ? new Date(annee, 11, 31) : new Date(annee, 0, 7 + (numero - 1) * 7);
  const f = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${f(debut)} – ${f(fin)}`;
}

async function loadProduitComparaison() {
  const annees = [...produitCmpAnnees].sort((a, b) => b - a); // plus recente en premier
  const parSemaine = produitCmpGranularite === 'semaine';

  // Controles (rendus a chaque fois pour refleter l'etat courant)
  const chipsEl = document.getElementById('produit-cmp-annees');
  if (!chipsEl) return;
  chipsEl.innerHTML = [...new Set([...anneesDisponibles, ...annees])].sort((a, b) => b - a).map(a => {
    const rang = annees.indexOf(a);
    const style = rang >= 0 ? `style="--chip-couleur:${COULEURS_ANNEES[rang % COULEURS_ANNEES.length]}"` : '';
    return `<button class="chip ${rang >= 0 ? 'active' : ''}" ${style} onclick="toggleProduitCmpAnnee(${a})">${a}</button>`;
  }).join('');
  document.getElementById('produit-cmp-mesure').innerHTML = `
    <button class="${produitCmpMesure === 'quantite' ? 'active' : ''}" onclick="setProduitCmpMesure('quantite')">Quantité</button>
    <button class="${produitCmpMesure === 'ca' ? 'active' : ''}" onclick="setProduitCmpMesure('ca')">CA</button>`;
  document.getElementById('produit-cmp-granularite').innerHTML = `
    <button class="${!parSemaine ? 'active' : ''}" onclick="setProduitCmpGranularite('mois')">Mois</button>
    <button class="${parSemaine ? 'active' : ''}" onclick="setProduitCmpGranularite('semaine')">Semaine</button>`;

  let data;
  try {
    data = await api(`/stats/produit/${currentProduitStatsId}/annees?annees=${annees.join(',')}&granularite=${produitCmpGranularite}`);
  } catch (e) {
    const b = document.getElementById('produit-cmp-body');
    if (b) b.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    return;
  }
  const body = document.getElementById('produit-cmp-body');
  if (!body) return; // modale fermee entre-temps

  const unite = data.produit.unite;
  const u = unite === 'kg' ? 'kg' : 'u';
  const series = data.annees; // meme ordre que `annees`
  const [recente, precedente] = series;
  const nbPeriodes = parSemaine ? 52 : 12;
  const libellePeriode = i => parSemaine ? `S${i + 1}` : MOIS_LONGS[i];
  // L'evolution suit la mesure choisie (quantite ou CA), comme le graphique
  const cle = produitCmpMesure === 'ca' ? 'ca' : 'quantite';
  const evo = (a, b) => celluleEvolution(a[cle], b[cle]);

  body.innerHTML = `
    <div class="chart-wrapper mt-2" style="height:260px;"><canvas id="chart-produit-annees"></canvas></div>
    <p class="form-hint" style="margin:8px 0 0;">
      ${parSemaine ? 'Semaine 1 = du 1er au 7 janvier, semaine 2 = du 8 au 14, etc. : chaque semaine couvre les mêmes dates d\'une année sur l\'autre.' : 'Ventes validées (statut « Vendu ») uniquement.'}
      ${annees.includes(anneeCourante()) ? ` ${anneeCourante()} est en cours : les ${parSemaine ? 'semaines' : 'mois'} à venir sont encore vides.` : ''}
    </p>
    <div class="table-container mt-2 ${parSemaine ? 'table-scroll' : ''}">
      <table class="table-comparaison">
        <thead>
          <tr>
            <th>${parSemaine ? 'Semaine' : 'Mois'}</th>
            ${series.map(s => `<th class="text-right">Qté ${s.annee}</th><th class="text-right">CA ${s.annee}</th>`).join('')}
            ${precedente ? `<th class="text-right" title="${produitCmpMesure === 'ca' ? 'CA' : 'Quantité'} ${recente.annee} comparé(e) à ${precedente.annee}">Évol. ${produitCmpMesure === 'ca' ? 'CA' : 'qté'} ${recente.annee}/${precedente.annee}</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: nbPeriodes }, (_, i) => `
            <tr>
              <td>${libellePeriode(i)}${parSemaine ? `<span class="periode-dates">${datesSemaine(i + 1, recente.annee)}</span>` : ''}</td>
              ${series.map((s, k) => `
                <td class="text-right ${k === 0 ? 'price-display' : ''}">${s.periodes[i].quantite ? `${fmtQty(s.periodes[i].quantite)} ${u}` : '—'}</td>
                <td class="text-right">${s.periodes[i].ca ? fmt(s.periodes[i].ca) : '—'}</td>`).join('')}
              ${precedente ? `<td class="text-right">${evo(recente.periodes[i], precedente.periodes[i])}</td>` : ''}
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            ${series.map(s => `<td class="text-right">${fmtQty(s.total.quantite)} ${u}</td><td class="text-right">${fmt(s.total.ca)}</td>`).join('')}
            ${precedente ? `<td class="text-right">${evo(recente.total, precedente.total)}</td>` : ''}
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  if (produitCmpChart) produitCmpChart.destroy();
  const valeur = p => produitCmpMesure === 'ca' ? p.ca : p.quantite;
  const fmtVal = v => produitCmpMesure === 'ca' ? fmt(v) : `${fmtQty(v)} ${u}`;
  produitCmpChart = new Chart(document.getElementById('chart-produit-annees'), {
    type: parSemaine ? 'line' : 'bar',
    data: {
      labels: Array.from({ length: nbPeriodes }, (_, i) => parSemaine ? `S${i + 1}` : MOIS_COURTS[i]),
      datasets: series.map((s, k) => {
        const couleur = COULEURS_ANNEES[k % COULEURS_ANNEES.length];
        return {
          label: String(s.annee),
          data: s.periodes.map(valeur),
          backgroundColor: parSemaine ? couleur + '22' : couleur + 'CC',
          borderColor: couleur,
          borderRadius: 4,
          // "monotone" : courbe lissee qui ne depasse jamais les valeurs
          // reelles (pas de creux sous zero entre deux semaines de vente)
          cubicInterpolationMode: 'monotone',
          pointRadius: parSemaine ? 2 : 0,
          borderWidth: parSemaine ? 2 : 0
        };
      })
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
        tooltip: {
          callbacks: {
            title: items => parSemaine ? `Semaine ${items[0].dataIndex + 1}` : MOIS_LONGS[items[0].dataIndex],
            label: ctx => `${ctx.dataset.label} : ${fmtVal(ctx.raw)}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => produitCmpMesure === 'ca' ? fmt(v) : fmtQty(v) }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } }
      }
    }
  });
}
