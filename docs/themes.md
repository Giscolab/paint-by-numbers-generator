# Thèmes CryptoKeep

Les quinze palettes proviennent de [Giscolab/CryptoKeep](https://github.com/Giscolab/CryptoKeep/tree/358c4b7bab570be7bafba0bdb6364a68ff5bb50a/public/themes),
révision `358c4b7bab570be7bafba0bdb6364a68ff5bb50a`.

Le menu Thème de l'en-tête propose les palettes avec leurs aperçus, ainsi que
Clair, Sombre et Système. Le choix est enregistré par next-themes dans la clé
locale existante `theme`. Les anciens choix restent valides ; Padawan est le
choix initial en l'absence de préférence enregistrée.

`src/config/themes.ts` contient les noms, aperçus et modes clair/sombre.
`src/styles/cryptokeep-themes.css` transpose les couleurs hexadécimales sources
en composantes HSL compatibles avec Tailwind et les variables du studio.
Les menus portalisés héritent des mêmes couleurs sur l'élément racine.

Les fonds, surfaces, textes, bordures et accents reprennent les palettes sources.
La surface translucide du thème CryptoKeep est composée sur son fond blanc.
Les déclarations auto-référentes `--color-text-primary` du dépôt source sont
ignorées au profit de la couleur explicite. La couleur du texte des boutons
est choisie entre blanc et presque noir pour préserver le contraste.

Les variantes Tailwind `dark:` reconnaissent les thèmes sombres de la collection.
Les couleurs des images, de la palette de peinture et des exports sont indépendantes
du thème de l'interface.
