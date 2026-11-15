import { vi, describe, expect, it } from 'vitest';
import { flattenOnWhite, imageFingerprint, processingCacheKey, quantizePerceptually, placeRegionLabels, validateModelParameters, type ModelParameters } from '../pbnModel';
import { labelConnectedComponents, mergeSmallZones, smoothZones, detectEdges, traceContours, generateSVG, processImage } from '../imageProcessing';
import { renderPipeline } from '../renderPipeline';
import { exportToSvg } from '../exportSvg';

vi.hoisted(() => {
class TestImageData {
  data: Uint8ClampedArray; width:number; height:number;
  constructor(width:number,height:number) { this.width=width;this.height=height;this.data=new Uint8ClampedArray(width*height*4); }
}
class TestCanvas {
  constructor(public width:number,public height:number) {}
  getContext() {
    let image=new ImageData(this.width,this.height);
    return { putImageData:(value:ImageData)=>{image=value;}, getImageData:()=>image, measureText:(text:string)=>({width:text.length*4}), fillText:()=>{}, fillRect:()=>{}, clearRect:()=>{}, drawImage:()=>{}, textAlign:'center',textBaseline:'middle',font:'',fillStyle:'' };
  }
}
Object.assign(globalThis,{ImageData:TestImageData,OffscreenCanvas:TestCanvas});
});
const params:ModelParameters={numColors:3,minRegionSize:0,smoothness:0,mergeTolerance:0,enableArtisticMerge:false,enableSmartPalette:false};
const image=(width:number,height:number,pixel:(x:number,y:number)=>number[])=>{const result=new ImageData(width,height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)result.data.set(pixel(x,y),(y*width+x)*4);return result;};
const checkRegions=(labels:Int32Array,zones:ReturnType<typeof labelConnectedComponents>['zones'])=>{
  const seen=new Set<number>();
  for(const zone of zones){expect(zone.pixels.length).toBe(zone.area);for(const pixel of zone.pixels){expect(labels[pixel]).toBe(zone.id);expect(seen.has(pixel)).toBe(false);seen.add(pixel);}}
  expect(seen.size).toBe(labels.length);
};

describe('identité du modèle et entrées',()=>{
  it('distingue deux images identiques sur leurs 1000 premiers pixels',async()=>{const a=image(50,30,()=>[255,255,255,255]);const b=image(50,30,()=>[255,255,255,255]);b.data[1400*4]=0;expect(await imageFingerprint(a)).not.toBe(await imageFingerprint(b));});
  it('inclut chaque réglage dans la clé du cache',()=>{const base=processingCacheKey('source',params);for(const key of Object.keys(params) as Array<keyof ModelParameters>){const value=params[key];const next={...params,[key]:typeof value==='boolean'?!value:value+1};expect(processingCacheKey('source',next)).not.toBe(base);}});
  it.each([0,81,NaN,Infinity,2.5])('rejette un nombre de couleurs invalide : %s',numColors=>{expect(()=>validateModelParameters({...params,numColors})).toThrow();});
  it('compose les transparences sur le papier blanc sans modifier la source',()=>{const source=image(2,1,x=>x?[255,0,0,128]:[0,0,0,0]);const out=flattenOnWhite(source);expect([...out.data]).toEqual([255,255,255,255,255,127,127,255]);expect(source.data[3]).toBe(0);});
});

describe('quantification reproductible',()=>{
  it('garde une couleur uniforme sans dupliquer les centres',()=>{expect(quantizePerceptually(image(20,20,()=>[255,0,0,255]),24)).toEqual(['#ff0000']);});
  it('ne transforme pas les pixels transparents en noir',()=>{expect(quantizePerceptually(image(2,2,()=>[0,0,0,0]),8)).toEqual(['#ffffff']);});
  it('produit la même palette sur plusieurs appels sans modifier les pixels',()=>{const source=image(64,32,(x,y)=>[x*4,y*8,(x+y)*2,255]);const bytes=source.data.slice();const palette=quantizePerceptually(source,8);expect(quantizePerceptually(source,8)).toEqual(palette);expect(new Set(palette).size).toBe(palette.length);expect(source.data).toEqual(bytes);});
});

describe('topologie des régions',()=>{
  it('ne relie pas des pixels en diagonale',()=>{const result=labelConnectedComponents([0,1,1,0],2,2);expect(result.zones).toHaveLength(4);checkRegions(result.labels,result.zones);});
  it('honore une fusion désactivée, sans modifier les zones sources',()=>{const source=labelConnectedComponents([0,1,0,1],4,1);const before=source.zones.map(z=>[...z.pixels]);const result=mergeSmallZones(source.zones,source.labels,['#000000','#ffffff'],4,1,0);expect([...result.mergedLabels]).toEqual([...source.labels]);expect(source.zones.map(z=>[...z.pixels])).toEqual(before);checkRegions(result.mergedLabels,result.mergedZones);});
  it('fusionne les petits voisins sans cycle ni duplication de pixels',()=>{const source=labelConnectedComponents([0,1,2,1,0,2,1,2,0],3,3);const before=source.zones.map(z=>z.area);const result=mergeSmallZones(source.zones,source.labels,['#000000','#777777','#ffffff'],3,3,4);checkRegions(result.mergedLabels,result.mergedZones);expect(result.mergedZones.every(z=>z.area>=4)).toBe(true);expect(source.zones.map(z=>z.area)).toEqual(before);});
  it('ne crée pas de contours photographiques à l’intérieur d’une région',()=>{const edges=detectEdges(new Int32Array(25),new Uint8Array(Array.from({length:25},(_,i)=>i%2?0:255)),5,5);expect(edges.data[(2*5+2)*4]).toBe(255);});
  it('conserve les trous et les identités dans les chemins SVG',()=>{const colors=Array.from({length:49},(_,i)=>{const x=i%7,y=Math.floor(i/7);return x>=2&&x<=4&&y>=2&&y<=4?1:0;});const {labels,zones}=labelConnectedComponents(colors,7,7);const contours=traceContours(7,7,zones);const svg=generateSVG(contours,zones,['#ff0000','#ffffff'],7,7);expect(svg).toContain('fill-rule="evenodd"');const outer=svg.match(/<path[^>]*data-id="0"[^>]*>/)![0];expect((outer.match(/M/g)||[]).length).toBe(2);checkRegions(labels,zones);});
});

describe('numérotation sans débordement',()=>{
  it('place les chiffres dans la région et à l’extérieur de son trou',()=>{const map=Array.from({length:1600},(_,i)=>{const x=i%40,y=Math.floor(i/40);return x>=14&&x<26&&y>=14&&y<26?1:0;});const {labels,zones}=labelConnectedComponents(map,40,40);const placements=placeRegionLabels(labels,zones,40,40);expect(placements.size).toBe(2);for(const zone of zones){const p=placements.get(zone.id)!;const radius=Math.floor(p.clearance);const x=Math.floor(p.x),y=Math.floor(p.y);for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)expect(labels[(y+dy)*40+x+dx]).toBe(zone.id);expect(p.fontSize).toBeLessThanOrEqual(16);}});
  it('signale implicitement une zone trop fine au lieu de dessiner hors de celle-ci',()=>{const {labels,zones}=labelConnectedComponents(Array(60).fill(0),60,1);expect(placeRegionLabels(labels,zones,60,1).size).toBe(0);});
});

describe('pipeline cohérent',()=>{
  it('rend seulement les couleurs de la palette et respecte les partitions finales',()=>{
    const source=image(32,24,(x,y)=>x<16?[220,y*3,20,255]:[20,80+y*2,180,255]);
    const progress:number[]=[];const {processed}=renderPipeline({referenceImageData:source,referenceGrayscaleMap:new Uint8Array(768),bruteSignal:{} as never},{...params,numColors:2,report:(_,p)=>progress.push(p)});
    checkRegions(processed.labels!,processed.zones);
    for(let i=0;i<processed.colorized!.data.length;i+=4){const color='#'+[...processed.colorized!.data.slice(i,i+3)].map(v=>v.toString(16).padStart(2,'0')).join('');expect(processed.palette).toContain(color);}
    expect(progress).toEqual([...progress].sort((a,b)=>a-b));expect(processed.zones.every(z=>z.pixels.length===z.area)).toBe(true);
  });
  it('exporte les vraies coordonnées des pixels dans le SVG, même pour une zone volumineuse',async()=>{
    const source=image(160,140,()=>[40,90,140,255]);const {processed}=renderPipeline({referenceImageData:source,referenceGrayscaleMap:new Uint8Array(22400),bruteSignal:{} as never},{...params,report:()=>{}});
    expect(processed.zones[0].pixels.length).toBe(22400);
    const text=await exportToSvg({...processed,metadata:{width:160,height:140,totalProcessingTimeMs:0,cacheKey:'test',wasCached:false}}).text();expect(text).toContain('viewBox="0 0 160 140"');expect(text).toContain('data-id="0"');expect(text).not.toContain('NaN');
  });
});


describe('contrat complet avec cache',()=>{
  it('ne réutilise pas un résultat lorsque la palette intelligente change',async()=>{
    const source=image(20,20,(x)=>x<10?[120,20,30,255]:[30,110,50,255]);
    const first=await processImage(source,2,0,0,0,false,undefined,false);
    const repeated=await processImage(source,2,0,0,0,false,undefined,false);
    const adapted=await processImage(source,2,0,0,0,false,undefined,true);
    expect(repeated.metadata?.wasCached).toBe(true);
    expect(adapted.metadata?.wasCached).toBe(false);
    expect(adapted.metadata?.cacheKey).not.toBe(first.metadata?.cacheKey);
    expect(adapted.palette).not.toEqual(first.palette);
    expect(first.zones.every(zone=>zone.pixels.length===zone.area)).toBe(true);
    expect(first.metadata?.unnumberedZoneCount).toBe(first.zones.filter(zone=>!zone.label).length);
    expect(first.progressLog!.map(event=>event.progress)).toEqual(first.progressLog!.map(event=>event.progress).sort((a,b)=>a-b));
  });
  it('préserve tous les pixels des grandes zones après sérialisation',async()=>{
    const result=await processImage(image(160,140,()=>[80,80,120,255]),4,0,0,0,false);
    expect(result.zones).toHaveLength(1);expect(result.zones[0].pixels.length).toBe(22400);
  });
});

describe('fusions sur des partitions bruitées',()=>{
  it.each([1,2,3,4,5])('préserve la partition sur le cas %s',seed=>{
    let state=seed;
    const colors=Array.from({length:300},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%4;});
    const source=labelConnectedComponents(colors,20,15);
    const result=mergeSmallZones(source.zones,source.labels,['#222222','#777777','#bbbbbb','#eeeeee'],20,15,15);
    checkRegions(result.mergedLabels,result.mergedZones);
    expect(result.mergedZones.every(zone=>zone.area>=15)).toBe(true);
  });
});
