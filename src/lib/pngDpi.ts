/** Add/replace the PNG pHYs chunk so physical print DPI matches the export dialog. */
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const encoder = new TextEncoder();
const read32 = (b: Uint8Array, off: number) =>
  (b[off] * 0x1000000 + (b[off + 1] << 16) + (b[off + 2] << 8) + b[off + 3]) >>> 0;
const write32 = (b: Uint8Array, off: number, value: number) => {
  b[off] = (value >>> 24) & 255;
  b[off + 1] = (value >>> 16) & 255;
  b[off + 2] = (value >>> 8) & 255;
  b[off + 3] = value & 255;
};
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function writePngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("Fichier PNG invalide.");
  if (!Number.isFinite(dpi) || dpi < 1 || dpi > 2400) throw new Error("Résolution DPI invalide.");
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(13); // chunk-type + 9 data bytes
  data.set(encoder.encode("pHYs"), 0);
  write32(data, 4, ppm);
  write32(data, 8, ppm);
  data[12] = 1; // pixels per metre
  const chunk = new Uint8Array(21);
  write32(chunk, 0, 9);
  chunk.set(data, 4);
  write32(chunk, 17, crc32(data));
  const pieces: Uint8Array[] = [bytes.slice(0, 8)];
  let pos = 8;
  let inserted = false;
  let hasImageData = false;
  let hasEnd = false;
  while (pos + 12 <= bytes.length) {
    const len = read32(bytes, pos);
    const end = pos + 12 + len;
    if (end > bytes.length) throw new Error("PNG tronqué.");
    const name = String.fromCharCode(...bytes.slice(pos + 4, pos + 8));
    if (pos === 8 && (name !== "IHDR" || len !== 13)) throw new Error("PNG sans en-tête IHDR valide.");
    if (name === "IDAT") hasImageData = true;
    if (name === "IHDR" && inserted) throw new Error("PNG avec en-tête IHDR dupliqué.");
    if (name !== "pHYs") pieces.push(bytes.slice(pos, end));
    if (name === "IHDR" && !inserted) {
      pieces.push(chunk);
      inserted = true;
    }
    pos = end;
    if (name === "IEND") {
      if (len !== 0) throw new Error("Fin PNG invalide.");
      hasEnd = true;
      break;
    }
  }
  if (!inserted) throw new Error("PNG sans en-tête IHDR.");
  if (!hasEnd || !hasImageData || pos !== bytes.length) throw new Error("PNG tronqué ou structure invalide.");
  const result = new Uint8Array(pieces.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of pieces) { result.set(part, at); at += part.length; }
  return result;
}
export async function withPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const png = writePngDpi(data, dpi);
  return new Blob([png as BlobPart], { type: "image/png" });
}
