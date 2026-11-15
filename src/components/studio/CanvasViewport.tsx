import { createContext, forwardRef, type ReactNode, type RefObject, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { clampPan, clampZoom, clientPointToImage, fitZoom } from '@/lib/viewportGeometry';

type ScrollState = {left:number;top:number};
export interface CanvasViewportHandle { zoomIn:()=>void; zoomOut:()=>void; zoomTo:(percent:number,anchor?:{x:number;y:number})=>void; reset:()=>void; fitToScreen:()=>void; center:()=>void; clientToImage:(x:number,y:number)=>{x:number;y:number}|null; }
export interface CanvasViewportProps { width:number; height:number; zoomPercent:number; onZoomChange:(percent:number)=>void; panTool?:boolean; initialScroll?:ScrollState; onScrollChange?:(state:ScrollState)=>void; className?:string; children:ReactNode; }
interface CanvasViewportContextValue { scale:number; dpr:number; imageWidth:number; imageHeight:number; containerRef:RefObject<HTMLDivElement>; overlayRef:RefObject<HTMLDivElement>; wrapperRef:RefObject<HTMLDivElement>; clientToImage:(x:number,y:number)=>{x:number;y:number}|null; }
const CanvasViewportContext=createContext<CanvasViewportContextValue|null>(null);
export function useCanvasViewport(){const value=useContext(CanvasViewportContext);if(!value)throw new Error('CanvasViewport context missing');return value;}

export const CanvasViewport=forwardRef<CanvasViewportHandle,CanvasViewportProps>(function CanvasViewport({width,height,zoomPercent,onZoomChange,panTool=false,initialScroll,onScrollChange,className,children},ref){
  const wrapperRef=useRef<HTMLDivElement>(null),containerRef=useRef<HTMLDivElement>(null),overlayRef=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  const [pan,setPan]=useState({x:initialScroll?.left ?? 0,y:initialScroll?.top ?? 0});
  const [dpr,setDpr]=useState(()=>window.devicePixelRatio||1);
  const drag=useRef<{id:number;x:number;y:number;panX:number;panY:number}|null>(null);
  const scale=clampZoom(zoomPercent)/100;
  const actualPan={x:clampPan(pan.x,width*scale,size.width),y:clampPan(pan.y,height*scale,size.height)};
  useLayoutEffect(()=>{
    const el=containerRef.current;if(!el)return;
    const resize=()=>setSize({width:el.clientWidth,height:el.clientHeight});resize();
    const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{const update=()=>setDpr(window.devicePixelRatio||1);window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[]);
  const fitToScreen=useCallback(()=>{setPan({x:0,y:0});onZoomChange(fitZoom(width,height,size.width,size.height));},[width,height,size.width,size.height,onZoomChange]);
  const zoomTo=useCallback((percent:number)=>onZoomChange(clampZoom(percent)),[onZoomChange]);
  const zoomIn=useCallback(()=>zoomTo(zoomPercent*1.2),[zoomPercent,zoomTo]);
  const zoomOut=useCallback(()=>zoomTo(zoomPercent/1.2),[zoomPercent,zoomTo]);
  const reset=useCallback(()=>{setPan({x:0,y:0});zoomTo(100);},[zoomTo]);
  const center=useCallback(()=>setPan({x:0,y:0}),[]);
  const clientToImage=useCallback((x:number,y:number)=>{const rect=containerRef.current?.getBoundingClientRect();return rect?clientPointToImage(x,y,rect,{width,height,containerWidth:size.width,containerHeight:size.height,scale,panX:actualPan.x,panY:actualPan.y}):null;},[width,height,size.width,size.height,scale,actualPan.x,actualPan.y]);
  useImperativeHandle(ref,()=>({zoomIn,zoomOut,zoomTo,reset,fitToScreen,center,clientToImage}),[zoomIn,zoomOut,zoomTo,reset,fitToScreen,center,clientToImage]);
  useEffect(()=>onScrollChange?.({left:actualPan.x,top:actualPan.y}),[actualPan.x,actualPan.y,onScrollChange]);
  // Native non-passive wheel handler: Ctrl/Cmd+wheel zooms; plain wheel pans the artwork.
  useEffect(()=>{
    const el=containerRef.current;if(!el)return;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
      if(event.ctrlKey||event.metaKey){zoomTo(zoomPercent*Math.exp(-event.deltaY*.002));return;}
      setPan(prev=>({x:clampPan(prev.x-event.deltaX,width*scale,size.width),y:clampPan(prev.y-event.deltaY,height*scale,size.height)}));
    };
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[zoomPercent,zoomTo,width,height,scale,size.width,size.height]);
  const context=useMemo(()=>({scale,dpr,imageWidth:width,imageHeight:height,containerRef,overlayRef,wrapperRef,clientToImage}),[scale,dpr,width,height,clientToImage]);
  return <CanvasViewportContext.Provider value={context}><div ref={wrapperRef} className={cn('relative h-full w-full',className)}>
    <div ref={containerRef} className={cn('absolute inset-0 overflow-hidden bg-studio-canvas',panTool?'cursor-grab active:cursor-grabbing':'cursor-default')} style={{touchAction:panTool?'none':'auto'}}
      onPointerDown={event=>{if(!panTool||event.button!==0)return;event.preventDefault();drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,panX:actualPan.x,panY:actualPan.y};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;setPan({x:clampPan(start.panX+event.clientX-start.x,width*scale,size.width),y:clampPan(start.panY+event.clientY-start.y,height*scale,size.height)});}}
      onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
      <div className="absolute" style={{left:(size.width-width*scale)/2+actualPan.x,top:(size.height-height*scale)/2+actualPan.y,width:width>0?width*scale:'100%',height:height>0?height*scale:'100%'}}>{children}</div>
    </div><div ref={overlayRef} className="pointer-events-none absolute inset-0"/>
  </div></CanvasViewportContext.Provider>;
});
