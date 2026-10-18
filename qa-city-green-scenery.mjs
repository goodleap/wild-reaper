import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { RiftCollision, riftPointInPolygon } from './dist/rift-collision.js';
import { createCityBlockScenery } from './dist/worlds/city-block-scenery.js';
import { createCityGreenScenery, CITY_GREEN_SCENERY_LIMIT } from './dist/worlds/city-green-scenery.js';

const rect=p=>({minX:p.x-p.width/2,minY:p.y-p.depth/2,maxX:p.x+p.width/2,maxY:p.y+p.depth/2});
const overlap=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const within=(a,b)=>a.minX>=b.minX&&a.maxX<=b.maxX&&a.minY>=b.minY&&a.maxY<=b.maxY;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const on=(p,a,b)=>Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
const intersect=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,c,d)||on(b,c,d)||on(c,a,b)||on(d,a,b);
const corners=r=>[{x:r.minX,y:r.minY},{x:r.maxX,y:r.minY},{x:r.maxX,y:r.maxY},{x:r.minX,y:r.maxY}];
const inside=(r,p)=>p.x>=r.minX&&p.x<=r.maxX&&p.y>=r.minY&&p.y<=r.maxY;
function edgeCrosses(a,b,r){const c=corners(r);return inside(r,a)||inside(r,b)||c.some((p,i)=>intersect(a,b,p,c[(i+1)%4]));}

const layout=createRiftLayout('clockshadow-city'),before=JSON.stringify(layout),occupied=createCityBlockScenery(layout),occupiedBefore=JSON.stringify(occupied);
const originalRandom=Math.random;
Math.random=()=>{throw new Error('World decoration must use a deterministic local seed.');};
let props,elapsed;
try{const start=performance.now();props=createCityGreenScenery(layout,occupied);elapsed=performance.now()-start;}finally{Math.random=originalRandom;}
assert.equal(createCityGreenScenery(layout,occupied),props,'warm frames reuse the same prebuilt records');
assert(Object.isFrozen(props)&&props.every(Object.isFrozen),'render consumers cannot edit cached placement records');
assert(props.length>=500&&props.length<=CITY_GREEN_SCENERY_LIMIT,'mixed edge vegetation has a world-sized, bounded population');
assert(elapsed<500,'one-time placement must not become a multi-second initialization pass');
assert.deepEqual(createCityGreenScenery(createRiftLayout('forest')),[],'legacy worlds receive no city vegetation');
assert.equal(new Set(props.map(p=>p.id)).size,props.length,'each depth-queue item has a stable identity');
assert.deepEqual(createCityGreenScenery(structuredClone(layout),occupied),props,'equivalent geometry produces identical whole-tree placements');

const masks=new RiftCollision(layout),foundations=[...layout.cityStructures,...occupied].map(rect);
const reservations=[{...layout.spawn,r:260},...Object.values(layout.plan),...layout.encounters,
  ...layout.interactions.caves.map(p=>({...p,r:145})),...layout.interactions.chests.map(p=>({...p,r:110}))];
for(const p of props){
  const r=rect(p);
  assert(p.riftPalette===true&&p.region==='clockshadow-city'&&p.collision===false&&p.cityGreen,'draw-only scenery does not create duplicate obstacles');
  assert(p.width>=24&&p.width<=70&&p.depth>=24&&p.depth<=70&&p.height>20&&p.height<180,'roots and projection remain readable at standard view');
  assert.equal(p.sortY,p.y+p.depth/2,'the normal depth queue uses the true front root edge');
  assert(within(r,layout.bounds),`${p.id}: the entire root rectangle stays inside the world`);
  assert(!foundations.some(f=>overlap(r,f)),`${p.id}: root does not intersect a canonical or raised city building`);
  for(const mask of[masks.ground,masks.high]){
    for(const q of[{x:p.x,y:p.y},...corners(r)])assert(!mask.inside(q.x,q.y),`${p.id}: tree roots belong to blocked ground for both bodies and flyers`);
    assert(!mask.query(r.minX,r.minY,r.maxX,r.maxY).some(e=>edgeCrosses(e.a,e.b,r)),`${p.id}: no contour can cross the full root rectangle between its corners`);
  }
  for(const lake of layout.lakes){
    assert(!riftPointInPolygon(p,lake.points),'a solid water bank is not a planting site');
    assert(!lake.points.some((a,i)=>edgeCrosses(a,lake.points[(i+1)%lake.points.length],r)),'tree roots never straddle water banks');
  }
  for(const q of reservations){const dx=Math.max(r.minX-q.x,0,q.x-r.maxX),dy=Math.max(r.minY-q.y,0,q.y-r.maxY);assert(dx*dx+dy*dy>=(q.r??130)**2,'objective approach space stays free of roots');}
}
const count=(area,kind)=>props.filter(p=>(!area||p.area===area)&&(!kind||p.cityKind===kind)).length;
for(const kind of ['tree','shrub','rock'])assert(count(null,kind)>30,'the boundary mixes full trees, low plants and rocks');
assert(props.some(p=>p.riftShrub&&p.heightBand==='low'),'low planting remains distinguishable from trunks');
assert(count('S1')>10,'the secret garden has its own leafy fringe');
for(const sx of[-1,1])for(const sy of[-1,1])assert(props.filter(p=>p.x*sx>0&&p.y*sy>0).length>100,'each quarter has vegetation');
let visibleGardenIslands=0;
for(const ring of layout.solidBoundaries){
  if(!ring.hole||ring.points.length<7)continue;
  const xs=ring.points.map(p=>p.x),ys=ring.points.map(p=>p.y),r={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)},cx=(r.minX+r.maxX)/2,cy=(r.minY+r.maxY)/2;
  if(r.maxX-r.minX<120||r.maxX-r.minX>650||r.maxY-r.minY<120||r.maxY-r.minY>650||!riftPointInPolygon({x:cx,y:cy},ring.points))continue;
  const area=layout.areas.reduce((best,a)=>(a.center.x-cx)**2+(a.center.y-cy)**2<(best.center.x-cx)**2+(best.center.y-cy)**2?a:best,layout.areas[0]);
  if(!['01','02','13','S1'].includes(area.id)||foundations.some(b=>inside(b,{x:cx,y:cy})))continue;
  assert(props.some(p=>riftPointInPolygon(p,ring.points)),`${ring.id}: a small real garden obstacle cannot remain an empty lawn`);visibleGardenIslands++;
}
assert(visibleGardenIslands>=4,'authored interior garden islands receive whole rooted vegetation');
assert.equal(JSON.stringify(layout),before,'all walkable contours, combat placements, sites and routes remain unchanged');
assert.equal(JSON.stringify(occupied),occupiedBefore,'natural placement cannot move a previously placed city object');
console.log(JSON.stringify({cityGreenScenery:'passed',items:props.length,visibleGardenIslands,initializationMs:Math.round(elapsed*100)/100,targetMs:200,
  types:Object.fromEntries(['tree','shrub','rock'].map(art=>[art,count(null,art)])),areas:Object.fromEntries(['01','02','13','S1'].map(area=>[area,count(area)])),
  coverage:'whole-root ground/high contour exclusion; no lake/foundation/site overlap; bounded deterministic cached placement; original geometry unchanged'}));
