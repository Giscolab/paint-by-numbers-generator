import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

// Core studio regressions run without third-party availability or accidental remote calls.
test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseURL!).origin
      ? route.continue()
      : route.abort('blockedbyclient');
  });
});
import { assertPng, downloadBytes, fourColorPng, generateModel, importImage } from './helpers';

test('import, analyse, génération et exports réels PNG, ZIP et PDF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Générer ma création', exact: true })).toBeDisabled();
  await generateModel(page);

  for (const name of ["Voir les contours de l'image", 'Voir les zones numérotées', "Comparer l'original et le colorisé"]) {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
  }

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  assertPng(await downloadBytes(await pngDownload), 192, 192);

  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const zipDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Exporter tout (colorisé + contours + numéroté)', exact: true }).click();
  const zip = await JSZip.loadAsync(await downloadBytes(await zipDownload));
  const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  expect(entries).toHaveLength(3);
  const renderedLayers: Buffer[] = [];
  for (const mode of ['colorized', 'contours', 'numbered']) {
    const name = entries.find(entry => entry.includes(`-${mode}-`));
    expect(name, `Rendu ${mode} présent dans le ZIP`).toBeTruthy();
    const rendered = await zip.file(name!)!.async('nodebuffer');
    assertPng(rendered, 192, 192);
    renderedLayers.push(rendered);
  }

  expect(renderedLayers[0].equals(renderedLayers[1]), 'Couleurs et contours distincts').toBe(false);
  expect(renderedLayers[1].equals(renderedLayers[2]), 'Le modèle numéroté contient ses numéros').toBe(false);

  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export PDF (prêt à imprimer)', exact: true }).click();
  const pdf = await downloadBytes(await pdfDownload);
  expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('le projet enregistré conserve ses rendus après rechargement et réouverture', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  await generateModel(page);
  await page.getByRole('navigation', { name: 'Menu principal', exact: true }).getByRole('button', { name: 'Fichier', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Enregistrer le projet localement', exact: true }).click();
  await expect(page.getByText('Projet enregistré et réouvrable localement.', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Menu principal', exact: true }).getByRole('button', { name: 'Fichier', exact: true }).click();
  await page.getByRole('menuitem', { name: 'quatre-couleurs.png', exact: true }).click();
  await expect(page.getByText('Projet restauré.', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Voir les zones numérotées', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  assertPng(await downloadBytes(await download), 192, 192);
});

test('les panneaux restent accessibles au clavier et les thèmes survivent au rechargement', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  const configuration = page.getByRole('complementary', { name: 'Configuration de génération', exact: true });
  const inspector = page.getByRole('complementary', { name: 'Inspecteur du document', exact: true });
  await expect(configuration).toBeVisible();
  await expect(inspector).toBeVisible();
  await page.getByRole('button', { name: 'Replier le panneau de configuration', exact: true }).press('Enter');
  await expect(configuration).toBeHidden();
  await page.getByRole('button', { name: 'Déplier le panneau de configuration', exact: true }).press('Space');
  await expect(configuration).toBeVisible();
  await page.getByRole('button', { name: 'Replier l’inspecteur', exact: true }).click();
  await expect(inspector).toBeHidden();
  await page.getByRole('button', { name: 'Afficher les rendus', exact: true }).click();
  await expect(inspector).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Rendus', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Changer de thème/ }).click();
  await page.getByRole('menuitemradio', { name: 'Sith', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Changer de thème : Sith', exact: true })).toBeVisible();
});

test('sur écran étroit les commandes échangent les panneaux sans bloquer le plan de travail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  const configuration = page.getByRole('complementary', { name: 'Configuration de génération', exact: true });
  const inspector = page.getByRole('complementary', { name: 'Inspecteur du document', exact: true });
  await expect(configuration).toBeHidden();
  await expect(inspector).toBeHidden();
  await page.getByRole('button', { name: 'Déplier le panneau de configuration', exact: true }).click();
  await expect(configuration).toBeVisible();
  await page.getByRole('button', { name: 'Déplier l’inspecteur', exact: true }).click();
  await expect(configuration).toBeHidden();
  await expect(inspector).toBeVisible();
  await page.getByRole('button', { name: 'Replier l’inspecteur', exact: true }).click();
  await expect(inspector).toBeHidden();
  await expect(page.getByRole('main', { name: 'Plan de travail', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menu principal', exact: true }).getByRole('button', { name: 'Fichier', exact: true })).toBeVisible();
});

for (const corrupt of [
  { name: 'corrompu.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') },
  { name: 'tronque.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff]) },
]) {
  test(`un fichier ${corrupt.name} donne une erreur visible puis un nouvel import fonctionne`, async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Ouvrir une image', exact: true }).click();
    await (await chooser).setFiles(corrupt);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/import|image|décod|charg/i);
    await importImage(page, 'valide.png');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: "Analyser l'image", exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Analyse brute', exact: true })).toBeVisible();
  });
}

test('remplacer une image invalide les résultats et impose une nouvelle analyse', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  await generateModel(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir une image', exact: true }).click();
  await (await chooser).setFiles({ name: 'nouvelle-image.png', mimeType: 'image/png', buffer: fourColorPng(80, 64) });
  await expect(page.getByRole('button', { name: "Analyser l'image", exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Générer ma création', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'Voir les zones numérotées', exact: true })).toBeDisabled();
});


test('une image de 24 mégapixels est analysée à résolution bornée et génère un modèle', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir une image', exact: true }).click();
  await (await chooser).setFiles({ name: 'photo-24mp.png', mimeType: 'image/png', buffer: fourColorPng(6000, 4000) });
  await expect(page.getByRole('button', { name: "Analyser l'image", exact: true })).toBeEnabled();
  await page.getByRole('button', { name: "Analyser l'image", exact: true }).click();
  const report = page.getByRole('dialog', { name: 'Analyse brute', exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText(/Source\s*:\s*6000\s*×\s*4000\s*px/);
  await expect(report).toContainText(/Analyse\s*:\s*1200\s*×\s*800\s*px/);
  await page.getByRole('button', { name: 'Appliquer les recommandations', exact: true }).click();
  await page.getByRole('button', { name: 'Générer ma création', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image colorisée avec effets appliqués', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  assertPng(await downloadBytes(await download), 2400, 1600);
});

test('un SVG est rasterisé sans exécuter son script puis analysé et généré', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" onload="alert('svg-onload')">
    <script>alert('svg-script')</script>
    <rect width="48" height="48" fill="#e6412d"/>
    <rect x="48" width="48" height="48" fill="#1e78d2"/>
    <rect y="48" width="48" height="48" fill="#f5c32d"/>
    <rect x="48" y="48" width="48" height="48" fill="#2d964b"/>
  </svg>`;
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir une image', exact: true }).click();
  await (await chooser).setFiles({ name: 'quatre-formes.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.getByRole('button', { name: "Analyser l'image", exact: true })).toBeEnabled();
  await page.getByRole('button', { name: "Analyser l'image", exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analyse brute', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Appliquer les recommandations', exact: true }).click();
  await page.getByRole('button', { name: 'Générer ma création', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image colorisée avec effets appliqués', exact: true })).toBeVisible();
  expect(dialogs, 'Les scripts SVG ne doivent pas être exécutés').toEqual([]);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  assertPng(await downloadBytes(await download), 192, 192);
});

test('le service IA indisponible propose une suggestion locale applicable', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  await importImage(page);
  await page.getByRole('button', { name: "Analyser l'image", exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analyse brute', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Appliquer les recommandations', exact: true }).click();
  await page.getByRole('combobox', { name: 'Niveau visé', exact: true }).click();
  await page.getByRole('option', { name: 'Débutant — grandes zones', exact: true }).click();
  await page.getByRole('button', { name: 'Suggérer des paramètres', exact: true }).click();
  await expect(page.getByText('Débutant · local', { exact: true })).toBeVisible();
  await expect(page.getByText('Proposition locale calculée à partir de l’analyse de l’image (sans intelligence artificielle).', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Appliquer ces paramètres', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Paramètres appliqués', exact: true })).toBeVisible();
  await expect(page.locator('#smoothness [role="slider"]')).toHaveAttribute('aria-valuenow', '20');
  await page.getByRole('button', { name: 'Générer ma création', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image colorisée avec effets appliqués', exact: true })).toBeVisible();
});

test('l’effet peinture modifie réellement le PNG exporté et peut être désactivé', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'canvas to colors', exact: true })).toBeVisible();
  await generateModel(page);
  const originalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  const original = await downloadBytes(await originalDownload);
  await page.locator('summary').filter({ hasText: 'Palette & Effets' }).click();
  await page.getByRole('combobox', { name: 'Effet peinture', exact: true }).click();
  await page.getByRole('option', { name: 'Aquarelle', exact: true }).click();
  const effectedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  const effected = await downloadBytes(await effectedDownload);
  assertPng(effected, 192, 192);
  expect(effected.equals(original), 'L’effet doit changer les pixels exportés').toBe(false);
  await page.getByRole('combobox', { name: 'Effet peinture', exact: true }).click();
  await page.getByRole('option', { name: 'Aucun', exact: true }).click();
  const restoredDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  expect((await downloadBytes(await restoredDownload)).equals(original)).toBe(true);
});
