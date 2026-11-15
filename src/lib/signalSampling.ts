import { boundedImageSize } from './imageDecode';

/** Block averages include every source sample, with a fixed upper bound on FFT allocation. */
export function reduceSignalChannels(channels: Float64Array[], width:number,height:number,maxDimension=256):{channels:Float64Array[];width:number;height:number} {
  if(channels.some(channel=>channel.length!==width*height))throw new Error('Canaux du signal incohérents.');
  const size=boundedImageSize(width,height,maxDimension);
  if(size.width===width&&size.height===height)return {channels,width,height};
  const reduced=channels.map(()=>new Float64Array(size.width*size.height));
  for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
    const x0=Math.floor(x*width/size.width),x1=Math.floor((x+1)*width/size.width);
    const y0=Math.floor(y*height/size.height),y1=Math.floor((y+1)*height/size.height);
    const count=(x1-x0)*(y1-y0);
    for(let c=0;c<channels.length;c++){
      let sum=0;
      for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++)sum+=channels[c][sy*width+sx];
      reduced[c][y*size.width+x]=sum/count;
    }
  }
  return {channels:reduced,...size};
}
