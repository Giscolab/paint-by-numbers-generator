import { IMAGE_PROCESSING } from '@/config/constants';

export function boundedImageSize(width: number, height: number, maxDimension: number = IMAGE_PROCESSING.MAX_DISPLAY_WIDTH): {width:number;height:number} {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new Error('Dimensions d’image invalides.');
  }
  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}

export function validateImageInput(file: File): void {
  if (!file.size) throw new Error('Le fichier image est vide.');
  if (file.size > IMAGE_PROCESSING.MAX_FILE_SIZE_BYTES) throw new Error('Image trop volumineuse : maximum 20 Mo.');
  const knownExtension = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name);
  if (!file.type.startsWith('image/') && !(file.type === '' && knownExtension)) throw new Error('Format de fichier non reconnu. Choisissez une image PNG, JPEG ou WebP.');
}

export interface DecodedImage { imageData:ImageData; sourceWidth:number; sourceHeight:number; }

/** Decode once, then allocate only the bounded canvas. Large photos are resized, not refused. */
export async function decodeImageFile(file: File, maxDimension: number = IMAGE_PROCESSING.MAX_DISPLAY_WIDTH): Promise<DecodedImage> {
  validateImageInput(file);
  let source: CanvasImageSource;
  let sourceWidth:number, sourceHeight:number;
  let cleanup:()=>void;
  if (typeof createImageBitmap === 'function') {
    let bitmap:ImageBitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation:'from-image' }); }
    catch { try { bitmap = await createImageBitmap(file); } catch (error) { throw new Error(`Impossible de décoder « ${file.name} » : ${error instanceof Error ? error.message : 'image illisible ou format non pris en charge'}`); } }
    source=bitmap;sourceWidth=bitmap.width;sourceHeight=bitmap.height;cleanup=()=>bitmap.close();
  } else if (typeof document !== 'undefined') {
    const url=URL.createObjectURL(file);
    const img=new Image();
    try { await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error(`Impossible de décoder « ${file.name} ».`));img.src=url;}); }
    catch(error){URL.revokeObjectURL(url);throw error;}
    source=img;sourceWidth=img.naturalWidth;sourceHeight=img.naturalHeight;cleanup=()=>URL.revokeObjectURL(url);
  } else { throw new Error('Le navigateur ne permet pas de décoder les images dans un Worker.'); }
  try {
    const {width,height}=boundedImageSize(sourceWidth,sourceHeight,maxDimension);
    const canvas=typeof OffscreenCanvas !== 'undefined'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
    const ctx=canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if(!ctx)throw new Error('Impossible de créer le canevas pour cette image.');
    ctx.drawImage(source,0,0,width,height);
    return {imageData:ctx.getImageData(0,0,width,height),sourceWidth,sourceHeight};
  } finally { cleanup(); }
}
