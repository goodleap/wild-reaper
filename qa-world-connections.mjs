import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Regions, worldConnectionId } from './dist/regions.js';
import { REGIONS, WORLD_IDS, WORLD_CONNECTIONS, worldNeighbors } from './dist/world-definitions.js';
import { portalDoor } from './dist/portal-geometry.js';

const legacyIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano'];
assert.deepEqual(WORLD_IDS,[...legacyIds,'verdant-rift','clockshadow-city','ember-realm-large']);
const existingRegions=REGIONS.slice(0,10);
assert.deepEqual(WORLD_CONNECTIONS,[[0,1],[1,2],[0,2],[0,3],[3,4],[4,5],[5,6],[6,7],[7,2],[4,2]],'all ten legacy world connections retain their identities');
assert.equal(new Set(WORLD_CONNECTIONS.map(([a,b])=>worldConnectionId(a,b))).size,WORLD_CONNECTIONS.length);
const reachable=new Set([0]),queue=[0];
for(const index of queue)for(const target of worldNeighbors(index)){
  assert(worldNeighbors(target).includes(index));assert.notEqual(index,target);
  if(!reachable.has(target)){reachable.add(target);queue.push(target);}
}
assert.deepEqual([...reachable].sort((a,b)=>a-b),legacyIds.map((_,index)=>index),'the original connected component is preserved');
assert.deepEqual(worldNeighbors(8),[],'the independent new map is entered through world selection');
assert.deepEqual(worldNeighbors(9),[],'the independent city retains its selection identity');
assert.deepEqual(worldNeighbors(10),[],'the region sample cannot create a hidden world connection');
const outlines=new Set();
// Keep complete-world generation/route regression fixtures on their original
// ten destinations. The new region sample has its own scoped route checks.
for(const [index,region] of existingRegions.entries())for(const seed of [0,index,17,91]) {
  const island=new Island({region:region.id,seed}),portals=worldNeighbors(index).map(target=>island.plan[`portal:${target}`]);
  if(seed===0)outlines.add(JSON.stringify(region.authored?region.authored.boundaries:island.points));
  assert.equal(island.points.length,region.authored?4:128,'authored maps retain rectangular bounds; procedural coasts retain their bounded geometry');
  assert.deepEqual(new Island({region:region.id,seed}).plan,island.plan,'generation is deterministic');
  assert.equal(Object.keys(island.plan).filter(key=>key.startsWith('portal:')).length,portals.length);
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
assert.equal(outlines.size,existingRegions.length,'every existing complete world has its own authored terrain or procedural outline');

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
assert.equal(game.regions.states.size,0,'worlds are generated on arrival, not all at startup');
const feet=point=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);};
const verify=()=>{
  assert.equal(game.terrain.region,game.region.id);
  assert.equal(game.terrain.island.region,game.region.id);
  assert.deepEqual(game.regions.portals.map(portal=>portal.nextRegionIndex).sort((a,b)=>a-b),worldNeighbors(game.regionIndex));
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
  feet(portalDoor(portal));assert(game.enterPortal(portal.id));assert.equal(game.regionIndex,target);verify();
  assert.equal(game.regions.portals.find(candidate=>candidate.nextRegionIndex===from).state,'active');
  assert.deepEqual({kills:game.kills,gold:game.gold,crystals:game.crystals,claimed:game.regions.claimedConnections.size},before,'arrival never grants another guardian reward');
  assert(game.regions.states.size<REGIONS.length);assert.equal(game.regions.endlessUnlocked,false,'world exploration never enables the survival wave rules');
}
for(const target of [1,2,0,3,4,5,6,7,2,4])travel(target);
assert.equal(game.regions.defeatedConnectionsCount,WORLD_CONNECTIONS.length);
const naturalConnections=WORLD_CONNECTIONS.filter(([a,b])=>REGIONS[a].authored||REGIONS[b].authored).length;
assert.equal(game.regions.claimedConnections.size,WORLD_CONNECTIONS.length-naturalConnections,'only defeated guardian routes grant guardian rewards');
assert.equal(game.regions.states.size,legacyIds.length-1,'the new starting map is not generated during legacy travel');
const rewards={kills:game.kills,gold:game.gold,crystals:game.crystals};
for(const target of [3,0,2,7,6,5,4,2,1,0])travel(target);
assert.deepEqual({kills:game.kills,gold:game.gold,crystals:game.crystals},rewards,'return routes cannot farm completed gates');
const standalone=new Game({mode:'world',worldId:'verdant-rift'});
assert.equal(standalone.regionIndex,8);assert.equal(standalone.worldId,'verdant-rift');assert.equal(standalone.startWorldId,'verdant-rift');
assert.equal(standalone.regions.portals.length,0);assert.equal(standalone.portal,null);assert.equal(standalone.regions.states.size,0);
assert.notEqual(standalone.terrain.island.layout,worldForLegacy());
function worldForLegacy(){return new Island({region:'forest'}).layout;}
const exploration=standalone.riftExploration,chest=exploration.sites.find(site=>site.kind==='chest');assert(chest);
chest.state='claimed';const mapId=standalone.mapId;standalone.regions.saveWorld();standalone.riftExploration=null;
assert(standalone.regions.restoreWorld(mapId));assert.equal(standalone.riftExploration,exploration);assert.equal(chest.state,'claimed','map snapshots preserve claimed rewards');
assert(standalone.riftExploration.sites.every(site=>site.id.includes('verdant-rift')),'authored interactions are namespaced independently');
assert.equal(standalone.regions.endlessUnlocked,false);
console.log('World connections: unchanged 8-world/10-route component, natural exits, guardian rewards, persistent travel, independent ninth-world selection and isolated claimed-objective state passed.');
