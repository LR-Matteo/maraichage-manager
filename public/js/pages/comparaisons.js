/* ═══════════════════════════════════════════ */
/* Comparaisons entre annees (page Statistiques) */
/* ═══════════════════════════════════════════ */
// Deux outils, independants de la "periode d'analyse" de la page :
// - comparaison annuelle : 12 mois d'une annee face aux 12 mois d'une autre ;
// - comparaison de deux mois au choix (ex: juillet 2026 vs juillet 2025),
//   indicateurs globaux + quantites et CA par produit.

// Indicateurs proposes dans la comparaison annuelle. `type` pilote le
// formatage, `inverse` : une hausse est mauvaise (depenses).
const INDICATEURS_ANNUELS = {
  ca: { label: "Chiffre d'affaires", type: 'euros' },
  depenses: { label: 'Dépenses', type: 'euros', inverse: true },
  benefice: { label: 'Bénéfice', type: 'euros' },
  nb_commandes: { label: 'Nombre de commandes', type: 'nombre' },
  panier_moyen: { label: 'Panier moyen', type: 'euros', moyenne: true }
};

function fmtValeur(v, type, unite) {
  if (type === 'euros') return fmt(v);
  if (type === 'quantite') return `${fmtQty(v)} ${unite === 'kg' ? 'kg' : 'u'}`;
  return String(Math.round(v * 100) / 100);
}

// Ecart signe "+12,00 €" / "−3 commandes"
function fmtEcart(diff, type, unite) {
  if (Math.abs(diff) < 1e-9) return '=';
  const sign = diff > 0 ? '+' : '−';
  return sign + fmtValeur(Math.abs(diff), type, unite);
}

// Annees proposees : celles ayant des donnees, plus l'annee preselectionnee
// meme vide (ex: N-1 la toute premiere annee d'utilisation).
function optionsAnneesSimples(selection) {
  const annees = [...new Set([...anneesDisponibles, selection])].sort((x, y) => y - x);
  return annees.map(a => `<option value="${a}" ${a === selection ? 'selected' : ''}>${a}</option>`).join('');
}

function comparaisonsHTML() {
  const anneeA = estToutesAnnees() ? anneeCourante() : anneeSelectionnee;
  const anneeB = anneeA - 1;
  // Mois A par defaut : le mois courant, dans l'annee affichee
  const moisA = `${anneeA}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const moisB = `${anneeB}${moisA.slice(4)}`;

  return `
    <h3 class="section-title">📅 Comparer les années</h3>

    <div class="card mb-2">
      <div class="flex-between flex-wrap gap-sm">
        <h3 style="font-size:15px">Comparaison annuelle, mois par mois</h3>
        <div class="date-range-picker">
          <select id="cmp-annee-a" onchange="loadComparaisonAnnuelle()">${optionsAnneesSimples(anneeA)}</select>
          <label>comparée à</label>
          <select id="cmp-annee-b" onchange="loadComparaisonAnnuelle()">${optionsAnneesSimples(anneeB)}</select>
          <select id="cmp-indicateur" onchange="loadComparaisonAnnuelle()">
            ${Object.entries(INDICATEURS_ANNUELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
            ${produits.length ? `<optgroup label="Quantités vendues">${produits.map(p => `<option value="produit:${p.id}">${esc(p.nom)} (${p.unite === 'kg' ? 'kg' : 'unités'})</option>`).join('')}</optgroup>` : ''}
          </select>
        </div>
      </div>
      <div id="cmp-annuel-body"><div style="text-align:center;padding:30px;color:var(--text-muted)">Chargement...</div></div>
    </div>

    <div class="card mb-2">
      <div class="flex-between flex-wrap gap-sm">
        <h3 style="font-size:15px">Comparer deux mois</h3>
        <div class="date-range-picker">
          <label>Mois</label>
          <input type="month" id="cmp-mois-a" value="${moisA}">
          <label>comparé à</label>
          <input type="month" id="cmp-mois-b" value="${moisB}">
          <button class="btn btn-primary btn-sm" onclick="loadComparaisonMois()">Comparer</button>
        </div>
      </div>
      <p class="form-hint" style="margin:10px 0 0;">Par exemple juillet ${anneeA} face à juillet ${anneeB}, ou deux mois quelconques. Seules les commandes vendues comptent.</p>
      <div id="cmp-mois-body"><div style="text-align:center;padding:30px;color:var(--text-muted)">Chargement...</div></div>
    </div>
  `;
}

async function initComparaisons() {
  await Promise.all([loadComparaisonAnnuelle(), loadComparaisonMois()]);
}

// ---------- Comparaison annuelle ----------
async function loadComparaisonAnnuelle() {
  const body = document.getElementById('cmp-annuel-body');
  if (!body) return;
  const anneeA = parseInt(document.getElementById('cmp-annee-a').value, 10);
  const anneeB = parseInt(document.getElementById('cmp-annee-b').value, 10);
  const indic = document.getElementById('cmp-indicateur').value;

  let def, produit = null, cle = indic;
  if (indic.startsWith('produit:')) {
    produit = produits.find(p => p.id === parseInt(indic.slice(8), 10));
    def = { label: `Quantité de ${produit ? produit.nom : 'produit'}`, type: 'quantite' };
    cle = 'quantite_produit';
  } else {
    def = INDICATEURS_ANNUELS[indic];
  }
  const qsProduit = produit ? `&produit_id=${produit.id}` : '';

  let a, b;
  try {
    [a, b] = await Promise.all([
      api(`/stats/annuel?annee=${anneeA}${qsProduit}`),
      api(`/stats/annuel?annee=${anneeB}${qsProduit}`)
    ]);
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    return;
  }
  if (!document.getElementById('cmp-annuel-body')) return; // page changee entre-temps

  const unite = produit ? produit.unite : null;
  const valsA = a.mois.map(m => m[cle]);
  const valsB = b.mois.map(m => m[cle]);
  // Total annuel : somme, sauf le panier moyen (CA total / nb commandes total)
  const total = an => def.moyenne
    ? (an.mois.reduce((s, m) => s + m.nb_commandes, 0) ? an.mois.reduce((s, m) => s + m.ca, 0) / an.mois.reduce((s, m) => s + m.nb_commandes, 0) : 0)
    : an.mois.reduce((s, m) => s + m[cle], 0);
  const totA = total(a), totB = total(b);

  body.innerHTML = `
    <div class="chart-wrapper mt-2" style="height:280px;"><canvas id="chart-cmp-annuel"></canvas></div>
    <div class="table-container mt-2">
      <table class="table-comparaison">
        <thead><tr><th>Mois</th><th class="text-right">${anneeA}</th><th class="text-right">${anneeB}</th><th class="text-right">Écart</th><th class="text-right">Évolution</th></tr></thead>
        <tbody>
          ${a.mois.map((m, i) => `
            <tr>
              <td>${MOIS_LONGS[i]}</td>
              <td class="text-right price-display">${fmtValeur(valsA[i], def.type, unite)}</td>
              <td class="text-right">${fmtValeur(valsB[i], def.type, unite)}</td>
              <td class="text-right">${fmtEcart(valsA[i] - valsB[i], def.type, unite)}</td>
              <td class="text-right">${celluleEvolution(valsA[i], valsB[i], def.inverse)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>${def.moyenne ? 'Sur l\'année' : 'Total'}</td>
            <td class="text-right">${fmtValeur(totA, def.type, unite)}</td>
            <td class="text-right">${fmtValeur(totB, def.type, unite)}</td>
            <td class="text-right">${fmtEcart(totA - totB, def.type, unite)}</td>
            <td class="text-right">${celluleEvolution(totA, totB, def.inverse)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${anneeA === anneeCourante() || anneeB === anneeCourante() ? `<p class="form-hint" style="margin:10px 0 0;">${anneeCourante()} est en cours : les mois à venir sont encore vides.</p>` : ''}
  `;

  if (chartsComparaison.annuel) chartsComparaison.annuel.destroy();
  chartsComparaison.annuel = new Chart(document.getElementById('chart-cmp-annuel'), {
    type: 'bar',
    data: {
      labels: MOIS_COURTS,
      datasets: [
        { label: String(anneeA), data: valsA, backgroundColor: 'rgba(61,124,71,0.8)', borderRadius: 4 },
        { label: String(anneeB), data: valsB, backgroundColor: 'rgba(212,160,23,0.55)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} : ${fmtValeur(ctx.raw, def.type, unite)}` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => def.type === 'euros' ? fmt(v) : v }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ---------- Comparaison de deux mois ----------
function bornesMois(ym) {
  const [y, m] = ym.split('-').map(Number);
  const dernier = new Date(y, m, 0).getDate();
  return { debut: `${ym}-01`, fin: `${ym}-${String(dernier).padStart(2, '0')}` };
}

function libelleMois(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MOIS_LONGS[m - 1]} ${y}`;
}

async function loadComparaisonMois() {
  const body = document.getElementById('cmp-mois-body');
  if (!body) return;
  const moisA = document.getElementById('cmp-mois-a').value;
  const moisB = document.getElementById('cmp-mois-b').value;
  if (!moisA || !moisB) { body.innerHTML = '<p class="form-hint" style="margin-top:12px">Choisissez les deux mois à comparer.</p>'; return; }

  const pA = bornesMois(moisA), pB = bornesMois(moisB);
  let dA, dB, prodA, prodB;
  try {
    [dA, dB, prodA, prodB] = await Promise.all([
      api(`/stats/dashboard?debut=${pA.debut}&fin=${pA.fin}`),
      api(`/stats/dashboard?debut=${pB.debut}&fin=${pB.fin}`),
      api(`/stats/top-produits?debut=${pA.debut}&fin=${pA.fin}&limit=1000`),
      api(`/stats/top-produits?debut=${pB.debut}&fin=${pB.fin}&limit=1000`)
    ]);
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    return;
  }
  if (!document.getElementById('cmp-mois-body')) return;

  const libA = libelleMois(moisA), libB = libelleMois(moisB);
  const indicateurs = [
    ['chiffre_affaires', "Chiffre d'affaires", 'euros'],
    ['depenses', 'Dépenses', 'euros', true],
    ['benefice', 'Bénéfice', 'euros'],
    ['nb_commandes', 'Commandes', 'nombre'],
    ['panier_moyen', 'Panier moyen', 'euros']
  ];

  // Union des produits vendus sur l'un ou l'autre mois, tries par CA du mois A
  const parId = new Map();
  for (const p of prodA) parId.set(p.id, { nom: p.nom, unite: p.unite, qA: p.quantite_totale, caA: p.ca_total, qB: 0, caB: 0 });
  for (const p of prodB) {
    const e = parId.get(p.id) || { nom: p.nom, unite: p.unite, qA: 0, caA: 0 };
    e.qB = p.quantite_totale; e.caB = p.ca_total;
    parId.set(p.id, e);
  }
  const lignesProduits = [...parId.values()].sort((x, y) => y.caA - x.caA || y.caB - x.caB);

  body.innerHTML = `
    <div class="table-container mt-2">
      <table class="table-comparaison">
        <thead><tr><th>Indicateur</th><th class="text-right">${libA}</th><th class="text-right">${libB}</th><th class="text-right">Écart</th><th class="text-right">Évolution</th></tr></thead>
        <tbody>
          ${indicateurs.map(([cle, label, type, inverse]) => `
            <tr>
              <td><strong>${label}</strong></td>
              <td class="text-right price-display">${fmtValeur(dA[cle], type)}</td>
              <td class="text-right">${fmtValeur(dB[cle], type)}</td>
              <td class="text-right">${fmtEcart(dA[cle] - dB[cle], type)}</td>
              <td class="text-right">${celluleEvolution(dA[cle], dB[cle], inverse)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <h4 class="sous-titre-comparaison">Détail par produit</h4>
    ${lignesProduits.length === 0 ? `<p class="form-hint">Aucune vente sur ces deux mois.</p>` : `
    <div class="table-container">
      <table class="table-comparaison">
        <thead>
          <tr><th>Produit</th><th class="text-right">Qté ${libA}</th><th class="text-right">Qté ${libB}</th><th class="text-right">Évolution</th><th class="text-right">CA ${libA}</th><th class="text-right">CA ${libB}</th><th class="text-right">Évolution</th></tr>
        </thead>
        <tbody>
          ${lignesProduits.map(p => `
            <tr>
              <td><strong>${esc(p.nom)}</strong></td>
              <td class="text-right">${fmtValeur(p.qA, 'quantite', p.unite)}</td>
              <td class="text-right">${fmtValeur(p.qB, 'quantite', p.unite)}</td>
              <td class="text-right">${celluleEvolution(p.qA, p.qB)}</td>
              <td class="text-right price-display">${fmt(p.caA)}</td>
              <td class="text-right">${fmt(p.caB)}</td>
              <td class="text-right">${celluleEvolution(p.caA, p.caB)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}
