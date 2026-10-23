import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Regions, worldConnectionId } from './dist/regions.js';
import { REGIONS, WORLD_IDS, WORLD_CONNECTIONS, worldNeighbors } from './dist/world-definitions.js';
import { portalDoor } from './dist/portal-geometry.js';
import { terrainNavigation } from './dist/terrain-navigation.js';

assert.deepEqual(WORLD_IDS,['forest','marsh','ruins','beach','clockshadow-city','mountain','snow','ember-realm-large','verdant-rift','rift-forest']);
for(const retiredId of ['city','volcano'])assert(!WORLD_IDS.includes(retiredId),'retired worlds are not registered as aliases');
const existingRegions=REGIONS,riftIndex=WORLD_IDS.indexOf('rift-forest');
assert.deepEqual(WORLD_CONNECTIONS,[[riftIndex,1],[1,2],[riftIndex,2],[riftIndex,3],[3,4],[4,5],[5,6],[6,7],[7,2],[4,2]],'all ten routes retain their endpoints after separating the rift identity');
assert.equal(new Set(WORLD_CONNECTIONS.map(([a,b])=>worldConnectionId(a,b))).size,WORLD_CONNECTIONS.length);
const reachable=new Set([riftIndex]),queue=[riftIndex];
for(const index of queue)for(const target of worldNeighbors(index)){
  assert(worldNeighbors(target).includes(index));assert.notEqual(index,target);
  if(!reachable.has(target)){reachable.add(target);queue.push(target);}
}
assert.deepEqual([...reachable].sort((a,b)=>a-b),[1,2,3,4,5,6,7,riftIndex],'the original connected component follows the rift map');
assert.deepEqual(worldNeighbors(0),[],'the commemorative challenge does not acquire world-travel exits');
assert.deepEqual(worldNeighbors(8),[],'the independent new map is entered through world selection');
assert.deepEqual(new Set(worldNeighbors(4)),new Set([3,5,2]),'the complete city connects to the coast, mountains and ruins');
assert.deepEqual(new Set(worldNeighbors(7)),new Set([6,2]),'the complete ember world connects to the snowfield and ruins');
const outlines=new Set();
// Run the unchanged connection and route requirements on every full world,
// including all fixed ember slots and all three bridge passages.
for(const [index,region] of existingRegions.entries())for(const seed of region.naturalIsland?[region.seed]:[0,index,17,91]) {
  const island=new Island({region:region.id,seed}),portals=worldNeighbors(index).map(target=>island.plan[`portal:${target}`]);
  if(seed===0)outlines.add(JSON.stringify(region.authored?region.authored.boundaries:island.points));
  assert.equal(island.points.length,region.authored?4:128,'authored maps retain rectangular bounds; procedural coasts retain their bounded geometry');
  assert.deepEqual(new Island({region:region.id,seed}).plan,island.plan,'generation is deterministic');
  assert.equal(Object.keys(island.plan).filter(key=>key.startsWith('portal:')).length,region.naturalIsland?2:portals.length,'historic clearings can remain without activating inter-world travel');
  for(const key of ['merchant','supply','occupied','castle','hunt','rescue','rune','rescue-warden','dogcamp','owlroost','golemaltar','stonevault'])assert(island.plan[key],`${region.id} retains ${key}`);
  for(const portal of portals){
    assert(island.isDry(portal.x,portal.y,region.authored?24:portal.r+100));
    for(const other of portals)if(other!==portal)assert(Math.hypot(portal.x-other.x,portal.y-other.y)>600,'all endpoints have separated arenas');
  }
  if(region.authored){
    const terrain=new Terrain({region:region.id,seed,island});
    for(const target of worldNeighbors(index)){
      const point=island.plan[`portal:${target}`];assert(terrain.isFree(point.x,point.y,24),'a natural world exit has full-body standing room');
    }
    for(const passage of island.layout.passages){
      if(passage.gateId)continue;
      for(let i=1;i<passage.waypoints.length;i++){
        const a=passage.waypoints[i-1],b=passage.waypoints[i];
        assert(!terrain.rift.firstBlocker(a.x,a.y,b.x,b.y,24),`${region.id}/${passage.id}: every declared route has a continuous body sweep`);
      }
    }
    continue;
  }
  // A connected route can bend around woods and lakes. Requiring a direct
  // origin-to-gate corridor would forbid the world's deliberate detours.
  const key=(x,y)=>`${Math.round(x*1000)},${Math.round(y*1000)}`,links=new Map();
  for(const route of island.routes){
    assert(island.containsCapsule(route.ax,route.ay,route.bx,route.by,route.r,island.shallowWidth),'complete route segments stay on land');
    const a=key(route.ax,route.ay),b=key(route.bx,route.by);
    if(!links.has(a))links.set(a,new Set());if(!links.has(b))links.set(b,new Set());
    links.get(a).add(b);links.get(b).add(a);
  }
  const connected=new Set([key(0,0)]),pending=[key(0,0)];
  for(const point of pending)for(const next of links.get(point)||[])if(!connected.has(next)){connected.add(next);pending.push(next);}
  for(const [name,point] of Object.entries(island.plan))assert(connected.has(key(point.x,point.y+96)),`${region.id}/${seed}: route network misses ${name}`);
}
assert.equal(outlines.size,existingRegions.length,'every complete world has its own authored terrain or procedural outline');

// Catalog position is identity, never an exponential difficulty multiplier.
const guardianHp=[];
for(const [regionIndex,region] of existingRegions.entries()){
  const fixture={_features:{adventure:true},regionIndex,region,time:0,easy:false,_spawnEnemy:()=>({id:1,r:49,type:'boss'}),_moveEntity:()=>{}};
  const regions=new Regions(fixture),portal={id:'test',x:900,y:0};let guardian;
  fixture._initializeRegionalBoss=boss=>{guardian=boss;};regions._spawnGuardian(portal);guardianHp.push(guardian.maxHp);
  regions.unlockedConnections=new Set(['0:1','1:2','0:2']);regions._spawnGuardian(portal);assert(guardian.maxHp>guardianHp.at(-1),'route progress increases guardian strength');
}
assert(Math.max(...guardianHp)/Math.min(...guardianHp)<1.11,'early volcano travel does not inherit index-seven boss growth');

let randomSeed=913071;Math.random=()=>((randomSeed=(Math.imul(1664525,randomSeed)+1013904223)>>>0)/4294967296);
const game=new Game();game.player.xpNext=Infinity;game.crystalsNext=Infinity;game._spawn=Infinity;game._shot=Infinity;
const traveled=new Set();
assert.equal(game.regions.states.size,0,'worlds are generated on arrival, not all at startup');
const feet=point=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);};
const verify=()=>{
  assert.equal(game.terrain.region,game.region.id);
  assert.equal(game.terrain.island.region,game.region.id);
  assert.deepEqual(game.regions.portals.map(portal=>portal.nextRegionIndex).sort((a,b)=>a-b),[...worldNeighbors(game.regionIndex)].sort((a,b)=>a-b));
  for(const portal of game.regions.portals){
    const door=portalDoor(portal);assert(game.terrain.isFree(door.x,door.y,game.player.r));
    assert(game.terrain.island.isDry(portal.x,portal.y,portal.natural?24:200));
    if(portal.natural)assert.equal(portal.state,'active','natural mountain passes and bridges have no guardian lock');
    assert.equal(game.enemies.filter(enemy=>enemy.hp>0&&enemy.portalId===portal.id).length,portal.state==='locked'?1:0);
    assert.equal(game.settlements.sites.filter(site=>site.anchorId===portal.id).length,0,'gate angels remain removed; the starting sanctuary is preserved');
  }
};
function travel(target){
  verify();const from=game.regionIndex,portal=game.regions.portals.find(candidate=>candidate.nextRegionIndex===target);assert(portal);
  if(portal.state==='locked'){
    const boss=game.enemies.find(enemy=>enemy.id===portal.bossId);assert(boss);
    feet({x:portal.x,y:portal.y+240});game.regionGrace=0;game.regions.update();
    const before=game.regions.defeatedConnectionsCount;game._hurtEnemy(boss,boss.hp+1);
    assert.equal(game.regions.defeatedConnectionsCount,before+1);assert(game.regions.flushReward());
    assert(game.chooseSuper(game.getSuperChoices()[0].id));assert(portal.rewardClaimed);
    assert(game.regions.claimedConnections.has(worldConnectionId(from,target)));
  }
  const before={kills:game.kills,gold:game.gold,crystals:game.crystals,claimed:game.regions.claimedConnections.size};
  feet(portalDoor(portal));assert(game.enterPortal(portal.id));assert.equal(game.regionIndex,target);verify();traveled.add(`${from}:${target}`);
  assert.equal(game.regions.portals.find(candidate=>candidate.nextRegionIndex===from).state,'active');
  assert.deepEqual({kills:game.kills,gold:game.gold,crystals:game.crystals,claimed:game.regions.claimedConnections.size},before,'arrival never grants another guardian reward');
  assert(game.regions.states.size<REGIONS.length);assert.equal(game.regions.endlessUnlocked,false,'world exploration never enables the survival wave rules');
}
for(const target of [1,2,riftIndex,3,4,5,6,7,2,4])travel(target);
assert.equal(game.regions.defeatedConnectionsCount,WORLD_CONNECTIONS.length);
const naturalConnections=WORLD_CONNECTIONS.filter(([a,b])=>REGIONS[a].authored||REGIONS[b].authored).length;
assert.equal(game.regions.claimedConnections.size,WORLD_CONNECTIONS.length-naturalConnections,'only defeated guardian routes grant guardian rewards');
assert.equal(game.regions.states.size,reachable.size-1,'unconnected maps are not generated during travel');
const rewards={kills:game.kills,gold:game.gold,crystals:game.crystals};
for(const target of [3,riftIndex,2,7,6,5,4,2,1,riftIndex])travel(target);
assert.deepEqual({kills:game.kills,gold:game.gold,crystals:game.crystals},rewards,'return routes cannot farm completed gates');
for(const [a,b] of [[3,4],[4,5],[4,2],[6,7],[7,2]])for(const [from,to] of [[a,b],[b,a]])assert(traveled.has(`${from}:${to}`),'every replacement connection is actually traveled in both directions');

// New exits must be reachable by normal full-body movement from each world's
// starting point, with all static scenery and building colliders still active.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let walkedExitCount=0,walkingSteps=0;
for(const id of ['clockshadow-city','ember-realm-large']){
  const walkGame=new Game({mode:'world',worldId:id}),layout=walkGame.terrain.island.layout;
  walkGame.enemies=[];walkGame.player.xpNext=walkGame.crystalsNext=Infinity;
  const foot=()=>({x:walkGame.player.x,y:walkGame.player.y+groundOffset(walkGame.player,true)});
  const navigation=terrainNavigation(walkGame.terrain);
  for(const portal of walkGame.regions.portals){
    const target=portalDoor(portal),label=`${id} → ${WORLD_IDS[portal.nextRegionIndex]}`;
    walkGame.player.x=layout.spawn.x;walkGame.player.y=layout.spawn.y-groundOffset(walkGame.player,true);
    const reservation=walkGame.terrain.island.plan[`portal:${portal.nextRegionIndex}`];
    for(const [key,site] of Object.entries(walkGame.terrain.island.plan))if(!key.startsWith('portal:'))assert(distance(reservation,site)>reservation.r+site.r,`${label}: exit reservation does not overlap ${key}`);
    assert(walkGame.terrain.isFree(target.x,target.y,walkGame.player.r),`${label}: the actual entrance has full-body standing space`);
    for(let leg=0;distance(foot(),target)>.04&&leg<300;leg++){
      const path=navigation.find(foot(),target,walkGame.player.r,'ground');
      assert(path?.length,`${label}: normal navigation finds a route from spawn`);
      const beforeLeg=foot();
      for(const waypoint of path){
        assert(!walkGame.terrain.firstBlocker(foot().x,foot().y,waypoint.x,waypoint.y,walkGame.player.r),`${label}: each path segment passes a complete body sweep`);
        for(let step=0;distance(foot(),waypoint)>.025&&step<5000;step++){
          const before=foot(),remaining=distance(before,waypoint),travel=Math.min(walkGame.player.speed/30,remaining);
          walkGame._moveEntity(walkGame.player,(waypoint.x-before.x)/remaining*travel,(waypoint.y-before.y)/remaining*travel,true);
          const after=foot(),advance=distance(before,after);
          assert(advance>.0001&&advance<=travel+.01,`${label}: ordinary movement advances within its speed budget`);
          assert(walkGame.terrain.isFree(after.x,after.y,walkGame.player.r),`${label}: walking never enters terrain or scenery`);walkingSteps++;
        }
        assert(distance(foot(),waypoint)<.04,`${label}: local walking completes`);
      }
      assert(distance(beforeLeg,foot())>.01,`${label}: the route advances`);
    }
    assert(distance(foot(),target)<.04,`${label}: spawn-to-exit walking reaches the destination`);walkedExitCount++;
  }
}
assert.equal(walkedExitCount,5,'all new city and ember entrances are reachable');
const standalone=new Game({mode:'world',worldId:'verdant-rift'});
assert.equal(standalone.regionIndex,8);assert.equal(standalone.worldId,'verdant-rift');assert.equal(standalone.startWorldId,'verdant-rift');
assert.equal(standalone.regions.portals.length,0);assert.equal(standalone.portal,null);assert.equal(standalone.regions.states.size,0);
assert.notEqual(standalone.terrain.island.layout,worldForLegacy());
function worldForLegacy(){return new Island({region:'rift-forest'}).layout;}
const exploration=standalone.riftExploration,chest=exploration.sites.find(site=>site.kind==='chest');assert(chest);
chest.state='claimed';const mapId=standalone.mapId;standalone.regions.saveWorld();standalone.riftExploration=null;
assert(standalone.regions.restoreWorld(mapId));assert.equal(standalone.riftExploration,exploration);assert.equal(chest.state,'claimed','map snapshots preserve claimed rewards');
assert(standalone.riftExploration.sites.every(site=>site.id.includes('verdant-rift')),'authored interactions are namespaced independently');
assert.equal(standalone.regions.endlessUnlocked,false);
console.log(`World connections: ten current worlds, ten routes, all five replaced links traveled in both directions, five new exits reached with ${walkingSteps} ordinary movement steps, persistent rewards and separate forest/verdant maps passed.`);
