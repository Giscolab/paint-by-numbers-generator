import { rgbToLab, deltaE2000, rgbToHex } from './colorUtils';
import type { Zone } from './imageProcessing';

export const MODEL_VERSION = 'pbn-2';
export interface LabelPlacement { x: number; y: number; fontSize: number; clearance: number; }
export interface ModelParameters {
  numColors: number; minRegionSize: number; smoothness: number; mergeTolerance: number;
  enableArtisticMerge: boolean; enableSmartPalette: boolean;
}

export function validateModelParameters(params: ModelParameters): void {
  const bounds = { numColors: [1, 80], minRegionSize: [0, 500], smoothness: [0, 100], mergeTolerance: [0, 100] };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const value = params[key as keyof typeof bounds];
    if (!Number.isFinite(value) || value < min || value > max || (key === 'numColors' && !Number.isInteger(value))) {
      throw new Error(`Paramètre invalide : ${key} doit être compris entre ${min} et ${max}.`);
    }
  }
}

export function processingCacheKey(imageHash: string, params: ModelParameters): string {
  return JSON.stringify([MODEL_VERSION, imageHash, params.numColors, params.minRegionSize,
    params.smoothness, params.mergeTolerance, params.enableArtisticMerge, params.enableSmartPalette]);
}

/** All pixels and dimensions participate; no prefix-only identity. */
export async function imageFingerprint(image: ImageData): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(image.data));
  return `${image.width}x${image.height}:` + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

/** Print models have a white paper background, including semi-transparent pixels. */
export function flattenOnWhite(image: ImageData): ImageData {
  const output = new ImageData(image.width, image.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) output.data[i + c] = Math.round(image.data[i + c] * alpha + 255 * (1 - alpha));
    output.data[i + 3] = 255;
  }
  return output;
}

type Lab = [number, number, number];
const squared = (a: Lab, b: Lab) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
function labToRgb([l,a,b]: Lab): [number,number,number] {
  const fy = (l+16)/116;
  const inverse = (v: number) => v**3 > 0.008856 ? v**3 : (v - 16/116)/7.787;
  const x = 0.95047*inverse(fy+a/500), y = inverse(fy), z = 1.08883*inverse(fy-b/200);
  const gamma = (v: number) => Math.round(255*Math.max(0, Math.min(1,v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055)));
  return [gamma(3.2404542*x-1.5371385*y-.4985314*z), gamma(-.969266*x+1.8760108*y+.041556*z), gamma(.0556434*x-.2040259*y+1.0572252*z)];
}

/** Bounded, weighted K-means++ in Lab, with a fixed seed and stable ordering. */
export function quantizePerceptually(image: ImageData, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 80) throw new Error('Nombre de couleurs invalide.');
  const total = image.width * image.height;
  if (!total || image.data.length !== total*4) throw new Error('Image vide ou invalide.');
  const sampleCount = Math.min(total, 50000);
  const histogram = new Map<number, number>();
  for (let s = 0; s < sampleCount; s++) {
    const i = Math.floor(s*total/sampleCount)*4, alpha = image.data[i+3]/255;
    const r = Math.round(image.data[i]*alpha+255*(1-alpha));
    const g = Math.round(image.data[i+1]*alpha+255*(1-alpha));
    const b = Math.round(image.data[i+2]*alpha+255*(1-alpha));
    const key = (r<<16)|(g<<8)|b;
    histogram.set(key, (histogram.get(key) ?? 0)+1);
  }
  const samples = [...histogram].sort((a,b)=>b[1]-a[1] || a[0]-b[0]).map(([rgb,weight])=>({lab:rgbToLab(rgb>>16,(rgb>>8)&255,rgb&255),rgb,weight}));
  if (samples.length <= count) return samples.map(s=>`#${s.rgb.toString(16).padStart(6,'0')}`);
  let seed = 0x12345678;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  const centers: Lab[] = [[...samples[0].lab]];
  const nearest = new Float64Array(samples.length).fill(Infinity);
  while (centers.length < count) {
    let sum = 0;
    for (let i=0;i<samples.length;i++) { nearest[i] = Math.min(nearest[i],squared(samples[i].lab,centers[centers.length-1])); sum += nearest[i]*samples[i].weight; }
    if (!sum) break;
    let target = random()*sum, chosen = samples.length-1;
    for (let i=0;i<samples.length;i++) { target -= nearest[i]*samples[i].weight; if(target <= 0) { chosen=i; break; } }
    centers.push([...samples[chosen].lab]);
  }
  let weights: number[] = [];
  for (let iteration=0;iteration<25;iteration++) {
    const sums = centers.map(()=>[0,0,0] as Lab); weights = centers.map(()=>0);
    for (const sample of samples) {
      let best=0, distance=Infinity;
      for(let c=0;c<centers.length;c++) { const d=squared(sample.lab,centers[c]); if(d<distance) {distance=d;best=c;} }
      weights[best]+=sample.weight;
      for(let c=0;c<3;c++) sums[best][c]+=sample.lab[c]*sample.weight;
    }
    let movement=0;
    for(let c=0;c<centers.length;c++) if(weights[c]) {
      const next=sums[c].map(v=>v/weights[c]) as Lab;
      movement=Math.max(movement,squared(next,centers[c])); centers[c]=next;
    }
    if(movement<.01) break;
  }
  return [...new Set(centers.map((lab,i)=>({lab,weight:weights[i]})).filter(c=>c.weight>0)
    .sort((a,b)=>b.weight-a.weight || a.lab[0]-b.lab[0]).map(c=>rgbToHex(...labToRgb(c.lab))))];
}

/** Merge actual adjacent regions sequentially. A donor can never become its own ancestor. */
export function mergeSmallRegions(zones: Zone[], labels: Int32Array, palette: string[], width: number, height: number, threshold: number): Int32Array {
  const output = new Int32Array(labels);
  if (threshold <= 0) return output;
  const parent = new Map(zones.map(z=>[z.id,z.id]));
  const area = new Map(zones.map(z=>[z.id,z.area]));
  const colors = new Map(zones.map(z=>[z.id,z.colorIdx]));
  const neighbors = new Map(zones.map(z=>[z.id,new Map<number,number>()]));
  const lab = palette.map(hex=>rgbToLab(parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)));
  const find = (id: number): number => { let root=id; while(parent.get(root)!==root) root=parent.get(root)!; while(id!==root) {const next=parent.get(id)!;parent.set(id,root);id=next;} return root; };
  const boundary = (a:number,b:number) => { if(a===b || !neighbors.has(a) || !neighbors.has(b))return; neighbors.get(a)!.set(b,(neighbors.get(a)!.get(b)??0)+1); neighbors.get(b)!.set(a,(neighbors.get(b)!.get(a)??0)+1); };
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {const i=y*width+x;if(x+1<width)boundary(labels[i],labels[i+1]);if(y+1<height)boundary(labels[i],labels[i+width]);}
  // Min heap: area first, then id; stale entries are discarded after each merge.
  const heap: Array<[number,number]> = [];
  const less=(a:[number,number],b:[number,number])=>a[0]<b[0] || (a[0]===b[0] && a[1]<b[1]);
  const push=(entry:[number,number])=>{heap.push(entry);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],heap[i]))break;[heap[i],heap[c]]=[heap[c],heap[i]];i=c;}}return top;};
  for(const zone of zones) if(zone.area<threshold) push([zone.area,zone.id]);
  const distances=new Map<string,number>();
  while(heap.length) {
    const [size,donor]=pop(); if(find(donor)!==donor || area.get(donor)!==size || size>=threshold)continue;
    let recipient=-1,best=Infinity,shared=-1;
    for(const [neighbor,length] of neighbors.get(donor)!) {
      if(find(neighbor)!==neighbor)continue;
      const a=colors.get(donor)!,b=colors.get(neighbor)!,key=`${Math.min(a,b)}:${Math.max(a,b)}`;
      let distance=distances.get(key);if(distance===undefined){distance=deltaE2000(lab[a],lab[b]);distances.set(key,distance);}
      if(distance<best || (distance===best && (length>shared || (length===shared && neighbor<recipient)))) {best=distance;shared=length;recipient=neighbor;}
    }
    if(recipient<0)continue;
    parent.set(donor,recipient);area.set(recipient,area.get(recipient)!+size);
    for(const [neighbor,length] of neighbors.get(donor)!) {
      neighbors.get(neighbor)!.delete(donor);
      if(neighbor===recipient)continue;
      const combined=(neighbors.get(recipient)!.get(neighbor)??0)+length;
      neighbors.get(recipient)!.set(neighbor,combined);neighbors.get(neighbor)!.set(recipient,combined);
    }
    neighbors.get(recipient)!.delete(donor); neighbors.get(donor)!.clear();
    if(area.get(recipient)!<threshold)push([area.get(recipient)!,recipient]);
  }
  for(let i=0;i<output.length;i++) if(parent.has(output[i]))output[i]=find(output[i]);
  return output;
}

/** Chessboard distance to other regions and paper edges; square clearance is conservative. */
export function placeRegionLabels(labels: Int32Array, zones: Zone[], width: number, height: number): Map<number, LabelPlacement> {
  const distance = new Uint16Array(labels.length).fill(65535);
  const forward = [[-1,0],[-1,-1],[0,-1],[1,-1]];
  const backward = [[1,0],[1,1],[0,1],[-1,1]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x, id=labels[i];
    if(!x||!y||x===width-1||y===height-1 || labels[i-1]!==id||labels[i+1]!==id||labels[i-width]!==id||labels[i+width]!==id)distance[i]=1;
    for(const [dx,dy] of forward) {const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height) {const n=ny*width+nx;distance[i]=Math.min(distance[i],labels[n]===id?distance[n]+1:1);}}
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--) {
    const i=y*width+x;
    for(const [dx,dy] of backward){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){const n=ny*width+nx;distance[i]=Math.min(distance[i],labels[n]===labels[i]?distance[n]+1:1);}}
  }
  const best = new Map<number,number>();
  for(let i=0;i<labels.length;i++) {const prev=best.get(labels[i]);if(prev===undefined||distance[i]>distance[prev])best.set(labels[i],i);}
  const placements=new Map<number,LabelPlacement>();
  for(const zone of zones) {
    const i=best.get(zone.id); if(i===undefined)continue;
    const clearance=distance[i]-1;
    const diameter=2*clearance;
    const digits=String(zone.colorIdx+1).length;
    const fontSize=Math.min(16,Math.floor(Math.min(diameter/1.5,diameter/(digits*.75+.8))));
    if(fontSize<6)continue; // Explicitly reported to the user; never spill into another region.
    placements.set(zone.id,{x:i%width+.5,y:Math.floor(i/width)+.5,fontSize,clearance});
  }
  return placements;
}

export function paintRegionMap(labels: Int32Array, zones: Zone[], palette: string[], width:number,height:number): ImageData {
  const colors=new Map(zones.map(z=>[z.id,palette[z.colorIdx]]));
  const rgb=new Map([...colors].map(([id,hex])=>[id,[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]]));
  const image=new ImageData(width,height);
  for(let i=0;i<labels.length;i++){const c=rgb.get(labels[i]);if(!c)throw new Error('Zone sans couleur dans le rendu final.');const p=i*4;image.data[p]=c[0];image.data[p+1]=c[1];image.data[p+2]=c[2];image.data[p+3]=255;}
  return image;
}
