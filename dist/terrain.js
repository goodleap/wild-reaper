import { groundFootprint, surfaceAllows } from './placement-rules.js';
import { blocksObstacle, obstacleHeight } from './height-rules.js';
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
  if(!prop||prop.rockForm!==3||prop.variant==='pillar'||!Number.isFinite(prop.r)||prop.r<=0)return null;
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
    const p=(prop.variant==='dead-tree'?DEAD_TREE_PROFILES:TREE_PROFILES)[prop.treeForm||0],cw=prop.crownWidth||1,ch=prop.crownHeight||1;
    return Object.freeze({halfWidth:(Math.abs(p.x)+p.rx*cw+8)*s,top:Math.max(140*(prop.treeForm===4?1:0),-p.y+p.ry*ch+7)*s,bottom:24*s,canopyX:p.x*s,canopyY:p.y*s,canopyRx:(p.rx*cw+4)*s,canopyRy:(p.ry*ch+3)*s,shadowWidth:(p.rx*.62)*s,shadowLength:Math.max(32,(-p.y+p.ry)*.42)*s});
  }
  if(prop.type==='log')return Object.freeze({halfWidth:Math.abs(Math.cos(prop.angle||0))*(prop.halfLength+prop.r)+28,top:Math.abs(Math.sin(prop.angle||0))*(prop.halfLength+prop.r)+28,bottom:Math.abs(Math.sin(prop.angle||0))*(prop.halfLength+prop.r)+28,shadowWidth:prop.r,shadowLength:prop.r*1.7});
  if(prop.rockForm===3&&prop.variant!=='pillar')return Object.freeze({halfWidth:prop.r*1.02+2,top:prop.r*.9+2,bottom:prop.r*.96+2,shadowWidth:prop.r*.85,shadowLength:prop.r*.35,shadowOffset:prop.r*.13});
  const r=prop.r,top=prop.variant==='pillar'?([3.05,3.75,2.6,3.35,2.05][prop.rockForm||0])*r:([1.42,.75,1.7,1.5,1.25][prop.rockForm||0])*r;
  // Move the oval toward the actual front footing and let taller boulders
  // project farther. Previously most of its short ellipse was hidden by the
  // stone body, leaving only a thin skirt regardless of the stone's height.
  const pillar=prop.variant==='pillar',height=top*(prop.variant==='slab'?.72:1);
  return Object.freeze({halfWidth:r*1.14,top:top+4,bottom:r*1.12,shadowWidth:r*.92,shadowLength:pillar?r*1.8:r*.75+height*.2,shadowOffset:pillar?r*.9:r*.48+height*.13});
}


export function groundOffset(entity,isPlayer=false) {
  if(isPlayer) return 19.8;
  const offsets={slime:[14,16],bat:[20,11],beetle:[18,18],brute:[23,26],boar:[20,22],spore:[18,20],boss:[41,49],trainingDummy:[18,16]};
  const [offset,radius]=offsets[entity.type]||[0,entity.r||1];
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
    this.region=['forest','marsh','ruins'].includes(region)?region:'forest';
    this.seed=Number.isFinite(seed)?Math.trunc(seed):0;
    this.cacheLimit=Math.max(16,Math.min(512,cacheLimit));this._cache=new Map();
    this._fixed=obstacles===undefined?null:obstacles.map((o,i)=>obstacle(o,i));
    this._structures=[];this._structureOwners=new Map();this.island=island;
  }
  get cacheSize(){return this._cache.size;}
  // Each world system replaces only its own bounded collision layer. A gate
  // opening must never erase a neighboring hut or castle foundation.
  setStructures(obstacles=[],owner='default') {
    const key=String(owner),layer=obstacles.slice(0,128).map((o,i)=>obstacle({...o,id:o.id??`structure:${key}:${i}`},i));
    if(layer.length)this._structureOwners.set(key,layer);else this._structureOwners.delete(key);
    this._structures=[...this._structureOwners.values()].flat();
    return this._structures;
  }
  _hash(x,y=0){const offset=this.region==='marsh'?419:this.region==='ruins'?811:0;return hash(x+this.seed*131+offset,y+this.seed*197+offset);}
  _cell(tx,ty) {
    const key=`${tx},${ty}`;
    if(this._cache.has(key)){const value=this._cache.get(key);this._cache.delete(key);this._cache.set(key,value);return value;}
    const items=[],n=this._hash(tx+31,ty+17),marsh=this.region==='marsh',ruins=this.region==='ruins';
    if(n>.62){
      const size=this._hash(tx+91,ty+43),scale=size<.86?.70+size*.64:1.28+(size-.86)/.14*.22;
      const treeForm=Math.floor(this._hash(tx+57,ty+101)*5),crownWidth=.93+this._hash(tx+37,ty+89)*.14,crownHeight=.96+this._hash(tx+13,ty+109)*.08;
      const visual=ruins?{region:this.region,variant:'pillar'}:marsh?{region:this.region,variant:'dead-tree'}:{};
      const prop={id:`${ruins?'pillar':'tree'}:${key}`,type:ruins?'rock':'tree',x:tx*CELL+110,y:ty*CELL+50,r:24*scale*(ruins?1:TREE_PROFILES[treeForm].trunkWidth),scale,seed:n,treeForm,rockForm:treeForm,crownWidth,crownHeight,...visual};
      items.push(obstacle({...prop,visual:sceneryVisual(prop)}));
    }
    // Keep the two occupied quarters and boss-width passages. Sizes vary by
    // an independent seed, so shape, location and growth do not repeat together.
    const x=tx*CELL+240+this._hash(tx+71,ty+13)*90,y=ty*CELL+245+this._hash(tx+19,ty+81)*85,seed=this._hash(tx+41,ty+63),size=this._hash(tx+113,ty+59);
    if(seed>.49){
      const visual=ruins?{region:this.region,variant:'wall'}:marsh?{region:this.region,variant:'sunken-log'}:{};
      const prop={id:`log:${key}`,type:'log',x,y,r:12+size*10,halfLength:35+size*43,angle:this._hash(tx+83,ty+23)*TAU,scale:1,seed,logForm:Math.floor(this._hash(tx+59,ty+29)*3),...visual};
      items.push(obstacle({...prop,visual:sceneryVisual(prop)}));
    }else{
      const scale=size<.9?.60+size*.91:1.45+(size-.9)*3.5,r=36*scale,rockForm=Math.floor(this._hash(tx+97,ty+137)*5),visual=ruins?{region:this.region,variant:'slab'}:marsh?{region:this.region,variant:'moss-rock'}:{};
      const prop={id:`rock:${key}`,type:'rock',x,y,r,scale,seed,rockForm,...visual};
      items.push(obstacle({...prop,visual:sceneryVisual(prop)}));
    }
    const clear=items.filter(o=>{
      const q=this.closestPoint(o,0,0);if(Math.hypot(q.x,q.y)<=190+o.r)return false;
      if(!this.island)return true;
      // Reserve roots, the stone base and the full rotated log body. Raised
      // branches may overhang a shore; their artwork does not block the route.
      const footprint=groundFootprint(o),kind=o.type==='tree'?'vegetation':o.type==='log'?'debris':'stone';
      return surfaceAllows(this.island,kind,footprint)&&!this.island.isReservedCapsule(footprint.ax,footprint.ay,footprint.bx,footprint.by,footprint.r);
    });
    this._cache.set(key,clear);
    while(this._cache.size>this.cacheLimit)this._cache.delete(this._cache.keys().next().value);
    return clear;
  }
  query(minX,minY,maxX,maxY) {
    const intersects=o=>o.bounds.maxX>=minX&&o.bounds.minX<=maxX&&o.bounds.maxY>=minY&&o.bounds.minY<=maxY;
    if(this._fixed)return [...this._fixed.filter(intersects),...this._structures.filter(intersects)];
    const result=this._structures.filter(intersects);
    // A neighboring cell can own a long prop that crosses a query edge.
    for(let tx=Math.floor((minX-110)/CELL);tx<=Math.floor((maxX+110)/CELL);tx++)
      for(let ty=Math.floor((minY-110)/CELL);ty<=Math.floor((maxY+110)/CELL);ty++)
        for(const o of this._cell(tx,ty))if(intersects(o))result.push(o);
    return result;
  }
  closestPoint(o,x,y) {const a=axis(o);return pointOnSegment(x,y,a.ax,a.ay,a.bx,a.by);}
  isDry(x,y,r=0) {return !this.island||this.island.isDry(x,y,r);}
  isNaturalFree(x,y,r=0) {return (!this.island||this.island.naturalCircleFree(x,y,r))&&this.isFree(x,y,r);}
  isFree(x,y,r=0,profile='ground') {
    if(this.island&&!this.island.contains(x,y,r))return false;
    return !this.query(x-r,y-r,x+r,y+r).some(o=>{if(!blocksObstacle(o,profile))return false;const q=this.closestPoint(o,x,y);return (x-q.x)**2+(y-q.y)**2<(r+o.r-.001)**2;});
  }
  _resolve(x,y,r,items,fromX=x,fromY=y) {
    let blocked=false;
    for(let pass=0;pass<6;pass++) {
      let hit=false;
      for(const o of items) {
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
    if(this.island){const coast=this.island.constrain(x,y,r);x=coast.x;y=coast.y;blocked=coast.blocked;}
    for(let pass=0;pass<8;pass++) {
      const resolved=this._resolve(x,y,r,this.query(x-r-110,y-r-110,x+r+110,y+r+110).filter(o=>blocksObstacle(o,profile)));
      x=resolved.x;y=resolved.y;blocked||=resolved.blocked;
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
    if(!items.length&&(!this.island||this.island.containsCapsule(x,y,x+dx,y+dy,r)))return {x:x+dx,y:y+dy,blocked};
    for(let i=0;i<steps;i++) {
      let next=this._resolve(x+sx,y+sy,r,items,x,y);blocked||=next.blocked;
      if(this.island){const coast=this.island.constrain(next.x,next.y,r);blocked||=coast.blocked;next=coast;}
      if(!items.some(o=>{const q=this.closestPoint(o,next.x,next.y);return Math.hypot(next.x-q.x,next.y-q.y)<r+o.r-.001;})){x=next.x;y=next.y;}
      else blocked=true;
    }
    return {x,y,blocked};
  }
  firstBlocker(x1,y1,x2,y2,r=0,profile='ground') {
    let found=null,best=Infinity;const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy||1;
    for(const o of this.query(Math.min(x1,x2)-r,Math.min(y1,y2)-r,Math.max(x1,x2)+r,Math.max(y1,y2)+r)) {
      if(!blocksObstacle(o,profile))continue;
      const a=axis(o),rr=r+o.r;
      if(segmentDistanceSq(x1,y1,x2,y2,a.ax,a.ay,a.bx,a.by)<rr*rr) {
        const t=clamp(((o.x-x1)*dx+(o.y-y1)*dy)/length,0,1);
        if(t<best){best=t;found=o;}
      }
    }
    return found;
  }
}
