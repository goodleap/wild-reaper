import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { RiftCollision, riftPointInPolygon } from './dist/rift-collision.js';
import { createCityBlockScenery } from './dist/worlds/city-block-scenery.js';
import { createCityGreenScenery, CITY_GREEN_SCENERY_LIMIT } from './dist/worlds/city-green-scenery.js';
import { CITY_SAMPLE_BOUNDS, CITY_SAMPLE_HOUSES } from './dist/worlds/city-sample-scene.js';

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
assert(props.length>=2000&&props.length<=3500&&props.length<=CITY_GREEN_SCENERY_LIMIT,'whole-tree density has a world-sized, bounded population');
assert(elapsed<500,'one-time placement must not become a multi-second initialization pass');
assert.deepEqual(createCityGreenScenery(createRiftLayout('forest')),[],'legacy worlds receive no city vegetation');
assert.equal(new Set(props.map(p=>p.id)).size,props.length,'each depth-queue item has a stable identity');
assert.deepEqual(createCityGreenScenery(structuredClone(layout),occupied),props,'equivalent geometry produces identical whole-tree placements');

const masks=new RiftCollision(layout),foundations=[...layout.cityStructures,...CITY_SAMPLE_HOUSES,...occupied].map(rect);
const reservations=[{...layout.spawn,r:260},...Object.values(layout.plan),...layout.encounters,
  ...layout.interactions.caves.map(p=>({...p,r:145})),...layout.interactions.chests.map(p=>({...p,r:110}))];
for(const p of props){
  const r=rect(p);
  assert(p.variant==='city-native'&&p.region==='clockshadow-city'&&p.collision===false&&p.cityGreen,'draw-only native sprites do not create duplicate obstacles');
  assert(p.width>=32&&p.width<=60&&p.depth>=24&&p.depth<=44&&p.height>=120&&p.height<=170,'tree footprint and projection remain readable at standard view');
  assert.equal(p.sortY,p.y+p.depth/2,'the normal depth queue uses the true front root edge');
  assert(within(r,layout.bounds),`${p.id}: the entire root rectangle stays inside the world`);
  assert(!foundations.some(f=>overlap(r,f)),`${p.id}: root does not intersect a canonical or raised city building`);
  assert(!overlap({minX:p.x-95,minY:p.y-167.5,maxX:p.x+95,maxY:p.y+37.5},CITY_SAMPLE_BOUNDS),'the approved art sample remains clear');
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
const count=(area,art)=>props.filter(p=>(!area||p.area===area)&&(!art||p.cityArt===art)).length;
assert(count('02','apple')>count('02','oak'),'the former orchard favors fruit trees');
assert(count('13','cypress')>count('13','oak'),'the formal garden favors clipped cypresses');
assert(count('S1')>15,'the secret garden has its own complete leafy fringe');
for(const sx of[-1,1])for(const sy of[-1,1])assert(props.filter(p=>p.x*sx>0&&p.y*sy>0).length>200,'every side of the world receives vegetation');
assert.equal(JSON.stringify(layout),before,'all walkable contours, combat placements, sites and routes remain unchanged');
assert.equal(JSON.stringify(occupied),occupiedBefore,'natural placement cannot move a previously placed city object');
console.log(JSON.stringify({cityGreenScenery:'passed',trees:props.length,initializationMs:Math.round(elapsed*100)/100,targetMs:200,
  types:Object.fromEntries(['oak','cypress','apple'].map(art=>[art,count(null,art)])),areas:Object.fromEntries(['02','13','S1','outer'].map(area=>[area,count(area)])),
  coverage:'whole-root ground/high contour exclusion; no lake/foundation/site/sample overlap; bounded deterministic cached placement; original geometry unchanged'}));
