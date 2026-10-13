import assert from 'node:assert/strict';
import { Terrain, sceneryVisual } from './dist/terrain.js';
import { Island } from './dist/islands.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { biomeZone, cityStreetAt, CITY_BLOCK, CITY_STREET_HALF_WIDTH } from './dist/biome-layout.js';
import { groundFootprint, surfaceAllows, surfaceAt, COAST_RULES } from './dist/placement-rules.js';
import { blocksObstacle } from './dist/height-rules.js';

let checked=0;
const kinds={beach:['world-palm','world-reef','world-driftwood'],city:['world-building','world-city-wall'],mountain:['world-ridge','world-pine'],snow:['world-snowpine','world-ice'],volcano:['world-charred','world-basalt']};
for(const region of WORLD_IDS.slice(3))for(const seed of [2,7]){
  const island=new Island({region,seed}),terrain=new Terrain({region,seed,island,cacheLimit:32});
  const snapshot=terrain.query(-2900,-2900,2900,2900);
  assert(snapshot.length>25,`${region} must contain meaningful scenery`);
  for(const variant of kinds[region])assert(snapshot.some(p=>p.variant===variant),`${region} missing ${variant}`);
  assert.equal(new Set(snapshot.map(p=>p.id)).size,snapshot.length,'spatial queries cannot duplicate obstacles');
  assert.equal(new Set(snapshot.map(p=>p.zone)).size,3,`${region} needs distinct local layouts`);
  for(const prop of snapshot){
    const footprint=groundFootprint(prop),kind=prop.type==='tree'?'vegetation':prop.type==='log'?'debris':'stone';
    assert(surfaceAllows(island,kind,footprint),`${region}:${prop.id} has an invalid habitat`);
    assert(!island.isReservedCapsule(footprint.ax,footprint.ay,footprint.bx,footprint.by,footprint.r),`${region}:${prop.id} blocks a guaranteed route`);
    assert(!terrain.isFree(prop.x,prop.y,3),'visible scenery must have matching ground collision');
    const visual=sceneryVisual(prop);assert(Object.values(visual).every(Number.isFinite));
    assert(visual.halfWidth>0&&visual.top>0&&visual.bottom>0);
    const tall=['world-building','world-city-wall','world-ridge'].includes(prop.variant);
    if(tall){assert.equal(prop.heightBand,'high');assert(blocksObstacle(prop,'air'));assert(blocksObstacle(prop,'projectile'));}
    if(prop.variant==='world-driftwood'){assert.equal(prop.heightBand,'low');assert(!blocksObstacle(prop,'air'));assert(!blocksObstacle(prop,'projectile'));}
    checked++;
  }
  // Walk every guaranteed route with the same swept body check used by actors.
  for(const route of island.routes){
    const steps=Math.ceil(Math.hypot(route.bx-route.ax,route.by-route.ay)/45);
    for(let i=0;i<=steps;i++){const t=i/steps;assert(terrain.isFree(route.ax+(route.bx-route.ax)*t,route.ay+(route.by-route.ay)*t,22),`${region} route blocked`);}
  }
  for(let i=0;i<80;i++)terrain.query(12000+i*530,-9000+i*270,12500+i*530,-8500+i*270);
  assert(terrain.cacheSize<=32,'world expansion must not create an unbounded scenery cache');
  assert.deepEqual(terrain.query(-2900,-2900,2900,2900),snapshot,'evicted terrain must regenerate exactly');
}

// Street centers and the full playable road width stay clear in either sign.
const city=new Terrain({region:'city',seed:4});
for(let line=-4;line<=4;line++)for(let other=-2200;other<=2200;other+=37)for(const edge of [-CITY_STREET_HALF_WIDTH,0,CITY_STREET_HALF_WIDTH]){
  const street=line*CITY_BLOCK+edge;
  assert(cityStreetAt(street,other)&&cityStreetAt(other,street));
  assert(city.isFree(street,other,18)&&city.isFree(other,street,18),'ordinary city streets need continuous actor-width clearance');
}
// Footprints cannot overlap just because they were emitted by adjacent cells.
for(const region of WORLD_IDS.slice(3)){
  const terrain=new Terrain({region,seed:4}),props=terrain.query(-1500,-1500,1500,1500);
  for(let i=0;i<props.length;i++)for(let j=i+1;j<props.length;j++){
    const a=props[i],b=props[j],f=groundFootprint(a,0),other=groundFootprint(b,0);
    for(const t of [0,.25,.5,.75,1]){
      const x=f.ax+(f.bx-f.ax)*t,y=f.ay+(f.by-f.ay)*t,q=terrain.closestPoint(b,x,y);
      assert(Math.hypot(x-q.x,y-q.y)>f.r+other.r,`${region}: overlapping ground footprints ${a.id}/${b.id}`);
    }
  }
}
const beach=new Island({region:'beach'});
assert(beach.beachWidth>COAST_RULES.beachWidth);
const edge=beach._nearest(5000,0),r=beach.shallowWidth+beach.beachWidth*.5;
assert.equal(surfaceAt(beach,edge.x+edge.nx*r,edge.y+edge.ny*r),'beach','terrain placement and widened beach must agree');
assert.deepEqual(biomeZone('snow',-1175,2413,4),biomeZone('snow',-1175,2413,4));
console.log(JSON.stringify({worldTerrain:'passed',regions:5,checkedScenery:checked,cacheLimit:32,continuousCityStreets:true,reservedRoutes:true}));
