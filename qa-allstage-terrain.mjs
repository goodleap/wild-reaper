import assert from 'node:assert/strict';
import { STAGES } from './dist/stage-definitions.js';
import { WORLD_IDS, worldForId } from './dist/world-definitions.js';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { groundFootprint, surfaceAllows } from './dist/placement-rules.js';
import { waterIntersectsCircle, waterIntersectsCapsule } from './dist/water-geometry.js';

const releasedStageThemes=['forest','marsh','ruins','beach','city','mountain','snow','volcano'];
assert.deepEqual(STAGES.map(stage=>stage.themeId),releasedStageThemes,'all eight released stage themes retain their authored terrain');
assert.deepEqual(STAGES.map(stage=>stage.id),releasedStageThemes.map(id=>`${id}-trial`),'terrain checks cover each released stage identity');
assert(WORLD_IDS.includes('verdant-rift'));assert(!STAGES.some(stage=>stage.themeId==='verdant-rift'),'the independent exploration world does not inherit a fabricated stage layout');
let reservations=0,scenery=0,waterChecks=0,arrivalChecks=0;
const reports=[];
for(const stage of STAGES){
  const outlines=[];
  for(const map of stage.islands){
    const island=new Island({map}),terrain=new Terrain({region:map.themeId,seed:map.seed,island,cacheLimit:32});
    const game={terrain,region:worldForId(map.themeId),regionIndex:map.themeIndex,stage:{currentIsland:map},player:{x:0,y:-19.8,r:15},viewWidth:960,viewHeight:720};
    const environment=new Environment(game,{generation:false});game.environment=environment;
    // Exercise stable terrain before it reaches the live screen cache. Core
    // islands currently disable random water; checking its layout too ensures
    // these reservations remain safe if that generation is later enabled.
    environment.generation=true;
    outlines.push(island.points);
    assert.equal(island.mapId,map.id);assert.equal(island.region,stage.themeId);
    if(map.role==='outer')for(const key of ['castle','rescue','rescue-warden','hunt','rune','golemaltar','stonevault'])assert(island.plan[key],`${map.id}: retained ${key}`);
    else assert.deepEqual(Object.keys(island.plan).sort(),[`portal:${stage.startMapId}`,'stageBoss','stageExit'].sort(),`${map.id}: core arena has only its three objectives`);
    for(const [key,point] of Object.entries(island.plan)){
      assert(island.isDry(point.x,point.y,point.r),`${map.id}: ${key} reserve is fully dry`);reservations++;
      if(key.startsWith('stage')||key.startsWith('portal:'))for(const [otherKey,other] of Object.entries(island.plan))if(key!==otherKey)assert(Math.hypot(point.x-other.x,point.y-other.y)>=point.r+other.r+29.9,`${map.id}: ${key} overlaps ${otherKey}`);
      const box={minX:point.x-point.r,minY:point.y-point.r,maxX:point.x+point.r,maxY:point.y+point.r};
      for(const water of environment.watersInBounds(box)){
        waterChecks++;assert(!waterIntersectsCircle(water,point.x,point.y,point.r),`${map.id}: ${water.kind} crosses ${key}`);
      }
    }
    for(const route of island.routes){
      assert(island.containsCapsule(route.ax,route.ay,route.bx,route.by,route.r,island.shallowWidth),`${map.id}: the approach crosses the sea`);
      for(const water of environment.watersInBounds({minX:Math.min(route.ax,route.bx)-route.r,minY:Math.min(route.ay,route.by)-route.r,maxX:Math.max(route.ax,route.bx)+route.r,maxY:Math.max(route.ay,route.by)+route.r})){
        waterChecks++;assert(!waterIntersectsCapsule(water,route.ax,route.ay,route.bx,route.by,route.r),`${map.id}: ${water.kind} blocks a route`);
      }
    }
    const b=island.bounds,props=terrain.query(b.minX,b.minY,b.maxX,b.maxY);
    for(const prop of props){
      const footprint=groundFootprint(prop),kind=prop.type==='tree'?'vegetation':prop.type==='log'?'debris':'stone';
      assert(surfaceAllows(island,kind,footprint),`${map.id}: ${prop.variant??prop.type} has an invalid shoreline footprint`);
      assert(!island.isReservedCapsule(footprint.ax,footprint.ay,footprint.bx,footprint.by,footprint.r),`${map.id}: natural scenery blocks a reserved area`);scenery++;
    }
    assert(props.length>0,`${map.id}: theme scenery remains outside the encounter reserves`);
    const arrivals=[{x:0,y:0},...Object.entries(island.plan).filter(([key])=>key.startsWith('portal:')||key==='stageExit').flatMap(([,point])=>[-55,0,55].flatMap(dx=>[70,110].map(dy=>({x:point.x+dx,y:point.y+dy}))))];
    for(const point of arrivals){
      assert(terrain.isDry(point.x,point.y,24)&&terrain.isFree(point.x,point.y,24),`${map.id}: blocked arrival`);
      environment.mechanisms.generation=true;environment.worldHazards.generation=true;
      assert(environment.mechanisms.isHazardFree(point.x,point.y,24),`${map.id}: vine or gas at arrival`);
      assert(environment.worldHazards.isHazardFree(point.x,point.y,24),`${map.id}: damaging terrain at arrival`);arrivalChecks++;
    }
    assert(terrain.cacheSize<=32,'the larger stage catalog does not enlarge terrain caches');
    reports.push({map:map.id,scenery:props.length,reservations:Object.keys(island.plan).length});
  }
  assert.notDeepEqual(outlines[0],outlines[1],`${stage.id}: outer and core use independent shapes`);
}
console.log(JSON.stringify({allStageTerrain:'passed',stages:STAGES.length,reservations,scenery,waterChecks,arrivalChecks,maps:reports}));
