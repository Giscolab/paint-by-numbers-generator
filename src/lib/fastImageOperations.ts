import type { Zone } from './imageProcessing';

export interface ConnectedComponents {
  labels: Int32Array;
  zones: Zone[];
}

/**
 * Segment connected colors with a reusable, contiguous work queue.
 * Unlike Array<number> flood fills, the queue is allocated once and a
 * region's pixel list is copied directly into its final Uint32Array.
 */
export function labelConnectedComponentsFast(
  colorMap: ArrayLike<number>,
  width: number,
  height: number
): ConnectedComponents {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width < 1 || height < 1 || !Number.isSafeInteger(width * height) ||
    colorMap.length !== width * height
  ) {
    throw new Error('Dimensions de segmentation invalides.');
  }
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const queue = new Uint32Array(total);
  const zones: Zone[] = [];
  let nextLabel = 0;

  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1) continue;
    const colorIdx = colorMap[start];
    let head = 0;
    let tail = 1;
    let sumX = 0;
    let sumY = 0;
    queue[0] = start;
    labels[start] = nextLabel;

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      sumX += x;
      sumY += y;
      let neighbor: number;

      if (x > 0) {
        neighbor = pixel - 1;
        if (labels[neighbor] === -1 && colorMap[neighbor] === colorIdx) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
      if (x + 1 < width) {
        neighbor = pixel + 1;
        if (labels[neighbor] === -1 && colorMap[neighbor] === colorIdx) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
      if (y > 0) {
        neighbor = pixel - width;
        if (labels[neighbor] === -1 && colorMap[neighbor] === colorIdx) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
      if (y + 1 < height) {
        neighbor = pixel + width;
        if (labels[neighbor] === -1 && colorMap[neighbor] === colorIdx) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
    }

    zones.push({
      id: nextLabel,
      colorIdx,
      area: tail,
      pixels: queue.slice(0, tail),
      centroid: {
        x: Math.round(sumX / tail),
        y: Math.round(sumY / tail),
      },
    });
    nextLabel++;
  }

  return { labels, zones };
}

/**
 * Sliding-window mode filter. Its vote counts move one column at a time;
 * it produces the same first-in-row-major-order tie break as smoothZones.
 */
export function smoothZonesFast(
  labels: Int32Array,
  width: number,
  height: number,
  iterations: number
): Int32Array {
  if (labels.length !== width * height) throw new Error('Dimensions de lissage invalides.');
  let current = new Int32Array(labels);
  const pixels = width * height;
  const radius = pixels < 250000 ? 2 : (pixels < 500000 ? 3 : 4);
  const size = radius * 2 + 1;
  if (width <= radius * 2 || height <= radius * 2) return current;

  for (let pass = 0; pass < iterations; pass++) {
    const next = new Int32Array(current);
    for (let y = radius; y < height - radius; y++) {
      const counts = new Map<number, number>();
      const add = (color: number) => counts.set(color, (counts.get(color) ?? 0) + 1);
      const remove = (color: number) => {
        const count = counts.get(color)! - 1;
        if (count === 0) counts.delete(color);
        else counts.set(color, count);
      };

      // Entire first neighborhood; subsequent pixels only update two columns.
      for (let yy = y - radius; yy <= y + radius; yy++) {
        const row = yy * width;
        for (let xx = 0; xx < size; xx++) add(current[row + xx]);
      }

      for (let x = radius; x < width - radius; x++) {
        let bestCount = 0;
        let bestColor = current[y * width + x];
        let ties = 0;
        for (const [color, count] of counts) {
          if (count > bestCount) {
            bestColor = color;
            bestCount = count;
            ties = 1;
          } else if (count === bestCount) {
            ties++;
          }
        }

        if (ties > 1) {
          // Match the original implementation's iteration order precisely.
          outer: for (let yy = y - radius; yy <= y + radius; yy++) {
            const row = yy * width;
            for (let xx = x - radius; xx <= x + radius; xx++) {
              const color = current[row + xx];
              if (counts.get(color) === bestCount) {
                bestColor = color;
                break outer;
              }
            }
          }
        }
        next[y * width + x] = bestColor;

        if (x + radius + 1 < width) {
          for (let yy = y - radius; yy <= y + radius; yy++) {
            const row = yy * width;
            remove(current[row + x - radius]);
            add(current[row + x + radius + 1]);
          }
        }
      }
    }
    current = next;
  }
  return current;
}

import { deltaE2000 } from './colorUtils';

/**
 * Palette consolidation without materializing two full JavaScript number arrays.
 * Uses the same union order and color selection as consolidateColorMap.
 */
export function consolidateColorMapTyped(
  palette: string[],
  colorMap: Uint16Array,
  paletteLabCache: [number, number, number][],
  threshold: number
): { consolidatedPalette: string[]; consolidatedColorMap: Uint16Array } {
  const n = palette.length;
  const parent = Uint16Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const a = paletteLabCache[i], b = paletteLabCache[j];
      if (!a || !b) continue;
      if (deltaE2000(a, b) < threshold) parent[find(j)] = find(i);
    }
  }

  const rootToNewIdx = new Map<number, number>();
  const consolidatedPalette: string[] = [];
  const remap = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!rootToNewIdx.has(root)) {
      rootToNewIdx.set(root, consolidatedPalette.length);
      consolidatedPalette.push(palette[root]);
    }
    remap[i] = rootToNewIdx.get(root)!;
  }
  const consolidatedColorMap = new Uint16Array(colorMap.length);
  for (let i = 0; i < colorMap.length; i++) {
    consolidatedColorMap[i] = remap[colorMap[i]] ?? colorMap[i];
  }
  return { consolidatedPalette, consolidatedColorMap };
}
