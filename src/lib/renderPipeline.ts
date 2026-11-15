import {
  consolidateColorMap,
  createNumberedVersion,
  detectEdges,
  generateLegend,
  generateSVG,
  hexToRgb,
  labelConnectedComponents,
  mergeNearIdenticalColors,
  mergeSimilarAdjacentZones,
  mergeSmallZones,
  quantizeColors,
  smoothZones,
  traceContours
} from './imageProcessing';
import { rgbToLab, deltaE2000, balancePalette, averagePaletteDeltaE } from './colorUtils';
import { artisticMerge, type ArtisticMergeStats } from './regionMerge';
import type { RawImageAnalysis } from './analysisPipeline';
import type { ProcessedResult } from './imageProcessing';
import { paintRegionMap, placeRegionLabels, validateModelParameters } from './pbnModel';

export interface RenderPipelineOptions {
  numColors: number;
  minRegionSize: number;
  smoothness: number;
  mergeTolerance: number;
  enableArtisticMerge: boolean;
  enableSmartPalette: boolean;
  report: (stage: string, progress: number, detail?: string) => void;
}

export interface RenderPipelineResult {
  processed: Omit<ProcessedResult, 'progressLog' | 'metadata'>;
  averageDeltaE?: number;
  artisticMergeStats?: ArtisticMergeStats;
}


/**
 * Supprime les pixels isolés lorsque la segmentation d'une photographie est
 * trop fragmentée. Une majorité locale ne remplace jamais une région dominante
 * par une couleur différente sans au moins quatre voisins concordants.
 */
export function suppressColorSpeckles(
  input: Uint16Array,
  width: number,
  height: number,
): Uint16Array {
  if (input.length !== width * height) throw new Error("Carte de couleurs invalide.");
  const output = new Uint16Array(input);
  const colors = new Uint16Array(9);
  const counts = new Uint8Array(9);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let unique = 0;
      let bestCount = 0;
      let bestColor = input[y * width + x];
      // Read from input; never depend on earlier pixels in this pass.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const color = input[(y + dy) * width + x + dx];
          let k = 0;
          while (k < unique && colors[k] !== color) k++;
          if (k === unique) {
            colors[unique] = color;
            counts[unique] = 0;
            unique++;
          }
          const count = ++counts[k];
          if (count > bestCount) {
            bestCount = count;
            bestColor = color;
          }
        }
      }
      if (bestCount >= 4) output[y * width + x] = bestColor;
    }
  }
  return output;
}

export function renderPipeline(
  raw: RawImageAnalysis,
  options: RenderPipelineOptions
): RenderPipelineResult {
  const {
    numColors,
    minRegionSize,
    smoothness,
    mergeTolerance,
    enableArtisticMerge,
    enableSmartPalette,
    report
  } = options;

  const { referenceImageData, referenceGrayscaleMap } = raw;
  const width = referenceImageData.width;
  const height = referenceImageData.height;

  if (referenceGrayscaleMap.length !== width * height) {
    throw new Error('referenceGrayscaleMap incohérente avec referenceImageData.');
  }

  validateModelParameters(options);
  const effectiveMinRegionSize = Math.max(0, Math.round(minRegionSize));
  const effectiveMergeTolerance = Math.max(0, mergeTolerance);
  let artisticMergeStats: ArtisticMergeStats | undefined;

  // === STEP 1: Quantization ===
  report("Quantification des couleurs", 15, `K-means++ sur ${Math.round(referenceImageData.data.length / 4)} pixels`);
  const quantizationStart = Date.now();
  let palette = quantizeColors(referenceImageData, numColors);
  palette = mergeNearIdenticalColors(palette, effectiveMergeTolerance);

  const rawPalette = [...palette];
  let averageDeltaE = 0;

  if (enableSmartPalette) {
    report("Adaptation intelligente de la palette", 30, "Équilibrage chromatique");
    const adaptedPalette = balancePalette(palette, {
      targetLightness: 50,
      targetSaturation: 60,
      contrastBoost: 20,
      preserveHue: true
    });
    averageDeltaE = averagePaletteDeltaE(palette, adaptedPalette);
    palette = adaptedPalette;
    report("Palette optimisée", 33, `ΔE moyen: ${averageDeltaE.toFixed(2)}`);
  } else {
    report("Palette générée", 28, `${palette.length} couleurs extraites en ${Date.now() - quantizationStart}ms`);
  }

  // === STEP 2: Pixel mapping ===
  report("Attribution des pixels", 35, "Calcul des distances perceptuelles ΔE2000");
  const mappingStart = Date.now();

  const colorMap = new Uint16Array(width * height);

  const paletteLabCache = new Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = hexToRgb(palette[i]);
    paletteLabCache[i] = rgbToLab(r, g, b);
  }

  const nearestColors = new Map<number,number>();
  let pixelIndex = 0;
  for (let i = 0; i < referenceImageData.data.length; i += 4) {
    const r = referenceImageData.data[i];
    const g = referenceImageData.data[i + 1];
    const b = referenceImageData.data[i + 2];

    const rgbKey = (r << 16) | (g << 8) | b;
    let colorIndex = nearestColors.get(rgbKey);
    if (colorIndex === undefined) {
      const pixelLab = rgbToLab(r, g, b);
      let minDist = Infinity;
      colorIndex = 0;
      for (let idx = 0; idx < paletteLabCache.length; idx++) {
        const distance = deltaE2000(pixelLab, paletteLabCache[idx]);
        if (distance < minDist) { minDist = distance; colorIndex = idx; }
      }
      if (nearestColors.size < 65536) nearestColors.set(rgbKey, colorIndex);
    }

    colorMap[pixelIndex++] = colorIndex;

  }

  report("Attribution terminée", 42, `Carte de couleurs générée en ${Date.now() - mappingStart}ms`);

  // === STEP 2.5: Consolidate near-identical colors ===
  report("Consolidation des couleurs", 44, "Fusion des couleurs perceptuellement identiques");
  const consolidationStart = Date.now();

  const { consolidatedPalette, consolidatedColorMap } = consolidateColorMap(
    palette,
    Array.from(colorMap),
    paletteLabCache,
    effectiveMergeTolerance
  );

  report(
    "Consolidation terminée",
    46,
    `${palette.length - consolidatedPalette.length} couleurs fusionnées en ${Date.now() - consolidationStart}ms`
  );

  palette = consolidatedPalette;
  const newColorMap = new Uint16Array(consolidatedColorMap.length);
  for (let i = 0; i < consolidatedColorMap.length; i++) {
    newColorMap[i] = consolidatedColorMap[i];
  }

  // === STEP 3: Connected components ===
  report("Segmentation des zones", 48, "Étiquetage des composantes connexes");
  const segmentationStart = Date.now();
  let segmentationMap: Uint16Array<ArrayBufferLike> = newColorMap;
  let initialComponents = labelConnectedComponents(Array.from(segmentationMap), width, height);
  const MAX_INITIAL_ZONES = 100000;
  for (let pass = 1; initialComponents.zones.length > MAX_INITIAL_ZONES && pass <= 3; pass++) {
    report("Simplification des micro-zones", 49 + pass, `${initialComponents.zones.length} régions — passe ${pass}/3`);
    segmentationMap = suppressColorSpeckles(segmentationMap, width, height);
    initialComponents = labelConnectedComponents(Array.from(segmentationMap), width, height);
  }
  if (initialComponents.zones.length > MAX_INITIAL_ZONES) {
    throw new Error(
      `Image encore trop fragmentée (${initialComponents.zones.length} zones). ` +
      "Essayez 16 couleurs ou une image légèrement réduite."
    );
  }
  const { labels: initialLabels, zones: initialZones } = initialComponents;
  report(
    "Segmentation terminée",
    52,
    `${initialZones.length} zones détectées en ${Date.now() - segmentationStart}ms`
  );

  // === STEP 4: Merge small zones ===
  report("Fusion des petites zones", 56, `Taille minimale ${effectiveMinRegionSize}px`);
  const mergeStart = Date.now();
  const { mergedLabels, mergedZones } = mergeSmallZones(
    initialZones,
    initialLabels,
    palette,
    width,
    height,
    effectiveMinRegionSize
  );

  // === STEP 4.5: Merge adjacent zones sharing identical colors ===
  const adjacencyTolerance = Math.min(effectiveMergeTolerance / 2, 2);
  let postMergeLabels = mergedLabels;
  let postMergeZones = mergedZones;
  if (adjacencyTolerance > 0 && mergedZones.length > 0) {
    report(
      "Fusion des contours fantômes",
      58,
      `ΔE ≤ ${adjacencyTolerance.toFixed(2)} entre zones adjacentes`
    );
    const adjacencyStart = Date.now();
    const mergedAdjacencyResult = mergeSimilarAdjacentZones(
      mergedZones,
      mergedLabels,
      palette,
      width,
      height,
      adjacencyTolerance
    );
    postMergeLabels = mergedAdjacencyResult.labels;
    postMergeZones = mergedAdjacencyResult.zones;
    report(
      "Contours fantômes fusionnés",
      59,
      `${mergedZones.length - postMergeZones.length} regroupements en ${Date.now() - adjacencyStart}ms`
    );
  }

  report(
    "Fusion terminée",
    60,
    `${postMergeZones.length} zones après fusion en ${Date.now() - mergeStart}ms`
  );

  if (enableArtisticMerge && postMergeZones.length > 0) {
    report(
      "Fusion artistique",
      61,
      `ΔE ≤ ${effectiveMergeTolerance.toFixed(1)} / aire ≤ ${effectiveMinRegionSize}px`
    );

    const artisticResult = artisticMerge(postMergeZones, postMergeLabels, palette, {
      mergeTolerance: effectiveMergeTolerance,
      minMergeArea: effectiveMinRegionSize,
      width,
      height,
    });

    postMergeLabels = artisticResult.labels;
    postMergeZones = artisticResult.zones;
    artisticMergeStats = artisticResult.stats;

    report(
      "Fusion artistique terminée",
      62,
      `${artisticMergeStats.mergedCount} fusions en ${artisticMergeStats.timeMs.toFixed(1)}ms`
    );
  }

  // Lissage is a percentage, not up to 100 full-image passes.
  const iterations = Math.round(smoothness / 20);
  report("Lissage des bords", 64, `${iterations} passes`);
  const smoothed = smoothZones(postMergeLabels, width, height, iterations);
  const zoneColors = new Map(postMergeZones.map(zone => [zone.id, zone.colorIdx]));
  const smoothedColors = Array.from(smoothed, id => zoneColors.get(id)!);
  // Re-segment by color: smoothing can split a formerly connected region.
  const connected = labelConnectedComponents(smoothedColors, width, height);
  const cleaned = mergeSmallZones(connected.zones, connected.labels, palette, width, height, effectiveMinRegionSize);
  const cleanedColors = new Map(cleaned.mergedZones.map(zone => [zone.id, zone.colorIdx]));
  const finalComponents = labelConnectedComponents(Array.from(cleaned.mergedLabels, id => cleanedColors.get(id)!), width, height);
  const smoothedLabels = finalComponents.labels;
  const usedColors = new Set(finalComponents.zones.map(zone => zone.colorIdx));
  const oldToNew = new Map<number, number>();
  palette = palette.filter((_, index) => {
    if (!usedColors.has(index)) return false;
    oldToNew.set(index, oldToNew.size);
    return true;
  });
  const smoothedZones = finalComponents.zones.map(zone => ({ ...zone, colorIdx: oldToNew.get(zone.colorIdx)! }));
  report("Zones stabilisées", 68, `${smoothedZones.length} régions connexes`);
  const contoursData = detectEdges(smoothedLabels, referenceGrayscaleMap, width, height);
  report("Traçage des contours", 72, "Contours indépendants avec conservation des trous");
  const mergedContours = traceContours(width, height, smoothedZones);
  report("Contours extraits", 83, `${mergedContours.length} anneaux`);
  const placements = placeRegionLabels(smoothedLabels, smoothedZones, width, height);
  const refinedZones = smoothedZones.map(zone => ({...zone, label: placements.get(zone.id), centroid: placements.has(zone.id) ? {x:placements.get(zone.id)!.x, y:placements.get(zone.id)!.y} : zone.centroid}));
  report("Placement des numéros", 88, `${placements.size} zones numérotables sur ${refinedZones.length}`);

  // === STEP 10: SVG generation ===
  report("Génération du SVG", 92, "Conversion des polygones en chemins");
  const svg = generateSVG(mergedContours, refinedZones, palette, width, height);

  // === STEP 11: Numbered version (base = image de référence, comme l'aperçu) ===
  report("Création de la version numérotée", 94, "Rendu des zones et numéros");
  const numberedData = createNumberedVersion(
    referenceImageData,
    refinedZones,
    palette,
    smoothedLabels,
    contoursData
  );

  // Colored output is the final segmentation, not the original photo or an overlay.
  report("Rendu des aplats", 96, "Application de la palette aux régions finales");
  const previewData = paintRegionMap(smoothedLabels, refinedZones, palette, width, height);

  // === STEP 13: Legend generation ===
  report("Génération de la légende", 98, `${palette.length} couleurs ordonnées par surface`);
  const legend = generateLegend(refinedZones, palette, width * height);

  // === STEP 14: Build color->zone map ===
  const colorZoneMapping = new Map<number, number[]>();
  for (const zone of refinedZones) {
    if (!colorZoneMapping.has(zone.colorIdx)) {
      colorZoneMapping.set(zone.colorIdx, []);
    }
    colorZoneMapping.get(zone.colorIdx)!.push(zone.id);
  }

  return {
    processed: {
      original: referenceImageData,
      contours: contoursData,
      numbered: numberedData,
      colorized: previewData,
      palette,
      rawPalette: enableSmartPalette ? rawPalette : undefined,
      zones: refinedZones,
      svg,
      legend,
      labels: smoothedLabels,
      colorZoneMapping,
      artisticMergeStats
    },
    averageDeltaE: enableSmartPalette ? averageDeltaE : undefined,
    artisticMergeStats
  };
}
