import assert from 'node:assert/strict';
import {Island} from './dist/islands.js';
import {Terrain} from './dist/terrain.js';
import {Environment,waterObstacleFootprint} from './dist/environment.js';
import {Adventure} from './dist/adventure.js';
import {Settlements} from './dist/settlements.js';
import {RelicSites} from './dist/relic-sites.js';
import {placementAllowed,COAST_RULES} from './dist/placement-rules.js';
import {getWaterContours,waterBounds,waterIntersectsCircle,waterIntersectsCapsule} from './dist/water-geometry.js';

const CELL=520;
function world(region,seed){
  const island=new Island({region,seed}),terrain=new Terrain({region,seed,island,cacheLimit:32});
  const g={terrain,region:{id:region},regionIndex:seed,player:{x:0,y:-19.8,r:15},viewWidth:960,viewHeight:720,enemies:[],time:0};
  // Suppress only the initial screen refresh: procedural placement queries
  // below must operate before any water enters the visible-object cache.
  g.environment=new Environment(g,{generation:false});g.environment.generation=true;
  return g;
}
const coordinates=[];for(let tx=-9;tx<=8;tx++)for(let ty=-9;ty<=8;ty++)coordinates.push([tx,ty]);
const waterSignature=water=>water?structuredClone(water):null;
const boundsOverlap=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const clearCaches=g=>{
  // Both rejected candidates and accepted neighbors must reconstruct from
  // seed data after a long journey, independently of the order of visitation.
  for(const [name,value] of Object.entries(g.environment))if(name.startsWith('_water')&&value instanceof Map)value.clear();
  g.terrain._cache.clear();
};
let waterCount=0,largeCount=0,mushroomCount=0,hazardCount=0,naturalCount=0,unloadedChecks=0;
const report=[];
for(const region of ['forest','marsh','ruins'])for(const seed of [0,7]){
  const g=world(region,seed),env=g.environment,island=g.terrain.island,snapshots=new Map(),waters=[];
  for(const [tx,ty] of coordinates){
    const mud=env._mudAt(tx,ty);snapshots.set(`${tx},${ty}`,waterSignature(mud));if(!mud)continue;
    waters.push(mud);waterCount++;if(mud.scale>=2.5)largeCount++;
    const ring=getWaterContours(mud).outer;
    // Validate complete shoreline segments plus their drawn bank. A dry
    // center or sampled ellipse cannot establish this for bent/rotated lakes.
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      assert(island.containsCapsule(a.x,a.y,b.x,b.y,8,147),`${region}:${seed}:${mud.id} shoreline bank overlaps beach`);
    }
    const b=waterBounds(mud,60);
    for(const prop of g.terrain.query(b.minX,b.minY,b.maxX,b.maxY)){
      const f=waterObstacleFootprint(prop);naturalCount++;
      assert(!waterIntersectsCapsule(mud,f.ax,f.ay,f.bx,f.by,f.r),`${region}:${seed}:${mud.id} intersects ${prop.type} roots/body`);
    }
  }
  assert(waters.length>=8,`${region}:${seed} must retain useful lake density`);
  assert.equal(env.muds.length,0,'these checks must exercise undiscovered, unloaded water');
  let mushrooms=0,hazards=0;
  const mushroomSnapshots=new Map(),hazardSnapshots=new Map();
  for(const [tx,ty] of coordinates){
    const props=env._mushroomsAt(tx,ty,{ignoreObjectives:true});mushroomSnapshots.set(`${tx},${ty}`,structuredClone(props));
    for(const prop of props){
      mushrooms++;mushroomCount++;
      assert(island.contains(prop.x,prop.y,prop.r+135),`${region}:${seed}:${prop.id} root footprint lies on beach`);
      for(const mud of waters)assert(!waterIntersectsCircle(mud,prop.x,prop.y,prop.r),`${region}:${seed}:${prop.id} grows in ${mud.id}`);
    }
    const hazard=env.mechanisms._candidate(tx,ty);hazardSnapshots.set(`${tx},${ty}`,waterSignature(hazard));
    if(hazard){
      hazards++;hazardCount++;
      assert(island.contains(hazard.x,hazard.y,hazard.r+135),`${region}:${seed}:${hazard.id} spills onto the beach`);
      if(hazard.type==='vine')for(const mud of waters)assert(!waterIntersectsCircle(mud,hazard.x,hazard.y,hazard.r),`${hazard.id} grows in ${mud.id}`);
    }
  }
  assert(mushrooms>=12,`${region}:${seed} habitat rules must not remove the mushroom population`);
  if(region!=='ruins')assert(hazards>=8,`${region}:${seed} habitat rules must retain regional hazards`);
  if(region==='forest'&&seed===0){
    for(const p of env._mushroomsAt(-3,-1,{ignoreObjectives:true}))for(const m of waters)
      assert(!waterIntersectsCircle(m,p.x,p.y,p.r),'regression: mushroom:-3,-1:1 once grew inside a pond');
  }
  // A small query at a remote shore must discover an accepted lake even if
  // the lake's owner is a neighboring cell and no live mud was loaded first.
  for(const mud of waters.filter(m=>m.scale>=1.6)){
    for(const p of getWaterContours(mud).outer){
      const [tx,ty]=mud.id.slice(4).split(',').map(Number);
      if(Math.floor(p.x/CELL)===tx&&Math.floor(p.y/CELL)===ty)continue;
      const b={minX:p.x-12,maxX:p.x+12,minY:p.y-12,maxY:p.y+12};
      const matches=env.watersInBounds(b);
      assert(matches.some(m=>m.id===mud.id),'neighbor-owned shoreline missing from stable bounds query');
      assert(matches.every(m=>boundsOverlap(waterBounds(m),b)),'bounds query should not leak unrelated lakes');
      assert.equal(placementAllowed(g,'loot',{x:p.x,y:p.y,r:12}),false,'loot must avoid an unloaded neighboring shore');
      unloadedChecks++;break;
    }
  }
  clearCaches(g);
  for(const [tx,ty] of [...coordinates].reverse()){
    const key=`${tx},${ty}`;
    assert.deepEqual(env._mudAt(tx,ty),snapshots.get(key),`${region}:${seed}:${key} water changes with visitation order`);
    assert.deepEqual(env._mushroomsAt(tx,ty,{ignoreObjectives:true}),mushroomSnapshots.get(key),`${key} vegetation changes after cache eviction`);
    assert.deepEqual(env.mechanisms._candidate(tx,ty),hazardSnapshots.get(key),`${key} hazard changes after cache eviction`);
  }
  assert(env._waterCandidates.size<=192);assert(g.terrain.cacheSize<=32);
  for(const [name,value] of Object.entries(env))if(name.startsWith('_water')&&value instanceof Map)assert(value.size<=192,`${name} must remain bounded`);

  const mud=waters.find(m=>m.scale>=1.6&&!m.island)||waters.find(m=>!m.island),[tx,ty]=mud.id.slice(4).split(',').map(Number),before=waterSignature(mud);
  g.adventure=new Adventure(g,{generation:false});g.settlements=new Settlements(g,{generation:false});g.relicSites=new RelicSites(g,{generation:false});
  assert.equal(g.adventure._environmentFree(mud.x,mud.y,18),false,'an offscreen crate cannot claim the location of a future lake');
  const site={id:'qa-site',type:'supply',x:mud.x,y:mud.y,width:54,depth:28,door:{x:mud.x,y:mud.y+30}};
  assert.equal(g.settlements._validSite(site),false,'an offscreen house must see stable water before it is loaded');
  const relic={id:'qa-relic',type:'rune',x:mud.x,y:mud.y,r:72,door:{x:mud.x,y:mud.y+45}};
  assert.equal(g.relicSites._valid(relic),false,'an offscreen relic must see stable water before it is loaded');
  // Older code suppressed a fixed lake when any transient objective occupied
  // it, then made that lake appear after consuming the objective.
  g.adventure.props=[{id:'qa-crate',x:mud.x,y:mud.y,r:18}];
  g.adventure.treasure={x:mud.x,y:mud.y,r:27};g.settlements.sites=[site];g.relicSites.sites=[relic];
  g.terrain.setStructures([{type:'rock',x:mud.x,y:mud.y,r:300,structureId:'qa-new-building'}],'qa-water');
  clearCaches(g);assert.deepEqual(env._mudAt(tx,ty),before,'adding an objective must not erase or move seeded water');
  g.adventure.props=[];g.adventure.treasure=null;g.settlements.sites=[];g.relicSites.sites=[];g.terrain.setStructures([],'qa-water');
  clearCaches(g);assert.deepEqual(env._mudAt(tx,ty),before,'consuming an objective must not generate a new lake');
  report.push({region,seed,waters:waters.length,mushrooms,hazards});
}
assert(largeCount>=4,'large waters must remain available');assert(unloadedChecks>0,'test must cover a neighboring owner cell');
assert(COAST_RULES,'terrain placement shares the coast profile');
console.log(JSON.stringify({placementWorld:'passed',waterCount,largeCount,mushroomCount,hazardCount,naturalCount,unloadedChecks,worlds:report}));
