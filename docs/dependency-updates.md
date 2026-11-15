# Mise à jour des dépendances — 15 novembre 2026

Le projet utilise désormais Vite 8.3.8, le plugin React 6.3.0 basé sur Oxc,
React Router 7.18.5 et Vitest 4.1.12. React 18 et Tailwind CSS 3 sont conservés.
Les autres dépendances ont été actualisées dans les plages du manifeste.

Deux surcharges ciblées dans `package.json` corrigent les dépendances indirectes :

- `@typescript-eslint/typescript-estree` : `minimatch` >= 11.0.1.
- `@tailwindcss/typography` : `postcss-selector-parser` >= 6.1.5, même version majeure.

Réexaminer ces surcharges lorsque les paquets parents intègrent les correctifs.
ESLint fonctionne avec la surcharge minimatch ; les 34 erreurs et 18 avertissements
du code existant restent à corriger séparément.

## Vérification

```powershell
npm ci
npm run build
npm run typecheck
npm test
npm audit
```

Si npm ne reconnaît pas la chaîne de certificats HTTPS sous Windows :

```powershell
$env:NODE_USE_SYSTEM_CA = '1'
npm audit
```

Cela utilise les certificats système sans désactiver la validation TLS.
La compilation, les types et les deux tests de segmentation ont été vérifiés.
L'audit après installation ne signale aucune vulnérabilité connue.
Le parcours complet dans le navigateur reste à vérifier manuellement.
