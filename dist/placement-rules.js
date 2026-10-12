import { getWaterContours, waterIntersectsCircle, waterIntersectsCapsule } from './water-geometry.js';

// Generation and shoreline art share these bands. Movement may enter the
// shallows; ordinary land objects must clear the entire beach as well.
export const COAST_RULES=Object.freeze({shallowWidth:100,beachWidth:35,inlandInset:135,waterSetback:12});
const policy=(surface,water='avoid',coastSetback=0,waterGap=water==='avoid'?8:0)=>Object.freeze({surface,water,coastSetback,waterGap});
export const PLACEMENT_POLICIES=Object.freeze({
  vegetation:policy('inland'),stone:policy('dry'),debris:policy('inland'),
  water:policy('inland','avoid',COAST_RULES.waterSetback),structure:policy('inland'),
  loot:policy('inland'),hazard:policy('inland'),wetlandHazard:policy('inland','allow')
});
const finite=(...values)=>values.every(Number.isFinite),nonnegative=n=>Number.isFinite(n)&&n>=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resolvePolicy(kind){
  if(typeof kind==='string')return Object.prototype.hasOwnProperty.call(PLACEMENT_POLICIES,kind)?PLACEMENT_POLICIES[kind]:null;
  if(!kind||typeof kind!=='object'||Array.isArray(kind)||Object.keys(kind).some(k=>!['surface','water','coastSetback','waterGap'].includes(k)))return null;
  if(!['inland','dry','coastal'].includes(kind.surface)||!['allow','avoid'].includes(kind.water)||!nonnegative(kind.coastSetback??0)||!nonnegative(kind.waterGap??0))return null;
  return {surface:kind.surface,water:kind.water,coastSetback:kind.coastSetback??0,waterGap:kind.waterGap??(kind.water==='avoid'?8:0)};
}
function parseShape(shape){
  if(!shape||typeof shape!=='object')return null;
  if('points' in shape){
    const points=shape.points,padding=shape.padding??0;
    if(!Array.isArray(points)||points.length<3||points.length>512||!nonnegative(padding)||!points.every(p=>p&&finite(p.x,p.y)))return null;
    let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
    return Number.isFinite(area)&&Math.abs(area)>1e-7?{points,padding}:null;
  }
  if('width' in shape||'height' in shape){
    const {x,y,width,height}=shape,padding=shape.padding??0;
    if(!finite(x,y,width,height)||width<=0||height<=0||!nonnegative(padding))return null;
    return {points:[{x:x-width/2,y:y-height/2},{x:x+width/2,y:y-height/2},{x:x+width/2,y:y+height/2},{x:x-width/2,y:y+height/2}],padding};
  }
  if('ax' in shape||'ay' in shape||'bx' in shape||'by' in shape){
    const {ax,ay,bx,by,r}=shape;return finite(ax,ay,bx,by)&&nonnegative(r)?{ax,ay,bx,by,r}:null;
  }
  return finite(shape.x,shape.y)&&nonnegative(shape.r)?{ax:shape.x,ay:shape.y,bx:shape.x,by:shape.y,r:shape.r}:null;
}
function normalizedShape(shape){
  const s=parseShape(shape);if(!s)return null;const b=shapeBounds(s);
  return finite(b.minX,b.minY,b.maxX,b.maxY,b.maxX-b.minX,b.maxY-b.minY)?s:null;
}
function shapeBounds(s){
  if(!s.points)return {minX:Math.min(s.ax,s.bx)-s.r,minY:Math.min(s.ay,s.by)-s.r,maxX:Math.max(s.ax,s.bx)+s.r,maxY:Math.max(s.ay,s.by)+s.r};
  return {minX:Math.min(...s.points.map(p=>p.x))-s.padding,minY:Math.min(...s.points.map(p=>p.y))-s.padding,maxX:Math.max(...s.points.map(p=>p.x))+s.padding,maxY:Math.max(...s.points.map(p=>p.y))+s.padding};
}
export function footprintBounds(shape){const s=normalizedShape(shape);return s?shapeBounds(s):null;}
function pointSegmentSq(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,n=dx*dx+dy*dy,t=n?clamp(((x-ax)*dx+(y-ay)*dy)/n,0,1):0;return (x-ax-t*dx)**2+(y-ay-t*dy)**2;}
function segmentSq(ax,ay,bx,by,cx,cy,dx,dy){
  const ux=bx-ax,uy=by-ay,vx=dx-cx,vy=dy-cy,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((cx-ax)*vy-(cy-ay)*vx)/den,s=((cx-ax)*uy-(cy-ay)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(pointSegmentSq(ax,ay,cx,cy,dx,dy),pointSegmentSq(bx,by,cx,cy,dx,dy),pointSegmentSq(cx,cy,ax,ay,bx,by),pointSegmentSq(dx,dy,ax,ay,bx,by));
}
function inside(points,x,y){let result=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;}
function edgesSome(s,test){for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[(i+1)%s.points.length];if(test(a,b))return true;}return false;}
function capsuleOverlaps(s,c){
  if(!s.points)return segmentSq(s.ax,s.ay,s.bx,s.by,c.ax,c.ay,c.bx,c.by)<=(s.r+c.r)**2;
  if(inside(s.points,c.ax,c.ay)||inside(s.points,c.bx,c.by))return true;
  return edgesSome(s,(a,b)=>segmentSq(a.x,a.y,b.x,b.y,c.ax,c.ay,c.bx,c.by)<=(s.padding+c.r)**2);
}
function waterOverlaps(s,m){
  if(!s.points)return s.ax===s.bx&&s.ay===s.by?waterIntersectsCircle(m,s.ax,s.ay,s.r):waterIntersectsCapsule(m,s.ax,s.ay,s.bx,s.by,s.r);
  if(edgesSome(s,(a,b)=>waterIntersectsCapsule(m,a.x,a.y,b.x,b.y,s.padding)))return true;
  // Perimeter checks alone miss a small pond entirely beneath a large site.
  return getWaterContours(m).outer.some(p=>inside(s.points,p.x,p.y));
}
function coastInset(island,p){const shallow=Number.isFinite(island?.shallowWidth)?island.shallowWidth:COAST_RULES.shallowWidth;return (p.surface==='inland'?shallow+COAST_RULES.beachWidth:p.surface==='dry'?shallow:0)+p.coastSetback;}
function allowsSurface(island,p,s){
  if(!island)return true;
  const inset=coastInset(island,p);
  if(!s.points)return island.containsCapsule(s.ax,s.ay,s.bx,s.by,s.r,inset);
  // Testing each complete edge, not isolated corners, catches concave bays.
  return !edgesSome(s,(a,b)=>!island.containsCapsule(a.x,a.y,b.x,b.y,s.padding,inset));
}
export function surfaceAt(island,x,y){
  if(!finite(x,y))return null;if(!island)return 'inland';
  const shallow=island.shallowWidth??COAST_RULES.shallowWidth;
  return !island.contains(x,y)?'sea':!island.contains(x,y,shallow)?'shallow':!island.contains(x,y,shallow+COAST_RULES.beachWidth)?'beach':'inland';
}
export function surfaceAllows(island,kind,shape){const p=resolvePolicy(kind),s=normalizedShape(shape);return !!p&&!!s&&allowsSurface(island,p,s);}

// Measured ground geometry excludes raised branches/canopies. One definition
// keeps shoreline checks and object-to-water clearance on the same roots.
export function groundFootprint(o,padding=8){
  if(!o||!finite(o.x,o.y,o.r)||o.r<0||!nonnegative(padding))return null;
  const scale=o.scale??1,angle=o.angle??0,length=o.type==='log'?(o.halfLength??0):0;
  if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(angle)||!nonnegative(length))return null;
  const root=([28,27,26,20,32][o.treeForm]||32)*scale;
  const r=(o.type==='tree'?Math.max(o.r,root):o.type==='log'?o.r*1.3:o.r*1.2)+padding,dx=Math.cos(angle)*length,dy=Math.sin(angle)*length;
  return {ax:o.x-dx,ay:o.y-dy,bx:o.x+dx,by:o.y+dy,r};
}
function reservedOverlaps(island,s){
  if(!island)return false;
  if(!s.points)return !!island.isReservedCapsule?.(s.ax,s.ay,s.bx,s.by,s.r);
  if(edgesSome(s,(a,b)=>island.isReservedCapsule?.(a.x,a.y,b.x,b.y,s.padding)))return true;
  return [{x:0,y:0},...Object.values(island.plan||{}),...(island.routes||[]).flatMap(r=>[{x:r.ax,y:r.ay},{x:r.bx,y:r.by}])].some(p=>inside(s.points,p.x,p.y));
}
// Query stable water geometry (not just currently rendered muds). Natural
// obstacle generation calls surfaceAllows only, so water/terrain never recurse.
// Custom policies describe allowed habitat; e.g. coastal+allow permits reeds
// on shore or inland water, without requiring water to be present.
export function placementAllowed(game,kind,shape,options={}){
  const p=resolvePolicy(kind),s=normalizedShape(shape);if(!p||!s||!game||!options||typeof options!=='object')return false;
  const terrain=game.terrain,island=terrain?.island??game.island;
  if(!allowsSurface(island,p,s)||(options.checkReserved&&reservedOverlaps(island,s)))return false;
  const b=shapeBounds(s);
  if(options.checkTerrain!==false&&terrain){
    if(typeof terrain.query==='function'){
      // Visible roots extend a little past solid collision bounds; query that
      // skirt before comparing complete, measured ground footprints.
      for(const obstacle of terrain.query(b.minX-48,b.minY-48,b.maxX+48,b.maxY+48)){
        const f=groundFootprint(obstacle,0);if(f&&capsuleOverlaps(s,f))return false;
      }
    }else if(typeof terrain.isFree==='function'){
      const x=(b.minX+b.maxX)/2,y=(b.minY+b.maxY)/2,r=Math.hypot(b.maxX-b.minX,b.maxY-b.minY)/2;
      if(!terrain.isFree(x,y,r))return false;
    }
  }
  if(options.checkWater!==false&&p.water==='avoid'){
    const waterShape=s.points?{...s,padding:s.padding+p.waterGap}:{...s,r:s.r+p.waterGap},waterBounds=shapeBounds(waterShape);
    const environment=options.environment??game.environment;
    const waters=typeof environment?.watersInBounds==='function'?environment.watersInBounds(waterBounds):environment?.muds||[];
    for(const water of waters)if(waterOverlaps(waterShape,water))return false;
  }
  return true;
}
