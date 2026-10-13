import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { SwordCombat, intersectsSwordArc } from './dist/sword-combat.js';
import { skillStats } from './dist/combat-stats.js';

let seed=814017;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const stats={equipped:true,damage:70,interval:.72,range:95,arc:Math.PI*.8,windup:.065,duration:.28,knockback:0,branch:null};
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
function swing(g,s=stats) {g.attacks.sword.update(0,s);g.attacks.sword.update(s.windup,s);}

assert(intersectsSwordArc({x:0,y:0},{x:100,y:0,r:6},95,Math.PI/2,0),'the blade end grazes an occupied target circle');
assert(!intersectsSwordArc({x:0,y:0},{x:110,y:0,r:6},95,Math.PI/2,0));
assert(!intersectsSwordArc({x:0,y:0},{x:-60,y:0,r:8},95,Math.PI/2,0),'a narrow forward sector cannot hit behind');
assert(intersectsSwordArc({x:0,y:0},{x:50,y:56,r:8},95,Math.PI/2,0),'the circular target can intersect the edge without its center entering');

// One real strike damages each reachable front target once. The shared damage
// resolver still records weapon feedback and respects the rescue grace period.
const fan=arena(),front=enemy(fan,50),side=enemy(fan,70,30),behind=enemy(fan,-65),far=enemy(fan,160),grace=enemy(fan,72,-20);
grace.rescueSpawnGrace=1;
fan.attacks.sword.update(0,stats);assert(fan.attacks.sword.pending);assert.equal(front.hp,10000,'damage waits for the short windup');
fan.attacks.sword.update(.065,stats);
assert.equal(front.hp,9930);assert.equal(side.hp,9930);assert.equal(behind.hp,10000);assert.equal(far.hp,10000);assert.equal(grace.hp,10000);
assert.equal(front.hitSource,'sword');fan.attacks.sword.update(.05,stats);assert.equal(front.hp,9930,'animation tail never repeats damage');

// Direction and outgoing damage are a snapshot, independent of later movement
// facing, newly nearer enemies, and upgrades acquired during the windup.
const locked=arena(),original=enemy(locked,55),reverse=enemy(locked,-65);
locked.attacks.sword.update(0,stats);locked.player.x=-12;locked.player.facing=Math.PI;reverse.x=-30;locked._rebuildGrid();
locked.attacks.sword.update(.065,{...stats,damage:700});assert.equal(original.hp,9930);assert.equal(reverse.hp,10000);

// Idle polling avoids burning a full attack cooldown and begins a real swing
// within one short poll after a target arrives.
const idle=arena();for(let i=0;i<30;i++)idle.attacks.sword.update(.1,stats);
assert(idle.attacks.sword.cooldown<=.06);assert.equal(idle.effects.length,0);
const arrival=enemy(idle,70);idle.attacks.sword.update(.061,stats);idle.attacks.sword.update(.065,stats);assert.equal(arrival.hp,9930);

for(const height of ['low','high']) {
  const g=arena([wall(height)]),e=enemy(g,85);swing(g);
  assert.equal(e.hp,height==='low'?9930:10000,`${height} obstacles use the shared sword path profile`);
}
const air=arena(),bat=enemy(air,70,0,'bat');swing(air);assert.equal(bat.hp,9930,'nearby flying targets can be hit by the blade');

const occluded=arena([wall('high')]),near=enemy(occluded,25),blocked=enemy(occluded,80);swing(occluded);
assert.equal(near.hp,9930);assert.equal(blocked.hp,10000,'area damage cannot reach through a wall even when another target starts the attack');
const interior=arena(),hidden=enemy(interior,70);hidden.dungeonId='qa-room';interior.dungeon.canDamage=()=>false;swing(interior);assert.equal(hidden.hp,10000,'closed room visibility is respected');

for(const boundary of ['scene','teleport','unequip','explicit']) {
  const g=arena(),e=enemy(g,60);g.attacks.sword.update(0,stats);assert(g.attacks.sword.pending);
  if(boundary==='scene')g.sceneKind='hut';
  else if(boundary==='teleport')g.player.x=2000;
  else if(boundary==='explicit')g.attacks.clearTrails();
  g.attacks.sword.update(.065,boundary==='unequip'?{...stats,equipped:false}:stats);
  assert.equal(e.hp,10000,`${boundary} cancels the previous scene's delayed strike`);
}
const pause=arena(),paused=enemy(pause,65);pause.attacks.sword.update(0,stats);pause.status='paused';pause.attacks.sword.update(1,stats);assert.equal(paused.hp,10000);pause.status='playing';pause.attacks.sword.update(.065,stats);assert.equal(paused.hp,9930);

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
console.log('Sword combat: directional delayed strikes, target circles, blocking, flight, rescue, scene/equipment cancellation, props, idle cadence, pulse interrupts and unique lightning chains passed.');
