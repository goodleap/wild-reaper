import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

// Full-map navigation allocates terrain caches. Isolate the eight fixtures so
// the QA process releases each map's geometry before loading the next one.
const stageId=process.argv[2];
if(!stageId){
  const definitions=JSON.parse(readFileSync(new URL('./dist/config/stages.json',import.meta.url))).definitions;
  for(const definition of definitions)await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[import.meta.filename,definition.id],{stdio:'inherit'});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${definition.id}: terrain QA exited ${code??signal}`)));
  });
}else{
const [{Game},{STAGES},{createRiftLayout},{worldForId,worldNeighbors},{groundOffset},{terrainNavigation},{WorldMap}]=await Promise.all([
  import('./dist/engine.js'),import('./dist/stage-definitions.js'),import('./dist/worlds/rift-layout.js'),import('./dist/world-definitions.js'),import('./dist/terrain.js'),import('./dist/terrain-navigation.js'),import('./dist/world-map.js')
]);
const selected=STAGES.filter(stage=>stage.id===stageId);assert.equal(selected.length,1,'the requested trial exists');

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let steps=0,goals=0;
for(const stage of selected){
  const world=new Game({mode:'world',worldId:stage.worldMapId}),game=new Game({stageId:stage.id});
  const layout=createRiftLayout(stage.worldMapId),source=worldForId(stage.worldMapId).authored,foot=()=>({x:game.player.x,y:game.player.y+groundOffset(game.player,true)});
  assert(game.terrain.island.layout===layout,'trial uses the shared authored map');assert(world.terrain.island.layout===layout,'exploration uses the same authored map');
  assert(Object.isFrozen(layout));assert.deepEqual(layout.bounds,source.bounds);assert.deepEqual(game.terrain.bounds,world.terrain.bounds,'trials retain the complete current map extent');
  assert(game.terrain!==world.terrain,'each run owns its terrain');assert(game.terrain.island!==world.terrain.island,'each run owns its island state');
  assert.equal(game.terrain.island.seed,world.terrain.island.seed,'shared scenery uses the same deterministic seed');
  assert.equal(game.mapId,stage.mapId);assert.equal(world.mapId,stage.worldIndex);assert.equal(game.terrain.island.region,stage.worldMapId);
  assert.equal(game.stage.currentMapId,stage.mapId);assert.equal(game._worldExploration,false);
  assert.deepEqual(foot(),{x:layout.spawn.x,y:layout.spawn.y});
  for(const passage of layout.passages.filter(p=>p.gateId)){
    assert.equal(game.terrain._riftGates.get(passage.gateId),true,'trial-only shortcut opening cannot depend on absent world quests');
    assert.equal(world.terrain._riftGates.get(passage.gateId),false,'opening a trial shortcut never changes exploration collision');
  }
  for(const sites of [game.settlements.sites,game.relicSites.sites,game.companions.camps,game.companions.members,game.territories.groups])assert.equal(sites.length,0,'world-specific actors and objectives stay out of the trial');
  assert.equal(game.riftExploration.sites.length,0);assert.equal(game.encounters.generation,false);assert.equal(game.regions.portals.length,0);
  assert.equal(game.environment.generation,layout.artTheme!=='ember','the source map retains its environment generation policy');assert.equal(game.adventure.generation,true,'combat pickups remain enabled independently of world events');
  assert(!game.enemies.some(enemy=>enemy.worldBoss||enemy.territoryId||enemy.settlementId||enemy.relicSiteId));
  assert.deepEqual(new Set(world.regions.portals.map(portal=>portal.nextRegionIndex)),new Set(worldNeighbors(stage.worldIndex)),'normal exploration still has its actual travel connections');
  assert(world.settlements.sites.length>0&&world.riftExploration.sites.length>0&&world.territories.groups.length>0,'normal world contents remain available');
  const worldGate=world.regions.portals[0];if(worldGate)assert.equal(game.enterPortal(worldGate.id),false,'a world route cannot be entered from a challenge');
  const map=new WorldMap();map.discover(game);assert(game.terrain.island.explored?.size>0);assert.equal(world.terrain.island.explored,undefined,'fog belongs to this run');
  assert(game.terrain.isFree(stage.arena.x,stage.arena.y,game.stage.boss.r),'the actual Boss fits its authored arena');
  assert(game.terrain.isFree(stage.exit.x,stage.exit.y,90),'the victory entrance has full portal clearance');
  const nav=terrainNavigation(game.terrain);
  for(const target of [stage.arena,{x:stage.exit.x,y:stage.exit.y+80}]){
    for(let leg=0;distance(foot(),target)>.04&&leg<300;leg++){
      const path=nav.find(foot(),target,game.player.r,'ground');assert(path?.length,`${stage.id}: normal navigation reaches the next objective`);
      const beforeLeg=foot();
      for(const point of path){
        assert(!game.terrain.firstBlocker(foot().x,foot().y,point.x,point.y,game.player.r),`${stage.id}: complete body sweep clears the route`);
        for(let n=0;distance(foot(),point)>.025&&n<5000;n++){
          const before=foot(),remaining=distance(before,point),travel=Math.min(game.player.speed/30,remaining);
          game._moveEntity(game.player,(point.x-before.x)/remaining*travel,(point.y-before.y)/remaining*travel,true);
          assert(distance(before,foot())>.0001&&distance(before,foot())<=travel+.01,'normal movement advances within its speed budget');
          assert(game.terrain.isFree(foot().x,foot().y,game.player.r),'walking keeps the entire body outside scenery');steps++;
        }
        assert(distance(foot(),point)<.04,'the current walking leg completes');
      }
      assert(distance(beforeLeg,foot())>.01,'navigation makes progress');
    }
    assert(distance(foot(),target)<.04,`${stage.id}: the complete source-map route reaches the objective`);goals++;
  }
  assert(world.terrain.island.layout===layout,'world source terrain remains shared');assert(!world.stage,'world exploration does not acquire a trial');assert.equal(world.regions.states.size,0);
}
assert.equal(goals,2);
console.log(`${stageId}: exact shared terrain and independent run state, safe Boss/exit positions, ${steps} movement steps across both objective routes passed.`);
}
