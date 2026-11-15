import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.hoisted(() => {
  class MockCanvas {
    constructor(public width: number, public height: number) {}
    getContext() { return {}; }
  }
  Object.assign(globalThis, { OffscreenCanvas: MockCanvas });
});

import { suppressColorSpeckles } from "@/lib/renderPipeline";

describe("simplification des micro-zones", () => {
  it("supprime une couleur isolée au milieu d'une région homogène", () => {
    const values = new Uint16Array(25).fill(2);
    values[12] = 7;
    const cleaned = suppressColorSpeckles(values, 5, 5);
    expect(cleaned[12]).toBe(2);
    expect(values[12]).toBe(7);
  });
  it("préserve les contours dominants entre deux aplats de couleur", () => {
    const values = Uint16Array.from({ length: 36 }, (_, i) => i % 6 < 3 ? 1 : 2);
    const cleaned = suppressColorSpeckles(values, 6, 6);
    for (let y = 0; y < 6; y++) {
      expect(cleaned[y * 6 + 1]).toBe(1);
      expect(cleaned[y * 6 + 4]).toBe(2);
    }
  });
  it("rejette les dimensions incorrectes", () => {
    expect(() => suppressColorSpeckles(new Uint16Array(3), 5, 5)).toThrow("Carte de couleurs invalide");
  });
});
