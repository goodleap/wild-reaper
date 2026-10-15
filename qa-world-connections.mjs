import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { groundOffset } from './dist/terrain.js';
import { Regions, worldConnectionId } from './dist/regions.js';
import { REGIONS, WORLD_IDS, WORLD_CONNECTIONS, worldNeighbors } from './dist/world-definitions.js';
import { portalDoor } from './dist/portal-geometry.js';

assert.deepEqual(WORLD_IDS,['forest','marsh','ruins','beach','city','mountain','snow','volcano']);
assert.equal(new Set(WORLD_CONNECTIONS.map(([a,b])=>worldConnectionId(a,b))).size,WORLD_CONNECTIONS.length);
const reachable=new Set([0]),queue=[0];
for(const index of queue)for(const target of worldNeighbors(index)){
  assert(worldNeighbors(target).includes(index));assert.notEqual(index,target);
  if(!reachable.has(target)){reachable.add(target);queue.push(target);}
}
assert.equal(reachable.size,REGIONS.length);
const outlines=new Set();
for(const [index,region] of REGIONS.entries())for(const seed of [0,index,17,91]) {
  const island=new Island({region:region.id,seed}),portals=worldNeighbors(index).map(target=>island.plan[`portal:${target}`]);
  if(seed===0)outlines.add(JSON.stringify(island.points));
  assert.equal(island.points.length,128,'new worlds keep the existing bounded coast geometry');
  assert.deepEqual(new Island({region:region.id,seed}).plan,island.plan,'generation is deterministic');
  assert.equal(Object.keys(island.plan).filter(key=>key.startsWith('portal:')).length,portals.length);
  for(const key of ['merchant','supply','occupied','castle','hunt','rescue','rune','rescue-warden','dogcamp','owlroost','golemaltar','stonevault'])assert(island.plan[key],`${region.id} retains ${key}`);
  for(const portal of portals){
    assert(island.isDry(portal.x,portal.y,portal.r+100));
    for(const other of portals)if(other!==portal)assert(Math.hypot(portal.x-other.x,portal.y-other.y)>600,'all endpoints have separated arenas');
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
assert.equal(outlines.size,REGIONS.length,'every world has its own outline');

// Catalog position is identity, never an exponential difficulty multiplier.
const guardianHp=[];
for(const [regionIndex,region] of REGIONS.entries()){
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
    assert(game.terrain.island.isDry(portal.x,portal.y,200));
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
assert.equal(game.regions.claimedConnections.size,WORLD_CONNECTIONS.length);
assert.equal(game.regions.states.size,REGIONS.length-1);
const rewards={kills:game.kills,gold:game.gold,crystals:game.crystals};
for(const target of [3,0,2,7,6,5,4,2,1,0])travel(target);
assert.deepEqual({kills:game.kills,gold:game.gold,crystals:game.crystals},rewards,'return routes cannot farm completed gates');
console.log('World connections: eight distinct deterministic islands, all ten bidirectional routes reachable, dry independent gate approaches, mild progress-based guardians, lazy world creation, persistent rewards, finite territories and no world endless waves passed.');
