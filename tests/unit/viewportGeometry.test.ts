import { describe, expect, it } from 'vitest';
import { clampPan, clampZoom, clientPointToImage, fitZoom } from '@/lib/viewportGeometry';

describe('navigation du plan de travail',()=>{
  it('permet de zoomer au-delà de l’ajustement',()=>{expect(fitZoom(1200,800,600,400)).toBe(50);expect(clampZoom(200)).toBe(200);expect(clampZoom(900)).toBe(800);});
  it('centre une petite image sans autoriser sa disparition par déplacement',()=>{expect(clampPan(50,200,600)).toBe(0);expect(clampPan(500,1200,600)).toBe(300);expect(clampPan(-500,1200,600)).toBe(-300);});
  it('aligne le pointage sur les pixels après zoom et déplacement',()=>{
    const geometry={width:100,height:80,containerWidth:300,containerHeight:200,scale:2,panX:10,panY:-5};
    expect(clientPointToImage(10+50+10+2*20,20+20-5+2*30,{left:10,top:20},geometry)).toEqual({x:20,y:30});
    expect(clientPointToImage(0,0,{left:10,top:20},geometry)).toBeNull();
  });
  it('ne grossit pas artificiellement une petite image lors de son ajustement initial',()=>{expect(fitZoom(120,80,600,400)).toBe(100);});
});
