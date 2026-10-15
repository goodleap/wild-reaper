import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { REGIONS, regionFor, normalizeWorldIndex, worldNeighbors } from './dist/regions.js';
import { portalDoor } from './dist/portal-geometry.js';

let seed=314159;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const g=new Game();
g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._spawn=Infinity;g._shot=Infinity;g._lightning=Infinity;
const feet=(point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const gate=target=>g.regions.portals.find(portal=>portal.nextRegionIndex===target);
function verifyWorld() {
  const island=g.terrain.island;assert(island);assert.equal(island.worldId,g.regionIndex);
  assert.equal(g.regions.portals.length,worldNeighbors(g.regionIndex).length);
  assert.deepEqual(new Set(g.regions.portals.map(p=>p.nextRegionIndex)),new Set(worldNeighbors(g.regionIndex)));
  for(const portal of g.regions.portals){
    assert.equal(portal.id,`portal:${g.regionIndex}:${portal.nextRegionIndex}`);
    assert.equal(portal.targetPortalId,`portal:${portal.nextRegionIndex}:${g.regionIndex}`);
    const planned=island.plan[`portal:${portal.nextRegionIndex}`];
    assert(Math.hypot(portal.x-planned.x,portal.y-planned.y)<=97,'a world gateway uses its planned district');
    assert(island.isDry(portal.x,portal.y,200));const door=portalDoor(portal);assert(g.terrain.isFree(door.x,door.y,g.player.r),'the front opening must fit the player between its solid jambs');
    const guardians=g.enemies.filter(enemy=>enemy.portalId===portal.id&&enemy.hp>0);
    assert.equal(guardians.length,portal.state==='locked'?1:0);
  }
  for(const type of ['merchant','supply','occupied','castle']){
    const site=g.settlements.sites.find(site=>site.type===type);assert(site,`${g.region.id} must retain its ${type}`);
    const point=island.plan[type];assert(Math.hypot(site.x-point.x,site.y-point.y)<82,'settlements remain distributed among their reserved districts');
    assert(g.terrain.isFree(site.door.x,site.door.y,20));assert(island.isDry(site.door.x,site.door.y,40));
  }
  for(const type of g.region.id==='ruins'?['hunt','rescue','rune']:['hunt','rescue']){
    const site=g.relicSites.sites.find(site=>site.type===type);assert(site,`${g.region.id} must retain its ${type} relic`);
    assert(Math.hypot(site.x-island.plan[type].x,site.y-island.plan[type].y)<82);
    const approachY=site.door.y+(type==='rescue'?20:0);
    assert(g.terrain.isFree(site.door.x,approachY,20),'the closed rescue door remains approachable within its interaction range');
  }
}
function unlock(target) {
  const portal=gate(target);assert.equal(portal.state,'locked');
  const boss=g.enemies.find(e=>e.id===portal.bossId);assert(boss);
  feet({x:portal.x,y:portal.y+250});g.regionGrace=0;g.regions.update();
  const before={kills:g.kills,bossKills:g.bossKills,gold:g.gold,count:g.regions.defeatedConnectionsCount};
  g._hurtEnemy(boss,boss.hp+1);
  assert.equal(g.kills,before.kills+1);assert.equal(g.bossKills,before.bossKills+1);
  assert.equal(g.gold,before.gold+30);assert.equal(g.regions.defeatedConnectionsCount,before.count+1);
  assert.equal(portal.state,'active');assert.equal(g.superSkills.pending.source,'region');
  assert(g.regions.flushReward());assert.equal(g.status,'super');
  const choices=g.getSuperChoices().map(c=>c.id);g.regions.openPortal(boss);assert.deepEqual(g.getSuperChoices().map(c=>c.id),choices);
  assert(g.chooseSuper(choices[0]));assert(portal.rewardClaimed);
  return portal;
}
function travel(target){const portal=gate(target);feet(portalDoor(portal));assert(g.enterPortal(portal.id));assert.equal(g.regionIndex,target);assert(g.regions.states.size<REGIONS.length);assert.equal(gate(Number(portal.id.split(':')[1])).state,'active');}

for(const value of [-9,-1,0,1,2,3,600,NaN])assert(REGIONS[normalizeWorldIndex(value)]);
assert.equal(regionFor(REGIONS.length).id,'forest');assert.equal(regionFor(-1).id,'volcano');
verifyWorld();
const original={terrain:g.terrain,settlements:g.settlements,relicSites:g.relicSites,gateToTwo:gate(2)};
const merchant=g.settlements.sites.find(s=>s.type==='merchant');merchant.state='spent';
const hunt=g.relicSites.sites.find(s=>s.type==='hunt');hunt.state='cleared';hunt.progress=hunt.goal;
const castle=g.settlements.sites.find(s=>s.type==='castle'),castleProgress={id:castle.id,rewardClaimed:true,visited:new Set([1,2])};g.dungeon.states.set(castle.id,castleProgress);
g.discoveredMap.add(castle.id);
unlock(1);travel(1);verifyWorld();assert.equal(g.regions.defeatedConnectionsCount,1);
assert(!g.enemies.some(e=>e.portalId===gate(0).id),'newly initialized opposite end never respawns a defeated connection boss');
unlock(2);travel(2);verifyWorld();assert.equal(g.regions.defeatedConnectionsCount,2);assert.equal(g.regions.endlessStartedAt,null);
const oldForest=g.regions.states.get(0),remoteBoss=oldForest.enemies.find(e=>e.portalId===original.gateToTwo.id);assert(remoteBoss&&remoteBoss.hp>0);
g.time=321;unlock(0);
assert.equal(g.regions.endlessUnlocked,false);assert.equal(g.regions.endlessStartedAt,null,'world clear progress never starts survival waves');
assert.equal(original.gateToTwo.state,'active');assert(original.gateToTwo.rewardClaimed);
assert(!oldForest.enemies.includes(remoteBoss),'opening an already visited opposite end despawns its dormant boss without another kill');
assert(remoteBoss.hp>0,'opposite boss removal never routes through damage');
travel(0);assert.equal(g.terrain,original.terrain);assert.equal(g.settlements,original.settlements);assert.equal(g.relicSites,original.relicSites);
assert.equal(merchant.state,'spent');assert.equal(hunt.state,'cleared');assert.equal(g.dungeon.states.get(castle.id),castleProgress);assert(g.discoveredMap.has(castle.id));
assert(!g.enemies.some(e=>[gate(1).id,gate(2).id].includes(e.portalId)&&e.hp>0));
const rewardState={kills:g.kills,bossKills:g.bossKills,gold:g.gold,crystals:g.crystals,skills:JSON.stringify(g.superSkills.owned)};
for(const target of [2,1,0,1,2,0]){
  travel(target);verifyWorld();assert.equal(g.superSkills.pending,null);assert.equal(g.regions.unlockedConnections.size,3);assert.equal(g.regions.states.size,2);
  assert.deepEqual({kills:g.kills,bossKills:g.bossKills,gold:g.gold,crystals:g.crystals,skills:JSON.stringify(g.superSkills.owned)},rewardState,'return journeys preserve progress and cannot farm rewards');
  for(const portal of g.regions.portals)assert.equal(g.settlements.sites.filter(site=>site.anchorId===portal.id).length,portal.state==='active'?1:0,'each active gate has exactly one persistent angel');
}
console.log('Island worlds: original route retained in expanded graph, planned dry landmarks, paired gateways, single connection rewards, no remote boss duplication, retained castle/merchant/relic progress, bounded snapshots and finite world populations passed.');
