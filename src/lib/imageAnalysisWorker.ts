import type { ColorAnalysis } from './imageProcessing';
import { analyzeImageColors } from './imageProcessing';
import { validateImageInput } from './imageDecode';

export async function analyzeImageWithWorker(file: File, options: {sourceType?:'vector'|'raster';onProgress?:(progress:number)=>void;signal?:AbortSignal}={}):Promise<ColorAnalysis> {
  validateImageInput(file);
  if(options.signal?.aborted)throw new DOMException('Analyse annulée','AbortError');
  if(typeof Worker==='undefined')return analyzeImageColors(file,options);
  return new Promise((resolve,reject)=>{
    let worker:Worker;
    let timeout:ReturnType<typeof setTimeout>;
    let settled=false;
    const cleanup=()=>{clearTimeout(timeout);worker?.terminate();options.signal?.removeEventListener('abort',abort);};
    const finish=(result?:ColorAnalysis,error?:Error)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(result!);};
    const abort=()=>finish(undefined,new DOMException('Analyse annulée','AbortError'));
    try {
      worker=new Worker(new URL('../workers/imageAnalysis.worker.ts',import.meta.url),{type:'module'});
      options.signal?.addEventListener('abort',abort,{once:true});
      timeout=setTimeout(()=>finish(undefined,new Error('L’analyse a dépassé une minute. Réessayez ou choisissez une image plus petite.')),60000);
      worker.onmessage=(event:MessageEvent)=>{
        if(event.data.type==='progress')options.onProgress?.(event.data.progress);
        else if(event.data.type==='success')finish(event.data.result);
        else if(event.data.type==='error')finish(undefined,new Error(event.data.error || 'L’analyse de cette image a échoué.'));
      };
      worker.onerror=event=>finish(undefined,new Error(`Impossible d’exécuter l’analyse : ${event.message || 'Worker indisponible'}`));
      worker.onmessageerror=()=>finish(undefined,new Error('La réponse de l’analyse est illisible.'));
      worker.postMessage({file,sourceType:options.sourceType??'raster'});
    } catch(error) {finish(undefined,error instanceof Error?error:new Error('Impossible de démarrer l’analyse.'));}
  });
}
