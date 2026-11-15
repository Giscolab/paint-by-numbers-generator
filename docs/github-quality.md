# Qualité et mises à jour sur GitHub

## Contrôles versionnés

| Configuration | Rôle |
| --- | --- |
| `.github/workflows/ci.yml` | Types application/tests, ESLint, tests unitaires, couverture et compilation sur Ubuntu avec Node 22/24 et Windows avec Node 24 ; parcours Chromium sur Ubuntu. |
| `.github/workflows/dependency-audit.yml` | Audit des dépendances de production et de développement à chaque push/PR et chaque semaine. Les vulnérabilités élevées ou critiques font échouer le contrôle. |
| `.github/workflows/codeql.yml` | Analyse statique JavaScript/TypeScript et des workflows GitHub Actions, avec les requêtes de sécurité étendues. |
| `.github/dependabot.yml` | Propositions hebdomadaires de mise à jour npm et GitHub Actions ; synchronisation des paquets Vitest et de leur fournisseur de couverture. |

Les actions tierces sont épinglées par SHA. Les permissions sont limitées aux besoins de chaque job. Les tests utilisent des valeurs publiques factices et ne demandent pas les identifiants de production. Aucune fusion automatique n’est configurée.

Dependabot propose des changements de dépendances ; il ne remplace ni les tests, ni un audit du code, ni la revue humaine des changements majeurs. Les alertes de sécurité et les mises à jour de version ont des rôles distincts.

## Mise en service dans le dépôt distant

Les fichiers locaux ne déclenchent aucun contrôle distant avant leur commit et leur push. Une fois les configurations présentes sur la branche par défaut :

1. Vérifier dans **Actions** que les workflows peuvent s’exécuter et consulter leur premier résultat.
2. Activer les **Dependabot alerts** et **Dependabot security updates** dans les paramètres de sécurité du dépôt.
3. Vérifier l’éligibilité de CodeQL pour le dépôt. Ce workflow utilise la configuration avancée : ne pas conserver simultanément un setup CodeQL par défaut incompatible.
4. Après un premier passage réussi, configurer les règles de protection de branche pour exiger les contrôles souhaités avant fusion. Utiliser les noms réellement affichés par GitHub.
5. Examiner les premières PR Dependabot, leurs notes de version et les résultats de CI avant de fusionner.

Les règles de protection et réglages de sécurité sont des paramètres GitHub : ajouter un fichier YAML ne les active pas à lui seul. Ce travail ne les modifie pas automatiquement.

## Rapports et limites

Les rapports de couverture, d’audit et de navigateur sont conservés comme artefacts pendant 14 jours. En cas d’échec, consulter le premier job en erreur et ses traces plutôt que relancer sans diagnostic.

L’audit npm détecte les vulnérabilités connues du registre au moment du contrôle. CodeQL recherche certaines classes de défauts dans le code ; aucun de ces outils ne certifie la sécurité totale du produit. Les fonctions Edge, leurs autorisations et les services déployés nécessitent aussi des validations dans leur environnement.

Références officielles : [options Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference), [configuration CodeQL](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options), [Playwright en CI](https://playwright.dev/docs/ci-intro), [couverture Vitest](https://vitest.dev/guide/coverage).
