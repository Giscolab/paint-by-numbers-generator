import { deflateSync } from 'node:zlib';
import type { Download, Page } from '@playwright/test';
import { expect } from '@playwright/test';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([header, typeBytes, data, checksum]);
}

/** Four broad regions give the real decoder/worker a small, deterministic paintable image. */
export function fourColorPng(width = 96, height = 96): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  const colors = [[230, 65, 45], [30, 120, 210], [245, 195, 45], [45, 150, 75]];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = colors[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)];
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      pixels.set(color, offset);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function importImage(page: Page, name = 'quatre-couleurs.png') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir une image', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: fourColorPng() });
  await expect(page.getByRole('button', { name: "Analyser l'image", exact: true })).toBeEnabled();
}

export async function generateModel(page: Page) {
  await importImage(page);
  await page.getByRole('button', { name: "Analyser l'image", exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analyse brute', exact: true })).toBeVisible();
  await expect(page.getByText('Source :', { exact: false })).toContainText('96');
  await page.getByRole('button', { name: 'Appliquer les recommandations', exact: true }).click();
  await page.getByRole('button', { name: 'Générer ma création', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image colorisée avec effets appliqués', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeEnabled();
}

export async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Le téléchargement est inaccessible.');
  const chunks: Buffer[] = [];
  for await (const data of stream) chunks.push(Buffer.from(data));
  return Buffer.concat(chunks);
}

export function assertPng(bytes: Buffer, width: number, height: number) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.toString('ascii', 12, 16)).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBe(width);
  expect(bytes.readUInt32BE(20)).toBe(height);
  expect(bytes.length).toBeGreaterThan(100);
}
