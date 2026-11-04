/* ═══════════════════════════════════════════ */
/* Export / import de la base, export CSV */
/* ═══════════════════════════════════════════ */

// ========== EXPORT / IMPORT ==========
async function exportDB() {
  try {
    const res = await fetch('/api/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maraichage_backup_${todayLocal()}.db`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Base de données exportée');
  } catch (e) { toast('Erreur export: ' + e.message, 'error'); }
}

async function importDB(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm('Attention : cette action remplacera toutes les données actuelles. Continuer ?')) {
    input.value = '';
    return;
  }
  try {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const bytes = new Uint8Array(reader.result);
        // Convert to base64 in chunks to avoid call stack overflow
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        await api('/import', 'POST', { data: base64 });
        toast('Base de données importée avec succès');
        renderPage();
      } catch (e) {
        toast('Erreur import: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (e) { toast('Erreur import: ' + e.message, 'error'); }
  input.value = '';
}

async function exportCSV() {
  try {
    const data = await api('/export-csv');
    for (const [name, csv] of Object.entries(data)) {
      if (!csv) continue;
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_${todayLocal()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast('Export CSV terminé');
  } catch (e) { toast('Erreur export CSV: ' + e.message, 'error'); }
}
