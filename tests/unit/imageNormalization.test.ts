import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOrientation } from '@/lib/imageNormalization';

afterEach(() => vi.unstubAllGlobals());

function readerFor(bytes: Uint8Array, failure?: 'error' | 'abort') {
  vi.stubGlobal('FileReader', class {
    onload?: (event: { target: { result: ArrayBuffer } }) => void;
    onerror?: () => void;
    onabort?: () => void;
    readAsArrayBuffer() {
      queueMicrotask(() => {
        if (failure === 'error') this.onerror?.();
        else if (failure === 'abort') this.onabort?.();
        else this.onload?.({ target: { result: bytes.slice().buffer } });
      });
    }
  });
}

function exif(orientation: number) {
  const bytes = new Uint8Array(38);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffe1);
  view.setUint16(4, 34);
  bytes.set([69, 120, 105, 102, 0, 0, 73, 73], 6);
  view.setUint16(14, 42, true);
  view.setUint32(16, 8, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 0x0112, true);
  view.setUint16(24, 3, true);
  view.setUint32(26, 1, true);
  view.setUint16(30, orientation, true);
  return bytes;
}

describe('EXIF metadata never leaves image import pending', () => {
  it.each([0, 1, 2, 3, 7, 13, 20, 31])('settles for a JPEG truncated at %s bytes', async length => {
    readerFor(exif(6).slice(0, length));
    await expect(getOrientation(new File(['broken'], 'broken.jpg'))).resolves.toBe(1);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('preserves valid EXIF orientation %s', async orientation => {
    readerFor(exif(orientation));
    await expect(getOrientation(new File(['image'], 'camera.jpg'))).resolves.toBe(orientation);
  });

  it('ignores unsupported orientation values', async () => {
    readerFor(exif(999));
    await expect(getOrientation(new File(['image'], 'camera.jpg'))).resolves.toBe(1);
  });

  it('rejects read failures rather than blocking the import', async () => {
    readerFor(new Uint8Array(), 'error');
    await expect(getOrientation(new File(['image'], 'camera.jpg'))).rejects.toThrow('métadonnées');
  });

  it('settles aborted reads', async () => {
    readerFor(new Uint8Array(), 'abort');
    await expect(getOrientation(new File(['image'], 'camera.jpg'))).rejects.toMatchObject({ name: 'AbortError' });
  });
});
