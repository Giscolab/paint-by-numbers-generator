import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applyArtisticEffect, type ArtisticEffectType } from '@/lib/artisticEffects';

beforeAll(() => {
  vi.stubGlobal('ImageData', class {
    data: Uint8ClampedArray;
    constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
  });
});
afterAll(() => vi.unstubAllGlobals());

function image(width = 13, height = 9, translucent = false): ImageData {
  const source = new ImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    source.data.set([30 + x * 13, 15 + y * 21, (p * 17) % 256, translucent ? (p * 47) % 256 : 255], p * 4);
  }
  return source;
}

const effects: ArtisticEffectType[] = ['oil', 'pencil', 'ink', 'pastel'];

describe('artistic render contracts', () => {
  it.each(effects)('%s produces a real, repeatable effect without changing the source model', type => {
    const input = image();
    const original = input.data.slice();
    const output = applyArtisticEffect(input, { type, intensity: 70 });
    expect([output.width, output.height]).toEqual([input.width, input.height]);
    expect(output).not.toBe(input);
    expect(output.data.buffer).not.toBe(input.data.buffer);
    expect(input.data).toEqual(original);
    expect(output.data).not.toEqual(original);
    expect(output.data).toEqual(applyArtisticEffect(input, { type, intensity: 70 }).data);
    expect(Array.from(output.data).filter((_, i) => i % 4 === 3)).toEqual(Array(input.width * input.height).fill(255));
  });

  it.each(effects)('%s at zero intensity leaves all pixels unchanged', type => {
    const input = image();
    const original = input.data.slice();
    expect(applyArtisticEffect(input, { type, intensity: 0 }).data).toEqual(original);
    expect(input.data).toEqual(original);
  });

  it.each(['oil', 'ink', 'pastel'] as ArtisticEffectType[])('%s preserves the transparency of the rendered image', type => {
    const input = image(7, 5, true);
    const output = applyArtisticEffect(input, { type, intensity: 100 });
    for (let p = 0; p < input.width * input.height; p++) expect(output.data[p * 4 + 3]).toBe(input.data[p * 4 + 3]);
  });

  it.each(effects)('%s handles single-pixel and one-dimensional images at maximum intensity', type => {
    for (const [width, height] of [[1, 1], [1, 9], [9, 1]]) {
      const input = image(width, height);
      const output = applyArtisticEffect(input, { type, intensity: 100 });
      expect([output.width, output.height, output.data.length]).toEqual([width, height, width * height * 4]);
      for (let p = 0; p < width * height; p++) expect(output.data[p * 4 + 3]).toBe(255);
    }
  });

  it('none preserves the input exactly', () => {
    const input = image(2, 3, true);
    expect(applyArtisticEffect(input, { type: 'none', intensity: 100 }).data).toEqual(input.data);
  });
});
