# 🌿 Maraîchage Manager

Application de bureau pour gérer un business de maraîchage : commandes, clients, produits, dépenses et statistiques.

---

## 🚀 Installation rapide

### Prérequis
- **Node.js** (version 18 ou supérieure) : https://nodejs.org

### Lancer l'application

1. **Décompresser** le dossier `maraichage-app` sur votre PC
2. **Double-cliquer** sur `demarrer.bat` (Windows)
   - La première fois, les dépendances s'installent automatiquement
   - Si Electron est installé → fenêtre de bureau native
   - Sinon → ouverture dans le navigateur

Ou en terminal :
```bash
npm install
npm run electron    # Mode bureau (Electron)
npm start           # Mode navigateur
```

---

## 📦 Créer le .exe installable

Le script `construire-exe.bat` fait tout automatiquement :

1. **Double-cliquer** sur `construire-exe.bat`
2. Attendre la fin de la construction (quelques minutes)
3. L'installeur apparaît dans `dist/Maraîchage Manager Setup 1.0.0.exe`
4. Ce .exe peut être distribué et installé sur n'importe quel PC Windows

Ou manuellement :
```bash
npm install
npm run build-win       # Windows (.exe installeur)
npm run build-mac       # macOS (.dmg)
npm run build-linux     # Linux (.AppImage)
```

---

## 📊 Fonctionnalités

### Gestion complète (CRUD)
- **Produits** : nom, prix au kg ou à l'unité
- **Clients** : nom, téléphone (optionnel), email (optionnel)
- **Commandes** : panier multi-produits, prix auto/manuel, lieu de livraison, détail cliquable
- **Dépenses** : nom, date, montant, catégorie

### Statistiques & Analyses
- Tableau de bord (CA, dépenses, bénéfice, panier moyen, marge)
- Top clients et produits par chiffre d'affaires
- Graphique barres mensuel CA / Dépenses / Bénéfice
- Commandes par mois, moyenne par semaine
- Évolution des clients actifs
- Répartition des dépenses par catégorie
- Répartition des points de livraison
- Filtrage par période personnalisable

### Import / Export
- **Export BDD** : fichier SQLite complet pour sauvegarde
- **Import BDD** : restauration (remplace les données)
- **Export CSV** : chaque table en fichier séparé

---

## 🔧 Architecture technique

- **Frontend** : HTML/CSS/JS vanilla + Chart.js
- **Backend** : Node.js + Express (serveur local)
- **Base de données** : SQLite via sql.js (fichier `maraichage.db`)
- **Bureau** : Electron (fenêtre native)
- **Build** : electron-builder (installeur Windows/Mac/Linux)

La base de données est créée automatiquement au premier lancement.

### Organisation du code

```
main.js                  Point d'entrée Electron (fenêtre, menus, mises à jour)
server.js                Point d'entrée mode navigateur (npm start)
src/
  db.js                  Accès SQLite (sql.js), création des tables, migrations
  api.js                 Assemblage des routes + gestion des erreurs
  helpers.js             Validation, filtres de période, calculs de dates
  routes/                Une route par domaine : produits, clients, commandes,
                         depenses, stats, preparation, sauvegarde
  exports/preparation.js Génération PDF / Excel des commandes à préparer
public/
  index.html, style.css
  js/
    etat.js, utils.js, navigation.js, main.js   Socle commun
    pages/               Une page de l'application par fichier
    composants/          Éléments partagés entre pages (panneau à préparer)
    sauvegarde.js, mise-a-jour.js
```

Les scripts du frontend sont des scripts classiques (pas de build) chargés
dans l'ordre par `index.html` : ils partagent leurs variables globales.
