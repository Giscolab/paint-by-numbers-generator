// Palettes imported from Giscolab/CryptoKeep. See docs/themes.md.
export const CRYPTOKEEP_THEMES = [
  {
    "id": "deathstar",
    "label": "Death Star",
    "dark": true,
    "background": "#0d0d0d",
    "surface": "#1a1a1a",
    "accent": "#ff1744"
  },
  {
    "id": "default",
    "label": "CryptoKeep",
    "dark": false,
    "background": "#fff",
    "surface": "#f8f9fa",
    "accent": "#4caf50"
  },
  {
    "id": "flatdark",
    "label": "Flat Dark",
    "dark": true,
    "background": "#121212",
    "surface": "#1e1e1e",
    "accent": "#4fc3f7"
  },
  {
    "id": "galactic",
    "label": "Galactic",
    "dark": true,
    "background": "#0d0221",
    "surface": "#1a0e3e",
    "accent": "#7c4dff"
  },
  {
    "id": "invaders",
    "label": "Invaders",
    "dark": true,
    "background": "#0c0010",
    "surface": "#1a001f",
    "accent": "#ff00cc"
  },
  {
    "id": "leia",
    "label": "Leia",
    "dark": false,
    "background": "#fff0f5",
    "surface": "#ffe3ec",
    "accent": "#ec407a"
  },
  {
    "id": "lightsaber",
    "label": "Lightsaber",
    "dark": true,
    "background": "#0b0c10",
    "surface": "#1c1f26",
    "accent": "#00e5ff"
  },
  {
    "id": "metallic",
    "label": "Metallic",
    "dark": true,
    "background": "#1c1c1e",
    "surface": "#2a2a2c",
    "accent": "#b0bec5"
  },
  {
    "id": "millennium",
    "label": "Millennium",
    "dark": false,
    "background": "#fdf6e3",
    "surface": "#f2e7c9",
    "accent": "#0277bd"
  },
  {
    "id": "padawan",
    "label": "Padawan",
    "dark": false,
    "background": "#faf3e0",
    "surface": "#f5e6ca",
    "accent": "#ffc107"
  },
  {
    "id": "r2d2",
    "label": "R2-D2",
    "dark": false,
    "background": "#f1f1f1",
    "surface": "#e0e0e0",
    "accent": "#1565c0"
  },
  {
    "id": "sith",
    "label": "Sith",
    "dark": true,
    "background": "#0a0000",
    "surface": "#1a0000",
    "accent": "#d50000"
  },
  {
    "id": "starfighter",
    "label": "Starfighter",
    "dark": true,
    "background": "#000c18",
    "surface": "#102030",
    "accent": "#ffeb3b"
  },
  {
    "id": "ubuntu",
    "label": "Ubuntu",
    "dark": true,
    "background": "#2c001e",
    "surface": "#3c0c1e",
    "accent": "#dd4814"
  },
  {
    "id": "xwing",
    "label": "X-Wing",
    "dark": false,
    "background": "#eeeeee",
    "surface": "#f5f5f5",
    "accent": "#ff5722"
  }
] as const;

export const STUDIO_THEMES = ["light", "dark", ...CRYPTOKEEP_THEMES.map((theme) => theme.id)];
