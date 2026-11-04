// ═══════════════════════════════════════════
// Generation des exports PDF / Excel du panneau "commandes a preparer"
// ═══════════════════════════════════════════
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function fmtEuros(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

// Les quantites sont des REAL sommes en SQL : sans arrondi, 0.1 + 0.2 kg
// s'afficherait "0.30000000000000004". 3 decimales suffisent (grammes).
function roundQty(n) {
  return Math.round((n || 0) * 1000) / 1000;
}

function fmtQty(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(roundQty(n));
}

function periodeLabel(debut, fin) {
  return debut && fin ? `Période du ${debut} au ${fin}` : 'Toutes les commandes en cours';
}

// --- PDF ---------------------------------------------------------------
// pdfkit n'a pas de composant tableau integre : on dessine des lignes de
// texte a des positions de colonnes fixes, avec saut de page manuel quand on
// approche du bas de la feuille.
function writePreparationPDF(res, { recap, commandes, debut, fin }) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="commandes_a_preparer.pdf"');
  doc.pipe(res);

  const pageBottom = () => doc.page.height - doc.page.margins.bottom;
  function ensureSpace(needed) {
    if (doc.y + needed > pageBottom()) doc.addPage();
  }

  doc.fontSize(20).font('Helvetica-Bold').text('Commandes à préparer');
  doc.fontSize(10).font('Helvetica').fillColor('#666666').text(periodeLabel(debut, fin));
  doc.fillColor('#000000');
  doc.moveDown(1);

  // --- Recapitulatif par produit ---
  doc.fontSize(14).font('Helvetica-Bold').text('Récapitulatif par produit');
  doc.moveDown(0.5);

  const colsRecap = [
    { label: 'Produit', x: 40, width: 260 },
    { label: 'Quantité', x: 300, width: 100 },
    { label: 'Nb commandes', x: 400, width: 120 }
  ];
  ensureSpace(20);
  doc.fontSize(10).font('Helvetica-Bold');
  // y fige avant la boucle : chaque doc.text() fait avancer doc.y, les
  // en-tetes s'affichaient sinon en escalier au lieu d'etre alignes.
  const headerY = doc.y;
  colsRecap.forEach(c => doc.text(c.label, c.x, headerY, { width: c.width, continued: false, lineBreak: false }));
  doc.moveDown(1);
  doc.font('Helvetica');

  if (recap.length === 0) {
    doc.fontSize(10).fillColor('#666666').text('Aucun produit à préparer sur cette période.');
    doc.fillColor('#000000');
  } else {
    for (const r of recap) {
      ensureSpace(18);
      const y = doc.y;
      const uniteLabel = r.unite === 'kg' ? 'kg' : 'unité(s)';
      doc.fontSize(10);
      doc.text(r.nom, colsRecap[0].x, y, { width: colsRecap[0].width });
      doc.text(`${fmtQty(r.quantite_totale)} ${uniteLabel}`, colsRecap[1].x, y, { width: colsRecap[1].width });
      doc.text(String(r.nb_commandes), colsRecap[2].x, y, { width: colsRecap[2].width });
      doc.moveDown(0.7);
    }
  }

  doc.addPage();

  // --- Detail par commande ---
  doc.fontSize(14).font('Helvetica-Bold').text('Détail des commandes');
  doc.moveDown(0.5);

  if (commandes.length === 0) {
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text('Aucune commande en cours sur cette période.');
    doc.fillColor('#000000');
  }

  for (const cmd of commandes) {
    ensureSpace(70);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
      .text(`Commande #${cmd.id} — ${cmd.client_nom}`, 40, doc.y);
    doc.fontSize(9).font('Helvetica').fillColor('#666666')
      .text(`Date : ${cmd.date_commande}${cmd.livraison ? '  ·  Livraison : ' + cmd.livraison : ''}`, 40, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.4);

    for (const l of cmd.lignes) {
      ensureSpace(16);
      const uniteLabel = l.produit_unite === 'kg' ? 'kg' : 'unité(s)';
      doc.fontSize(10).font('Helvetica')
        .text(`•  ${l.produit_nom} — ${fmtQty(l.quantite)} ${uniteLabel}  (${fmtEuros(l.prix_ligne)})`, 55, doc.y, { width: 480 });
    }

    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold')
      .text(`Total : ${fmtEuros(cmd.prix_manuel != null ? cmd.prix_manuel : cmd.prix_total)}`, 55, doc.y);
    doc.moveDown(1);
  }

  doc.end();
}

// --- Excel ---------------------------------------------------------------
async function writePreparationExcel(res, { recap, commandes, debut, fin }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maraîchage Manager';
  wb.created = new Date();

  const sheet1 = wb.addWorksheet('Récapitulatif');
  sheet1.addRow([periodeLabel(debut, fin)]).font = { italic: true, color: { argb: 'FF666666' } };
  sheet1.addRow([]);
  const header1 = sheet1.addRow(['Produit', 'Unité', 'Quantité totale', 'Nb commandes']);
  header1.font = { bold: true };
  for (const r of recap) {
    sheet1.addRow([r.nom, r.unite === 'kg' ? 'kg' : 'unité', roundQty(r.quantite_totale), r.nb_commandes]);
  }
  sheet1.columns = [{ width: 30 }, { width: 12 }, { width: 16 }, { width: 14 }];

  // --- Feuille 2 : tableau croise client x produit ---
  // Une ligne par client, une colonne par produit (meme ensemble que la
  // feuille "Recapitulatif"), quantite commandee dans chaque case (0 si le
  // client n'a pas pris ce produit). Cases par colonne d'un seul type
  // d'unite (kg OU unite) : jamais de somme croisant kg et unites.
  const sheet2 = wb.addWorksheet('Par client');
  sheet2.addRow([periodeLabel(debut, fin)]).font = { italic: true, color: { argb: 'FF666666' } };
  sheet2.addRow([]);

  const produitCols = recap; // deja tries par nom (voir getPreparationRecap)
  const header2 = sheet2.addRow(['Client', ...produitCols.map(p => `${p.nom} (${p.unite === 'kg' ? 'kg' : 'unité'})`)]);
  header2.font = { bold: true };

  // client_nom -> (produit_id -> quantite cumulee)
  const parClient = new Map();
  for (const cmd of commandes) {
    if (!parClient.has(cmd.client_nom)) parClient.set(cmd.client_nom, new Map());
    const parProduit = parClient.get(cmd.client_nom);
    for (const l of cmd.lignes) {
      parProduit.set(l.produit_id, (parProduit.get(l.produit_id) || 0) + l.quantite);
    }
  }

  const clientsTries = [...parClient.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
  for (const nomClient of clientsTries) {
    const parProduit = parClient.get(nomClient);
    sheet2.addRow([nomClient, ...produitCols.map(p => roundQty(parProduit.get(p.produit_id)))]);
  }

  if (clientsTries.length > 0) {
    const totalRow = sheet2.addRow(['TOTAL', ...produitCols.map(p => roundQty(p.quantite_totale))]);
    totalRow.font = { bold: true };
  }

  sheet2.getColumn(1).width = 26;
  for (let i = 0; i < produitCols.length; i++) sheet2.getColumn(i + 2).width = 18;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="commandes_a_preparer.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { writePreparationPDF, writePreparationExcel };
