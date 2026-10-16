import { RiftCollision } from '../rift-collision.js';
import { CITY_SAMPLE_BOUNDS, CITY_SAMPLE_HOUSES } from './city-sample-scene.js';

// Raised city mass is placed once, in the already blocked part of the baked
// world. These records only index complete artwork in the usual depth queue;
// neither a new foundation nor a second collision shape is introduced.
export const CITY_BLOCK_SCENERY_LIMIT=1536;
const BUILDING_LIMIT=1280,FOLIAGE_LIMIT=256,CELL=256,EMPTY=Object.freeze([]);
const cache=new WeakMap();
const urban=Object.freeze({minX:-5400,minY:-4900,maxX:5800,maxY:4100});
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const identity=text=>[...String(text)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17);
const box=(x,y,width,depth)=>({minX:x-width/2,minY:y-depth/2,maxX:x+width/2,maxY:y+depth/2});
const overlap=(a,b,pad=0)=>a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const within=(a,b)=>a.minX>=b.minX&&a.maxX<=b.maxX&&a.minY>=b.minY&&a.maxY<=b.maxY;

// Segment/box clipping also detects an entire contour segment inside a box.
// Corner sampling alone could miss a narrow road crossing a large foundation.
function segmentInBox(a,b,r){
  let lo=0,hi=1;
  for(const [p,d,min,max]of [[a.x,b.x-a.x,r.minX,r.maxX],[a.y,b.y-a.y,r.minY,r.maxY]]){
    if(Math.abs(d)<1e-12){if(p<min||p>max)return false;continue;}
    const s=(min-p)/d,t=(max-p)/d;lo=Math.max(lo,Math.min(s,t));hi=Math.min(hi,Math.max(s,t));if(lo>hi)return false;
  }
  return true;
}
function blockedRectangle(mask,r){
  if(mask.inside((r.minX+r.maxX)/2,(r.minY+r.maxY)/2))return false;
  return !mask.query(r.minX,r.minY,r.maxX,r.maxY).some(edge=>segmentInBox(edge.a,edge.b,r));
}
class RectIndex{
  constructor(){this.cells=new Map();}
  add(rect){
    for(let gx=Math.floor(rect.minX/CELL);gx<=Math.floor(rect.maxX/CELL);gx++)for(let gy=Math.floor(rect.minY/CELL);gy<=Math.floor(rect.maxY/CELL);gy++){
      const key=`${gx},${gy}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(rect);
    }
  }
  overlaps(rect,pad=0){
    for(let gx=Math.floor((rect.minX-pad)/CELL);gx<=Math.floor((rect.maxX+pad)/CELL);gx++)for(let gy=Math.floor((rect.minY-pad)/CELL);gy<=Math.floor((rect.maxY+pad)/CELL);gy++)for(const other of this.cells.get(`${gx},${gy}`)||[])if(overlap(rect,other,pad))return true;
    return false;
  }
}
function visualBox(prop){
  if(prop.cityArt==='house'||prop.cityArt==='ruin')return {minX:prop.x-138,minY:prop.y-212,maxX:prop.x+138,maxY:prop.y+72};
  if(prop.cityArt==='oak'||prop.cityArt==='cypress')return {minX:prop.x-70,minY:prop.y-160,maxX:prop.x+70,maxY:prop.y+35};
  return {minX:prop.x-30,minY:prop.y-45,maxX:prop.x+30,maxY:prop.y+15};
}
function carrier(prop){
  const long=Math.max(prop.width,prop.depth),short=Math.min(prop.width,prop.depth),square=long===short;
  return Object.freeze({...prop,region:'clockshadow-city',variant:'city-native',
    type:square?'rock':'log',r:short/2,halfLength:square?0:(long-short)/2,angle:prop.depth>prop.width?Math.PI/2:0,
    collision:false,scale:1,heightBand:prop.cityArt==='shrub'?'low':'high',sortY:prop.y+prop.depth/2,cityBlock:true});
}

export function createCityBlockScenery(layout){
  if(layout?.worldId!=='clockshadow-city'||layout.artTheme!=='city')return EMPTY;
  if(cache.has(layout))return cache.get(layout);
  const collision=new RiftCollision(layout),occupied=new RectIndex(),props=[];
  for(const s of [...layout.cityStructures,...CITY_SAMPLE_HOUSES])occupied.add(box(s.x,s.y,s.width,s.depth));
  const reservations=[{...layout.spawn,r:260},...Object.values(layout.plan||{}),...(layout.encounters||[]),
    ...(layout.interactions?.caves||[]).map(p=>({...p,r:120})),...(layout.interactions?.chests||[]).map(p=>({...p,r:90}))];
  const routes=layout.passages.flatMap(p=>p.waypoints.slice(1).map((b,i)=>({a:p.waypoints[i],b,r:p.width/2+6})));
  const district=p=>layout.areas.reduce((best,a)=>(a.center.x-p.x)**2+(a.center.y-p.y)**2<(best.center.x-p.x)**2+(best.center.y-p.y)**2?a:best,layout.areas[0]);
  function safe(p){
    const rect=box(p.x,p.y,p.width,p.depth);
    if(!within(rect,urban)||!within(rect,layout.bounds)||overlap(visualBox(p),CITY_SAMPLE_BOUNDS)||occupied.overlaps(rect,14))return false;
    if(reservations.some(q=>{const dx=Math.max(rect.minX-q.x,0,q.x-rect.maxX),dy=Math.max(rect.minY-q.y,0,q.y-rect.maxY);return dx*dx+dy*dy<(q.r??100)**2;}))return false;
    // Keep even the reserved painted approach width clear. The expanded box
    // is conservative around diagonal trails and exact on ordinary city lanes.
    if(routes.some(q=>segmentInBox(q.a,q.b,{minX:rect.minX-q.r,minY:rect.minY-q.r,maxX:rect.maxX+q.r,maxY:rect.maxY+q.r})))return false;
    return blockedRectangle(collision.ground,rect)&&blockedRectangle(collision.high,rect);
  }
  function add(p){
    if(props.length>=CITY_BLOCK_SCENERY_LIMIT||!safe(p))return false;
    props.push(carrier(p));occupied.add(box(p.x,p.y,p.width,p.depth));return true;
  }
  function building(id,x,y,placement){
    const seed=identity(id),area=district({x,y}),ruined=['06','09','11','16'].includes(area.id)?hash(seed+3)<.34:hash(seed+3)<.14;
    return {id,x:Math.round(x*100)/100,y:Math.round(y*100)/100,width:210,depth:100,height:160,
      cityArt:ruined?'ruin':'house',cityKind:ruined?'ruin':'house',style:Math.floor(hash(seed+5)*6),seed:hash(seed+7),area:area.id,cityBlockPlacement:placement};
  }

  // Street fronts follow the true contour rather than a screen-space grid.
  // The inward normal belongs to walkable land, so its opposite side holds
  // the complete house. Southern buildings stand farther back: their raised
  // roofs can overhang the edge without covering a whole narrow street.
  const fronts=[];
  for(const [i,edge]of collision.high.edges.entries()){
    const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy),step=Math.abs(dy)>Math.abs(dx)?196:260;
    if(length<128)continue;
    const seed=identity(`edge:${i}`),start=step*.42+hash(seed)*step*.18;
    for(let along=start,j=0;along<length-36&&fronts.length<4096;along+=step,j++){
      const support=Math.abs(edge.nx)*105+Math.abs(edge.ny)*50+9,setback=edge.ny<-.2?Math.max(support,150*-edge.ny):support;
      fronts.push(building(`city-block:front:${i}:${j}`,edge.a.x+dx*along/length-edge.nx*setback,edge.a.y+dy*along/length-edge.ny*setback,'front'));
    }
  }
  fronts.sort((a,b)=>identity(a.id)-identity(b.id));
  let buildings=0;
  for(const p of fronts)if(buildings<BUILDING_LIMIT&&add(p))buildings++;

  // District rows use different phases, occasional courts and broken plots.
  // Their deterministic order spreads any bounded-density cutoff over the
  // whole world instead of filling only its northernmost half.
  const interior=[];
  for(let gy=Math.floor(urban.minY/184);gy<=Math.ceil(urban.maxY/184);gy++)for(let gx=Math.floor(urban.minX/252);gx<=Math.ceil(urban.maxX/252);gx++){
    const seed=identity(`lot:${gx}:${gy}`),area=district({x:gx*252,y:gy*184});
    if(hash(seed+17)<(['04','05','11'].includes(area.id)?.14:.06))continue;
    const phase=(Number(area.id.replace(/\D/g,''))%3)*23,stagger=(gy%2?126:0)*(area.id==='07'?.4:1);
    interior.push(building(`city-block:lot:${gx}:${gy}`,gx*252+stagger+phase+(hash(seed+9)-.5)*18,gy*184+(hash(seed+11)-.5)*20,'interior'));
  }
  interior.sort((a,b)=>hash(identity(a.id)+29)-hash(identity(b.id)+29));
  for(const p of interior)if(buildings<BUILDING_LIMIT&&add(p))buildings++;

  // Small plants fill selected unused blocked pockets, especially beside
  // gardens and ruined courts. Their own complete root rectangles are checked
  // exactly too; no walk-through tree trunk is placed on playable ground.
  let foliage=0;const growth=[];
  for(let gy=Math.floor(urban.minY/144);gy<=Math.ceil(urban.maxY/144);gy++)for(let gx=Math.floor(urban.minX/180);gx<=Math.ceil(urban.maxX/180);gx++){
    const seed=identity(`plant:${gx}:${gy}`);if(hash(seed+5)<.48)continue;
    const x=gx*180+(hash(seed+7)-.5)*80,y=gy*144+(hash(seed+9)-.5)*60,area=district({x,y}),tree=['02','13'].includes(area.id)&&hash(seed+11)>.55;
    const p={id:`city-block:growth:${gx}:${gy}`,x:Math.round(x*100)/100,y:Math.round(y*100)/100,
      width:tree?76:44,depth:tree?60:16,height:tree?140:32,cityArt:tree?(hash(seed+13)>.5?'oak':'cypress'):'shrub',cityKind:tree?'tree':'foliage',
      style:Math.floor(hash(seed+15)*6),seed:hash(seed+17),area:area.id,cityBlockPlacement:'growth'};
    growth.push(p);
  }
  growth.sort((a,b)=>hash(identity(a.id)+31)-hash(identity(b.id)+31));
  for(const p of growth)if(foliage<FOLIAGE_LIMIT&&add(p))foliage++;
  const result=Object.freeze(props);cache.set(layout,result);return result;
}
