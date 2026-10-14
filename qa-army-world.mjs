import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {Island} from './dist/islands.js';
import {RelicSites,ARMY_SITE_RULES} from './dist/relic-sites.js';
import {WorldMap,landmarkState} from './dist/world-map.js';
import {portalDoor} from './dist/portal-geometry.js';
const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
function quiet(g){g.enemies=g.enemies.filter(e=>e.portalId);g.nextBossAt=Infinity;g._spawn=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;return g;}
function joinSite(g,site){feet(g,site.door);assert(g.relicSites.interact(site.id),`${site.key} can activate`);const camp=g.companions.camp;assert(camp);assert.equal(camp.guardTotal,site.guardCount);
 for(const enemy of g.enemies.filter(e=>e.rescueId===camp.id)){assert(Math.hypot(enemy.x-g.player.x,enemy.y+groundOffset(enemy)-site.door.y)>=150,'defenders have safe doorway clearance');enemy.rescueSpawnGrace=0;g._hurtEnemy(enemy,enemy.hp+100);}
 assert.equal(camp.state,'ready');feet(g,camp);assert(g.companions._join());assert.equal(site.state,'cleared');return g.companions.members.find(m=>m.kind===site.kind);}
const g=quiet(new Game());g.gold=100;
const required=['stormcaller','warden','dog','owl','golem'];assert.deepEqual(g.relicSites.sites.filter(s=>s.kind).map(s=>s.kind),required,'all five kinds are obtainable without changing worlds');
assert.equal(g.relicSites.sites.filter(s=>s.type==='stonevault').length,1,'optional vault count is bounded');
const vault=g.relicSites.sites.find(s=>s.type==='stonevault');feet(g,vault.door);assert.equal(g.relicSites.getInteraction().enabled,false);assert.equal(g.relicSites.interact(vault.id),false);assert.equal(vault.gateOpen,false);assert(!g.terrain.isFree(vault.x,vault.y+61,15));
const map=new WorldMap();map.discover(g);const marker=map.getMarkers(g).find(m=>m.id===vault.id);assert(marker);assert.match(landmarkState(marker),/需要岩灵/);assert(!map.getMarkers(g).some(m=>m.kind==='golem'),'finding a vault never exposes the distant recruitment site');
for(const kind of ['stormcaller','warden'])joinSite(g,g.relicSites.sites.find(s=>s.kind===kind));
const dogSite=g.relicSites.sites.find(s=>s.kind==='dog');feet(g,dogSite.door);g.gold=7;assert.equal(g.relicSites.interact(dogSite.id),false);assert.equal(dogSite.state,'ready');g.gold=100;assert(g.relicSites.interact(dogSite.id));assert.equal(g.gold,100-ARMY_SITE_RULES.dogCost);assert.equal(g.relicSites.interact(dogSite.id),false,'recruitment cannot charge twice');
joinSite(g,g.relicSites.sites.find(s=>s.kind==='owl'));
const golemSite=g.relicSites.sites.find(s=>s.kind==='golem');assert(g.terrain.isFree(golemSite.door.x,golemSite.door.y,22),'awakening approach never requires an earlier golem');assert.equal(g.relicSites._obstacles(golemSite).length,0,'the statue is accessible before awakening');const golem=joinSite(g,golemSite);assert.equal(g.companions.members.length,5);
feet(g,vault.door);golem.x=vault.x;golem.y=vault.y-35-groundOffset(golem,true);assert.equal(g.relicSites.getInteraction().enabled,false,'the gate cannot be smashed from behind its solid wall');
golem.x=vault.x+30;golem.y=vault.y+145-groundOffset(golem,true);assert(g.relicSites.interact(vault.id));g.relicSites.update(.05);assert.equal(vault.state,'opening');g.status='paused';const progress=vault.openProgress;g.relicSites.update(.05);assert.equal(vault.openProgress,progress);g.status='playing';
for(let i=0;i<20;i++)g.relicSites.update(.05);assert.equal(vault.state,'opened');assert(vault.gateOpen);assert(g.terrain.isFree(vault.x,vault.y+61,15),'only the designated gate collider is removed');assert(!g.terrain.isFree(vault.x-63,vault.y,15),'adjacent architecture remains solid');
g.companions.dismiss(golem.id);g.relicSites._setStructures();assert(vault.gateOpen);assert(g.terrain.isFree(vault.x,vault.y+61,15),'dismissing the worker cannot reseal a finished passage');
feet(g,vault);const before={gold:g.gold,crystals:g.crystals};assert(g.relicSites.interact(vault.id));assert.equal(g.gold,before.gold+ARMY_SITE_RULES.vaultGold);assert.equal(g.crystals,before.crystals+ARMY_SITE_RULES.vaultCrystals);assert.equal(g.relicSites.interact(vault.id),false);assert.equal(vault.state,'cleared');
// A real portal round trip retains the opened architecture rather than merely
// checking a stand-alone serialization of a test object.
const portal=g.regions.portals[0];feet(g,portalDoor(portal));const guardian=g.enemies.find(e=>e.id===portal.bossId);g._hurtEnemy(guardian,guardian.hp+100);g.regions.flushReward();assert(g.chooseSuper(g.getSuperChoices()[0].id));assert(g.enterPortal(portal.id));const back=g.regions.portals.find(p=>p.nextRegionIndex===0);feet(g,portalDoor(back));assert(g.enterPortal(back.id));assert.equal(g.relicSites.sites.find(s=>s.id===vault.id),vault);assert(vault.gateOpen);assert.equal(vault.state,'cleared');
// Check reservation-driven generation against several deterministic coast and
// terrain seeds; no destructible gate encloses any recruitment point.
for(const region of ['forest','marsh','ruins'])for(const seed of [0,1,9]){
 const t=new Terrain({island:new Island({region,seed}),region,seed});const world=quiet(new Game({terrain:t,environment:false,settlements:false,adventure:false,companions:true,encounters:false}));world.region={id:region};world._features.companions=true;world.relicSites=new RelicSites(world);
 assert.equal(world.relicSites.sites.filter(s=>s.kind).length,5,`${region}/${seed}: all recruitment sites exist`);
 for(const site of world.relicSites.sites.filter(s=>s.kind))assert(t.isFree(site.door.x,site.door.y,22),`${region}/${seed}/${site.key}: approach is traversable`);
}
// Drive real movement and TouchInteractions through Game.update: testing only
// RelicSites.interact used to hide the altar's misplaced prison-door anchor.
function altarRun(options={}) {
 const game=quiet(new Game(options));game.enemies=[];game.events=[];game._shot=Infinity;
 if(game.encounters)game.encounters.generation=false;
 const altar=game.relicSites.sites.find(site=>site.appearance==='golemaltar');assert(altar);
 assert.deepEqual(altar.door,{x:altar.x,y:altar.y},'the open altar has no off-center doorway');
 return {game,altar};
}
for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
 const {game,altar}=altarRun();
 // A previously generated region may still carry the old front-door field.
 if(dx===-1)altar.door={x:altar.x,y:altar.y+100};
 feet(game,{x:altar.x+dx*70,y:altar.y+dy*70});game.update(0);
 assert.equal(altar.state,'ready');assert.equal(game.companions.camp,null);
 const hint=game.getInteraction();assert.equal(hint.id,altar.id);assert.equal(hint.x,altar.x);assert.equal(hint.y,altar.y);assert.equal(hint.touchRadius,ARMY_SITE_RULES.altarTouchRadius);
 assert.equal(game.relicSites.interact(altar.id),false,'a hint-range key press cannot remotely trigger the altar');
 for(let step=0;step<20&&altar.state==='ready';step++)game.update(.025,{x:-dx,y:-dy});
 assert.equal(altar.state,'active','walking onto the central pedestal activates from every direction');
 const camp=game.companions.camp;assert(camp);assert.equal(camp.kind,'golem');
 const guards=game.enemies.filter(enemy=>enemy.rescueId===camp.id);assert.equal(guards.length,8);
 const foot={x:game.player.x,y:game.player.y+groundOffset(game.player,true)};
 for(const enemy of guards){assert(Math.hypot(enemy.x-foot.x,enemy.y+groundOffset(enemy)-foot.y)>=150);assert.equal(enemy.rescueSpawnGrace,.8);assert.equal(game._hurtEnemy(enemy,enemy.hp+100),0,'activation retains the harmless spawn warning');}
 assert.equal(game.companions.members.length,0,'touching the statue begins its challenge, not instant recruitment');
 game.update(0);game.update(0);assert.equal(game.enemies.filter(enemy=>enemy.rescueId===camp.id).length,8);assert.equal(game.events.filter(event=>event.type==='relicSiteStarted'&&event.siteId===altar.id).length,1);
 if(dx===1){
   for(const enemy of guards){enemy.rescueSpawnGrace=0;game._hurtEnemy(enemy,enemy.hp+100);}
   assert.equal(camp.state,'ready');game.update(0);assert.equal(altar.state,'cleared');assert.equal(game.companions.members.filter(member=>member.kind==='golem').length,1);assert.equal(game.rescuePower,1);
   feet(game,{x:altar.x+100,y:altar.y});game.update(0);feet(game,altar);game.update(0);assert.equal(game.rescuePower,1);assert.equal(game.companions.members.length,1,'reentering a completed altar cannot duplicate recruitment or reward');
 }
}
const pausedAltar=altarRun();feet(pausedAltar.game,pausedAltar.altar);pausedAltar.game.status='paused';pausedAltar.game.update(.05);assert.equal(pausedAltar.altar.state,'ready');pausedAltar.game.status='playing';pausedAltar.game.update(0);assert.equal(pausedAltar.altar.state,'active','a paused contact does not consume the activation latch');
const busyAltar=altarRun(),otherPrison=busyAltar.game.relicSites.sites.find(site=>site.kind==='stormcaller');feet(busyAltar.game,otherPrison.door);assert(busyAltar.game.relicSites.interact(otherPrison.id));feet(busyAltar.game,busyAltar.altar);busyAltar.game.update(0);assert.equal(busyAltar.altar.state,'active');assert.equal(busyAltar.game.companions.camps.length,2,'a second relic keeps the first challenge intact');
const graceAltar=altarRun();feet(graceAltar.game,graceAltar.altar);graceAltar.game.regionGrace=2;graceAltar.game.update(0);assert.equal(graceAltar.altar.state,'active','arrival grace protects the player without mutually excluding relic challenges');
const ownedAltar=altarRun({debug:true,debugOptions:{fullLoadout:true}});ownedAltar.game.companions.recruit('golem');feet(ownedAltar.game,ownedAltar.altar);ownedAltar.game.update(0);assert.equal(ownedAltar.altar.state,'ready');assert.equal(ownedAltar.game.companions.camp,null);assert.equal(ownedAltar.game.getInteraction().enabled,false);assert.equal(ownedAltar.game.getInteraction().label,'岩灵已在队伍中');assert.equal(ownedAltar.game.companions.members.filter(member=>member.kind==='golem').length,1);
console.log('Army world: five reachable recruitments, safe challenges, conditional stone gate, unique rewards, paused work, persistent travel and actual center-contact altar activation passed.');
