import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  class TestCanvas {
    constructor(public width: number, public height: number) {}
    getContext() { return {}; }
  }
  Object.assign(globalThis, { OffscreenCanvas: TestCanvas });
});

import { consolidateColorMap, labelConnectedComponents, smoothZones } from '../imageProcessing';
import { rgbToLab } from '../colorUtils';
import { consolidateColorMapTyped, labelConnectedComponentsFast, smoothZonesFast } from '../fastImageOperations';

describe('algorithmes haute performance : équivalence des résultats', () => {
  it('reproduit les identités, les couleurs et les barycentres des zones', () => {
    const width = 71;
    const height = 47;
    let state = 0x98765;
    const colors = Uint16Array.from({ length: width * height }, (_, index) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return index % 71 < 12 ? 3 : (state >>> 24) % 8;
    });
    const legacy = labelConnectedComponents(Array.from(colors), width, height);
    const fast = labelConnectedComponentsFast(colors, width, height);
    expect([...fast.labels]).toEqual([...legacy.labels]);
    expect(fast.zones.map(z => [z.id, z.colorIdx, z.area, z.centroid])).toEqual(
      legacy.zones.map(z => [z.id, z.colorIdx, z.area, z.centroid])
    );
    for (let i = 0; i < fast.zones.length; i++) {
      expect([...fast.zones[i].pixels].sort((a, b) => a - b)).toEqual(
        [...legacy.zones[i].pixels].sort((a, b) => a - b)
      );
    }
  });

  it('conserve les trous, les connexions diagonales et les bords', () => {
    const cases: { map: number[]; w: number; h: number }[] = [
      { map: [0, 1, 1, 0], w: 2, h: 2 },
      { map: [1, 1, 1, 1, 0, 1, 1, 1, 1], w: 3, h: 3 },
      { map: Array(60).fill(5), w: 60, h: 1 },
      { map: [0, 1, 2, 3, 4], w: 1, h: 5 },
    ];
    for (const item of cases) {
      const legacy = labelConnectedComponents(item.map, item.w, item.h);
      const fast = labelConnectedComponentsFast(item.map, item.w, item.h);
      expect(fast.labels).toEqual(legacy.labels);
      expect(fast.zones.map(z => [z.area, z.colorIdx, z.centroid])).toEqual(
        legacy.zones.map(z => [z.area, z.colorIdx, z.centroid])
      );
    }
  });

  it('produit exactement le même lissage avec les conflits de majorité', () => {
    for (const [width, height] of [[12, 16], [57, 29], [108, 47], [5, 5]] as const) {
      let seed = 0x293fd2;
      const colors = Int32Array.from({ length: width * height }, () => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return (seed >>> 20) % 11;
      });
      for (const passes of [0, 1, 2, 3]) {
        expect(smoothZonesFast(colors, width, height, passes)).toEqual(
          smoothZones(colors, width, height, passes)
        );
      }
    }
  });

  it('garde les pixels de bord et l’entrée inchangés', () => {
    const input = Int32Array.from({ length: 625 }, (_, i) => i % 11);
    const copy = input.slice();
    const output = smoothZonesFast(input, 25, 25, 2);
    expect(input).toEqual(copy);
    for (let i = 0; i < 25; i++) {
      expect(output[i]).toBe(input[i]);
      expect(output[600 + i]).toBe(input[600 + i]);
    }
  });

  it('rejette des dimensions incohérentes', () => {
    expect(() => labelConnectedComponentsFast([1], 3, 4)).toThrow();
    expect(() => smoothZonesFast(new Int32Array(4), 3, 3, 2)).toThrow();
  });

  it('reproduit la consolidation de palette sans recopier en tableaux JS', () => {
    const palette = ['#222222', '#242424', '#ffffff', '#fdffff', '#e00000', '#d90003'];
    const lab = palette.map(hex => rgbToLab(
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ));
    const map = Uint16Array.from({ length: 22019 }, (_, i) => i % palette.length);
    for (const threshold of [0, 0.5, 3, 15, 50]) {
      const old = consolidateColorMap(palette, Array.from(map), lab, threshold);
      const fast = consolidateColorMapTyped(palette, map, lab, threshold);
      expect(fast.consolidatedPalette).toEqual(old.consolidatedPalette);
      expect([...fast.consolidatedColorMap]).toEqual(old.consolidatedColorMap);
    }
  });

  it('mesure le temps sur une image fragmentée sans seuil matériel fixe', () => {
    const width = 280, height = 180;
    const colors = Uint16Array.from({ length: width * height }, (_, i) =>
      ((Math.imul(i, 1664525) >>> 11) + (i % 9)) % 15
    );
    const startLegacy = performance.now();
    const legacy = labelConnectedComponents(Array.from(colors), width, height);
    const legacyMs = performance.now() - startLegacy;
    const startFast = performance.now();
    const fast = labelConnectedComponentsFast(colors, width, height);
    const fastMs = performance.now() - startFast;
    expect(fast.labels).toEqual(legacy.labels);
    console.info(`Segmentation 280x180 : ancien ${legacyMs.toFixed(1)} ms, rapide ${fastMs.toFixed(1)} ms, ${fast.zones.length} zones`);

    const smoothingPixels = 320 * 240;
    const ids = Int32Array.from({ length: smoothingPixels }, (_, i) => (i % 320 < 100 ? 1 : (i % 7)));
    const oldStart = performance.now();
    const oldResult = smoothZones(ids, 320, 240, 1);
    const oldMs = performance.now() - oldStart;
    const newStart = performance.now();
    const newResult = smoothZonesFast(ids, 320, 240, 1);
    const newMs = performance.now() - newStart;
    expect(newResult).toEqual(oldResult);
    console.info(`Lissage 320x240 : ancien ${oldMs.toFixed(1)} ms, rapide ${newMs.toFixed(1)} ms`);
  });
});
