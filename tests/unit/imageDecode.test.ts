import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedImageSize, decodeImageFile, validateImageInput } from '@/lib/imageDecode';
import { reduceSignalChannels } from '@/lib/signalSampling';

afterEach(()=>vi.unstubAllGlobals());
describe('décodage borné des images',()=>{
  it.each([[6000,4000,1200,800],[800,533,800,533],[1,100000,1,1200],[100000,1,1200,1]])('borne %sx%s à %sx%s',(w,h,width,height)=>{expect(boundedImageSize(w,h)).toEqual({width,height});});
  it.each([[0,10],[10,0],[Infinity,10],[-1,5],[1.5,2]])('rejette les dimensions invalides %sx%s',(w,h)=>expect(()=>boundedImageSize(w,h)).toThrow());
  it('accepte un JPEG reconnu par son extension lorsque Windows ne fournit pas de MIME',()=>{expect(()=>validateImageInput(new File(['jpeg'],'PHOTO.JPG'))).not.toThrow();});
  it('rejette un fichier vide ou non-image',()=>{expect(()=>validateImageInput(new File([],'photo.png',{type:'image/png'}))).toThrow('vide');expect(()=>validateImageInput(new File(['text'],'file.txt'))).toThrow('Format');});
  it('ne crée jamais un canevas de 24 mégapixels pour une grande photographie',async()=>{
    const close=vi.fn(),draw=vi.fn(),sizes:number[][]=[];
    vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:6000,height:4000,close}));
    vi.stubGlobal('OffscreenCanvas',class {constructor(public width:number,public height:number){sizes.push([width,height]);}getContext(){return {drawImage:draw,getImageData:()=>({width:this.width,height:this.height,data:new Uint8ClampedArray(this.width*this.height*4)})};}});
    const output=await decodeImageFile(new File(['photo'],'camera.jpg',{type:'image/jpeg'}));
    expect(sizes).toEqual([[1200,800]]);expect(output.sourceWidth).toBe(6000);expect(output.imageData.width).toBe(1200);expect(draw).toHaveBeenCalledWith(expect.anything(),0,0,1200,800);expect(close).toHaveBeenCalledOnce();
  });
  it('libère le bitmap même si le canevas échoue',async()=>{
    const close=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:400,height:300,close}));
    vi.stubGlobal('OffscreenCanvas',class {getContext(){return null;}});
    await expect(decodeImageFile(new File(['data'],'photo.png',{type:'image/png'}))).rejects.toThrow('canevas');expect(close).toHaveBeenCalledOnce();
  });
  it('conserve la cause du rejet du décodeur',async()=>{vi.stubGlobal('createImageBitmap',vi.fn().mockRejectedValue(new Error('Image corrompue')));await expect(decodeImageFile(new File(['broken'],'broken.png',{type:'image/png'}))).rejects.toThrow('Image corrompue');});
});
describe('mémoire du calcul spectral',()=>{
  it('borne la taille des canaux sans ignorer les pixels alternés',()=>{const channels=[Float64Array.from({length:1024},(_,i)=>i%2?255:0)];const result=reduceSignalChannels(channels,1024,1,256);expect(result.width).toBe(256);expect([...result.channels[0]]).toEqual(Array(256).fill(127.5));expect(channels[0][1]).toBe(255);});
  it('préserve les petits signaux sans copie',()=>{const channels=[new Float64Array(100)];expect(reduceSignalChannels(channels,10,10).channels).toBe(channels);});
});
