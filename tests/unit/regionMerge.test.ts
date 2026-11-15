import { describe, expect, it } from 'vitest';
import { artisticMerge } from '@/lib/regionMerge';
import type { Zone } from '@/lib/imageProcessing';

function model(ids: number[], width: number, colors: Record<number, number>) {
  const labels = Int32Array.from(ids);
  const grouped = new Map<number, number[]>();
  ids.forEach((id, pixel) => grouped.set(id, [...(grouped.get(id) ?? []), pixel]));
  const zones: Zone[] = [...grouped].map(([id, pixels]) => ({
    id, colorIdx: colors[id], area: pixels.length, pixels: Uint32Array.from(pixels),
    centroid: { x: pixels.reduce((sum, p) => sum + p % width, 0) / pixels.length, y: pixels.reduce((sum, p) => sum + Math.floor(p / width), 0) / pixels.length },
  }));
  return { zones, labels };
}

function verifyCoverage(zones: Zone[], labels: Int32Array, width: number, height: number, paletteLength: number) {
  const seen = new Set<number>();
  for (const zone of zones) {
    expect(zone.area).toBe(zone.pixels.length);
    expect(zone.colorIdx).toBeGreaterThanOrEqual(0);
    expect(zone.colorIdx).toBeLessThan(paletteLength);
    expect(zone.centroid.x).toBeGreaterThanOrEqual(0);
    expect(zone.centroid.x).toBeLessThan(width);
    expect(zone.centroid.y).toBeGreaterThanOrEqual(0);
    expect(zone.centroid.y).toBeLessThan(height);
    for (const p of zone.pixels) {
      expect(p).toBeLessThan(width * height);
      expect(seen.has(p)).toBe(false);
      seen.add(p);
      expect(labels[p]).toBe(zone.id);
    }
  }
  expect(seen.size).toBe(width * height);
}

describe('artistic region merging topology', () => {
  it('merges perceptually close adjacent colors while preserving every pixel exactly once', () => {
    const input = model([10, 10, 20, 30, 30], 5, { 10: 0, 20: 1, 30: 2 });
    const labelsBefore = input.labels.slice();
    const pixelsBefore = input.zones.map(zone => zone.pixels.slice());
    const result = artisticMerge(input.zones, input.labels, ['#ff0000', '#fe0000', '#0000ff'], { width: 5, height: 1, mergeTolerance: 2, minMergeArea: 0 });
    expect(result.zones).toHaveLength(2);
    expect(result.zones.map(zone => zone.area).sort()).toEqual([2, 3]);
    expect(result.stats.mergedCount).toBe(1);
    expect(result.stats.beforeCount - result.stats.afterCount).toBe(result.stats.mergedCount);
    verifyCoverage(result.zones, result.labels, 5, 1, 3);
    expect(input.labels).toEqual(labelsBefore);
    expect(input.zones.map(zone => zone.pixels)).toEqual(pixelsBefore);
  });

  it('does not merge similar colors touching only diagonally', () => {
    const input = model([0, 1, 2, 3], 2, { 0: 0, 1: 1, 2: 2, 3: 0 });
    const result = artisticMerge(input.zones, input.labels, ['#ff0000', '#000000', '#ffffff'], { width: 2, height: 2, mergeTolerance: 0, minMergeArea: 0 });
    expect(result.zones).toHaveLength(4);
    expect(result.labels).toEqual(input.labels);
  });

  it('does not join the right edge of one row to the left edge of the next', () => {
    const input = model([0, 0, 1, 2, 3, 3], 3, { 0: 0, 1: 1, 2: 1, 3: 2 });
    const result = artisticMerge(input.zones, input.labels, ['#000000', '#ff0000', '#ffffff'], { width: 3, height: 2, mergeTolerance: 0, minMergeArea: 0 });
    expect(result.zones).toHaveLength(4);
    expect(result.labels).toEqual(input.labels);
  });

  it('absorbs a tiny zone into its nearest adjacent color even outside the color threshold', () => {
    const input = model([0, 0, 1, 2, 2], 5, { 0: 0, 1: 1, 2: 2 });
    const result = artisticMerge(input.zones, input.labels, ['#ee0000', '#ff1010', '#0000ff'], { width: 5, height: 1, mergeTolerance: 0, minMergeArea: 2 });
    expect(result.labels[2]).toBe(result.labels[0]);
    expect(result.labels[2]).not.toBe(result.labels[4]);
    verifyCoverage(result.zones, result.labels, 5, 1, 3);
  });

  it('is deterministic across calls and does not alias output pixels to the source', () => {
    const input = model([0, 1, 2, 3], 4, { 0: 0, 1: 1, 2: 2, 3: 3 });
    const options = { width: 4, height: 1, mergeTolerance: 5, minMergeArea: 2 };
    const palette = ['#ff0000', '#fe0101', '#fa0202', '#ff0303'];
    const a = artisticMerge(input.zones, input.labels, palette, options);
    const b = artisticMerge(input.zones, input.labels, palette, options);
    expect(a.labels).toEqual(b.labels);
    expect(a.zones).toEqual(b.zones);
    verifyCoverage(a.zones, a.labels, 4, 1, 4);
    a.zones[0].pixels[0] = 99;
    expect(input.zones[0].pixels[0]).toBe(0);
  });

  it('honors the iteration bound without losing labels when convergence needs more passes', () => {
    const input = model([0, 1, 2, 3, 4, 5, 6, 7], 8, Object.fromEntries(Array.from({ length: 8 }, (_, id) => [id, 0])));
    const result = artisticMerge(input.zones, input.labels, ['#777777'], { width: 8, height: 1, mergeTolerance: 100, minMergeArea: 0, maxIterations: 1 });
    expect(result.stats.iterations).toBe(1);
    expect(result.zones.length).toBeGreaterThan(1);
    verifyCoverage(result.zones, result.labels, 8, 1, 1);
  });

  it('handles an empty model without inventing a zone', () => {
    const result = artisticMerge([], new Int32Array(), [], { width: 0, height: 0, mergeTolerance: 0, minMergeArea: 0 });
    expect(result.zones).toEqual([]);
    expect(result.labels).toHaveLength(0);
    expect(result.stats.mergedCount).toBe(0);
    expect(result.stats.averageDeltaE).toBe(0);
  });
});
