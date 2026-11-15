import { describe, expect, it } from 'vitest';
import { averagePaletteDeltaE, balancePalette, deltaE2000, hslToRgb, perceptualDistance, rgbToHex, rgbToHsl, rgbToLab } from '@/lib/colorUtils';

describe('paint color measurements', () => {
  it('converts D65 black, white and red to their expected Lab coordinates', () => {
    expect(rgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
    const white = rgbToLab(255, 255, 255);
    expect(white[0]).toBeCloseTo(100, 3);
    expect(white[1]).toBeCloseTo(0, 3);
    expect(white[2]).toBeCloseTo(0, 3);
    const red = rgbToLab(255, 0, 0);
    expect(red[0]).toBeCloseTo(53.24, 2);
    expect(red[1]).toBeCloseTo(80.09, 2);
    expect(red[2]).toBeCloseTo(67.20, 2);
  });

  it('clamps and rounds display channels consistently', () => {
    expect(rgbToHex(-2, 127.6, 300)).toBe('#0080ff');
    expect(rgbToLab(-2, 127.6, 300)).toEqual(rgbToLab(0, 128, 255));
  });

  it.each([
    [0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0],
    [0, 0, 255], [117, 83, 201], [254, 1, 127],
  ])('round-trips RGB (%i,%i,%i) through HSL without losing channel values', (r, g, b) => {
    expect(hslToRgb(...rgbToHsl(r, g, b))).toEqual([r, g, b]);
  });

  it('treats hue 0 and 360 as the same red', () => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(360, 100, 50)).toEqual([255, 0, 0]);
  });

  it('has zero self-distance and symmetric nonnegative distance for chromatic and neutral colors', () => {
    const samples: Array<[number, number, number]> = [[0, 0, 0], [100, 0, 0], [53, 80, 67], [32, 79, -108]];
    for (const a of samples) {
      expect(deltaE2000(a, a)).toBe(0);
      for (const b of samples) {
        expect(deltaE2000(a, b)).toBeGreaterThanOrEqual(0);
        expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10);
      }
    }
  });

  it('ranks a near-red painting color closer than an unrelated blue', () => {
    expect(perceptualDistance([255, 0, 0], [250, 4, 2])).toBeLessThan(perceptualDistance([255, 0, 0], [0, 0, 255]));
  });

  it('balances a palette without mutating or reordering the source', () => {
    const input = ['#ff0000', '#00ff00', '#0000ff'];
    const before = [...input];
    const output = balancePalette(input);
    expect(input).toEqual(before);
    expect(output).toHaveLength(input.length);
    expect(output.every(color => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    expect(averagePaletteDeltaE(input, input)).toBe(0);
    expect(averagePaletteDeltaE(input, output)).toBeGreaterThan(0);
  });

  it('handles an empty palette without inventing colors', () => {
    expect(balancePalette([])).toEqual([]);
    expect(averagePaletteDeltaE([], [])).toBe(0);
  });
});
