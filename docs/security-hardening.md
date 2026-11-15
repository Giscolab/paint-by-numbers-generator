# Sécurité du dépôt et de Supabase

## Configuration locale

- Le fichier \`.env\` est **local et ignoré par Git**. Il ne doit contenir que les
  variables publiques \`VITE_SUPABASE_*\` nécessaires au navigateur.
- Copiez \`.env.example\` vers \`.env\` pour configurer un nouvel environnement.
- Ne mettez **jamais** de clé \`service_role\`, \`sb_secret_*\`, jeton
  d'administration ou mot de passe dans une variable \`VITE_*\`.
- Le fichier \`.env\` a été suivi par Git dans l'historique du projet. Son contenu
  examiné comporte une clé \`anon\` publique et aucune clé administrative.
  Retirer le fichier du suivi **ne purge pas l'historique** : révoquez immédiatement
  toute vraie clé secrète découverte dans un ancien commit.

## Importation d'images par URL

La fonction \`supabase/functions/fetch-image-url\` applique désormais :

- HTTPS seulement ; ni identifiants d'URL ni ports personnalisés ;
- liste de fournisseurs autorisés, sans adresses IP arbitraires ;
- **aucune redirection HTTP** suivie ;
- 10 secondes de délai par téléchargement ;
- 20 Mio maximum, même si le fournisseur ne fournit pas \`Content-Length\` ;
- signature PNG, JPEG ou WebP vérifiée ;
- refus des SVG distants et des contenus HTML présentés comme une image.

L'importation de **fichiers locaux** (dont SVG) reste disponible. Les URL
d'autres domaines peuvent être téléchargées manuellement puis importées en
fichier local.

Par défaut, les noms de domaines acceptés sont définis dans
\`supabase/functions/fetch-image-url/urlSecurity.ts\`. Pour approuver un autre
**fournisseur public fiable**, l'ajouter aussi côté client et configurer
\`IMAGE_PROXY_ALLOWED_HOSTS\` (liste de domaines séparés par des virgules) dans
les secrets de la fonction Edge. Ne pas autoriser de domaine de rebinding, de
résolution privée, ni d'hébergeur contrôlé par une source non fiable.

> Important : changer le code dans Git **ne déploie pas** la fonction Edge sur
> le service Supabase. La version serveur doit être publiée séparément.

## Vérification et déploiement Supabase

1. Vérifier les règles **réellement actives** avec le script SQL non destructif
   \`supabase/security/audit_rls.sql\` dans le SQL Editor Supabase.
2. Déployer et vérifier \`fetch-image-url\` via les outils Supabase du projet
   authentifié (Dashboard, CLI ou application Supabase).
3. Appliquer la migration
   \`supabase/migrations/20261115142500_harden_anonymous_access.sql\`.
   Elle supprime la lecture anonyme des anciennes tâches \`image_jobs\` et
   préserve l'accès des utilisateurs authentifiés à leurs propres enregistrements.
4. Réexécuter l'audit RLS : aucune politique anonyme ne doit autoriser l'accès
   aux données personnelles, et les tables accessibles via l'API doivent garder
   la RLS activée.
5. Vérifier dans Supabase Edge Functions > Invocations / Logs les erreurs, les
   appels inhabituels et les refus de requêtes. Examiner aussi les journaux
   d'authentification et les consommations de services IA.

Pour la CLI Supabase, l'authentification et le lien au projet sont nécessaires
avant toute commande de déploiement. Examiner les migrations en attente avant
un éventuel \`supabase db push\` : cette commande peut déployer **toutes** les
migrations non encore appliquées.

## Tests et limites

\`npm run typecheck\`, \`npm run test:unit\` et \`npm run build\` vérifient
localement les changements. Les tests dans
\`tests/unit/imageProxySecurity.test.ts\` simulent les requêtes sans contacter
de réseau interne ni télécharger de fichiers extérieurs.

Ces protections réduisent la surface d'attaque, mais ne remplacent pas le
contrôle des rôles et des politiques en production ni la surveillance des logs.
