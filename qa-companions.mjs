import assert from 'node:assert/strict';
import { portalDoor } from './dist/portal-geometry.js';
import { Game, HEROES, COMPANIONS } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Encounters } from './dist/encounters.js';

// Exercise real battle and map transitions. Fixtures suppress unrelated random
// spawns, but never replace damage, rewards, collision or the companion system.
let seed=423961;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,...options});
  // Preserve arrow fixtures while excluding unrelated default-sword damage.
  g.levels.arrow=1;g.build.setEquipped('sword',false);
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];g.gold=1000;
  g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  // Pressure phases would otherwise shorten the suppressed wave timer.
  g._updatePressure=()=>{};
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function monster(g,x=200,y=0,type='slime') {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});return e;
}
const foot=(e,isPlayer=false)=>({x:e.x,y:e.y+groundOffset(e,isPlayer)});
const xpTotal=g=>g.player.xp;
function guards(g,camp=g.companions.camp) {return g.enemies.filter(e=>camp.guardIds.includes(e.id));}
function clearCamp(g,camp=g.companions.camp) {for(const e of guards(g,camp))g._hurtEnemy(e,e.hp+1);}
function atCamp(g,camp=g.companions.camp) {g.player.x=camp.x;g.player.y=camp.y-groundOffset(g.player,true);}
function rescue(g,kind='stormcaller',x=350,y=19.8) {
  const camp=g.companions.spawn(kind,x,y);assert(camp,`a clear site can host ${kind}`);
  clearCamp(g,camp);atCamp(g,camp);g.update(0);
  assert(g.companions.active,`${kind} joins after its guards are defeated and the player approaches`);
  return g.companions.active;
}
function travel(g) {
  const boss=monster(g,300,0,'boss');g._hurtEnemy(boss,boss.hp+1);
  g.player.x=g.portal.x;g.player.y=portalDoor(g.portal).y-groundOffset(g.player,true);
  g.regions.flushReward();assert(g.chooseSuper(g.getSuperChoices()[0].id));assert(g.enterPortal());
}

assert.deepEqual(HEROES.map(h=>h.id),['traveler']);
assert.deepEqual(COMPANIONS.map(h=>h.id).sort(),['dog','golem','owl','stormcaller','warden']);
const original=new Game({hero:'stormcaller',terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false});
assert.equal(original.hero.id,'traveler');assert.equal(original.player.heroId,'traveler');
assert.equal(original.player.hp,100);assert.equal(original.player.speed,220);assert.equal(original.player.skillCooldownMax,15);
assert.equal(original.levels.sword,1);assert.equal(original.levels.arrow,0);
assert(Object.entries(original.levels).every(([id,level])=>level===(id==='sword'?1:0)));assert.equal(original.rescuePower,0);
assert.equal(original.companions.active,null);assert.equal(original.companions.camp,null);

const access=arena(),camp=access.companions.spawn('stormcaller',350,19.8);
assert(camp);assert.equal(camp.state,'trapped');assert.equal(guards(access).length,6);
assert.equal(access.companions.spawn('warden',700,19.8),null,'only one rescue camp can exist');
for(const guard of guards(access)) {
  assert.equal(guard.rescueId,camp.id);assert.equal(guard.eventRole,'rescueGuard');assert.equal(guard.xp,2);
  assert(access.terrain.isFree(guard.x,guard.y+groundOffset(guard),guard.r),'each guard spawns outside terrain');
}
atCamp(access);access.update(0);assert.equal(access.companions.active,null,'walking into a surrounded camp is not a rescue');
access.player.x=0;access.player.y=0;
const outsider=monster(access,140);access._hurtEnemy(outsider,outsider.hp+1);
assert.equal(camp.remainingGuards,6,'unrelated kills do not advance the rescue');
const defeated=guards(access)[0];access._hurtEnemy(defeated,defeated.hp+1);access._hurtEnemy(defeated,100);
assert.equal(camp.remainingGuards,5,'a designated guard counts once');
clearCamp(access);access.update(0);
assert.equal(camp.state,'ready');assert.equal(camp.remainingGuards,0);assert.equal(access.companions.active,null);
assert.equal(access.rescuePower,0,'ranged clearing never grants a remote reward');
const before={xp:xpTotal(access),level:access.player.level,damage:access._damageMultiplier()};
atCamp(access);access.update(0);
assert.equal(access.companions.camp,null);assert.equal(access.companions.active.kind,'stormcaller');
assert.equal(access.companions.active.remaining,Infinity);assert.equal(access.companions.active.state,'active');
assert.equal(access.rescuePower,1);assert.equal(access.companions.rescuedCount,1);
assert(Math.abs(access._damageMultiplier()-before.damage-.08)<1e-12);
assert.equal(xpTotal(access),before.xp);assert.equal(access.player.level,before.level);assert.equal(access.status,'playing','rescue growth never interrupts play with an upgrade choice');
access._hurtEnemy(defeated,100);access.companions.onEnemyKilled(defeated);access.update(0);
assert.equal(access.rescuePower,1);assert.equal(access.companions.rescuedCount,1);
assert.equal(access.companions.spawn('stormcaller',700,19.8),null,'duplicate companion kinds cannot be recruited');

// The small permanent benefit changes actual weapon damage, survives departure,
// and combines additively with ordinary +25% damage upgrades.
access.levels.power=2;access._refreshStats();
assert(Math.abs(access._damageMultiplier()-1.58)<1e-12);
const arrowTarget=monster(access,access.player.x+150,access.player.y);access._shot=0;access.update(0);access._shot=Infinity;
assert.equal(access.bullets.length,1);assert(Math.abs(access.bullets[0].damage-32*1.58)<1e-10);
access.bullets=[];access.enemies=[];
const active=access.companions.active;
advance(access,10);assert.equal(access.companions.active,active);
for(const state of ['paused','upgrade','relic','dead']) {
  access.status=state;const frozen=structuredClone(active);const clock=access.time;
  advance(access,2,{x:1});access.companions.update(.05);access.companions.resolve();
  assert.deepEqual(active,frozen,`${state} freezes companion movement, attacks and remaining service time`);assert.equal(access.time,clock);
}
access.status='playing';advance(access,50.05);
assert.equal(access.companions.active,active,'a paid companion remains beyond the old one-minute lifetime');
assert(access.companions.dismiss(active.id));
assert.equal(access.rescuePower,1);assert(Math.abs(access._damageMultiplier()-1.58)<1e-12,'the rescue benefit remains for the run after departure');
assert.equal(arena().rescuePower,0,'a new run does not inherit earlier rescue rewards');

// Missing guards are abandonment, never a successful combat result.
const removed=arena(),missing=removed.companions.spawn('warden',350,19.8);
removed.enemies=removed.enemies.filter(e=>e.id!==missing.guardIds[0]);atCamp(removed);advance(removed,.1);
assert.equal(removed.rescuePower,0);assert.equal(removed.companions.active,null);
if(removed.companions.camp)assert.notEqual(removed.companions.camp.state,'ready');
const abandoned=arena(),abandonedCamp=abandoned.companions.spawn('warden',350,19.8);
abandoned.player.x=4000;advance(abandoned,.1);
assert.equal(abandoned.rescuePower,0);assert.equal(abandoned.companions.active,null);
assert.equal(abandoned.companions.camp,null);assert(!abandoned.enemies.some(e=>e.rescueId===abandonedCamp.id),'abandonment removes the camp-owned guards without rewarding kills');
assert.equal(abandoned.kills,0);assert.equal(xpTotal(abandoned),0);
const expired=arena(),expiredCamp=expired.companions.spawn('warden',350,19.8);
for(const guard of guards(expired))guard.speed=0;
advance(expired,70.1);assert.equal(expired.companions.camp,null);assert.equal(expired.rescuePower,0);
assert(!expired.enemies.some(e=>e.rescueId===expiredCamp.id));assert.equal(expired.kills,0);

// Camp defenders remain real combatants, including on narrow-screen culling.
const combat=arena(),combatCamp=combat.companions.spawn('warden',350,19.8);
atCamp(combat);const fighter=guards(combat)[0];fighter.x=combat.player.x;fighter.y=combat.player.y;
const hpBeforeContact=combat.player.hp;combat.update(0);
assert(combat.player.hp<hpBeforeContact,'a nearby camp guard uses ordinary contact damage');
combat.player.x=150;combat.player.y=0;combat.update(0,{skill:true});
assert.equal(combatCamp.state,'ready','the player active lightning can defeat the actual camp defenders');
assert.equal(xpTotal(combat),12);assert.equal(combat.rescuePower,0,'guard kill XP is separate from the approach-only rescue benefit');
atCamp(combat);combat.update(0);assert.equal(combat.rescuePower,1);
const distant=arena();distant.viewWidth=390;distant.viewHeight=320;
const distantCamp=distant.companions.spawn('warden',350,19.8);distant.player.x=-700;distant.update(.025);
assert.equal(distant.companions.camp,distantCamp);assert.equal(guards(distant).length,6,'narrow viewport culling cannot silently delete an unfinished rescue guard');
assert.equal(distantCamp.remainingGuards,6);assert.equal(distant.rescuePower,0);


// The two retained character models now perform different real support attacks.
const thunder=arena(),mage=rescue(thunder,'stormcaller');
const strikes=Array.from({length:6},(_,i)=>monster(thunder,mage.x+75+i*38,mage.y));
const hidden=monster(thunder,thunder.player.x+900,mage.y);
mage._attack=0;thunder.companions.resolve();
assert.equal(strikes.filter(e=>e.hp<10000).length,5,'advanced allied lightning strikes at most five visible enemies');
assert(strikes.filter(e=>e.hp<10000).every(e=>10000-e.hp>=100),'allied lightning is stronger than the opening passive lightning');
assert.equal(hidden.hp,10000,'allied lightning never damages a hidden target');
assert(strikes.filter(e=>e.hp<10000).every(e=>e.shock),'allied lightning shares the protagonist passive shock mechanism');assert(strikes.every(e=>!e.bleed));
const allyLinks=thunder.effects.filter(e=>e.type==='lightning'&&e.ally);assert.equal(allyLinks.length,5);
assert.equal(allyLinks[0].x,mage.x);for(let i=1;i<allyLinks.length;i++){assert.equal(allyLinks[i].x,allyLinks[i-1].x2);assert.equal(allyLinks[i].y,allyLinks[i-1].y2);}
assert(!thunder.effects.some(e=>e.type==='companionLightning'),'the ally uses the same chain effect as the protagonist, with no separate sky-lightning effect');
const afterLightning=strikes.map(e=>e.hp);thunder.companions.resolve();
assert.deepEqual(strikes.map(e=>e.hp),afterLightning,'lightning respects its cooldown');
assert(thunder.effects.length<=201,'one allied cast retains the common effect budget');
thunder.enemies=[];thunder.effects=[];
const victim=monster(thunder,mage.x+100,mage.y);victim.hp=1;const victimXp=victim.xp;
thunder.relics.owned.push('thunderstone');thunder.player.skillCooldown=10;
const beforeKill={kills:thunder.kills,xp:xpTotal(thunder)};mage._attack=0;thunder.companions.resolve();
assert.equal(thunder.kills,beforeKill.kills+1);assert.equal(xpTotal(thunder),beforeKill.xp+victimXp);
assert.equal(thunder.player.skillCooldown,10,'a companion kill does not masquerade as the player lightning relic proc');
mage._attack=0;thunder.companions.resolve();thunder._hurtEnemy(victim,100);
assert.equal(thunder.kills,beforeKill.kills+1);assert.equal(xpTotal(thunder),beforeKill.xp+victimXp,'a companion kill follows the normal exactly-once XP path');

const quake=arena(),warden=rescue(quake,'warden');
const close=monster(quake,warden.x+90,warden.y),far=monster(quake,warden.x+280,warden.y);
quake._rebuildGrid();warden._attack=0;quake.companions.resolve();
const firstDamage=10000-close.hp;assert(firstDamage>=30&&firstDamage<60,'warden deals modest defensive pulse damage');
assert.equal(far.hp,10000);assert(!close.bleed&&!close.shock);
assert(close._weaponPush?.distance>0,'a defensive pulse shoves nearby attackers');
assert.equal(warden._echoes.length,0,'defensive support no longer queues offensive quake echoes');
assert.equal(quake.companions.protectionMultiplier(quake.player),.75,'nearby warden protects the hero');
warden.x+=400;assert.equal(quake.companions.protectionMultiplier(quake.player),1,'protection has a bounded radius');

// Support spells use the same death path that cancels Boss windups. An ally's
// lethal hit resolves before an attack already due on this very frame.
for(const kind of ['stormcaller','warden'])for(const bossKind of ['ancient','bloom']) {
  const g=arena(),ally=rescue(g,kind);g.bossCount=bossKind==='bloom'?2:1;
  const boss=monster(g,g.player.x+75,g.player.y,'boss');
  boss.bloomCooldown=0;boss.bloomNext='burst';g.update(0);
  const warning=bossKind==='bloom'?boss.bloomAttack:boss.slam;assert(warning);
  boss.hp=1;warning.life=.001;ally._attack=0;const hp=g.player.hp;
  g.update(.025);
  assert.equal(g.bossKills,1);assert.equal(g.player.hp,hp);
  assert(!g.events.some(e=>e.type==='bossSlam'||e.type==='bloomBurst'),`a same-frame ${kind} kill cancels the ${bossKind} Boss attack`);
}

// Allies share collision-safe movement even when the player rounds an obstacle.
const walking=arena(),walker=rescue(walking,'warden');
const initialFoot=foot(walker,true);
walking.terrain=new Terrain({obstacles:[{id:'companion-rock',type:'rock',x:initialFoot.x+130,y:initialFoot.y,r:48},{id:'companion-log',type:'log',x:initialFoot.x+180,y:initialFoot.y+160,r:16,halfLength:70,angle:0}]});
walking.player.x=initialFoot.x+330;walking.player.y=initialFoot.y-groundOffset(walking.player,true);
let maxStep=0;
for(let i=0;i<320;i++) {
  const prior={x:walker.x,y:walker.y};walking.update(.025);
  assert(walking.terrain.isFree(walker.x,walker.y+groundOffset(walker,true),walker.r),'following never leaves the ally embedded in a tree, rock or log');
  maxStep=Math.max(maxStep,Math.hypot(walker.x-prior.x,walker.y-prior.y));
}
assert(Math.hypot(walker.x-walking.player.x,walker.y-walking.player.y)<150,'an ally can route around blocking scenery and catch up');
assert(maxStep<30,'ordinary following does not teleport through nearby obstacles');

// A stationary player can stand with the usual trailing position against a
// tree. The ally must settle at another clear point instead of orbiting forever.
const resting=arena(),restingAlly=rescue(resting,'warden');
Object.assign(resting.player,{x:0,y:0,facing:0});
Object.assign(restingAlly,{x:-180,y:0,_navTimer:0,_navObstacle:null,_navSide:0});
resting.terrain=new Terrain({obstacles:[{id:'trailing-tree',type:'tree',x:-95,y:19.8,r:25}]});
for(let i=0;i<600;i++) {
  resting.update(1/60);
  assert(resting.terrain.isFree(restingAlly.x,restingAlly.y+groundOffset(restingAlly,true),restingAlly.r),'a resting ally keeps its feet outside the tree while approaching');
}
const settled={x:restingAlly.x,y:restingAlly.y};
for(let i=0;i<120;i++)resting.update(1/60);
assert(Math.hypot(restingAlly.x-settled.x,restingAlly.y-settled.y)<.01,'the ally settles instead of continuously circling the blocked trailing position');
assert(Math.hypot(restingAlly.x-resting.player.x,restingAlly.y-resting.player.y)<150);
assert.equal(restingAlly.moving,false);

// Feet follow actual displacement, including analogue input and collisions.
// Equal distance at different speeds produces the same stride progress.
const fullStride=arena(),halfStride=arena();
advance(fullStride,.1,{x:1});advance(halfStride,.2,{x:.5});
assert(Math.abs(fullStride.player.x-halfStride.player.x)<1e-8);
assert(Math.abs(fullStride.player.walkPhase-halfStride.player.walkPhase)<1e-8,'walk cadence follows distance rather than elapsed time');
assert(fullStride.player.walkSpeed>halfStride.player.walkSpeed);
const phaseAfterWalking=fullStride.player.walkPhase;
advance(fullStride,.3);
assert.equal(fullStride.player.moving,false);assert.equal(fullStride.player.walkSpeed,0);
assert.equal(fullStride.player.walkPhase,phaseAfterWalking,'stationary feet do not keep walking');
const againstWall=arena();
againstWall.terrain=new Terrain({obstacles:[{id:'stride-wall',type:'rock',x:45,y:19.8,r:30}]});
advance(againstWall,.3,{x:1});const wallPhase=againstWall.player.walkPhase,wallX=againstWall.player.x;
advance(againstWall,.3,{x:1});
assert(Math.abs(againstWall.player.x-wallX)<1e-6);
assert.equal(againstWall.player.walkPhase,wallPhase,'holding movement into a wall does not animate walking in place');
assert.equal(againstWall.player.moving,false);assert.equal(againstWall.player.walkSpeed,0);

// Once settled, facing changes and small player adjustments must not make the
// companion shuffle from one trailing slot to another.
const idlePhase=restingAlly.walkPhase;
for(let i=0;i<16;i++){
  resting.player.x=i%2?3:0;resting.player.facing=i*Math.PI/2;
  advance(resting,.1);
}
assert(Math.hypot(restingAlly.x-settled.x,restingAlly.y-settled.y)<.01,'small idle adjustments do not cause companion drift');
assert.equal(restingAlly.walkPhase,idlePhase);
advance(resting,1,{x:1});
assert(Math.hypot(restingAlly.x-settled.x,restingAlly.y-settled.y)>40,'the companion resumes following when the player walks away');
assert(restingAlly.moving&&restingAlly.walkSpeed>0);assert.notEqual(restingAlly.walkPhase,idlePhase);

const pendingTravel=arena(),lostCamp=pendingTravel.companions.spawn('stormcaller',350,19.8);
const beforeTravelKills=pendingTravel.kills;travel(pendingTravel);
assert.equal(pendingTravel.regionIndex,1);assert.equal(pendingTravel.companions.camp,null);assert.equal(pendingTravel.companions.active,null);
assert.equal(pendingTravel.rescuePower,0);assert.equal(pendingTravel.companions.rescuedCount,0);
assert.equal(pendingTravel.kills,beforeTravelKills+1,'travel only rewards the defeated Boss, never cleared rescue guards');
assert(!pendingTravel.enemies.some(e=>e.rescueId===lostCamp.id));
const backToCamp=pendingTravel.regions.portals.find(p=>p.direction==='back');pendingTravel.player.x=backToCamp.x;pendingTravel.player.y=portalDoor(backToCamp).y-groundOffset(pendingTravel.player,true);assert(pendingTravel.enterPortal(backToCamp.id));
assert.equal(pendingTravel.companions.camp,lostCamp,'an unfinished camp is restored on returning to its region');assert.equal(pendingTravel.enemies.filter(e=>e.rescueId===lostCamp.id).length,6);
const followingTravel=arena(),follower=rescue(followingTravel,'warden');
advance(followingTravel,7);const remaining=follower.remaining;
follower._attack=0;monster(followingTravel,follower.x+100,follower.y);followingTravel.companions.resolve();
const attackCooldown=follower._attack;follower._echoes.push({x:0,y:0,life:2,regionIndex:0});
travel(followingTravel);
assert.equal(followingTravel.companions.active,follower,'an active rescued ally persists across a portal');
assert.equal(follower.remaining,remaining);assert.equal(follower._attack,attackCooldown,'travel cannot reset the support attack cooldown');
assert.equal(follower._echoes.length,0,'old-map ground impacts are discarded instead of detonating at unrelated new coordinates');
assert.equal(followingTravel.rescuePower,1);assert.equal(followingTravel.companions.rescuedCount,1);
assert(followingTravel.terrain.isFree(follower.x,follower.y+groundOffset(follower,true),follower.r));
assert(Math.hypot(follower.x-followingTravel.player.x,follower.y-followingTravel.player.y)<150,'the ally lands safely beside the player');
for(const entity of [followingTravel.player,follower]){
  assert.equal(entity.moving,false);assert.equal(entity.walkSpeed,0);
  assert.equal(entity.walkPhase,0,'portal relocation is not counted as a walking stride');
}

// Rescues live at fixed ruins; explicit activation still respects nearby fights.
const scheduled=arena({companions:true});advance(scheduled,34.9);assert.equal(scheduled.companions.camp,null);
advance(scheduled,.2);assert.equal(scheduled.companions.camp,null,'rescues are activated at fixed ruins, never spawned by a timer');
assert.equal(scheduled.enemies.filter(e=>e.rescueId).length,0);
const explicitCamp=scheduled.companions.spawn('stormcaller',350,19.8);assert(explicitCamp);assert.equal(scheduled.enemies.filter(e=>e.rescueId).length,6);
const blocker=arena({companions:true});monster(blocker,350,0,'boss');advance(blocker,40);
assert.equal(blocker.companions.spawn('warden',350,19.8),null,'an active Boss prevents activating a rescue camp');
const imminent=arena({companions:true});imminent.nextBossAt=55;advance(imminent,40);
assert.equal(imminent.companions.spawn('warden',350,19.8),null,'an imminent legacy Boss blocks a competing rescue');
const eventBlock=arena({companions:true});eventBlock.encounters=new Encounters(eventBlock,{generation:false});
const event=eventBlock.encounters.spawn('hunt',0,19.8);event.life=100;advance(eventBlock,40);
assert.equal(eventBlock.companions.spawn('warden',350,19.8),null,'an active nearby objective prevents another rescue objective');
const campBlock=arena();campBlock.companions.spawn('warden',350,19.8);campBlock.player.x=150;
campBlock.encounters=new Encounters(campBlock);campBlock.encounters.nextAt=0;advance(campBlock,.1);
assert.equal(campBlock.encounters.active,null,'a nearby engaged rescue camp defers automatic timed encounters');
const hunt=arena();hunt.encounters=new Encounters(hunt,{generation:false});
const huntEvent=hunt.encounters.spawn('hunt',0,19.8),rescueGuard=monster(hunt,100);
rescueGuard.rescueId='qa-rescue';rescueGuard.eventRole='rescueGuard';rescueGuard.xp=0;
hunt._hurtEnemy(rescueGuard,rescueGuard.hp+1);assert.equal(huntEvent.progress,0,'camp guards cannot farm a simultaneous ordinary hunt counter');

// Repeat optional rescues over a long run without accumulating old guards,
// companions, queued spells or reward copies.
const cycling=arena();
for(let i=0;i<12;i++) {
  const helper=rescue(cycling,i%2?'warden':'stormcaller',cycling.player.x+350,cycling.player.y+19.8);
  assert.equal(cycling.rescuePower,i+1);assert.equal(cycling.companions.rescuedCount,i+1);
  assert.equal(cycling.companions.camp,null);assert(!cycling.enemies.some(e=>e.hp>0&&e.rescueId));
  advance(cycling,60.1);assert.equal(cycling.companions.active,helper);cycling.companions.dismiss(helper.id);assert.equal(cycling.companions.active,null);
  assert.equal(helper._echoes.length,0);assert(cycling.enemies.length<=180);assert(cycling.effects.length<=201);
  advance(cycling,45.1);
}
assert.equal(cycling.rescuePower,12);assert.equal(xpTotal(cycling),144);assert.equal(cycling.player.level,1);
console.log('Companion mechanics: fixed protagonist, real guard combat/rescue, persistent paid service, permanent run growth, lightning/defensive pulse damage, single rewards, interrupted Boss attacks, collision following, portal continuity, objective scheduling and long-run bounds passed.');
