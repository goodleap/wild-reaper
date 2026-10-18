import assert from 'node:assert/strict';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { RiftCollision } from './dist/rift-collision.js';
import { createCityBlockScenery, CITY_BLOCK_SCENERY_LIMIT } from './dist/worlds/city-block-scenery.js';

const layout=createRiftLayout('clockshadow-city'),before=JSON.stringify(layout);
const started=performance.now(),props=createCityBlockScenery(layout),initializationMs=performance.now()-started;
assert.equal(createCityBlockScenery(layout),props,'normal revisits share one immutable placement result');
assert.equal(createCityBlockScenery(null).length,0);
for(const id of ['forest','verdant-rift'])assert.equal(createCityBlockScenery(createRiftLayout(id)).length,0,'other worlds receive no city mass');
assert(Object.isFrozen(props)&&props.every(Object.isFrozen));
assert(props.length>=400&&props.length<=CITY_BLOCK_SCENERY_LIMIT,'the full city receives populated but bounded scenery');
assert.equal(new Set(props.map(p=>p.id)).size,props.length,'world props have stable unique identities');
assert(props.filter(p=>p.cityBlockPlacement==='front').length>80,'street-side placement follows the real contour');
assert(props.filter(p=>p.cityBlockPlacement==='interior').length>100,'blocked street blocks also retain interior buildings');
assert(props.filter(p=>p.cityArt==='ruin').length>10,'ruined districts use more than the repeated house image');
assert(props.filter(p=>['planter','rubble','cart','lamp'].includes(p.cityArt)).length>25,'small rooted vegetation breaks up blocked masonry');
assert(new Set(props.map(p=>p.area)).size>=12,'placement is distributed across the large world');

const copy=structuredClone(layout),copyBefore=JSON.stringify(copy),replayed=createCityBlockScenery(copy);
assert.deepEqual(replayed,props,'a fresh layout identity produces the same complete placement');
assert.equal(JSON.stringify(copy),copyBefore,'generation cannot edit the baked layout');
const collision=new RiftCollision(layout);
const rectangle=p=>({minX:p.x-p.width/2,minY:p.y-p.depth/2,maxX:p.x+p.width/2,maxY:p.y+p.depth/2});
const overlaps=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const pointInBox=(p,b)=>p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY;
const turn=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function crosses(a,b,c,d){
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.min(a.x,b.x)>Math.max(c.x,d.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.min(a.y,b.y)>Math.max(c.y,d.y))return false;
  return turn(a,b,c)*turn(a,b,d)<=0&&turn(c,d,a)*turn(c,d,b)<=0;
}
function contourInBox(mask,box){
  const corners=[{x:box.minX,y:box.minY},{x:box.maxX,y:box.minY},{x:box.maxX,y:box.maxY},{x:box.minX,y:box.maxY}];
  return mask.query(box.minX,box.minY,box.maxX,box.maxY).some(edge=>pointInBox(edge.a,box)||pointInBox(edge.b,box)||corners.some((p,i)=>crosses(edge.a,edge.b,p,corners[(i+1)%4])));
}
const protectedRects=layout.cityStructures.map(rectangle),rects=[];
let footprintChecks=0;
for(const p of props){
  assert.equal(p.variant,'city-native');assert.equal(p.region,'clockshadow-city');assert.equal(p.collision,false);
  assert(['house','ruin','workshop','warehouse','stable','planter','rubble','cart','lamp'].includes(p.cityArt));
  assert(p.width>0&&p.depth>0&&p.height>0&&Number.isFinite(p.x+p.y+p.width+p.depth+p.height));
  assert.equal(p.scale,1,'world and actor scale are not used to hide placement errors');
  assert.equal(p.sortY,p.y+p.depth/2,'depth uses the full foundation front');
  assert.equal(p.r,Math.min(p.width,p.depth)/2);
  assert.equal(p.halfLength,(Math.max(p.width,p.depth)-Math.min(p.width,p.depth))/2);
  const dx=Math.cos(p.angle)*p.halfLength,dy=Math.sin(p.angle)*p.halfLength,b=rectangle(p);
  for(const [actual,expected]of [[Math.min(p.x-dx,p.x+dx)-p.r,b.minX],[Math.max(p.x-dx,p.x+dx)+p.r,b.maxX],[Math.min(p.y-dy,p.y+dy)-p.r,b.minY],[Math.max(p.y-dy,p.y+dy)+p.r,b.maxY]])assert(Math.abs(actual-expected)<.001,'the nonblocking terrain carrier indexes the complete rectangular foundation');
  for(const mask of [collision.ground,collision.high]){
    assert(!mask.inside(p.x,p.y),'the foundation belongs to the original blocked component');
    assert(!contourInBox(mask,b),'no road or terrain contour can cross any part of the foundation');
    for(const x of [b.minX,p.x,b.maxX])for(const y of [b.minY,p.y,b.maxY]){assert(!mask.inside(x,y));footprintChecks++;}
  }
  assert(protectedRects.every(q=>!overlaps(b,q)),'canonical buildings and accepted sample houses cannot receive a second foundation');
  assert(rects.every(q=>!overlaps(b,q)),'new native buildings and roots do not share ground footprints');
  rects.push(b);
}

// Use the production Terrain carrier/indexing and movement code, with the
// generated artwork supplied as its actual fixed props. The immutable city
// union remains the only obstacle owner for these nonblocking foundations.
const island=new Island({region:'clockshadow-city'}),terrain=new Terrain({region:'clockshadow-city',island,obstacles:props});
assert.equal(terrain.query(layout.bounds.minX,layout.bounds.minY,layout.bounds.maxX,layout.bounds.maxY).length,props.length);
let roadSweeps=0;
for(const passage of layout.passages)for(const radius of [15,24,49])for(let i=1;i<passage.waypoints.length;i++){
  const a=passage.waypoints[i-1],b=passage.waypoints[i];assert(terrain.isFree(a.x,a.y,radius));
  assert(!terrain.firstBlocker(a.x,a.y,b.x,b.y,radius),'native props cannot close a real road');
  const moved=terrain.moveCircle(a.x,a.y,b.x-a.x,b.y-a.y,radius);
  assert(Math.hypot(moved.x-b.x,moved.y-b.y)<.02,'unchanged full-body movement replays the authored connection');roadSweeps++;
}
assert.equal(JSON.stringify(layout),before,'all layout, collision, encounters and routes remain unchanged');
const artCounts=Object.fromEntries([...new Set(props.map(p=>p.cityArt))].map(art=>[art,props.filter(p=>p.cityArt===art).length]));
console.log(JSON.stringify({cityBlockScenery:'passed',count:props.length,limit:CITY_BLOCK_SCENERY_LIMIT,artCounts,streetFronts:props.filter(p=>p.cityBlockPlacement==='front').length,interiorLots:props.filter(p=>p.cityBlockPlacement==='interior').length,footprintChecks,roadSweeps,initializationMs:Math.round(initializationMs*100)/100,method:'cached deterministic placement; exact full-rectangle contour exclusion on both masks; ordinary terrain carriers and r15/r24/r49 movement; canonical preservation'}));
