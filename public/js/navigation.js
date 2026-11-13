/* ═══════════════════════════════════════════ */
/* Navigation entre les pages */
/* ═══════════════════════════════════════════ */

// ========== NAVIGATION ==========
function navigate(page) {
  destroyCharts();
  Object.values(chartsComparaison).forEach(c => c.destroy());
  chartsComparaison = {};
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage();
}

async function renderPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);">Chargement...</div>';
  
  try {
    await chargerAnnees();
    switch (currentPage) {
      case 'dashboard': await renderDashboard(); break;
      case 'commandes': await renderCommandes(); break;
      case 'clients': await renderClients(); break;
      case 'produits': await renderProduits(); break;
      case 'depenses': await renderDepenses(); break;
      case 'statistiques': await renderStatistiques(); break;
    }
  } catch (e) {
    main.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}
