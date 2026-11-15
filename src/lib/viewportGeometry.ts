export interface ViewportGeometry { width:number; height:number; containerWidth:number; containerHeight:number; scale:number; panX:number; panY:number; }
export function clampZoom(percent:number): number { return Math.min(800,Math.max(10,Number.isFinite(percent)?percent:100)); }
export function fitZoom(width:number,height:number,containerWidth:number,containerHeight:number):number {
  if(!width||!height||!containerWidth||!containerHeight)return 100;
  return clampZoom(Math.floor(100*Math.min(1,containerWidth/width,containerHeight/height)));
}
export function clampPan(pan:number,imageSize:number,containerSize:number):number {
  const limit=Math.max(0,(imageSize-containerSize)/2);
  return Math.max(-limit,Math.min(limit,pan));
}
export function clientPointToImage(clientX:number,clientY:number,rect:{left:number;top:number},geometry:ViewportGeometry): {x:number;y:number}|null {
  const left=rect.left+(geometry.containerWidth-geometry.width*geometry.scale)/2+geometry.panX;
  const top=rect.top+(geometry.containerHeight-geometry.height*geometry.scale)/2+geometry.panY;
  const x=(clientX-left)/geometry.scale,y=(clientY-top)/geometry.scale;
  return x>=0&&y>=0&&x<geometry.width&&y<geometry.height?{x:Math.floor(x),y:Math.floor(y)}:null;
}
