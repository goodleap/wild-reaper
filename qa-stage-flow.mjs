import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { portalDoor } from './dist/portal-geometry.js';
import { movementProfile } from './dist/height-rules.js';

let seed=801937;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const place=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const quiet=g=>{g.player.xpNext=g.crystalsNext=Infinity;g.gold=1000;};
const stage=()=>{const g=new Game({stageId:'forest-trial'});quiet(g);return g;};
function travel(g,target){
  const portal=g.regions.portals.find(p=>p.nextMapId===target);assert(portal,'a paired travel endpoint exists');
  place(g,portalDoor(portal));assert(g.canEnterPortal(portal.id));assert(g.requestInteraction(portal.id));
  for(let frame=0;frame<32&&g.sceneTransition.active;frame++)g.update(.025);
  assert.equal(g.sceneTransition.active,false);assert.equal(g.mapId,target);assert.equal(g.region.id,'forest');
  assert.equal(g.regionIndex,0,'theme identity does not change between same-theme maps');
  const foot={x:g.player.x,y:g.player.y+groundOffset(g.player,true)};
  assert(g.terrain.isFree(foot.x,foot.y,g.player.r),'arrival is walkable');
  const arrival=g.regions.portals.find(p=>p.connectionId===portal.connectionId),door=portalDoor(arrival);
  assert(Math.hypot(foot.x-door.x,foot.y-door.y)<135,'arrival remains at the receiving gate');
  for(const member of g.companions.members){
    const point={x:member.x,y:member.y+groundOffset(member,true)};
    assert(g.terrain.isFree(point.x,point.y,member.r,movementProfile(member)),'companion arrival clears terrain');
    assert(Math.hypot(point.x-foot.x,point.y-foot.y)>member.r+g.player.r,'companions do not overlap the hero');
  }
  for(let frame=0;frame<3;frame++)g.touchInteractions.update();
  assert.equal(g.sceneTransition.active,false,'arrival never bounces through the paired gate');
}
function kill(g,boss){
  place(g,{x:boss.stageHome.x,y:boss.stageHome.y+150});g.regionGrace=0;
  assert(g._hurtEnemy(boss,boss.hp+1)>0);g.regions.flushReward();
  assert.equal(g.status,'super','boss rewards are offered immediately');
}
function claim(g){assert(g.chooseSuper(g.getSuperChoices()[0].id));assert.equal(g.status,'playing');}

const g=stage(),outer=g.mapId,outerTerrain=g.terrain,outerSettlements=g.settlements;
const optional=g.enemies.find(e=>e.stageBossRole==='optional');assert(optional);
assert.equal(g.stage.currentIsland.role,'outer');assert.equal(g.regions.portals.length,1);
assert.equal(g.regions.portals[0].state,'active');assert(!g.regions.portals.some(p=>p.kind==='victory'));
const supply=g.settlements.sites.find(s=>s.type==='supply');assert(supply);supply.state='spent';
const spawnAngel=g.settlements.sites.find(s=>s.type==='angel');assert(spawnAngel?.anchorId.startsWith('spawn:'));
assert.equal(g.settlements.sites.filter(s=>s.type==='angel').length,1,'only the original outer-island spawn has an angel');
g.discoveredMap.add('qa:outer');g.dropGold(0,0,7);const outerCoins=g.coins;
g.adventure.furyTime=20;g.adventure.magnetTime=30;
optional.hp-=123;const optionalHp=optional.hp;
assert(g.companions.recruit('warden'));const member=g.companions.members[0],build=g.build;
optional.guardActive=true;
travel(g,'forest-heart');
assert.equal(g.build,build);assert.equal(g.companions.members[0],member);
assert.equal(g.regions.states.get(outer).terrain,outerTerrain);
assert.equal(g.stage.currentIsland.role,'boss');assert.equal(g.environment.generation,false);assert.equal(g.adventure.generation,false);assert.equal(g.encounters,null);
assert.equal(g.environment.props.length,0);assert.equal(g.environment.muds.length,0);assert.equal(g.adventure.props.length,0);
assert.equal(g.adventure.furyTime,20);assert.equal(g.adventure.magnetTime,30,'temporary supplies follow the player between islands');
assert.equal(g.relicSites.sites.length,0);assert.equal(g.settlements.sites.length,0,'core arena contains no buildings or portal guardian angels');
assert.equal(g.companions.generation,false,'companions remain, but no rescue camps spawn on the core island');
let core=g.enemies.find(e=>e.stageBossRole==='core');assert(core);assert.equal(g.enemies.length,1);
const coreStats={hp:core.maxHp,damage:core.damage,speed:core.speed};
g._spawn=0;g.nextBossAt=0;g.player.hp=g.player.maxHp;member._attack=member._scan=Infinity;
for(let frame=0;frame<700;frame++)g.update(.05);
assert.equal(g.status,'playing');assert.equal(g.enemies.length,1);assert.equal(g.waveDirector.count,0,'core island never starts ordinary waves');
assert.equal(g.adventure.furyTime,0);assert.equal(g.adventure.magnetTime,0,'buff timers continue on the core island');
core.hp-=321;const coreHp=core.hp,coreTerrain=g.terrain;
travel(g,outer);
assert.equal(g.terrain,outerTerrain);assert.equal(g.settlements,outerSettlements);assert.equal(supply.state,'spent');
assert.deepEqual(g.settlements.sites.filter(s=>s.type==='angel'),[spawnAngel],'the original spawn haven survives world restoration without gate guardians');
assert.equal(g.adventure.furyTime,0);assert.equal(g.adventure.magnetTime,0,'returning does not resurrect expired supplies');
assert(g.discoveredMap.has('qa:outer'));assert.equal(g.coins,outerCoins);assert.equal(optional.hp,optionalHp);
assert.equal(g.build,build);assert.equal(g.companions.members[0],member);
assert.equal(g.stage.coreDefeated,false);assert.equal(g.stage.completed,false);
kill(g,optional);const optionalGold=g.gold;
assert.equal(g.regions.openPortal(optional),null,'repeated notification cannot duplicate an optional reward');assert.equal(g.gold,optionalGold);
assert(!g.stage.coreDefeated);assert(!g.regions.portals.some(p=>p.kind==='victory'));claim(g);
assert.equal(g.stage.objectives.get(outer).rewardClaimed,true);
travel(g,'forest-heart');assert.equal(g.terrain,coreTerrain);core=g.enemies.find(e=>e.stageBossRole==='core');assert.equal(core.hp,coreHp);
const beforeGold=g.gold;kill(g,core);
assert.equal(g.gold-beforeGold,60,'core challenge grants the larger currency reward');
assert(g.stage.coreDefeated);assert(!g.stage.completed,'defeating the core does not end the run automatically');
const exit=g.regions.portals.find(p=>p.kind==='victory');assert(exit);assert.equal(g.regions.portals.filter(p=>p.kind==='victory').length,1);
place(g,portalDoor(exit));assert.equal(g.canEnterPortal(exit.id),false,'pending boss reward blocks all gates');
assert.equal(g.stage.complete(),false);assert.equal(g.regions.openPortal(core),null);claim(g);
travel(g,outer);assert(!g.enemies.some(e=>e.stageBoss),'defeated outer boss stays defeated');
assert.equal(g.stage.coreDefeated,true);travel(g,'forest-heart');assert(!g.enemies.some(e=>e.stageBoss));
assert.equal(g.regions.portals.filter(p=>p.kind==='victory').length,1,'return does not duplicate the victory gate');
place(g,{x:exit.x+30,y:exit.y+18});assert.equal(g.canEnterPortal(exit.id),false,'side contact is blocked');assert.equal(g.stage.complete(),false);
place(g,{x:exit.x,y:exit.y-20});assert.equal(g.canEnterPortal(exit.id),false,'rear contact is blocked');
place(g,portalDoor(exit));assert.equal(g.getInteraction().type,'stageExit');assert(g.requestInteraction(exit.id));
assert.equal(g.status,'victory');assert(g.stage.completed);assert.equal(g.sceneTransition.active,false,'direct completion cannot stall a fade');
const completedTime=g.runTime;g.update(.05);assert.equal(g.runTime,completedTime);assert.equal(g.stage.complete(),false);
assert.equal(g.events.filter(e=>e.type==='victory').length,1);

const delayed=stage();delayed.time=100000;travel(delayed,'forest-heart');
const delayedBoss=delayed.enemies.find(e=>e.stageBossRole==='core');
assert.deepEqual({hp:delayedBoss.maxHp,damage:delayedBoss.damage,speed:delayedBoss.speed},coreStats,'waiting on the outer island does not inflate the core boss');
assert.equal(delayed.stage.coreDefeated,false);assert.equal(delayed.stage.completed,false);assert.equal(delayed.regions.states.size,1,'a fresh run has its own snapshots');
delayed.player.invuln=0;delayed.combat.damagePlayer(1e9);assert.equal(delayed.status,'dead');assert.equal(delayed.stage.completed,false);
assert.equal(delayed.stage.complete(),false);assert(!delayed.events.some(e=>e.type==='victory'));
const legacy=new Game({adventure:false});assert.equal(legacy.stage,null);assert.equal(legacy.mapId,0,'legacy mode keeps its old state identity');
console.log('Stage flow: optional boss, fixed core, same-theme persistence, companions, rewards, entry geometry, victory/death and restart passed.');
