import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applyPaintEffect, gaussianBlur, sobelMagnitude, toGrayscale, type PaintEffectType } from '@/lib/postProcessing';

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
    source.data.set([20 + x * 17, 10 + y * 23, (p * 31) % 256, translucent ? (p * 47) % 256 : 255], p * 4);
  }
  return source;
}

const effects: PaintEffectType[] = ['watercolor', 'brush', 'pointillism', 'impasto'];

describe('paint simulation contracts', () => {
  it.each(effects)('%s changes the preview reproducibly while preserving source pixels and dimensions', type => {
    const input = image();
    const original = input.data.slice();
    const output = applyPaintEffect(input, { type, intensity: 70 });
    expect([output.width, output.height]).toEqual([input.width, input.height]);
    expect(output).not.toBe(input);
    expect(output.data.buffer).not.toBe(input.data.buffer);
    expect(input.data).toEqual(original);
    expect(output.data).not.toEqual(original);
    expect(output.data).toEqual(applyPaintEffect(input, { type, intensity: 70 }).data);
    for (let p = 0; p < input.width * input.height; p++) expect(output.data[p * 4 + 3]).toBe(255);
  });

  it.each(effects)('%s at zero intensity preserves the image', type => {
    const input = image();
    expect(applyPaintEffect(input, { type, intensity: 0 }).data).toEqual(input.data);
  });

  it.each(['watercolor', 'brush', 'impasto'] as PaintEffectType[])('%s preserves source alpha', type => {
    const input = image(7, 5, true);
    const output = applyPaintEffect(input, { type, intensity: 100 });
    for (let p = 0; p < input.width * input.height; p++) expect(output.data[p * 4 + 3]).toBe(input.data[p * 4 + 3]);
  });

  it.each(effects)('%s supports narrow and single-pixel images', type => {
    for (const [width, height] of [[1, 1], [1, 9], [9, 1]]) {
      const output = applyPaintEffect(image(width, height), { type, intensity: 100 });
      expect([output.width, output.height, output.data.length]).toEqual([width, height, width * height * 4]);
      for (let p = 0; p < width * height; p++) expect(output.data[p * 4 + 3]).toBe(255);
    }
  });
});

describe('image filters used by the paint effects', () => {
  it('preserves a constant color and opacity when blurred, including image borders', () => {
    const input = new ImageData(7, 5);
    for (let p = 0; p < 35; p++) input.data.set([42, 128, 219, 123], p * 4);
    expect(gaussianBlur(input, 3).data).toEqual(input.data);
    expect(gaussianBlur(input, 0).data).toEqual(input.data);
  });

  it('spreads an isolated highlight symmetrically without changing its source', () => {
    const input = new ImageData(7, 7);
    for (let p = 0; p < 49; p++) input.data[p * 4 + 3] = 255;
    input.data.set([255, 255, 255, 255], (3 * 7 + 3) * 4);
    const output = gaussianBlur(input, 2);
    const at = (x: number, y: number) => output.data[(y * 7 + x) * 4];
    expect(at(3, 3)).toBeLessThan(255);
    expect(at(3, 3)).toBeGreaterThan(at(2, 3));
    expect(at(2, 3)).toBeGreaterThan(0);
    expect(at(2, 3)).toBe(at(4, 3));
    expect(at(3, 2)).toBe(at(3, 4));
    expect(input.data[(3 * 7 + 3) * 4]).toBe(255);
  });

  it('measures no edges in a uniform image but detects a strong vertical boundary', () => {
    const flat = new ImageData(7, 5);
    for (let p = 0; p < 35; p++) flat.data.set([80, 80, 80, 255], p * 4);
    expect([...sobelMagnitude(flat)]).toEqual(Array(35).fill(0));
    const step = new ImageData(7, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) step.data.set(x < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * 7 + x) * 4);
    const edges = sobelMagnitude(step);
    expect(edges[2 * 7 + 2]).toBeGreaterThan(900);
    expect(edges[2 * 7 + 1]).toBe(0);
    expect(edges.length).toBe(35);
  });

  it('converts primary colors to one luminance value per pixel without altering alpha', () => {
    const input = new ImageData(3, 1);
    input.data.set([255, 0, 0, 0, 0, 255, 0, 127, 0, 0, 255, 255]);
    const original = input.data.slice();
    const gray = toGrayscale(input);
    expect(gray).toHaveLength(3);
    expect(gray[1]).toBeGreaterThan(gray[0]);
    expect(gray[0]).toBeGreaterThan(gray[2]);
    expect(input.data).toEqual(original);
  });
});
