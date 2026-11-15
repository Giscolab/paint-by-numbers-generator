import { analyzeImageColors } from '@/lib/imageProcessing';
self.onmessage=async(event:MessageEvent<{file:File;sourceType:'vector'|'raster'}>)=>{
  try {
    const result=await analyzeImageColors(event.data.file,{sourceType:event.data.sourceType,onProgress:progress=>self.postMessage({type:'progress',progress})});
    self.postMessage({type:'success',result});
  } catch(error) {self.postMessage({type:'error',error:error instanceof Error?error.message:'Erreur inconnue pendant l’analyse.'});}
};
