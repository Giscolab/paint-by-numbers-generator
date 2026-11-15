import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/imageProcessing',()=>({analyzeImageColors:vi.fn()}));
import { analyzeImageWithWorker } from '@/lib/imageAnalysisWorker';
class MockWorker {
  static current:MockWorker;
  onmessage:((event:MessageEvent)=>void)|null=null;
  onerror:((event:ErrorEvent)=>void)|null=null;
  onmessageerror:(()=>void)|null=null;
  terminate=vi.fn();postMessage=vi.fn();
  constructor(){MockWorker.current=this;}
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const photo=()=>new File(['photo'],'photo.jpg',{type:'image/jpeg'});
describe('supervision de l’analyse',()=>{
  it('retourne le résultat et arrête le Worker après succès',async()=>{vi.stubGlobal('Worker',MockWorker);const promise=analyzeImageWithWorker(photo());const result={uniqueColorsCount:5};MockWorker.current.onmessage!({data:{type:'success',result}} as MessageEvent);expect(await promise).toEqual(result);expect(MockWorker.current.terminate).toHaveBeenCalledOnce();});
  it('remonte la vraie erreur au lieu de rester bloqué',async()=>{vi.stubGlobal('Worker',MockWorker);const promise=analyzeImageWithWorker(photo());MockWorker.current.onmessage!({data:{type:'error',error:'Décodage impossible'}} as MessageEvent);await expect(promise).rejects.toThrow('Décodage impossible');expect(MockWorker.current.terminate).toHaveBeenCalledOnce();});
  it('annule le calcul lorsque le document change',async()=>{vi.stubGlobal('Worker',MockWorker);const controller=new AbortController();const promise=analyzeImageWithWorker(photo(),{signal:controller.signal});controller.abort();await expect(promise).rejects.toMatchObject({name:'AbortError'});expect(MockWorker.current.terminate).toHaveBeenCalledOnce();});
  it('arrête un Worker qui ne répond plus',async()=>{vi.useFakeTimers();vi.stubGlobal('Worker',MockWorker);const promise=analyzeImageWithWorker(photo());const assertion=expect(promise).rejects.toThrow('une minute');await vi.advanceTimersByTimeAsync(60000);await assertion;expect(MockWorker.current.terminate).toHaveBeenCalledOnce();});
});
