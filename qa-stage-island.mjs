import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { Environment, waterObstacleFootprint } from './dist/environment.js';
import { waterIntersectsCircle } from './dist/water-geometry.js';
import { WORLD_IDS, worldNeighbors } from './dist/world-definitions.js';

const outerMap={id:'forest-outer',themeId:'forest',role:'outer',connections:[{id:'forest-route',targetMapId:'forest-heart'}]};
const bossMap={id:'forest-heart',themeId:'forest',role:'boss',connections:[{id:'forest-route',targetMapId:'forest-outer'}]};
let reservations=0;
for(const seed of [0,1,2,5,11,31,79,113,255,801]){
  const outer=new Island({map:{...outerMap,seed}}),boss=new Island({map:{...bossMap,seed}});
  assert.equal(outer.region,boss.region,'theme is shared by distinct map instances');
  assert.notEqual(outer.mapId,boss.mapId);
  assert.equal(Object.keys(outer.plan).filter(key=>key.startsWith('portal:')).length,1);
  assert(outer.plan.castle&&outer.plan.rescue&&outer.plan.golemaltar,'outer island keeps existing adventure sites');
  assert.deepEqual(Object.keys(boss.plan).sort(),['portal:forest-outer','stageBoss','stageExit'],'boss island does not inherit the large island site plan');
  assert(boss.bounds.maxX-boss.bounds.minX<(outer.bounds.maxX-outer.bounds.minX)*.35);
  assert(Math.hypot(boss.plan.stageBoss.x-boss.plan['portal:forest-outer'].x,boss.plan.stageBoss.y-boss.plan['portal:forest-outer'].y)>550,'arrival is separated from the core boss');
  for(const island of [outer,boss]){
    for(const [key,point] of Object.entries(island.plan)){
      assert(island.isDry(point.x,point.y,point.r),`${island.mapId}: ${key} is completely dry`);
      assert(island.isReserved(point.x,point.y));reservations++;
      if(key.startsWith('stage')||key.startsWith('portal:'))for(const [otherKey,other] of Object.entries(island.plan))if(otherKey!==key)assert(Math.hypot(point.x-other.x,point.y-other.y)>=point.r+other.r+29.9,`${key} overlaps ${otherKey}`);
    }
    for(const route of island.routes)assert(island.containsCapsule(route.ax,route.ay,route.bx,route.by,route.r,island.shallowWidth),'entrance and encounter approaches stay dry');
  }
  // Actual generated scenery and water must respect the open combat floor and
  // both portals, including their approach routes and room for companions.
  const terrain=new Terrain({region:'forest',seed,island:boss});
  for(const prop of terrain.query(-1400,-1400,1400,1400)){
    const footprint=waterObstacleFootprint(prop);
    assert(!boss.isReservedCapsule(footprint.ax,footprint.ay,footprint.bx,footprint.by,footprint.r));
  }
  const game={terrain,region:{id:'forest'},regionIndex:0,player:{x:0,y:-19.8,r:15},viewWidth:960,viewHeight:720};
  const environment=new Environment(game,{generation:false});
  for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){
    const water=environment._mudAt(x,y);if(!water)continue;
    for(const point of Object.values(boss.plan))assert(!waterIntersectsCircle(water,point.x,point.y,point.r));
  }
  const portal=boss.plan['portal:forest-outer'];
  for(const dx of [-55,0,55])for(const dy of [70,110])assert(terrain.isFree(portal.x+dx,portal.y+dy,24),'hero and companion doorway arrival candidates are open');
}
// Existing non-stage callers retain all theme graph endpoints and full maps.
for(const region of WORLD_IDS){
  const island=new Island({region});
  assert.equal(Object.keys(island.plan).filter(key=>key.startsWith('portal:')).length,worldNeighbors(island.worldId).length);
  assert(!island.plan.stageBoss);assert(island.plan.castle);
}
assert.throws(()=>new Island({map:{...bossMap,layout:{stageExit:{x:0,y:0,r:150}}}}),/No clear island reservation/,'invalid authored layouts cannot silently overlap combat space');
console.log(`Stage island QA passed: ${reservations} seeded reservations, separate theme/map identities, small arena, safe arrivals, natural placement and legacy map compatibility.`);
