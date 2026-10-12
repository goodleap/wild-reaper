import assert from 'node:assert/strict';
import { Game, REGIONS } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';
import { Encounters } from './dist/encounters.js';
import { portalDoor } from './dist/portal-geometry.js';

// Focused state transitions and enemy behaviors, not a long-run difficulty bot.
let seed=195870;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,...options});
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;
  g.player.xpNext=Infinity;g.crystalsNext=Infinity;if(g.elites)g.elites.generation=false;
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function finishTransition(g) {
  assert(g.sceneTransition.active,'eligible contact queues a portal fade');
  for(let i=0;g.sceneTransition.active&&i<20;i++)g.update(.025);
  assert.equal(g.sceneTransition.active,false,'the portal transition finishes promptly');
}
function monster(g,type,x=200,y=0) {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});return e;
}
const xpTotal=g=>g.player.xp;
function claim(g) {
  g.regions.flushReward();assert.equal(g.status,'super');const index=g.regionIndex,id=g.getSuperChoices()[0].id;
  assert(g.chooseSuper(id));assert.equal(g.regionIndex,index,'claiming a Boss reward never changes maps');
  return id;
}
function openPortal(g) {
  let boss=g.enemies.find(e=>e.portalId&&e.hp>0);
  if(!boss)boss=monster(g,'boss',280,-21.2);
  if(boss.portalId){g.player.x=g.portal.x;g.player.y=g.portal.y+180-groundOffset(g.player,true);g.regions.update();}
  g._hurtEnemy(boss,boss.hp+1);assert(g.portal&&g.portal.state==='active');return boss;
}
function standAtPortal(g,portal=g.portal) {const door=portalDoor(portal);g.player.x=door.x;g.player.y=door.y-groundOffset(g.player,true);}
function usePortal(g,portal=g.portal) {standAtPortal(g,portal);return g.enterPortal(portal.id);}

assert.deepEqual(REGIONS.map(r=>r.id),['forest','marsh','ruins']);
const swampGate=arena(),water=[{id:'gate-water',x:1120,y:0,rx:80,ry:45},{id:'guardian-water',x:0,y:1235,rx:80,ry:45}];
swampGate.environment={muds:water,props:[],isHazardFree:()=>true};
const clearGate=swampGate.regions._safePoint({x:0,y:0},true);
for(const mud of water) {
  assert(((clearGate.x-mud.x)/(mud.rx+112))**2+((clearGate.y-mud.y)/(mud.ry+112))**2>=1,'the gate approach stays outside existing water');
  assert(((clearGate.x-mud.x)/(mud.rx+66))**2+((clearGate.y+115-mud.y)/(mud.ry+66))**2>=1,'the guardian stands on dry ground');
}
assert.equal(swampGate.environment.muds,water);assert.equal(water.length,2,'gate placement never deletes swamp terrain');
const wetGuardian=arena(),footWater={x:1120,y:210,rx:80,ry:45};wetGuardian.environment={muds:[footWater],props:[],isHazardFree:()=>true};
assert(((0-footWater.y)/(footWater.ry+112))**2>1,'the first candidate gate itself is dry');
const dryGuardianGate=wetGuardian.regions._safePoint({x:0,y:0},true);assert.notDeepEqual(dryGuardianGate,{x:1120,y:0},'a dry gate is still rejected when its guardian footing is flooded');

const reserved=arena();reserved.relicSites={isSafePoint:(x,y,r)=>Math.hypot(x-1120,y)>200+r};
const reservedGate=reserved.regions._safePoint({x:0,y:0},true);assert(reserved.relicSites.isSafePoint(reservedGate.x,reservedGate.y,180),'a later gate respects an existing relic footprint');
const access=arena(),firstBoss=openPortal(access),portalId=access.portal.id;
const firstOffer=access.getSuperChoices().map(c=>c.id);access._hurtEnemy(firstBoss,100);
assert.equal(access.portal.id,portalId);assert.deepEqual(access.getSuperChoices().map(c=>c.id),firstOffer,'death cannot reroll the reward');
assert.equal(access.enterPortal(),false,'pending skill reward precedes travel');
access.update(0);assert.equal(access.status,'super','the first frame after a lethal hit opens the reward immediately');
assert.equal(access.regionIndex,0);const choices=access.getSuperChoices(),choiceIds=choices.map(c=>c.id);
assert.equal(choices.length,3);assert.equal(new Set(choiceIds).size,3);
const frozen={time:access.time,cooldown:access.player.skillCooldown,x:access.player.x,y:access.player.y};
advance(access,2,{x:1,skill:true});assert.deepEqual({time:access.time,cooldown:access.player.skillCooldown,x:access.player.x,y:access.player.y},frozen);
assert.equal(access.chooseSuper('invalid-relic'),false);assert(access.chooseSuper(choiceIds[0]));assert.equal(access.regionIndex,0);
assert.equal(access.chooseSuper(choiceIds[0]),false);assert.equal(access.portal.rewardClaimed,true);
assert.equal(access.enterPortal(),false,'remote interaction cannot travel');standAtPortal(access);
for(const state of ['paused','upgrade','dead']){access.status=state;access.update(0);assert.equal(access.enterPortal(),false);assert.equal(access.regionIndex,0,'touching a gate cannot travel while gameplay is paused');}
access.status='playing';const blockingBoss=monster(access,'boss',450,0);access.update(0);assert.equal(access.regionIndex,0);assert.equal(access.enterPortal(),false,'an engaged Boss prevents flight through a gate');
blockingBoss.guardActive=false;access.update(0);assert.equal(access.regionIndex,0,'portal contact keeps the original scene until the fade cut');finishTransition(access);assert.equal(access.region.id,'marsh','touching an activated gate automatically travels once eligible; dormant remote guardians do not lock every gate');
const returnGate=access.regions.portals.find(p=>p.direction==='back');assert(returnGate&&returnGate.state==='active');
// Even if the player is still touching the paired doorway on the first frame
// in a new scene, arrival must not trigger an immediate return or a bounce loop.
standAtPortal(access,returnGate);access.update(0);access.update(0);assert.equal(access.regionIndex,1,'arrival contact is latched until the player leaves the doorway');
access.player.x=returnGate.x+75;access.player.y=returnGate.y-groundOffset(access.player,true);access.update(0);
standAtPortal(access,returnGate);access.update(0);assert.equal(access.regionIndex,1);finishTransition(access);assert.equal(access.regionIndex,0,'leaving and touching the return gate again automatically returns');
access.update(0);access.update(0);assert.equal(access.regionIndex,0,'the restored region also remains stable after arrival');
assert.equal(access.portal.id,portalId);assert.equal(access.superSkills.owned[choiceIds[0]],1);
assert.equal(access.superSkills.pending,null,'return journeys do not award the same skill again');

const travel=arena({adventure:true,encounters:true,environment:true,companions:true});
// The arena helper strips enemies for unrelated mechanics; a real world retains its guardian.
travel.regions.initialize();travel.enemies=travel.enemies.filter(e=>e.portalId);travel.relicSites.generation=false;
const sleeping=travel.enemies.find(e=>e.portalId);assert(sleeping);assert.equal(sleeping.guardActive,false);assert.equal(travel.portal.state,'locked');
assert.equal(travel.enterPortal(),false);assert.equal(travel.encounters._canStart(),true,'distant guardian leaves exploration and optional events available');
const spawnPosition={x:sleeping.x,y:sleeping.y};advance(travel,.2);assert.deepEqual({x:sleeping.x,y:sleeping.y},spawnPosition,'dormant guards do not pursue the player from offscreen');
standAtPortal(travel);travel.regions.update();assert(sleeping.guardActive);assert.equal(travel.encounters._canStart(),false);
travel.player.x=travel.portal.x+800;travel.regions.update();assert.equal(sleeping.guardActive,false,'leaving the arena disengages the guardian');
assert.equal(travel._hurtEnemy(sleeping,1000),0,'distant guardian cannot be sniped outside its arena');
travel.time=241;travel._clock=241;travel.player.level=9;travel.player.hp=91;travel.player.skillCooldown=7.4;
Object.assign(travel.levels,{orbit:5,pulse:3,lightning:2,power:3,speed:2});travel._syncEvolutions();travel._refreshStats();travel._refreshWeapons();
travel.relics.owned.push('leafWard');travel.relics.shieldReady=false;travel.relics.shieldCooldown=7.8;
travel.adventure.furyTime=4.3;travel.adventure.magnetTime=5.2;
openPortal(travel);const skillId=claim(travel);standAtPortal(travel);
const old={terrain:travel.terrain,adventure:travel.adventure,environment:travel.environment,encounters:travel.encounters,settlements:travel.settlements,relicSites:travel.relicSites,portal:travel.portal};
const castle=travel.settlements.sites.find(s=>s.type==='castle');const castleState={id:castle.id,rewardClaimed:true,visited:new Set([1,2])};travel.dungeon.states.set(castle.id,castleState);
const oldEnemy=monster(travel,'spore',400);oldEnemy.cast={life:.001};
const guard=monster(travel,'slime',800);guard.relicSiteId='kept-site';guard.eventId='kept-event';guard.guardActive=false;guard.hp=234;
travel.gems.push({x:999,y:999,r:5,value:77});travel.effects.push({type:'old-map-effect',x:999,y:999,life:1,maxLife:1});
travel.adventure.treasure={id:'old-chest',x:800,y:800,r:27,state:'locked',life:100};
travel.encounters.active={id:'old-event',siteId:'kept-site',type:'hunt',x:800,y:800,r:210,life:10,goal:24,progress:3};
const saved={hp:travel.player.hp,time:travel.time,clock:travel._clock,skillCooldown:travel.player.skillCooldown,shieldCooldown:travel.relics.shieldCooldown,fury:travel.adventure.furyTime,magnet:travel.adventure.magnetTime,gold:travel.gold,crystals:travel.crystals};
assert(usePortal(travel));assert.equal(travel.regionIndex,1);assert.notEqual(travel.terrain,old.terrain);
assert.equal(travel.enemies.filter(e=>e.portalId).length,1,'the new region has its own locked gate and sleeping guardian');
assert.equal(travel.regions.portals.length,2);assert.equal(travel.portal.state,'locked');
assert.deepEqual({hp:travel.player.hp,time:travel.time,clock:travel._clock,skillCooldown:travel.player.skillCooldown,shieldCooldown:travel.relics.shieldCooldown,fury:travel.adventure.furyTime,magnet:travel.adventure.magnetTime,gold:travel.gold,crystals:travel.crystals},saved);
assert.equal(travel.bullets.length,0);assert.equal(travel.enemyBullets.length,0);assert.equal(travel._pulseEchoes.length,0);assert.equal(travel.storm,null);
assert(!travel.effects.some(e=>e.type==='old-map-effect'));assert.equal(travel.dungeon.states.size,0);assert(travel.player.invuln>0&&travel.regionGrace>0);
const nextGate=travel.portal,back=travel.regions.portals.find(p=>p.direction==='back');advance(travel,.1);assert(usePortal(travel,back));
for(const key of Object.keys(old))assert.equal(travel[key],old[key],`${key} restored by identity`);
assert.equal(travel.dungeon.states.get(castle.id),castleState,'castle progress survives round trips');assert.equal(travel.encounters.active.progress,3);assert.equal(travel.adventure.treasure.id,'old-chest');
assert(travel.enemies.includes(guard));assert.equal(guard.hp,234);assert(!travel.enemies.includes(oldEnemy),'ordinary chase mobs are released on suspension');
assert.equal(travel.superSkills.owned[skillId],1);assert.equal(travel.superSkills.pending,null);
assert(usePortal(travel));assert.equal(travel.portal,nextGate,'revisiting uses the same uncleared next gate');assert.equal(travel.regions.states.size,1,'only inactive region snapshots are stored');

const route=arena(),routeIds=[route.region.id],terrainSignatures=[];
for(let i=0;i<3;i++) {route.time=180+i*180;openPortal(route);claim(route);assert(usePortal(route));routeIds.push(route.region.id);terrainSignatures.push(JSON.stringify(route.terrain.query(200,-900,1100,900).map(o=>[o.type,o.x,o.y,o.r])));}
assert.deepEqual(routeIds,['forest','marsh','ruins','forest']);assert.equal(new Set(terrainSignatures).size,3);assert.equal(route.regions.states.size,2);assert.equal(route.regionIndex,0);assert.equal(route.regions.unlockedConnections.size,3);assert(route.regions.endlessUnlocked);
for(const index of [2,1,0]){const back=route.regions.portals.find(p=>p.nextRegionIndex===index);assert(back);assert.equal(back.state,'active');assert(usePortal(route,back));assert.equal(route.regionIndex,index);assert(route.regions.states.size<=2);}
assert.equal(route.portal.state,'active','all visited regions remain returnable');

const xpChoice=arena();openPortal(xpChoice);xpChoice.crystalsNext=40;xpChoice.crystals=41;const savedXp=xpChoice.player.xp;
claim(xpChoice);assert.equal(xpChoice.regionIndex,0);assert.equal(xpChoice.status,'upgrade');assert.equal(xpChoice.crystals,41);assert.equal(xpChoice.player.xp,savedXp);
assert(xpChoice.chooseUpgrade(xpChoice.getUpgradeChoices()[0].id));assert.equal(xpChoice.crystals,1);

const debugStorm=arena({debug:true}),stormTarget=monster(debugStorm,'slime',90,0);
assert.equal(debugStorm.player.skillCooldownMax,0);const initialHealth=stormTarget.hp;
debugStorm.update(0,{skill:true});debugStorm.update(0,{skill:true});
assert.equal(debugStorm.player.skillCooldown,0);assert.equal(stormTarget.hp,initialHealth-320,'debug allows consecutive full-screen storm casts');
const ordinaryStorm=arena(),ordinaryTarget=monster(ordinaryStorm,'slime',90,0);ordinaryStorm.update(0,{skill:true});const afterFirst=ordinaryTarget.hp;
ordinaryStorm.update(0,{skill:true});assert.equal(ordinaryTarget.hp,afterFirst,'normal mode retains the skill cooldown');

const mixed=arena();
for(const [i,id] of ['shield','swift','summoner'].entries())assert(mixed.elites.promote(monster(mixed,'slime',150+i*80),id));
assert.equal(mixed.elites.promote(monster(mixed,'slime',420),'shield'),false,'at most three living affix elites coexist');
const natural=arena();natural.elites.generation=true;const early=monster(natural,'slime');
const originalRandom=Math.random;
try {
  Math.random=()=>0;natural.time=44;assert.equal(natural.elites.maybePromote(early),false,'affixes do not appear during the opening grace period');
  natural.time=45;assert(natural.elites.maybePromote(early),'an eligible later spawn can receive a natural affix');
} finally {Math.random=originalRandom;}
for(const extras of [{type:'boss'},{type:'boar'},{elite:true},{guardianId:'guarded-chest'},{eventRole:'treasure'},{summoned:true}]) {
  const g=arena(),e=monster(g,'slime');Object.assign(e,extras);
  assert.equal(g.elites.promote(e,'swift'),false,'special enemies and summons cannot receive a second elite identity');
}

const shield=arena(),shielded=monster(shield,'slime',74);shield.levels.orbit=1;
assert(shield.elites.promote(shielded,'shield'));
const shieldHp=shielded.hp,shieldStart=shielded.affix.shield;shield.update(0);
assert.equal(shielded.hp,shieldHp);assert(shielded.affix.shield<shieldStart);
assert(!shielded.bleed,'a fully shielded orbit hit does not apply bleed to health');
shield.update(0,{skill:true});assert.equal(shielded.hp,shieldHp);assert(!shielded.shock,'a fully absorbed storm cannot mark the enemy as shocked');
shield.levels.orbit=0;shield.levels.lightning=1;shield._lightning=0;shielded.affix.shield=10;shield.update(0);
assert.equal(shielded.hp,shieldHp-38,'only lightning damage beyond the remaining shield reaches health');
assert(shielded.shock&&shielded.affix.shield===0);
assert.equal(shield.effects.filter(e=>e.type==='shieldBreak').length,1);
shield._hurtEnemy(shielded,20);assert.equal(shield.effects.filter(e=>e.type==='shieldBreak').length,1,'a broken shield produces one break effect');
const absorbedDot=arena(),bleeder=monster(absorbedDot,'slime',74);absorbedDot.levels.orbit=1;absorbedDot.update(0);assert(bleeder.bleed);
absorbedDot.levels.orbit=0;assert(absorbedDot.elites.promote(bleeder,'shield'));
const hpBeforeDot=bleeder.hp,shieldBeforeDot=bleeder.affix.shield;bleeder.bleed.nextTick=.001;absorbedDot.update(.025);
assert.equal(bleeder.hp,hpBeforeDot);assert(bleeder.affix.shield<shieldBeforeDot,'existing DOT also passes through the common shield damage path');

const swift=arena(),runner=monster(swift,'slime',-180,5.8);runner.speed=100;assert(swift.elites.promote(runner,'swift'));runner.affix.cooldown=0;
const windupX=runner.x;swift.update(.025);assert.equal(runner.affix.phase,'windup');advance(swift,.4);
assert.equal(runner.x,windupX,'a swift elite stays still throughout its readable windup');
advance(swift,.15);assert.equal(runner.affix.phase,'rush');const rushStart=runner.x;swift.update(.05);
assert(runner.x-rushStart>7.5,'the actual rush movement is faster than ordinary pursuit');
const frozenSwift={x:runner.x,y:runner.y,affix:structuredClone(runner.affix)};swift.status='upgrade';advance(swift,1);
assert.deepEqual({x:runner.x,y:runner.y,affix:runner.affix},frozenSwift,'a swift elite attack freezes with the game');
const blocked=arena({terrain:new Terrain({obstacles:[{id:'elite-wall',type:'rock',x:-85,y:19.8,r:35}]})});
const blockedRunner=monster(blocked,'slime',-180,5.8);blockedRunner.speed=100;blocked.elites.promote(blockedRunner,'swift');blockedRunner.affix.cooldown=0;
for(let i=0;i<80;i++) {
  blocked.update(.025);assert(blocked.terrain.isFree(blockedRunner.x,blockedRunner.y+groundOffset(blockedRunner),blockedRunner.r),'a swift rush cannot tunnel into terrain');
}

function summoner(g,x=250,y=5.8) {
  const e=monster(g,'slime',x,y);assert(g.elites.promote(e,'summoner'));e.affix.cooldown=0;return e;
}
const summoning=arena(),caster=summoner(summoning);summoning.update(.025);
assert.equal(caster.affix.phase,'windup');advance(summoning,.5);
assert.equal(summoning.enemies.filter(e=>e.summoned).length,0,'a summoner creates no enemy before its warning ends');
const summonWarning=structuredClone(caster.affix);summoning.status='upgrade';advance(summoning,1);
assert.deepEqual(caster.affix,summonWarning);summoning.status='playing';advance(summoning,.65);
const children=summoning.enemies.filter(e=>e.summoned);
assert.equal(children.length,2);
for(const child of children) {
  assert.equal(child.xp,0);assert.equal(child.summonerId,caster.id);assert(!child.affix);
  assert.equal(summoning.elites.promote(child,'summoner'),false,'summons cannot recursively become summoner elites');
  assert(summoning.terrain.isFree(child.x,child.y+groundOffset(child),child.r));
  assert(Math.hypot(child.x-summoning.player.x,child.y+groundOffset(child)-summoning.player.y-groundOffset(summoning.player,true))>75,'new summons do not materialize on the player');
}
caster.affix.cooldown=0;advance(summoning,.2);assert.equal(summoning.enemies.filter(e=>e.summoned).length,2,'one summoner cannot exceed its living minion allowance');
const beforeChildXp=xpTotal(summoning);summoning._hurtEnemy(children[0],children[0].hp+1);
assert.equal(xpTotal(summoning),beforeChildXp,'a summoned enemy cannot be farmed for experience');

const many=arena();for(const [x,y] of [[-250,-100],[0,250],[250,-100]]) {
  const e=summoner(many,x,y);e.affix.phase='windup';e.affix.life=.001;
}
many.update(.025);assert.equal(many.enemies.filter(e=>e.summoned).length,6,'three summoners share the global six-minion budget');
for(const e of many.enemies.filter(e=>e.affix)){e.affix.phase='windup';e.affix.life=.001;}
many.update(.025);assert.equal(many.enemies.filter(e=>e.summoned).length,6,'subsequent casts cannot exceed that shared budget');
const crowd=arena(),crowdCaster=summoner(crowd);
for(let i=1;i<179;i++)monster(crowd,'slime',900+(i%10)*30,700+Math.floor(i/10)*30);
crowdCaster.affix.phase='windup';crowdCaster.affix.life=.001;crowd.update(.025);
assert.equal(crowd.enemies.length,180,'summons also respect the ordinary total population cap');
const unseen=arena(),hiddenCaster=summoner(unseen,750);hiddenCaster.affix.phase='windup';hiddenCaster.affix.life=.001;
unseen.update(.025);assert(!unseen.enemies.some(e=>e.summoned),'an unseen summoner cannot create offscreen pressure');

for(const source of ['storm','bleed']) {
  const g=arena(),e=summoner(g,source==='bleed'?74:250,0);if(source==='bleed')g.levels.orbit=1;
  if(source==='bleed') {g.update(0);assert(e.bleed);g.levels.orbit=0;e.bleed.nextTick=.001;}
  e.hp=1;e.affix.phase='windup';e.affix.life=.001;g.update(.025,source==='storm'?{skill:true}:{});
  assert(e.hp<=0);assert(!g.enemies.some(child=>child.summoned),`a same-frame ${source} kill cancels a ready summon`);
}

const hunt=arena();hunt.adventure=new Adventure(hunt,{generation:false});hunt.encounters=new Encounters(hunt,{generation:false});
const huntEvent=hunt.encounters.spawn('hunt',0,19.8),affixed=monster(hunt,'slime',100,5.8);hunt.elites.promote(affixed,'swift');
hunt._hurtEnemy(affixed,affixed.hp+1);assert.equal(huntEvent.progress,0,'affix elites cannot count as ordinary hunt kills');
const minion=monster(hunt,'slime',100,5.8);minion.summoned=true;minion.xp=0;hunt._hurtEnemy(minion,minion.hp+1);
assert.equal(huntEvent.progress,0,'summoned enemies cannot farm hunt progress');
const ordinary=monster(hunt,'slime',100,5.8);hunt._hurtEnemy(ordinary,ordinary.hp+1);assert.equal(huntEvent.progress,1);

const populations=[];
for(const region of REGIONS) {
  const g=arena();g.region=region;g.time=90;g._updatePressure=()=>{};const counts={};const savedRandom=Math.random;
  try {
    for(let i=0;i<240;i++) {
      g.enemies=[];g._spawn=0;Math.random=()=>((i+.5)/240);g.update(0);
      const type=g.enemies[0].type;counts[type]=(counts[type]||0)+1;
    }
  } finally {Math.random=savedRandom;}
  populations.push(counts);
  for(let i=0;i<240;i++) {g._spawn=0;g.update(0);}
  assert(g.enemies.length<=180&&g.enemies.filter(e=>e.type==='boar').length<=5&&g.enemies.filter(e=>e.type==='spore').length<=4,'regional preferences retain enemy type and population limits');
}
assert(populations[1].spore>populations[0].spore,'marsh produces more spore enemies under the same sampled spawn rolls');
assert(populations[2].beetle+populations[2].brute>populations[0].beetle+populations[0].brute,'ruins favor beetles and brutes without increasing the spawn count');

console.log('Portal and elite mechanics: contact travel with arrival latches, departure/reentry, preserved progression, persistent round trips, discovered gates, region populations, shield/swift/summoner behavior and bounded rewards passed.');
