import { describe, expect, it } from "vitest";
import { writePngDpi } from "../pngDpi";

const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tOUAAAAASUVORK5CYII=";
const sample = () => new Uint8Array(Buffer.from(TINY_PNG, "base64"));
const read32 = (b: Uint8Array, i: number) => ((b[i] * 2 ** 24) + (b[i+1] << 16) + (b[i+2] << 8) + b[i+3]) >>> 0;
const countChunks = (b: Uint8Array, expected: string) => {
  let count = 0;
  for (let pos = 8; pos + 12 <= b.length;) {
    const size = read32(b, pos);
    const kind = String.fromCharCode(...b.slice(pos + 4, pos + 8));
    if (kind === expected) count++;
    pos += 12 + size;
  }
  return count;
};

describe("PNG DPI metadata", () => {
  it("encodes an actual pHYs chunk for 300 dpi without altering the pixels", () => {
    const png = sample();
    const output = writePngDpi(png, 300);
    expect(countChunks(output, "pHYs")).toBe(1);
    expect(String.fromCharCode(...output.slice(37, 41))).toBe("pHYs");
    expect(read32(output, 41)).toBe(Math.round(300 / 0.0254));
    expect(read32(output, 45)).toBe(Math.round(300 / 0.0254));
    expect(output[49]).toBe(1);
    expect(countChunks(output, "IEND")).toBe(1);
  });

  it("replaces the previous DPI chunk rather than duplicating it", () => {
    const twice = writePngDpi(writePngDpi(sample(), 72), 150);
    expect(countChunks(twice, "pHYs")).toBe(1);
    expect(read32(twice, 41)).toBe(Math.round(150 / 0.0254));
  });

  it("rejects invalid input", () => {
    expect(() => writePngDpi(new Uint8Array([0, 1, 2]), 300)).toThrow("PNG invalide");
    expect(() => writePngDpi(sample(), 0)).toThrow("DPI invalide");
  });
});
