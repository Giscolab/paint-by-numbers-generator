# Studio Canvas to Colors

L'interface reprend la structure de `Giscolab/RedesignForErgonomics`, révision
`f92818d48071ed6949112a9a8a29372ef38ab725` : barre de document, outils verticaux,
configuration repliable, plan de travail et inspecteur à onglets.

Les vues et paramètres sont reliés au contexte PBN existant. La génération utilise
toujours le worker de traitement, et les statistiques proviennent du résultat réel.
Les couleurs de l'interface utilisent les variables sémantiques des thèmes CryptoKeep.
Le bouton de génération reste visible en bas du panneau de configuration.

Les actions de recadrage, baguette magique et les calques fictifs de la maquette
ne sont pas ajoutés. L'onglet Rendus expose les véritables modes de PBN.

## Validation

- Compilation de production, vérification TypeScript et deux tests de segmentation réussis.
- ESLint réussi sur Header, StudioLayout, ColorPalette et ParametersPanel.
- Import d'un SVG synthétique 480 × 320, analyse, application des recommandations,
  génération réelle de 8 couleurs et 48 zones, et affichage numéroté vérifiés dans le navigateur.
- Thèmes Padawan et Galactic contrôlés visuellement.
- Panneaux repliables et plan de travail contrôlés à 390 × 844.
- Le clic d'export PNG a été exécuté, mais la récupération du téléchargement par
  le navigateur intégré a expiré : le fichier exporté n'a pas été inspecté.
- Les erreurs ESLint préexistantes hors des composants vérifiés restent à traiter.

## Sauvegarde du design

`Redesign_for_Ergonomics.zip` contient désormais la révision distante ci-dessus.
Il s'agit de la maquette de référence indépendante, pas d'une copie du moteur PBN.

Copies de travail sur ce poste :

- Version locale actualisée : `C:/Users/cadet/Documents/github/pbn-design-comparison/redesign-local-updated`.
- Ancienne version locale conservée : `C:/Users/cadet/Documents/github/pbn-design-comparison/redesign-local`.
- Ancienne archive : `C:/Users/cadet/Documents/github/pbn-design-comparison/backups/Redesign_for_Ergonomics-original-20261115-111800.zip`.

L'archive distante contient les pointeurs Git LFS de fichiers historiques dont les
objets binaires ne sont pas disponibles sur GitHub (erreur 404). Ces images ne sont
pas utilisées par la page actuelle, qui s'affiche correctement.

Pour relancer la maquette locale actualisée sous PowerShell :

```powershell
cd C:/Users/cadet/Documents/github/pbn-design-comparison/redesign-local-updated
$env:NODE_USE_SYSTEM_CA = '1'
npm install --package-lock=false
$env:PORT = '8081'
npm run dev -- --host 127.0.0.1 --port 8081 --strictPort
```

Le verrou npm fourni par le dépôt ne correspond pas complètement à son manifeste ;
la commande ci-dessus conserve les sources et le verrou fournis sans les réécrire.
