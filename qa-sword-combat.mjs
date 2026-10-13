import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { SwordCombat, intersectsSwordArc } from './dist/sword-combat.js';
import { skillStats, weaponStats } from './dist/combat-stats.js';

let seed=814017;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const stats={equipped:true,damage:70,interval:.72,range:95,arc:Math.PI*.8,windup:.065,hitTime:.115,duration:.28,knockback:0,branch:null};
const wall=heightBand=>({id:`${heightBand}-wall`,type:'log',heightBand,x:50,y:20,r:8,halfLength:90,angle:Math.PI/2});
function arena(obstacles=[]) {
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.player.x=0;g.player.y=0;
  g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function enemy(g,x,y=0,type='slime') {
  const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0});g._rebuildGrid();return e;
}
function swing(g,s=stats) {g.attacks.sword.update(0,s);g.attacks.sword.update(s.hitTime,s);}

assert(intersectsSwordArc({x:0,y:0},{x:100,y:0,r:6},95,Math.PI/2,0),'the blade end grazes an occupied target circle');
assert(!intersectsSwordArc({x:0,y:0},{x:110,y:0,r:6},95,Math.PI/2,0));
assert(!intersectsSwordArc({x:0,y:0},{x:-60,y:0,r:8},95,Math.PI/2,0),'a narrow forward sector cannot hit behind');
assert(intersectsSwordArc({x:0,y:0},{x:50,y:56,r:8},95,Math.PI/2,0),'the circular target can intersect the edge without its center entering');

// One real strike damages each reachable front target once. The shared damage
// resolver still records weapon feedback and respects the rescue grace period.
const fan=arena(),front=enemy(fan,50),side=enemy(fan,70,30),behind=enemy(fan,-65),far=enemy(fan,160),grace=enemy(fan,72,-20);
grace.rescueSpawnGrace=1;
fan.attacks.sword.update(0,stats);assert(fan.attacks.sword.pending);assert.equal(front.hp,10000,'damage waits for the short windup');
fan.attacks.sword.update(stats.windup,stats);assert.equal(front.hp,10000,'contact lands during the visible swing, after anticipation');
fan.attacks.sword.update(stats.hitTime-stats.windup,stats);
assert.equal(front.hp,9930);assert.equal(side.hp,9930);assert.equal(behind.hp,10000);assert.equal(far.hp,10000);assert.equal(grace.hp,10000);
assert.equal(front.hitSource,'sword');fan.attacks.sword.update(.05,stats);assert.equal(front.hp,9930,'animation tail never repeats damage');

// Direction and outgoing damage are a snapshot, independent of later movement
// facing, newly nearer enemies, and upgrades acquired during the windup.
const locked=arena(),original=enemy(locked,55),reverse=enemy(locked,-65);
locked.attacks.sword.update(0,stats);locked.player.x=-12;locked.player.facing=Math.PI;reverse.x=-30;locked._rebuildGrid();
locked.attacks.sword.update(stats.hitTime,{...stats,damage:700});assert.equal(original.hp,9930);assert.equal(reverse.hp,10000);

// Movement translates the locked sector along with the independent sword.
// Stepping into or away from reach is evaluated at contact, not at startup.
const moving=arena(),first=enemy(moving,60),newReach=enemy(moving,145);
moving.attacks.sword.update(0,stats);
const movingEffect=moving.effects.find(e=>e.type==='swordSlash'),angle=movingEffect.angle;
assert.equal(movingEffect.followOwner,true);assert.equal(movingEffect.owner,moving.player);assert.equal(movingEffect.energyRank,0);
moving.player.x=55;moving.player.y=6;moving.player.facing=Math.PI;
moving.attacks.sword.update(stats.hitTime,stats);
assert.equal(first.hp,9930);assert.equal(newReach.hp,9930,'moving into reach updates the damage sector origin');
assert.equal(movingEffect.x,55);assert.equal(movingEffect.y,6);assert.equal(movingEffect.groundY,25.8);
assert.equal(movingEffect.angle,angle,'movement and facing never redirect the committed swing');assert.equal(movingEffect.attackAge,stats.hitTime);
moving.player.x=58;moving.attacks.sword.update(.03,stats);assert.equal(movingEffect.x,58,'the recovery also follows the owner');
const retreat=arena(),escaped=enemy(retreat,80);retreat.attacks.sword.update(0,stats);retreat.player.x=-55;retreat.attacks.sword.update(stats.hitTime,stats);
assert.equal(escaped.hp,10000,'the blade cannot hit from the position the owner left behind');
for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
  const g=arena(),e=enemy(g,Math.cos(angle)*65,Math.sin(angle)*65);swing(g);
  assert.equal(e.hp,9930,`the same attack works at cardinal angle ${angle}`);
  const visual=g.effects.find(e=>e.type==='swordSlash');assert(Math.abs(visual.angle-angle)<1e-8);
}

// Melee and independent flying energy share one cast ledger. Distant damage
// waits for travel, and acquiring a rank cannot mutate a committed swing.
const energy=arena(),inner=enemy(energy,55),outer=enemy(energy,140);
const energyStats={...stats,range:135,meleeRange:95,energyRank:2,energyBonus:.14};swing(energy,energyStats);
assert.equal(inner.hp,9930);assert.equal(outer.hp,10000);
energy.attacks.sword.update(.22,energyStats);assert.equal(inner.hp,9930);assert.equal(outer.hp,9944);
const energyEffect=energy.effects.find(e=>e.type==='swordSlash');assert.equal(energyEffect.meleeRange,95);assert.equal(energyEffect.r,95);assert.equal(energyEffect.energyRank,2);
const acquireLate=arena(),lateInner=enemy(acquireLate,55),lateOuter=enemy(acquireLate,140);
acquireLate.attacks.sword.update(0,stats);acquireLate.attacks.sword.update(stats.hitTime,energyStats);
assert.equal(lateInner.hp,9930);assert.equal(lateOuter.hp,10000,'upgrades are effective from the next attack');
const baseBuild=arena();assert.equal(weaponStats(baseBuild,'sword').energyRank,0,'the starting sword never has sword energy');
for(const height of [null,'low','high']) {
  const g=arena(height?[wall(height)]:[]),close=enemy(g,25),distant=enemy(g,130);
  assert(g.build.increment('sword'));assert(g.build.increment('sword'));assert(g.build.increment('swordEnergy'));
  const resolved=weaponStats(g,'sword'),calls=new Map(),hitEnemy=g._hitEnemy.bind(g);
  g._hitEnemy=(target,...args)=>{calls.set(target.id,(calls.get(target.id)||0)+1);return hitEnemy(target,...args);};
  assert.equal(intersectsSwordArc({x:0,y:0},distant,resolved.meleeRange,resolved.arc,0),false,'the target is beyond the unmodified blade');
  swing(g,resolved);g.attacks.sword.update(.23,resolved);
  assert(Math.abs(10000-close.hp-resolved.damage)<1e-8);assert.equal(calls.get(close.id),1,'blade and energy share one damage application');
  if(height==='high'){assert.equal(distant.hp,10000);assert.equal(calls.get(distant.id),undefined,'sword energy respects tall occluders');}
  else {assert(Math.abs(10000-distant.hp-resolved.energyDamage)<1e-8);assert.equal(calls.get(distant.id),1,'real sword energy reaches beyond the base blade through low cover');}
}
const outerOnly=arena(),onlyTarget=enemy(outerOnly,130);outerOnly.build.increment('sword');outerOnly.build.increment('sword');outerOnly.build.increment('swordEnergy');
swing(outerOnly,weaponStats(outerOnly,'sword'));assert.equal(onlyTarget.hp,10000);outerOnly.attacks.sword.update(.23,weaponStats(outerOnly,'sword'));assert(onlyTarget.hp<10000,'energy reach participates in acquisition but damage waits for travel');

// Idle polling avoids burning a full attack cooldown and begins a real swing
// within one short poll after a target arrives.
const idle=arena();for(let i=0;i<30;i++)idle.attacks.sword.update(.1,stats);
assert(idle.attacks.sword.cooldown<=.06);assert.equal(idle.effects.length,0);
const arrival=enemy(idle,70);idle.attacks.sword.update(.061,stats);idle.attacks.sword.update(stats.hitTime,stats);assert.equal(arrival.hp,9930);

for(const height of ['low','high']) {
  const g=arena([wall(height)]),e=enemy(g,85);swing(g);
  assert.equal(e.hp,height==='low'?9930:10000,`${height} obstacles use the shared sword path profile`);
}
const air=arena(),bat=enemy(air,70,0,'bat');swing(air);assert.equal(bat.hp,9930,'nearby flying targets can be hit by the blade');

const occluded=arena([wall('high')]),near=enemy(occluded,25),blocked=enemy(occluded,80);swing(occluded);
assert.equal(near.hp,9930);assert.equal(blocked.hp,10000,'area damage cannot reach through a wall even when another target starts the attack');
const interior=arena(),hidden=enemy(interior,70);hidden.dungeonId='qa-room';interior.dungeon.canDamage=()=>false;swing(interior);assert.equal(hidden.hp,10000,'closed room visibility is respected');

for(const boundary of ['scene','teleport','unequip','explicit','owner']) {
  const g=arena(),e=enemy(g,60);g.attacks.sword.update(0,stats);assert(g.attacks.sword.pending);
  if(boundary==='scene')g.sceneKind='hut';
  else if(boundary==='teleport')g.player.x=2000;
  else if(boundary==='explicit')g.attacks.clearTrails();
  else if(boundary==='owner')g.player={...g.player,x:2000};
  g.attacks.sword.update(stats.hitTime,boundary==='unequip'?{...stats,equipped:false}:stats);
  assert.equal(e.hp,10000,`${boundary} cancels the previous scene's delayed strike`);
}
const afterHit=arena();enemy(afterHit,60);swing(afterHit);assert.equal(afterHit.attacks.sword.pending,null);assert(afterHit.effects.some(e=>e.type==='swordSlash'));
afterHit.attacks.sword.update(.01,{...stats,equipped:false});assert(!afterHit.effects.some(e=>e.type==='swordSlash'),'unequipping removes the remaining visual even after contact');
const pause=arena(),paused=enemy(pause,65);pause.attacks.sword.update(0,stats);const frozen=pause.effects.find(e=>e.type==='swordSlash');
pause.status='paused';pause.attacks.sword.update(1,stats);assert.equal(paused.hp,10000);assert.equal(frozen.attackAge,0,'paused poses stay frozen');pause.status='playing';pause.attacks.sword.update(stats.hitTime,stats);assert.equal(paused.hp,9930);

// Targeting supplies/vines exercises the same sector and occlusion predicate
// as enemy damage, without changing the destructible's own lifecycle rules.
const props=arena();const supply={x:60,y:0,aimY:0,r:12,hp:100};props.adventure={props:[supply],hitSupply:(p,d)=>p.hp-=d};swing(props);assert.equal(supply.hp,30);
const blockedProps=arena([wall('high')]),shieldedSupply={x:85,y:0,aimY:0,r:12,hp:100};blockedProps.adventure={props:[shieldedSupply],hitSupply:(p,d)=>p.hp-=d};swing(blockedProps);assert.equal(shieldedSupply.hp,100);
const vines=arena(),vine={type:'vine',x:60,y:0,aimY:0,r:12,state:'active'},rearVine={type:'vine',x:-70,y:0,aimY:0,r:12,state:'active'};
vines.environment={mechanisms:{props:[vine,rearVine]},hitAt:(x,y,r,source,canHit)=>{assert.equal(source,'sword');let n=0;for(const p of [vine,rearVine])if(canHit(p)){p.state='spent';n++;}return n;}};
swing(vines);assert.equal(vine.state,'spent');assert.equal(rearVine.state,'active');

// A pulse waits for a valid reachable grounded target. A successful pulse
// interrupts an ordinary charge before the engine resolves its swept damage.
const pulse=arena();pulse.levels.pulse=1;pulse._pulse=0;pulse.attacks.updatePulse(0);assert.equal(pulse._pulse,.06);assert.equal(pulse.effects.length,0);
const charger=enemy(pulse,75,0,'boar');charger.charge={phase:'rush'};charger._chargeSegment={x:0,y:0,x2:90,y2:0};pulse.attacks.updatePulse(.061);
assert(charger.hp<10000);assert.equal(charger.charge,null);assert.equal(charger._chargeSegment,null);assert(charger.chargeCooldown>=1.2);assert.equal(pulse._pulse,skillStats(pulse,'pulse').cooldown);
const pulseAir=arena();pulseAir.levels.pulse=1;const overhead=enemy(pulseAir,70,0,'bat');pulseAir._pulse=0;pulseAir.attacks.updatePulse(0);assert.equal(overhead.hp,10000);assert.equal(pulseAir._pulse,.06);
const pulseWall=arena([wall('low')]);pulseWall.levels.pulse=1;const inaccessible=enemy(pulseWall,85);pulseWall._pulse=0;pulseWall.attacks.updatePulse(0);assert.equal(inaccessible.hp,10000);assert.equal(pulseWall._pulse,.06);

for(const branch of [null,'focus','chain']) {
  const g=arena();g.levels.lightning=branch?5:1;if(branch)g.branches.lightning=branch;g._lightning=0;g.attacks.updateLightning(0);
  assert.equal(g._lightning,.06);assert.equal(g.effects.length,0);
  const e=enemy(g,100);g.attacks.updateLightning(.061);assert(e.hp<10000);assert.equal(g._lightning,skillStats(g,'lightning').cooldown);
}
const chain=arena();chain.levels.lightning=5;chain.branches.lightning='chain';const targets=Array.from({length:9},(_,i)=>enemy(chain,80+i*32,0));chain._lightning=0;chain.attacks.updateLightning(0);
const chainStats=skillStats(chain,'lightning'),struck=targets.filter(e=>e.hp<10000);assert.equal(struck.length,chainStats.targetLimit);
struck.forEach((e,i)=>assert(Math.abs(10000-e.hp-chainStats.damage*(i>=3?(chainStats.chainRetention??.85):1))<1e-8,'one resolved damage application per chain target'));
console.log('Sword combat: owner-following directional strikes, impact timing, energy reach without duplicate hits, cardinal targets, blocking, flight, rescue, scene/equipment cancellation, props, pause, pulse interrupts and unique lightning chains passed.');
