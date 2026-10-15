import { RiftCollision, riftPointInPolygon } from './rift-collision.js';
import { enemyVisual } from './enemy-visuals.js';
import { groundFootprint, surfaceAllows } from './placement-rules.js';
import { blocksObstacle, obstacleHeight } from './height-rules.js';
import { worldForId } from './world-definitions.js';
import { biomeZone } from './biome-layout.js';
import { layoutTerrainCell, layoutWet, patchContains } from './worlds/world-layout.js';
import { getWaterContours, waterBounds, containsWater, waterIntersectsCircle, waterIntersectsCapsule } from './water-geometry.js';
const CELL=520, TAU=Math.PI*2, EPS=.02;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
// Shared measured outlines keep art, fading and sunlight on the same footprint.
// All heights are relative to the root; trees only collide at their trunks.
export const TREE_PROFILES=Object.freeze([
  {name:'wide',x:0,y:-76,rx:74,ry:42,trunkWidth:1.08,trunkHeight:.91},
  {name:'slender',x:0,y:-101,rx:39,ry:50,trunkWidth:.74,trunkHeight:1.20},
  {name:'leaning',x:16,y:-90,rx:55,ry:48,trunkWidth:.92,trunkHeight:1.06},
  {name:'sapling',x:0,y:-68,rx:32,ry:31,trunkWidth:.58,trunkHeight:.81},
  {name:'weathered',x:-9,y:-84,rx:63,ry:47,trunkWidth:1.22,trunkHeight:1.07}
].map(Object.freeze));
export const DEAD_TREE_PROFILES=Object.freeze([
  {x:0,y:-73,rx:48,ry:36,trunkWidth:1.08,trunkHeight:1},
  {x:0,y:-92,rx:30,ry:43,trunkWidth:.74,trunkHeight:1.25},
  {x:16,y:-81,rx:54,ry:39,trunkWidth:.92,trunkHeight:1.1},
  {x:0,y:-53,rx:26,ry:27,trunkWidth:.58,trunkHeight:.7},
  {x:-3,y:-61,rx:49,ry:32,trunkWidth:1.22,trunkHeight:.86}
].map(Object.freeze));
export const WORLD_TREE_PROFILES=Object.freeze(Object.fromEntries(Object.entries({
  'world-palm':{x:10,y:-85,rx:66,ry:38},
  'world-pine':{x:0,y:-76,rx:46,ry:64},
  'world-snowpine':{x:0,y:-76,rx:46,ry:64},
  'world-charred':{x:-5,y:-74,rx:39,ry:39}
}).map(([key,value])=>[key,Object.freeze(value)])));

// The five pieces share their exact top outline and low vertical depth with
// the painter. Their ground projection must follow each piece, not a central
// oval that misses the front stones and darkens the empty middle instead.
export const ROCK_FRAGMENTS=Object.freeze([
  {points:[[-33,-15],[-26,-29],[-15,-31],[-4,-23],[-11,-12],[-25,-9]],depth:7},
  {points:[[4,-20],[13,-29],[28,-24],[34,-12],[27,-3],[10,-7]],depth:7},
  {points:[[-12,1],[-5,-6],[5,-3],[8,6],[1,12],[-13,8]],depth:7},
  {points:[[-33,13],[-27,4],[-18,7],[-18,17],[-25,21],[-34,18]],depth:5},
  {points:[[11,19],[16,10],[27,9],[35,20],[28,28],[16,28]],depth:5}
].map(piece=>Object.freeze({...piece,points:Object.freeze(piece.points.map(point=>Object.freeze(point)))})));
const fragmentShadows=new WeakMap();
export function rockShadowParts(prop){
  if(!prop||prop.rockForm!==3||prop.variant==='pillar'||prop.variant?.startsWith('world-')||!Number.isFinite(prop.r)||prop.r<=0)return null;
  const cached=fragmentShadows.get(prop);if(cached?.radius===prop.r)return cached.parts;
  const scale=prop.r/36,parts=Object.freeze(ROCK_FRAGMENTS.map(({points,depth})=>Object.freeze({
    points:Object.freeze(points.map(([x,y])=>Object.freeze({x:x*scale,y:(y+depth)*scale}))),
    offset:depth*.85*scale
  })));
  fragmentShadows.set(prop,{radius:prop.r,parts});return parts;
}
export function sceneryVisual(prop){
  const s=prop.scale||1;
  if(prop.type==='tree'){
    const themed=WORLD_TREE_PROFILES[prop.variant];
    if(themed)return Object.freeze({halfWidth:(Math.abs(themed.x)+themed.rx+8)*s,top:(-themed.y+themed.ry+8)*s,bottom:24*s,canopyX:themed.x*s,canopyY:themed.y*s,canopyRx:themed.rx*s,canopyRy:themed.ry*s,shadowWidth:themed.rx*.58*s,shadowLength:(-themed.y+themed.ry)*.43*s});
    const p=(prop.variant==='dead-tree'?DEAD_TREE_PROFILES:TREE_PROFILES)[prop.treeForm||0],cw=prop.crownWidth||1,ch=prop.crownHeight||1;
    return Object.freeze({halfWidth:(Math.abs(p.x)+p.rx*cw+8)*s,top:Math.max(140*(prop.treeForm===4?1:0),-p.y+p.ry*ch+7)*s,bottom:24*s,canopyX:p.x*s,canopyY:p.y*s,canopyRx:(p.rx*cw+4)*s,canopyRy:(p.ry*ch+3)*s,shadowWidth:(p.rx*.62)*s,shadowLength:Math.max(32,(-p.y+p.ry)*.42)*s});
  }
  if(prop.variant==='world-building')return Object.freeze({halfWidth:prop.halfLength+prop.r+5,top:115*prop.r/30,bottom:prop.r+6,shadowWidth:prop.halfLength*.7+prop.r,shadowLength:52*prop.r/30,shadowOffset:prop.r*.4});
  if(prop.variant==='world-city-wall'||prop.variant==='world-ridge'){
    const dx=Math.abs(Math.cos(prop.angle||0))*prop.halfLength,dy=Math.abs(Math.sin(prop.angle||0))*prop.halfLength,height=prop.variant==='world-ridge'?60:48;
    return Object.freeze({halfWidth:dx+prop.r+7,top:dy+prop.r+height+6,bottom:dy+prop.r+6,shadowWidth:dx+prop.r,shadowLength:height*.65,shadowOffset:prop.r*.3});
  }
  if(prop.type==='log')return Object.freeze({halfWidth:Math.abs(Math.cos(prop.angle||0))*(prop.halfLength+prop.r)+28,top:Math.abs(Math.sin(prop.angle||0))*(prop.halfLength+prop.r)+28,bottom:Math.abs(Math.sin(prop.angle||0))*(prop.halfLength+prop.r)+28,shadowWidth:prop.r,shadowLength:prop.r*1.7});
  if(prop.type==='rock'&&prop.variant?.startsWith('world-')){
    const top=([52,34,64,45,48][prop.rockForm||0]/36)*prop.r;
    return Object.freeze({halfWidth:prop.r+3,top:top+2,bottom:prop.r+2,shadowWidth:prop.r*.9,shadowLength:prop.r*.7+top*.2,shadowOffset:prop.r*.46+top*.12});
  }
  if(prop.rockForm===3&&prop.variant!=='pillar')return Object.freeze({halfWidth:prop.r*1.02+2,top:prop.r*.9+2,bottom:prop.r*.96+2,shadowWidth:prop.r*.85,shadowLength:prop.r*.35,shadowOffset:prop.r*.13});
  const r=prop.r,top=prop.variant==='pillar'?([3.05,3.75,2.6,3.35,2.05][prop.rockForm||0])*r:([1.42,.75,1.7,1.5,1.25][prop.rockForm||0])*r;
  // Move the oval toward the actual front footing and let taller boulders
  // project farther. Previously most of its short ellipse was hidden by the
  // stone body, leaving only a thin skirt regardless of the stone's height.
  const pillar=prop.variant==='pillar',height=top*(prop.variant==='slab'?.72:1);
  return Object.freeze({halfWidth:r*1.14,top:top+4,bottom:r*1.12,shadowWidth:r*.92,shadowLength:pillar?r*1.8:r*.75+height*.2,shadowOffset:pillar?r*.9:r*.48+height*.13});
}


export function groundOffset(entity,isPlayer=false) {
  if(Number.isFinite(entity?.groundOffset))return entity.groundOffset;
  if(isPlayer) return 19.8;
  const visual=enemyVisual(entity);
  const offset=visual?.foot??(entity.type==='trainingDummy'?18:0),radius=visual?.radius??(entity.type==='trainingDummy'?16:entity.r||1);
  return offset*(entity.r/radius);
}
function axis(o) {
  const length=o.type==='log'?o.halfLength:0,dx=Math.cos(o.angle||0)*length,dy=Math.sin(o.angle||0)*length;
  return {ax:o.x-dx,ay:o.y-dy,bx:o.x+dx,by:o.y+dy};
}
function pointOnSegment(x,y,ax,ay,bx,by) {
  const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?clamp(((x-ax)*dx+(y-ay)*dy)/l,0,1):0;
  return {x:ax+dx*t,y:ay+dy*t};
}
function pointDistanceSq(x,y,ax,ay,bx,by) {
  const q=pointOnSegment(x,y,ax,ay,bx,by);return (x-q.x)**2+(y-q.y)**2;
}
function segmentDistanceSq(ax,ay,bx,by,cx,cy,dx,dy) {
  const ux=bx-ax,uy=by-ay,vx=dx-cx,vy=dy-cy,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10) {
    const t=((cx-ax)*vy-(cy-ay)*vx)/den,s=((cx-ax)*uy-(cy-ay)*ux)/den;
    if(t>=0&&t<=1&&s>=0&&s<=1)return 0;
  }
  return Math.min(pointDistanceSq(ax,ay,cx,cy,dx,dy),pointDistanceSq(bx,by,cx,cy,dx,dy),pointDistanceSq(cx,cy,ax,ay,bx,by),pointDistanceSq(dx,dy,ax,ay,bx,by));
}
function obstacle(spec,index=0) {
  const o={id:spec.id??`fixed:${index}`,type:'rock',r:36,scale:1,seed:hash(index+37,19),angle:0,halfLength:0,...spec};
  if(o.type==='log'&&!spec.halfLength)o.halfLength=55;
  const a=axis(o);
  o.bounds=Object.freeze({minX:Math.min(a.ax,a.bx)-o.r,minY:Math.min(a.ay,a.by)-o.r,maxX:Math.max(a.ax,a.bx)+o.r,maxY:Math.max(a.ay,a.by)+o.r});
  o.sortY=spec.sortY??o.y;
  o.heightBand=obstacleHeight(o);
  return Object.freeze(o);
}

export class Terrain {
  constructor({obstacles,cacheLimit=192,region='forest',seed=0,island=null}={}) {
    this.world=worldForId(region);this.region=this.world.id;
    this.seed=Number.isFinite(seed)?Math.trunc(seed):0;
    this.cacheLimit=Math.max(16,Math.min(512,cacheLimit));this._cache=new Map();
    this._fixed=obstacles===undefined?null:obstacles.map((o,i)=>obstacle(o,i));
    this._structures=[];this._structureOwners=new Map();this.structureRevision=0;this.island=island;
    this._layoutIndex=new Map();
    const layout=island?.layout;
    this.rift=layout?.kind==='rift-forest'?new RiftCollision(layout):null;this._riftGates=new Map();
    const props=(layout?.obstacles||[]).map((o,i)=>obstacle({...o,visual:sceneryVisual(o)},i));
    if(this.rift)for(const [index,patch] of layout.patches.entries()){
      const minX=Math.min(...patch.points.map(p=>p.x)),maxX=Math.max(...patch.points.map(p=>p.x)),minY=Math.min(...patch.points.map(p=>p.y)),maxY=Math.max(...patch.points.map(p=>p.y)),placed=[];
      // A few small, separated trunks make sparse woodland readable while
      // preserving every authored road and landmark reservation.
      for(let attempt=0;attempt<120&&placed.length<5;attempt++){
        const x=minX+hash(index*131+attempt*17,this.seed+27)*(maxX-minX),y=minY+hash(index*73+attempt*31,this.seed+43)*(maxY-minY);
        if(!riftPointInPolygon({x,y},patch.points)||!this.rift.circleFree(x,y,55,'ground')||this.island.isReserved(x,y,26)||placed.some(p=>Math.hypot(x-p.x,y-p.y)<90))continue;
        const tree={id:`rift-sparse:${index}:${placed.length}`,type:'tree',x,y,r:12,scale:.72,treeForm:placed.length%4,seed:hash(index,attempt),riftPalette:true,layoutPatch:patch.id};
        placed.push(tree);props.push(obstacle({...tree,visual:sceneryVisual(tree)}));
      }
    }
    for(const water of this.rift?[]:layout?.lakes||[])if(water.deep)props.push(Object.freeze({id:water.id,type:'water',region:this.region,x:water.x,y:water.y,r:0,scale:1,seed:water.seed,sortY:water.y,heightBand:'low',visual:false,water,points:getWaterContours(water).outer,bounds:waterBounds(water)}));
    for(const prop of props)for(let x=Math.floor(prop.bounds.minX/CELL);x<=Math.floor(prop.bounds.maxX/CELL);x++)for(let y=Math.floor(prop.bounds.minY/CELL);y<=Math.floor(prop.bounds.maxY/CELL);y++){const key=`${x},${y}`;if(!this._layoutIndex.has(key))this._layoutIndex.set(key,[]);this._layoutIndex.get(key).push(prop);}
    for(const passage of layout?.passages||[])if(passage.gateId)this.setRiftGate(passage.gateId,false);
  }
  riftGateOpen(id){return this._riftGates.get(id)===true;}
  setRiftGate(id,open){
    const passage=this.island?.layout?.passages?.find(p=>p.gateId===id);if(!passage?.gate)return false;
    if(this._riftGates.has(id)&&this.riftGateOpen(id)===!!open)return true;
    this._riftGates.set(id,!!open);const gate=passage.gate,dx=gate.bx-gate.ax,dy=gate.by-gate.ay;
    this.setStructures(open?[]:[{id:`rift-gate:${id}`,type:'log',variant:'rift-gate',structureId:id,x:(gate.ax+gate.bx)/2,y:(gate.ay+gate.by)/2,halfLength:Math.hypot(dx,dy)/2,angle:Math.atan2(dy,dx),r:gate.r??16}],`rift-gate:${id}`);
    return true;
  }
  get cacheSize(){return this._cache.size;}
  // Each world system replaces only its own bounded collision layer. A gate
  // opening must never erase a neighboring hut or castle foundation.
  setStructures(obstacles=[],owner='default') {
    this.structureRevision++;
    const key=String(owner),layer=obstacles.slice(0,128).map((o,i)=>obstacle({...o,id:o.id??`structure:${key}:${i}`},i));
    if(layer.length)this._structureOwners.set(key,layer);else this._structureOwners.delete(key);
    this._structures=[...this._structureOwners.values()].flat();
    return this._structures;
  }
  _hash(x,y=0){const offset=this.world.terrain.hashOffset;return hash(x+this.seed*131+offset,y+this.seed*197+offset);}
  _worldCell(tx,ty){
    const key=`${tx},${ty}`,zone=biomeZone(this.region,(tx+.5)*CELL,(ty+.5)*CELL,this.seed),items=[];
    const hash=(x,y=0)=>this._hash(x,y),roll=n=>hash(tx+n*17+137,ty+n*31+251);
    const add=prop=>items.push(obstacle({...prop,visual:sceneryVisual(prop)}));
    const place=(type,variant,x,y,extra={})=>{
      const index=items.length,seed=roll(index+7),size=.8+roll(index+13)*.36;
      add({id:`${this.region}:${key}:${index}`,region:this.region,zone:zone.id,type,variant,x:tx*CELL+x,y:ty*CELL+y,r:type==='tree'?19*size:type==='rock'?34*size:18,scale:size,seed,angle:0,treeForm:index%5,rockForm:index%3,logForm:index%3,...extra});
    };
    if(this.rift){
      // Sparse interior scenery supplies familiar depth without defining the
      // impassable forests. Their continuous outlines own all large barriers.
      for(let i=0;i<3;i++){
        const x=(tx+roll(i+21))*CELL,y=(ty+roll(i+31))*CELL;
        if(!this.rift.circleFree(x,y,80,'ground')||this.island.isReserved(x,y,50))continue;
        place(i===2?'rock':'tree',i===2?'world-rock':undefined,x-tx*CELL,y-ty*CELL,{r:i===2?24:18,scale:i===2?.8:.78,riftPalette:true});
      }
      return items;
    }
    this.world.terrain.generate({tx,ty,key,region:this.region,hash,roll,zone,add,place,treeProfiles:TREE_PROFILES,cell:CELL,settings:this.world.terrain});
    if(this.island?.layout){
      // Sparse legacy scenery does not compete with the contiguous woodland
      // lattice. Keeping one owner avoids overlapping arbitrary trunks.
      for(let i=items.length-1;i>=0;i--)if(this.island.layout.patches.some(p=>p.kind==='forest'&&patchContains(p,items[i].x,items[i].y, -100)))items.splice(i,1);
      layoutTerrainCell({layout:this.island.layout,tx,ty,cell:CELL,region:this.region,seed:this.seed,add});
    }
    return items;
  }
  _cell(tx,ty) {
    const key=`${tx},${ty}`;
    if(this._cache.has(key)){const value=this._cache.get(key);this._cache.delete(key);this._cache.set(key,value);return value;}
    const items=this._worldCell(tx,ty);
    const clear=items.filter(o=>{
      const q=this.closestPoint(o,0,0);if(Math.hypot(q.x,q.y)<=190+o.r)return false;
      if(!this.island)return true;
      // Reserve roots, the stone base and the full rotated log body. Raised
      // branches may overhang a shore; their artwork does not block the route.
      const footprint=groundFootprint(o),kind=o.type==='tree'?'vegetation':o.type==='log'?'debris':'stone';
      return surfaceAllows(this.island,kind,footprint)&&!this.island.isReservedCapsule(footprint.ax,footprint.ay,footprint.bx,footprint.by,footprint.r)&&!layoutWet(this.island.layout,footprint.ax,footprint.ay,footprint.bx,footprint.by,footprint.r+8)&&!(this.island.layout?.obstacles||[]).some(p=>{const a=axis(p);return segmentDistanceSq(footprint.ax,footprint.ay,footprint.bx,footprint.by,a.ax,a.ay,a.bx,a.by)<(footprint.r+p.r+16)**2;});
    });
    this._cache.set(key,clear);
    while(this._cache.size>this.cacheLimit)this._cache.delete(this._cache.keys().next().value);
    return clear;
  }
  query(minX,minY,maxX,maxY) {
    const intersects=o=>o.bounds.maxX>=minX&&o.bounds.minX<=maxX&&o.bounds.maxY>=minY&&o.bounds.minY<=maxY;
    if(this._fixed)return [...this._fixed.filter(intersects),...this._structures.filter(intersects)];
    const result=this._structures.filter(intersects);
    const seen=new Set();for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++)for(let y=Math.floor(minY/CELL);y<=Math.floor(maxY/CELL);y++)for(const o of this._layoutIndex.get(`${x},${y}`)||[])if(!seen.has(o.id)&&intersects(o)){seen.add(o.id);result.push(o);}
    // A neighboring cell can own a long prop that crosses a query edge.
    for(let tx=Math.floor((minX-110)/CELL);tx<=Math.floor((maxX+110)/CELL);tx++)
      for(let ty=Math.floor((minY-110)/CELL);ty<=Math.floor((maxY+110)/CELL);ty++)
        for(const o of this._cell(tx,ty))if(intersects(o))result.push(o);
    return result;
  }
  closestPoint(o,x,y) {
    if(o.water){let best=null,distance=Infinity;for(let i=0;i<o.points.length;i++){const a=o.points[i],b=o.points[(i+1)%o.points.length],q=pointOnSegment(x,y,a.x,a.y,b.x,b.y),d=(q.x-x)**2+(q.y-y)**2;if(d<distance){const length=Math.hypot(b.x-a.x,b.y-a.y);distance=d;best={...q,nx:(b.y-a.y)/length,ny:-(b.x-a.x)/length};}}return best;}
    const a=axis(o);return pointOnSegment(x,y,a.ax,a.ay,a.bx,a.by);
  }
  isDry(x,y,r=0) {return !this.island||this.island.isDry(x,y,r);}
  isNaturalFree(x,y,r=0) {return (!this.island||this.island.naturalCircleFree(x,y,r))&&this.isFree(x,y,r);}
  isFree(x,y,r=0,profile='ground') {
    if(this.island&&!this.island.contains(x,y,r)||this.rift&&!this.rift.circleFree(x,y,r,profile))return false;
    return !this.query(x-r,y-r,x+r,y+r).some(o=>{if(!blocksObstacle(o,profile))return false;if(o.water)return waterIntersectsCircle(o.water,x,y,Math.max(0,r-.001));const q=this.closestPoint(o,x,y);return (x-q.x)**2+(y-q.y)**2<(r+o.r-.001)**2;});
  }
  _resolve(x,y,r,items,fromX=x,fromY=y) {
    let blocked=false;
    for(let pass=0;pass<6;pass++) {
      let hit=false;
      for(const o of items) {
        if(o.water){if(!waterIntersectsCircle(o.water,x,y,r))continue;const q=this.closestPoint(o,x,y),inside=containsWater(o.water,x,y),dx=x-q.x,dy=y-q.y,d=Math.hypot(dx,dy),nx=!inside&&d>1e-8?dx/d:q.nx,ny=!inside&&d>1e-8?dy/d:q.ny;x=q.x+nx*(r+EPS);y=q.y+ny*(r+EPS);blocked=hit=true;continue;}
        const q=this.closestPoint(o,x,y),dx=x-q.x,dy=y-q.y,d=Math.hypot(dx,dy),required=r+o.r;
        if(d>=required)continue;
        let nx,ny;
        if(d>1e-8){nx=dx/d;ny=dy/d;}
        else {
          const previous=this.closestPoint(o,fromX,fromY),px=fromX-previous.x,py=fromY-previous.y,pd=Math.hypot(px,py);
          if(pd>1e-8){nx=px/pd;ny=py/pd;}
          else{const a=o.type==='log'?o.angle+Math.PI/2:o.seed*TAU;nx=Math.cos(a);ny=Math.sin(a);}
        }
        x=q.x+nx*(required+EPS);y=q.y+ny*(required+EPS);blocked=hit=true;
      }
      if(!hit)break;
    }
    return {x,y,blocked};
  }
  resolveCircle(x,y,r,profile='ground') {
    if(this.isFree(x,y,r,profile))return {x,y,blocked:false};
    const originalX=x,originalY=y;let blocked=false;
    if(this.rift){const boundary=this.rift.constrain(x,y,r,profile);x=boundary.x;y=boundary.y;blocked=boundary.blocked;}
    if(this.island){const coast=this.island.constrain(x,y,r);x=coast.x;y=coast.y;blocked||=coast.blocked;}
    for(let pass=0;pass<8;pass++) {
      const resolved=this._resolve(x,y,r,this.query(x-r-110,y-r-110,x+r+110,y+r+110).filter(o=>blocksObstacle(o,profile)));
      x=resolved.x;y=resolved.y;blocked||=resolved.blocked;
      if(this.rift){const boundary=this.rift.constrain(x,y,r,profile);x=boundary.x;y=boundary.y;blocked||=boundary.blocked;}
      if(this.island){const coast=this.island.constrain(x,y,r);x=coast.x;y=coast.y;blocked||=coast.blocked;}
      if(this.isFree(x,y,r,profile))return {x,y,blocked};
    }
    // Only relevant to overlapping injected obstacles; procedural props are sparse.
    for(let radius=24;radius<=1024;radius+=24)for(let i=0;i<24;i++){
      const a=i*TAU/24,nx=originalX+Math.cos(a)*radius,ny=originalY+Math.sin(a)*radius;
      if(this.isFree(nx,ny,r,profile))return {x:nx,y:ny,blocked:true};
    }
    return {x,y,blocked};
  }
  moveCircle(x,y,dx,dy,r,profile='ground') {
    const start=this.resolveCircle(x,y,r,profile);x=start.x;y=start.y;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.max(3,Math.min(6,r*.45))));
    const sx=dx/steps,sy=dy/steps;let blocked=start.blocked;
    const items=this.query(Math.min(x,x+dx)-r-110,Math.min(y,y+dy)-r-110,Math.max(x,x+dx)+r+110,Math.max(y,y+dy)+r+110).filter(o=>blocksObstacle(o,profile));
    if(!items.length&&(!this.rift||!this.rift.firstBlocker(x,y,x+dx,y+dy,r,profile))&&(!this.island||this.island.containsCapsule(x,y,x+dx,y+dy,r)))return {x:x+dx,y:y+dy,blocked};
    for(let i=0;i<steps;i++) {
      let next=this._resolve(x+sx,y+sy,r,items,x,y);blocked||=next.blocked;
      if(this.rift){next=this.rift.step(x,y,next.x,next.y,r,profile);blocked||=next.blocked;}
      if(this.island){const coast=this.island.constrain(next.x,next.y,r);blocked||=coast.blocked;next=coast;}
      if(!items.some(o=>{if(o.water)return waterIntersectsCircle(o.water,next.x,next.y,Math.max(0,r-.001));const q=this.closestPoint(o,next.x,next.y);return Math.hypot(next.x-q.x,next.y-q.y)<r+o.r-.001;})){x=next.x;y=next.y;}
      else blocked=true;
    }
    return {x,y,blocked};
  }
  firstBlocker(x1,y1,x2,y2,r=0,profile='ground') {
    let found=this.rift?.firstBlocker(x1,y1,x2,y2,r,profile)??null,best=Infinity;const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy||1;
    if(found){const q=this.closestPoint(found,x1,y1);best=clamp(((q.x-x1)*dx+(q.y-y1)*dy)/length,0,1);}
    for(const o of this.query(Math.min(x1,x2)-r,Math.min(y1,y2)-r,Math.max(x1,x2)+r,Math.max(y1,y2)+r)) {
      if(!blocksObstacle(o,profile))continue;
      if(o.water){if(waterIntersectsCapsule(o.water,x1,y1,x2,y2,r)){const q=this.closestPoint(o,x1,y1),t=clamp(((q.x-x1)*dx+(q.y-y1)*dy)/length,0,1);if(t<best){best=t;found=o;}}continue;}
      const a=axis(o),rr=r+o.r;
      if(segmentDistanceSq(x1,y1,x2,y2,a.ax,a.ay,a.bx,a.by)<rr*rr) {
        const t=clamp(((o.x-x1)*dx+(o.y-y1)*dy)/length,0,1);
        if(t<best){best=t;found=o;}
      }
    }
    return found;
  }
}
