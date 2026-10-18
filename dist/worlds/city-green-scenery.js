import { RiftCollision, riftPointInPolygon } from '../rift-collision.js';

// Complete rooted silhouettes dress the baked contour. Their ground contact
// stays in blocked land; this layer never adds another collision surface.
export const CITY_GREEN_SCENERY_LIMIT=4600;
const EMPTY=Object.freeze([]),cache=new WeakMap(),CELL=192;
const greenAreas=new Set(['01','02','13','S1']);
const hash=n=>{n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
const seed=(x,y)=>Math.imul(x,73856093)^Math.imul(y,19349663)^0x7a6c129d;
const box=(x,y,w,d)=>({minX:x-w/2,minY:y-d/2,maxX:x+w/2,maxY:y+d/2});
const overlaps=(a,b,pad=0)=>a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
function segmentInBox(a,b,r){let lo=0,hi=1;for(const[p,d,min,max]of[[a.x,b.x-a.x,r.minX,r.maxX],[a.y,b.y-a.y,r.minY,r.maxY]]){if(Math.abs(d)<1e-12){if(p<min||p>max)return false;continue;}const s=(min-p)/d,t=(max-p)/d;lo=Math.max(lo,Math.min(s,t));hi=Math.min(hi,Math.max(s,t));if(lo>hi)return false;}return true;}
function blocked(mask,r){return !mask.inside((r.minX+r.maxX)/2,(r.minY+r.maxY)/2)&&!mask.query(r.minX,r.minY,r.maxX,r.maxY).some(e=>segmentInBox(e.a,e.b,r));}
class RectIndex{
  constructor(){this.cells=new Map();}
  add(r){for(let x=Math.floor(r.minX/CELL);x<=Math.floor(r.maxX/CELL);x++)for(let y=Math.floor(r.minY/CELL);y<=Math.floor(r.maxY/CELL);y++){const k=`${x},${y}`;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(r);}}
  has(r,pad=0){for(let x=Math.floor((r.minX-pad)/CELL);x<=Math.floor((r.maxX+pad)/CELL);x++)for(let y=Math.floor((r.minY-pad)/CELL);y<=Math.floor((r.maxY+pad)/CELL);y++)for(const q of this.cells.get(`${x},${y}`)||[])if(overlaps(r,q,pad))return true;return false;}
}
export function createCityGreenScenery(layout,occupiedProps=[]){
  if(layout?.worldId!=='clockshadow-city'||layout.artTheme!=='city')return EMPTY;
  if(cache.has(layout))return cache.get(layout);
  const collision=new RiftCollision(layout),occupied=new RectIndex(),props=[],candidates=[],b=layout.bounds;
  for(const p of [...(layout.cityStructures||[]),...occupiedProps])occupied.add(box(p.x,p.y,p.width??p.r*2,p.depth??p.r*2));
  const reservations=[{...layout.spawn,r:260},...Object.values(layout.plan||{}),...(layout.encounters||[]),...(layout.interactions?.caves||[]).map(p=>({...p,r:145})),...(layout.interactions?.chests||[]).map(p=>({...p,r:110})),...(layout.interactions?.gates||[]).map(p=>({...p.approach,r:160}))];
  const district=(x,y)=>layout.areas.reduce((best,a)=>(a.center.x-x)**2+(a.center.y-y)**2<(best.center.x-x)**2+(best.center.y-y)**2?a:best,layout.areas[0]);
  function candidate(id,x,y,n,edge=false){
    const area=district(x,y),garden=greenAreas.has(area.id)||x<-5400||x>5800||y<-4900||y>4100,roll=hash(n+31);
    const kind=garden?(roll<.5?'tree':roll<.88?'shrub':'rock'):(roll<.8?'shrub':'rock'),scale=kind==='tree'?.76+hash(n+47)*.28:kind==='shrub'?.51+hash(n+47)*.34:1;
    const r=kind==='tree'?12:kind==='shrub'?12:20+hash(n+41)*15;
    candidates.push({id,x:Math.round(x*100)/100,y:Math.round(y*100)/100,type:kind==='rock'?'rock':'tree',cityKind:kind,cityGreen:true,cityEdge:edge,riftPalette:true,
      r,width:r*2,depth:r*2,height:kind==='tree'?125*scale:kind==='shrub'?45*scale:50,scale,seed:hash(n+53),treeForm:Math.floor(hash(n+59)*5),rockForm:[0,1,2,4][Math.floor(hash(n+61)*4)],
      ...(kind==='shrub'?{riftShrub:true}:{}),collision:false,heightBand:kind==='tree'?'high':'low',area:area.id,order:(edge?0:1)+hash(n+67)});
  }
  // A close low tier and a staggered tall tier follow the contour, including
  // the inside of turns. Jitter is seeded once, so loading order cannot shift it.
  for(const [i,e]of collision.high.edges.entries()){
    const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,length=Math.hypot(dx,dy);if(length<35)continue;
    for(let d=24,j=0;d<length;d+=69+hash(seed(i,j))*24,j++){
      const n=seed(i,j),offset=25+hash(n+11)*24,x=e.a.x+dx*d/length-e.nx*offset,y=e.a.y+dy*d/length-e.ny*offset;
      candidate(`city-green:rim:${i}:${j}`,x,y,n,true);
      if(hash(n+7)>.63)candidate(`city-green:back:${i}:${j}`,x-e.nx*86+dx/length*33,y-e.ny*86+dy/length*33,n+389,true);
    }
  }
  for(let gy=Math.floor(b.minY/154);gy<=Math.ceil(b.maxY/154);gy++)for(let gx=Math.floor(b.minX/169);gx<=Math.ceil(b.maxX/169);gx++){
    const n=seed(gx,gy),x=gx*169+(hash(n+11)-.5)*103,y=gy*154+(hash(n+17)-.5)*97,area=district(x,y);
    if(!greenAreas.has(area.id)&&x>-5400&&x<5800&&y>-4900&&y<4100||hash(n+23)>.54)continue;
    candidate(`city-green:grove:${gx}:${gy}`,x,y,n);
  }
  // Small authored garden islands can consist entirely of short curved
  // edges. Seed their interior as a group as well, so a real collision island
  // cannot become an invisible empty lawn when the rim sampling misses it.
  for(const [i,ring]of (layout.solidBoundaries||[]).entries()){
    if(!ring.hole)continue;const xs=ring.points.map(p=>p.x),ys=ring.points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    if(maxX-minX>650||maxY-minY>650||!greenAreas.has(district((minX+maxX)/2,(minY+maxY)/2).id))continue;
    for(let gy=Math.ceil(minY/55);gy<=Math.floor(maxY/55);gy++)for(let gx=Math.ceil(minX/57);gx<=Math.floor(maxX/57);gx++){
      const n=seed(gx+i*31,gy),x=gx*57+(hash(n+17)-.5)*18,y=gy*55+(hash(n+21)-.5)*18;if(!riftPointInPolygon({x,y},ring.points))continue;
      candidate(`city-green:island:${i}:${gx}:${gy}`,x,y,n,true);const p=candidates.at(-1);p.order=-1+hash(n+67);p.cityGrove=ring.id;
    }
  }
  candidates.sort((a,b)=>a.order-b.order);
  for(const {order,...p}of candidates){
    if(props.length>=CITY_GREEN_SCENERY_LIMIT)break;const r=box(p.x,p.y,p.width,p.depth);
    if(r.minX<b.minX||r.maxX>b.maxX||r.minY<b.minY||r.maxY>b.maxY||occupied.has(r,17))continue;
    if(reservations.some(q=>{const dx=Math.max(r.minX-q.x,0,q.x-r.maxX),dy=Math.max(r.minY-q.y,0,q.y-r.maxY);return dx*dx+dy*dy<(q.r??130)**2;}))continue;
    if(!blocked(collision.ground,r)||!blocked(collision.high,r))continue;
    if((layout.lakes||[]).some(l=>riftPointInPolygon(p,l.points)||l.points.some((q,i)=>segmentInBox(q,l.points[(i+1)%l.points.length],r))))continue;
    props.push(Object.freeze({...p,region:'clockshadow-city',sortY:p.y+p.depth/2}));occupied.add(r);
  }
  const result=Object.freeze(props);cache.set(layout,result);return result;
}
