import { describe, expect, it } from 'vitest';
import { withPngDpi, writePngDpi } from '@/lib/pngDpi';

const png = () => new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tOUAAAAASUVORK5CYII=', 'base64'));

describe('PNG export validation and integrity', () => {
  it.each([NaN, Infinity, -Infinity, -1, 0, 2401])('rejects invalid print resolution %s', dpi => {
    expect(() => writePngDpi(png(), dpi)).toThrow('DPI invalide');
  });

  it.each([1, 72, 150, 300, 600, 2400])('accepts supported resolution %s', dpi => {
    expect(writePngDpi(png(), dpi).length).toBe(png().length + 21);
  });

  it.each([0, 1, 7, 8, 20, 32, 33, 55, 67])('rejects a PNG truncated after %s bytes', length => {
    expect(() => writePngDpi(png().slice(0, length), 300)).toThrow();
  });

  it('rejects a PNG with a missing IEND chunk even when all preceding chunks are complete', () => {
    const input = png();
    expect(() => writePngDpi(input.slice(0, input.length - 12), 300)).toThrow();
  });

  it('rejects an oversized chunk length without allocation or partial output', () => {
    const input = png();
    input.set([255, 255, 255, 255], 8);
    expect(() => writePngDpi(input, 300)).toThrow();
  });

  it('does not mutate source bytes and is stable when the same DPI is applied twice', () => {
    const input = png();
    const original = input.slice();
    const once = writePngDpi(input, 300);
    expect(input).toEqual(original);
    expect(writePngDpi(once, 300)).toEqual(once);
  });

  it('returns an image/png blob rather than retaining a misleading input MIME type', async () => {
    const result = await withPngDpi(new Blob([png()], { type: 'application/octet-stream' }), 300);
    expect(result.type).toBe('image/png');
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(writePngDpi(png(), 300));
  });
});
