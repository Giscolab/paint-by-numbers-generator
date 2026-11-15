# Tests du studio

Les tests du projet sont regroupés ici. Les tests existants, y compris le fichier de comparaison des algorithmes rapides, sont conservés dans `unit/`.

## Lancer les vérifications

À la racine du dépôt, après `npm ci` :

```bash
npm test
npm run test:coverage
npm run test:types
npx playwright install chromium
npm run test:e2e
npm run test:pages
```

`npm run check` enchaîne les types de l’application et des tests, ESLint, la couverture et la compilation. Les tests navigateur se lancent séparément avec `npm run test:e2e` ; `npm run test:e2e:ui` ouvre leur interface de diagnostic.

## Organisation et contrats vérifiés

| Dossier | Périmètre |
| --- | --- |
| `unit/` | Moteur de segmentation, zones et numéros, conversions de couleurs, cache, décodage borné, traitement des erreurs et annulations, métadonnées EXIF, intégrité PNG/DPI, stockage IndexedDB et recommandations locales. |
| `e2e/` | Parcours dans Chromium avec le vrai décodeur, les Web Workers, IndexedDB et les fichiers téléchargés. |

Les images des tests navigateur sont générées localement par `e2e/helpers.ts`. Elles ne dépendent d’aucune photo privée ou URL distante. Les requêtes vers les services externes sont bloquées pendant ces scénarios ; ils n’exercent donc pas une véritable réponse de l’IA distante.

Les tests navigateur compilent l’application dans `.e2e-dist/` puis démarrent Vite Preview sur `127.0.0.1:4173`. Ce dossier séparé évite qu’une compilation de développement remplace les fichiers pendant les tests. Les variables publiques factices du harnais suffisent à initialiser le client ; aucun secret ni compte de production n’est nécessaire. Le serveur habituel du studio sur 8080 reste indépendant.

## Lire les résultats

- `coverage/index.html` : rapport V8 des tests unitaires.
- `coverage/lcov.info` et `coverage/coverage-summary.json` : résultats exploitables par d’autres outils.
- `playwright-report/` : rapport HTML produit en CI.
- `test-results/` : traces, captures et vidéos des échecs navigateur.

Ces résultats générés sont ignorés par Git et conservés temporairement comme artefacts des GitHub Actions.

La couverture inclut les fichiers de l’application dans `src/`, même ceux qui ne sont jamais importés par les tests. Seuls les déclarations TypeScript, les types générés Supabase et les composants UI de base sont exclus. Les tests navigateur ne sont pas ajoutés artificiellement au pourcentage V8 des tests unitaires.

Des seuils globaux initiaux et des seuils plus exigeants sur plusieurs modules du moteur sont définis dans `vitest.config.ts`. Ils bloquent les baisses importantes ; ils doivent augmenter avec les nouveaux scénarios. Un pourcentage élevé ne remplace pas la vérification du comportement.

## Ajouter une régression

1. Reproduire le défaut par une entrée minimale et déterministe.
2. Ajouter un test dans `unit/*.test.ts` ou `e2e/*.spec.ts` qui échoue avant la correction.
3. Vérifier le résultat observable : conservation des pixels et zones, erreur visible, promesse réglée, sauvegarde réouvrable ou contenu réel d’un export.
4. Éviter les délais arbitraires, les services externes, les données personnelles et les limites de performance dépendantes de la machine.
5. Exécuter le test ciblé puis les contrôles concernés. Ne pas désactiver un test qui révèle un défaut pour rendre la CI verte.

Les cas manuels complémentaires figurent dans [`docs/manual-tests.md`](../docs/manual-tests.md). La webcam physique, les services distants, les formats propres à chaque navigateur et la qualité artistique sur des photos variées restent des validations distinctes. Cette suite ne garantit pas une absence totale de défauts ou de vulnérabilités.
