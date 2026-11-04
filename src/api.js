// ═══════════════════════════════════════════
// Assemblage des routes API (utilise par server.js ET main.js)
// Chaque domaine fonctionnel a son propre fichier dans src/routes/.
// ═══════════════════════════════════════════
const express = require('express');

const ROUTES = [
  require('./routes/produits'),
  require('./routes/clients'),
  require('./routes/commandes'),
  require('./routes/depenses'),
  require('./routes/stats'),
  require('./routes/preparation'),
  require('./routes/sauvegarde')
];

function createApiRouter() {
  const router = express.Router();
  for (const r of ROUTES) router.use(r);
  return router;
}

// Gestionnaire d'erreurs a monter APRES toutes les routes /api (dans
// server.js et main.js) : renvoie toujours du JSON { error } au lieu de la
// page HTML par defaut d'Express (avec la trace de la pile), que le frontend
// ne savait pas lire. Couvre aussi les erreurs de express.json() (corps
// invalide ou trop volumineux), levees avant meme d'atteindre le routeur.
function apiErrorHandler(err, req, res, next) {
  console.error('API error:', req.method, req.originalUrl, err);
  if (res.headersSent) return next(err);
  // sql.js leve parfois une simple chaine plutot qu'un objet Error.
  const message = (err && err.message) || String(err);
  const status = (err && (err.status || err.statusCode)) || 500;
  res.status(status).json({ error: status === 500 ? 'Erreur serveur : ' + message : message });
}

module.exports = { createApiRouter, apiErrorHandler };
