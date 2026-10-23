import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { WORLD_IDS, worldForId, worldNeighbors } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { relicSiteProfile } from './dist/site-definitions.js';
import { containsWater, waterIntersectsCircle, waterIntersectsCapsule } from './dist/water-geometry.js';
import { WORLD_HAZARD_RULES } from './dist/world-hazards.js';
import { defenseDamageMultiplier } from './dist/combat-stats.js';

const id='ember-realm-large',layout=createRiftLayout(id),report={world:id};
assert.equal(WORLD_IDS.indexOf(id),7);assert.deepEqual(worldNeighbors(7),[2,6]);
assert.equal(layout.emberScene.sample,false);assert.equal(layout.emberScene.revision,2);assert.equal(worldForId(id).name,'熔火之境');
assert.equal(layout.areas.length,17);assert.equal(layout.passages.length,25);assert.equal(layout.passages.filter(p=>p.kind==='bridge').length,3);
assert.equal(layout.interactions.chests.length,10);assert.equal(layout.interactions.caves.length,3);
assert.equal(new Set(layout.interactions.caves.map(c=>c.caveId)).size,3,'the three caves are independent challenges, not invented surface shortcuts');
const old=new Game({mode:'world'}),city=new Game({mode:'world',worldId:'clockshadow-city'}),game=new Game({mode:'world',worldId:id});
assert.equal(game.debug,false);assert.equal(game.mapId,7);assert.equal(game.startWorldId,id);assert.equal(game.worldId,id);
assert.equal(game.player.speed,old.player.speed,'map choice never changes movement speed');
assert.equal(game.region.danger,1.1);assert.deepEqual(game.region.enemyWeights,{"slime": 0.8, "beetle": 1.35, "bat": 1.3, "brute": 1.4, "boar": 0.85, "spore": 0.55, "rootbinder": 0, "boglurker": 0, "prismguard": 0, "tidepriest": 0, "shieldguard": 0, "stoneape": 0.65, "windhunter": 0, "frostmage": 0, "flamelizard": 1});
assert.equal(game.terrain.island.layout,layout);assert.notEqual(game.terrain,old.terrain);assert.notEqual(game.terrain,city.terrain);
for(const other of [old,city]){
  assert.notEqual(game.terrain.island.layout,other.terrain.island.layout);assert.notEqual(game.terrain._cache,other.terrain._cache);
  assert.notEqual(game.riftExploration.sites,other.riftExploration.sites);assert.notEqual(game.dungeon.states,other.dungeon.states);
}
assert.equal(game.regions.portals.length,2);assert.equal(game.regions.states.size,0);assert(game.regions.portals.includes(game.portal),'the active travel hint belongs to an authored exit');
for(const system of ['environment','adventure','encounters','companions'])assert.equal(game[system].generation,false,`${system}: no unconstrained ambient placement on the fixed world`);
assert.equal(game.settlements.generation,true);assert.equal(game.relicSites.generation,true,'fixed real sites remain active independently of ambient timers');
assert.equal(game.territories.groups.length,layout.encounters.length);assert.equal(game.enemies.filter(enemy=>enemy.worldBoss).length,2);
for(const field of game.territories.groups){
  const source=layout.encounters.find(encounter=>field.id.endsWith(`:${encounter.id}`));assert(source);
  assert.equal(field.kind,source.kind);assert.equal(field.members.length,source.count,'every declared finite population is actually instantiated');
  for(const enemy of field.members){
    const p={x:enemy.x,y:enemy.y+groundOffset(enemy)};
    assert(game.terrain.isFree(p.x,p.y,enemy.r));assert.equal(enemy.guardActive,false);
    assert(Math.hypot(p.x-enemy.territoryHome.x,p.y-enemy.territoryHome.y)<.001);
  }
}
const put=point=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);game.regionGrace=0;};
const finish=()=>{for(let i=0;i<30&&game.sceneTransition.active;i++)game.sceneTransition.update(.05);assert.equal(game.sceneTransition.active,false);assert.equal(game.sceneTransition.commitSucceeded,true);};
const request=key=>{assert(game.requestInteraction(key),`the real interaction accepts ${key}`);finish();};
const physicalSites=[...game.settlements.sites.filter(site=>site.type!=='angel'),...game.relicSites.sites];
assert.equal(physicalSites.length,12);assert.equal(Object.keys(layout.plan).length,14);
for(const [key,point] of Object.entries(layout.plan).filter(([key])=>!key.startsWith('portal:'))){
  const site=physicalSites.find(site=>site.key===key||site.type===key);assert(site,`${key}: fixed plan creates its actual site`);
  assert.equal(site.x,point.x,`${key}: no fallback placement changes the approved slot`);assert.equal(site.y,point.y);
  assert(game.terrain.isFree(site.door.x,site.door.y,22),`${key}: the full player/follower body fits the real door approach`);
  if(['supply','occupied','castle'].includes(site.type)){put(site.door);const choice=game.settlements.getInteraction();assert.equal(choice?.id,site.id);assert(choice.label.includes(site.name),`${key}: the real interaction names this map's building`);}
}
assert(game.settlements.sites.some(site=>site.type==='angel'&&site.anchorId==='spawn:7'),'the selected map has its own starting sanctuary');
assert.equal(game.relicSites.sites.filter(site=>site.type==='rescue').length,4);
for(const site of game.relicSites.sites){
  const profile=relicSiteProfile(site);put(profile.anchor==='center'?site:site.door);
  assert.equal(game.relicSites.getInteraction()?.id,site.id,`${site.key}: usable approach selects the actual installed objective`);
}
let zeroAxes=0;
for(const prop of layout.emberScene.props){
  const actual=game.terrain.query(prop.x-1,prop.y-1,prop.x+1,prop.y+1).find(obstacle=>obstacle.id===prop.id);
  assert(actual,`${prop.id}: the authored carrier exists in the actual Game terrain`);
  for(const key of ['x','y','type','r','halfLength','angle','collision'])assert.equal(actual[key],prop[key],`${prop.id}: runtime ${key} must not acquire a legacy fallback footprint`);
  const axisHalf=prop.type==='log'?prop.halfLength:0;
  assert.equal(actual.bounds.minX,prop.x-axisHalf-prop.r);assert.equal(actual.bounds.maxX,prop.x+axisHalf+prop.r);
  assert.equal(actual.bounds.minY,prop.y-prop.r);assert.equal(actual.bounds.maxY,prop.y+prop.r);
  if(prop.halfLength===0){assert.notEqual(actual.type,'log','a circular native carrier cannot trigger the legacy missing-log-length fallback');zeroAxes++;}
}
report.runtimeCarriers=layout.emberScene.props.length;report.zeroAxisCarriers=zeroAxes;
report.fixedSites=physicalSites.map(site=>({id:site.id,type:site.type,key:site.key,x:site.x,y:site.y}));
const surfaces=layout.emberScene.surfaces;assert.equal(surfaces.length,1,'the existing shallow lava hazard has an explicit surface descriptor');
for(const surface of surfaces){
  assert.equal(surface.kind,'lava');assert(containsWater(surface,surface.x,surface.y));
  assert(game.terrain.isFree(surface.x,surface.y,22),'the shallow hazard permits an ordinary grounded body');
  const live=game.environment.muds.find(patch=>patch.id===surface.id);assert(live,'the fixed surface is present despite disabled ambient generation');
  assert.deepEqual(live,surface,'painting, placement and contact damage consume the same fixed descriptor');
  for(const route of layout.routes)assert(!waterIntersectsCapsule(surface,route.ax,route.ay,route.bx,route.by,49),`${route.id}: the full main/branch body route stays outside the shallow hazard`);
  const safeTargets=[...layout.areas.map(area=>area.center),...physicalSites.flatMap(site=>[site.door,{x:site.x,y:site.y}]),...game.riftExploration.sites.flatMap(site=>[site,site.approach].filter(Boolean)),...layout.encounters];
  for(const target of safeTargets)assert(!waterIntersectsCircle(surface,target.x,target.y,24),'an actual required target and its approach never spawn in lava');
  const hazardGame=new Game({mode:'world',worldId:id}),hazards=hazardGame.environment.worldHazards;
  hazardGame.enemies=[];hazardGame.player.x=surface.x;hazardGame.player.y=surface.y-groundOffset(hazardGame.player,true);hazardGame.player.invuln=0;
  const ground=hazardGame._spawnEnemy('slime',1),air=hazardGame._spawnEnemy('bat',1);
  for(const enemy of [ground,air]){enemy.x=surface.x;enemy.y=surface.y-groundOffset(enemy);enemy.hp=enemy.maxHp=1000;}
  const hp=hazardGame.player.hp;assert.equal(hazardGame.environment.movementMultiplier(hazardGame.player),1,'the map does not introduce a new movement penalty');
  hazards.update(0);assert.equal(hazardGame.player.hp,hp-WORLD_HAZARD_RULES.lava.playerDamage*defenseDamageMultiplier(hazardGame.stats.defense),'actual fixed surface uses the existing lava damage value');
  assert.equal(ground.hp,1000-WORLD_HAZARD_RULES.lava.enemyDamage);assert.equal(air.hp,1000,'flying enemies are immune to contact with the shallow surface');
  const after=hazardGame.player.hp;hazardGame.player.invuln=0;hazardGame.player.flying=true;
  for(let i=0;i<Math.ceil(WORLD_HAZARD_RULES.hitInterval/.05)+1;i++)hazards.update(.05);
  assert.equal(hazardGame.player.hp,after,'the same surface respects a flying player profile');
}
report.shallowSurfaces=surfaces.length;

// These transaction checks isolate progression from combat. Full population,
// body-sweep routes and real following retain separate gameplay QA coverage.
game.enemies=[];game.player.xpNext=game.crystalsNext=Infinity;game.player.invuln=1e9;
const chests=game.riftExploration.sites.filter(site=>site.kind==='chest');assert.equal(chests.length,10);
for(const chest of chests){
  assert(chest.id.startsWith(`rift:${id}:`));assert.equal(chest.artTheme,'ember');
  assert(game.terrain.isFree(chest.approach.x,chest.approach.y,22));put(chest.approach);
  assert.equal(game.riftExploration.getInteraction()?.id,chest.id);const before=game.gold;
  assert(game.riftExploration.interact(chest.id));assert(game.gold>before);assert.equal(chest.state,'claimed');
  const claimedGold=game.gold;assert.equal(game.riftExploration.interact(chest.id),false);assert.equal(game.gold,claimedGold);
}
assert(old.riftExploration.sites.filter(site=>site.kind==='chest').every(site=>site.state==='closed'));
assert(city.riftExploration.sites.filter(site=>site.kind==='chest').every(site=>site.state==='closed'));
const merchant=game.settlements.sites.find(site=>site.type==='merchant');put(merchant.door);
assert(game.settlements.interact(merchant.id));assert.equal(game.status,'shop');assert(game.getShopItems().length>0);assert(game.closeShop());
const surfaceTerrain=game.terrain,surfaceExploration=game.riftExploration,interiors=[];
for(const site of game.settlements.sites.filter(site=>['supply','occupied','castle'].includes(site.type))){
  put(site.door);request(site.id);const state=game.dungeon.active;assert(state,'the authored building really enters an interior');
  assert(Array.isArray(state.enemies)&&state.cells.length>0);assert(game.terrain!==surfaceTerrain);put(state.entrance);game.dungeon.update(0);request(`${state.id}:exit`);
  assert.equal(game.terrain,surfaceTerrain);assert.equal(game.riftExploration,surfaceExploration);interiors.push(state.id);
}
assert(game.companions.recruit('owl'));assert(game.companions.recruit('warden'));
const caveStates=[];
for(const cave of game.riftExploration.sites.filter(site=>site.kind==='cave')){
  assert(cave.id.startsWith(`rift:${id}:`));assert.equal(cave.artTheme,'ember');
  assert(game.terrain.isFree(cave.approach.x,cave.approach.y,22));put(cave);request(cave.id);
  const state=game.dungeon.active;assert.equal(state.kind,'cave');assert.equal(state.artTheme,'ember');assert.equal(state.riftExits.length,1);
  assert(state.enemies.length>8&&state.chests.length>0);assert(!caveStates.includes(state),'each independent cave owns a distinct seeded state');
  const enemy=state.enemies[0];enemy.hp-=1;const hp=enemy.hp;
  const exit=state.riftExits[0];put(exit);game.dungeon.update(0);request(exit.id);
  assert.equal(game.terrain,surfaceTerrain);assert.equal(game.riftExploration,surfaceExploration);
  assert(game.terrain.isFree(game.player.x,game.player.y+groundOffset(game.player,true),game.player.r));
  assert(Math.hypot(game.player.x-cave.x,game.player.y+groundOffset(game.player,true)-cave.y)<190);
  for(const member of game.companions.members){
    const point={x:member.x,y:member.y+groundOffset(member,true)};
    assert(game.terrain.isFree(point.x,point.y,member.r,member.flying?'air':'ground'));assert(Math.hypot(member.x-game.player.x,member.y-game.player.y)<190);
  }
  assert.equal(game.touchInteractions.update(),false,'surface arrival never immediately enters the cave again');
  put(cave);request(cave.id);assert.equal(game.dungeon.active,state);assert.equal(enemy.hp,hp,'leaving and entering retains actual combat damage');
  put(exit);game.dungeon.update(0);request(exit.id);caveStates.push(state);
}
const snapshot=game.regions.saveWorld();assert.equal(game.regions.states.get(7),snapshot);
assert.equal(game.regions.restoreWorld(0),false);assert.equal(game.regions.restoreWorld(9),false);assert(game.regions.restoreWorld(7));
assert(chests.every(chest=>chest.state==='claimed'));assert.equal(game.riftExploration,surfaceExploration);
for(const state of caveStates)assert.equal(game.dungeon.states.get(state.id),state);
assert.equal(old.dungeon.states.size,0);assert.equal(city.dungeon.states.size,0);assert.equal(game.regions.endlessUnlocked,false);
report.chests=chests.length;report.caves=caveStates.length;report.buildingInteriors=interiors.length;report.encounters=game.territories.groups.length;
console.log(JSON.stringify({emberIntegration:'passed',...report}));
