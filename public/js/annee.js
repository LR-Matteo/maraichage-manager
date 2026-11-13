/* ═══════════════════════════════════════════ */
/* Selection de l'annee civile affichee         */
/* ═══════════════════════════════════════════ */
// Les donnees ne sont jamais effacees : chaque page filtre simplement les
// commandes et depenses sur l'annee choisie dans la barre laterale.

function anneeCourante() {
  return new Date().getFullYear();
}

function estToutesAnnees() {
  return anneeSelectionnee === 'toutes';
}

// Bornes "YYYY-MM-DD" d'une annee civile complete ({ debut: '', fin: '' }
// pour 'toutes' : aucun filtre).
function periodeAnnee(annee = anneeSelectionnee) {
  if (annee === 'toutes') return { debut: '', fin: '' };
  return { debut: `${annee}-01-01`, fin: `${annee}-12-31` };
}

// Parametres de requete de l'annee affichee (chaine vide pour 'toutes').
function qsAnnee() {
  const { debut, fin } = periodeAnnee();
  return debut ? `debut=${debut}&fin=${fin}` : '';
}

// Ajoute le filtre d'annee a une URL d'API, avec le bon separateur.
function avecAnnee(url) {
  const qs = qsAnnee();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

// "en 2026" / "toutes années confondues", pour les sous-titres.
function libelleAnnee() {
  return estToutesAnnees() ? 'toutes années confondues' : `en ${anneeSelectionnee}`;
}

// Periode de reference "N-1" pour les indicateurs du tableau de bord :
// - annee en cours : du 1er janvier a aujourd'hui, un an plus tot (on compare
//   a date egale, sinon une annee entamee paraitrait toujours en baisse) ;
// - annee passee : l'annee precedente complete.
function periodeN1(annee = anneeSelectionnee) {
  if (annee === 'toutes') return null;
  const y = Number(annee);
  if (y === anneeCourante()) {
    const auj = todayLocal();
    let finN1 = `${y - 1}${auj.slice(4)}`;
    if (finN1.endsWith('-02-29')) finN1 = `${y - 1}-02-28`;
    return { debut: `${y - 1}-01-01`, fin: finN1, libelle: `vs ${y - 1} à la même date` };
  }
  return { debut: `${y - 1}-01-01`, fin: `${y - 1}-12-31`, libelle: `vs ${y - 1}` };
}

// Recharge la liste des annees disponibles et met a jour le selecteur.
// Appele a chaque affichage de page : une commande saisie sur une nouvelle
// annee la fait apparaitre aussitot dans la liste.
async function chargerAnnees() {
  if (anneeAuto) anneeSelectionnee = anneeCourante();
  try {
    anneesDisponibles = await api('/annees');
  } catch (e) {
    if (anneesDisponibles.length === 0) anneesDisponibles = [anneeCourante()];
  }
  if (!estToutesAnnees() && !anneesDisponibles.includes(anneeSelectionnee)) {
    anneesDisponibles = [...anneesDisponibles, anneeSelectionnee].sort((a, b) => b - a);
  }
  renderSelecteurAnnee();
}

function optionsAnnees() {
  return anneesDisponibles.map(a =>
    `<option value="${a}" ${a === anneeSelectionnee ? 'selected' : ''}>${a}${a === anneeCourante() ? ' (en cours)' : ''}</option>`
  ).join('') + `<option value="toutes" ${estToutesAnnees() ? 'selected' : ''}>Toutes les années</option>`;
}

function renderSelecteurAnnee() {
  const sel = document.getElementById('annee-select');
  if (sel) sel.innerHTML = optionsAnnees();
}

// Selecteur d'annee a integrer dans une page (Commandes, Depenses), relie au
// meme etat que celui de la barre laterale.
function selecteurAnneeHTML() {
  return `<label class="annee-inline">Année
    <select class="form-control" onchange="changerAnnee(this.value)">${optionsAnnees()}</select>
  </label>`;
}

function changerAnnee(val) {
  anneeSelectionnee = val === 'toutes' ? 'toutes' : parseInt(val, 10);
  anneeAuto = anneeSelectionnee === anneeCourante();
  destroyCharts();
  renderPage();
}

// Apres l'enregistrement d'une commande/depense datee hors de l'annee
// affichee : previent qu'elle n'apparait pas dans la liste courante.
function signalerHorsAnnee(dateISO, quoi) {
  if (estToutesAnnees() || !dateISO) return;
  const annee = parseInt(dateISO.slice(0, 4), 10);
  if (annee !== anneeSelectionnee) {
    toast(`${quoi} enregistrée en ${annee} : sélectionnez ${annee} dans la barre latérale pour la voir`, 'info');
  }
}
