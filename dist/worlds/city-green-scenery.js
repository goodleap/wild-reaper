import { RiftCollision, riftPointInPolygon } from '../rift-collision.js';
import { CITY_SAMPLE_BOUNDS, CITY_SAMPLE_HOUSES } from './city-sample-scene.js';

// Whole trees join the normal depth queue. Their roots stay in existing solid
// land; vegetation does not create obstacles or alter an authored contour.
export const CITY_GREEN_SCENERY_LIMIT=4096;
const EMPTY=Object.freeze([]),cache=new WeakMap(),CELL=192,STEP=104;
const urban={minX:-5400,minY:-4900,maxX:5800,maxY:4100};
const hash=n=>{n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
const seed=(x,y)=>Math.imul(x,73856093)^Math.imul(y,19349663)^0x7a6c129d;
const box=(x,y,w,d)=>({minX:x-w/2,minY:y-d/2,maxX:x+w/2,maxY:y+d/2});
const overlaps=(a,b,pad=0)=>a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const contains=(b,x,y)=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY;
const within=(a,b)=>a.minX>=b.minX&&a.maxX<=b.maxX&&a.minY>=b.minY&&a.maxY<=b.maxY;
const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
function segmentInBox(a,b,r){
  let lo=0,hi=1;
  for(const[p,d,min,max]of[[a.x,b.x-a.x,r.minX,r.maxX],[a.y,b.y-a.y,r.minY,r.maxY]]){
    if(Math.abs(d)<1e-12){if(p<min||p>max)return false;continue;}
    const s=(min-p)/d,t=(max-p)/d;lo=Math.max(lo,Math.min(s,t));hi=Math.min(hi,Math.max(s,t));if(lo>hi)return false;
  }
  return true;
}
function blocked(mask,r){
  return !mask.inside((r.minX+r.maxX)/2,(r.minY+r.maxY)/2)&&!mask.query(r.minX,r.minY,r.maxX,r.maxY).some(e=>segmentInBox(e.a,e.b,r));
}
class RectIndex{
  constructor(){this.cells=new Map();}
  add(r){for(let x=Math.floor(r.minX/CELL);x<=Math.floor(r.maxX/CELL);x++)for(let y=Math.floor(r.minY/CELL);y<=Math.floor(r.maxY/CELL);y++){const k=`${x},${y}`;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(r);}}
  has(r,pad=0){for(let x=Math.floor((r.minX-pad)/CELL);x<=Math.floor((r.maxX+pad)/CELL);x++)for(let y=Math.floor((r.minY-pad)/CELL);y<=Math.floor((r.maxY+pad)/CELL);y++)for(const q of this.cells.get(`${x},${y}`)||[])if(overlaps(r,q,pad))return true;return false;}
}
function carrier(p){
  const long=Math.max(p.width,p.depth),short=Math.min(p.width,p.depth),square=long===short;
  return Object.freeze({...p,region:'clockshadow-city',variant:'city-native',type:square?'rock':'log',r:short/2,
    halfLength:square?0:(long-short)/2,angle:p.depth>p.width?Math.PI/2:0,scale:1,collision:false,
    heightBand:p.cityKind==='tree'?'high':'low',sortY:p.y+p.depth/2,cityGreen:true});
}

export function createCityGreenScenery(layout,occupiedProps=[]){
  if(layout?.worldId!=='clockshadow-city'||layout.artTheme!=='city')return EMPTY;
  if(cache.has(layout))return cache.get(layout);
  const collision=new RiftCollision(layout),occupied=new RectIndex(),props=[];
  for(const p of [...(layout.cityStructures||[]),...CITY_SAMPLE_HOUSES,...occupiedProps])occupied.add(box(p.x,p.y,p.width,p.depth));
  const gardens=(layout.areas||[]).filter(a=>['02','13','S1'].includes(a.id)).map(a=>{const b=bounds(a.points);return{id:a.id,minX:b.minX-260,minY:b.minY-260,maxX:b.maxX+260,maxY:b.maxY+260};});
  const lakes=(layout.lakes||[]).map(l=>({...l,bounds:bounds(l.points)}));
  const reservations=[{...layout.spawn,r:260},...Object.values(layout.plan||{}),...(layout.encounters||[]),
    ...(layout.interactions?.caves||[]).map(p=>({...p,r:145})),...(layout.interactions?.chests||[]).map(p=>({...p,r:110})),
    ...(layout.interactions?.gates||[]).map(p=>({...p.approach,r:160}))];
  const wet=r=>lakes.some(l=>overlaps(r,l.bounds)&&(
    riftPointInPolygon({x:(r.minX+r.maxX)/2,y:(r.minY+r.maxY)/2},l.points)||l.points.some((p,i)=>segmentInBox(p,l.points[(i+1)%l.points.length],r))));
  const safe=p=>{
    const r=box(p.x,p.y,p.width,p.depth),visual=box(p.x,p.y-65,p.cityKind==='tree'?190:75,p.cityKind==='tree'?205:90);
    if(!within(r,layout.bounds)||overlaps(visual,CITY_SAMPLE_BOUNDS)||occupied.has(r,19)||wet(r))return false;
    if(reservations.some(q=>{const dx=Math.max(r.minX-q.x,0,q.x-r.maxX),dy=Math.max(r.minY-q.y,0,q.y-r.maxY);return dx*dx+dy*dy<(q.r??130)**2;}))return false;
    return blocked(collision.ground,r)&&blocked(collision.high,r);
  };

  // Coarse groves change density, while jittered fine candidates avoid rows.
  // Hash ordering distributes the density cap across every side of the map.
  const candidates=[];
  for(let gy=Math.floor(layout.bounds.minY/STEP);gy<=Math.ceil(layout.bounds.maxY/STEP);gy++)for(let gx=Math.floor(layout.bounds.minX/STEP);gx<=Math.ceil(layout.bounds.maxX/STEP);gx++){
    const n=seed(gx,gy),x=gx*STEP+(hash(n+11)-.5)*86,y=gy*STEP+(hash(n+17)-.5)*86;
    const garden=gardens.find(g=>contains(g,x,y));if(contains(urban,x,y)&&!garden)continue;
    const grove=hash(seed(Math.floor(x/530),Math.floor(y/470))),density=grove<.2?.38:grove>.76?.94:.73;
    if(hash(n+23)>density)continue;
    const roll=hash(n+31),art=garden?.id==='02'?(roll<.78?'apple':'oak'):garden?.id==='13'?(roll<.7?'cypress':'oak'):garden?.id==='S1'?(roll<.64?'oak':'cypress'):(roll<.81?'oak':roll<.97?'cypress':'apple');
    const width=art==='oak'?34+hash(n+41)*9:art==='cypress'?32+hash(n+41)*8:38+hash(n+41)*9;
    const depth=26+hash(n+43)*10,height=art==='cypress'?145+hash(n+47)*25:art==='apple'?120+hash(n+47)*20:125+hash(n+47)*35;
    candidates.push({id:`city-green:${gx}:${gy}`,x:Math.round(x*100)/100,y:Math.round(y*100)/100,width,depth,height,
      cityArt:art,cityKind:'tree',seed:hash(n+53),style:Math.floor(hash(n+59)*6),area:garden?.id??'outer',order:hash(n+67)});
  }
  candidates.sort((a,b)=>a.order-b.order);
  for(const candidate of candidates){
    if(props.length>=CITY_GREEN_SCENERY_LIMIT)break;
    const{order,...p}=candidate;if(!safe(p))continue;
    props.push(carrier(p));occupied.add(box(p.x,p.y,p.width,p.depth));
  }
  const result=Object.freeze(props);cache.set(layout,result);return result;
}
