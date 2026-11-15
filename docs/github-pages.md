# Déploiement GitHub Pages

Le studio est publié à l’adresse :

**https://giscolab.github.io/paint-by-numbers-generator/**

## Publication

Le workflow `.github/workflows/pages.yml` s’exécute sur les pushes vers `main`, ou manuellement depuis l’onglet Actions avec **Deploy GitHub Pages → Run workflow**.

Il installe les dépendances verrouillées, vérifie les types, le lint, les tests unitaires et la couverture, puis exécute les parcours Chromium sous `/paint-by-numbers-generator/`. La compilation finale utilise le chemin retourné par GitHub Pages pour les scripts, styles, icônes et Web Workers. Le job de déploiement attend la réussite du job de validation.

Dans **Settings → Pages**, la source doit être **GitHub Actions**. Le déploiement utilise l’environnement `github-pages`, avec les seules permissions nécessaires. Les contrôles et les journaux restent visibles dans Actions.

## Configuration publique

Les variables du dépôt, dans **Settings → Secrets and variables → Actions → Variables**, peuvent définir :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Ces valeurs sont intégrées dans le JavaScript téléchargé par le navigateur. La clé doit être une clé publique publishable, ou une ancienne clé `anon` compatible. Ne jamais utiliser `service_role`, `sb_secret_*` ou une clé de fournisseur IA. Le fichier `.env` local n’est pas envoyé dans l’artefact Pages.

En l’absence de variables, le workflow utilise des valeurs factices permettant au moteur local de démarrer. Les fonctions distantes ne seront alors pas disponibles ; les suggestions locales restent utilisables. GitHub Pages héberge les fichiers statiques, pas les fonctions Edge Supabase.

## Vérifier le chemin de publication localement

```bash
npx playwright install chromium
npm run test:pages
```

Le harnais compile une version dédiée dans `.pages-test-dist/`, la sert sur le port 4174 et teste le vrai sous-dossier du dépôt. Il n’utilise pas de services distants. Le serveur de développement sur le port 8080 continue de fonctionner à la racine.

## Données et limites

Les projets sont enregistrés dans le navigateur, sur l’origine utilisée. Les sauvegardes de `localhost`, de `127.0.0.1` et de `giscolab.github.io` sont distinctes. Exporter les rendus locaux avant de changer d’adresse si une copie indépendante est nécessaire.

Un fichier `404.html` contenant le shell de l’application est livré pour afficher la page introuvable du studio sur les routes inconnues. La route normale du studio reste l’adresse terminée par `/` ci-dessus.

Références : [déploiement Vite sur Pages](https://vite.dev/guide/static-deploy.html#github-pages), [workflows GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
