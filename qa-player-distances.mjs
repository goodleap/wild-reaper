import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { weaponStats, skillStats } from './dist/combat-stats.js';
import { getStormGeometry } from './dist/storm-geometry.js';
import { SWORD_FLIGHT_RULES, swordFormationAnchor, createSwordFlight, advanceSwordFlight } from './dist/sword-flight.js';

const HP=10000,near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,`${message}: ${actual} vs ${expected}`);
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.viewWidth=1200;g.viewHeight=1200;
  g.player.xpNext=g.crystalsNext=Infinity;return g;
}
function enemy(g,x,y=0,r=5){
  const e=g._spawnEnemy('slime');Object.assign(e,{x,y,r,hp:HP,maxHp:HP,speed:0,knockbackImmune:true});g._rebuildGrid();return e;
}
function rank(g,id,n){for(let i=0;i<n;i++)assert(g.build.increment(id));g._syncEvolutions();}
function steps(time,update){for(let left=time;left>1e-9;left-=.025)update(Math.min(.025,left));}

// Acquisition and projectile travel are separate; a bounce may not replenish
// the total travel budget even though its legacy minimum lifetime still applies.
{
  const g=arena();rank(g,'arrow',1);const target=enemy(g,261);g._shot=0;g.attacks.updateBasic(0);assert.equal(g.bullets.length,0);
  target.x=259;g._shot=0;g.attacks.updateBasic(0);assert.equal(g.bullets.length,1);
  const b=g.bullets[0];g.enemies=[];g._rebuildGrid();g.attacks.updateArrow(b,1);
  near(b.x,320,'arrow stops at total travel');near(b.remainingRange,0,'arrow budget consumed');assert(b.life<=0);
}
{
  const g=arena();rank(g,'arrow',1);rank(g,'rapid',3);assert(g.build.selectBranch('arrow','ricochet'));
  const targets=[90,210,340].map(x=>enemy(g,x));g._shot=0;g.attacks.updateBasic(0);const b=g.bullets[0];
  steps(1,dt=>g.attacks.updateArrow(b,dt));
  assert(targets[0].hp<HP&&targets[1].hp<HP,'ricochet still hits multiple targets');assert.equal(targets[2].hp,HP,'minimum bounce lifetime cannot extend 320 travel');
  near(b.remainingRange,0,'ricochet shares one travel budget');near(b.x,320,'ricochet exact final segment');
}
for(const id of ['fireball','frostbolt'])for(const level of [1,5]){
  const g=arena();rank(g,id,level);const target=enemy(g,251);g._abilityCooldowns[id]=0;g._updateGeneralSkills(0);assert.equal(g.abilities.effects.length,0);
  target.x=249;g._abilityCooldowns[id]=0;g._updateGeneralSkills(0);const effect=g.abilities.effects[0];assert(effect);
  assert.equal(effect.parameters.range,300);assert.equal(skillStats(g,id).acquisitionRange,250);
  g.enemies=[];steps(1,dt=>g.abilities.update(dt));near(effect.x,300,`${id} stops at flight distance`);near(effect.distance,300,`${id} travel accounting`);
}
{
  const g=arena();rank(g,'lightning',1);const first=enemy(g,240),linked=enemy(g,240,139),far=enemy(g,240,280);
  g._lightning=0;g.attacks.updateLightning(0);assert(first.hp<HP&&linked.hp<HP);assert.equal(far.hp,HP,'ordinary lightning cannot jump 141 units');
  assert.equal(skillStats(g,'lightning').range,250);assert.equal(skillStats(g,'lightning').chainRange,140);
}
{
  const g=arena();rank(g,'lightning',4);assert(g.build.selectBranch('lightning','chain'));g._syncEvolutions();g.viewWidth=540;g.viewHeight=1000;
  const first=enemy(g,230),offscreen=enemy(g,300),linked=enemy(g,230,149);
  g._lightning=0;g.attacks.updateLightning(0);assert(first.hp<HP&&linked.hp<HP);assert.equal(offscreen.hp,HP,'subsequent lightning targets retain visibility eligibility');
  assert.equal(skillStats(g,'lightning').chainRange,150);
}
{
  const g=arena();rank(g,'pulse',4);assert(g.build.selectBranch('pulse','echoes'));g._syncEvolutions();const outside=enemy(g,202,0,1);
  g._pulse=0;g.attacks.updatePulse(0);assert.equal(g._pulseEchoes.length,0,'an enemy outside the capped echo cannot trigger an empty cast');
  outside.x=199;g._pulse=0;g.attacks.updatePulse(0);assert.equal(g._pulseEchoes[0].r,200);
  g._pulse=Infinity;g.attacks.updatePulse(.4);assert(outside.hp<HP,'the outer echo band still deals damage');
}
for(const branch of ['echoes','control']){
  const g=arena();rank(g,'pulse',4);assert(g.build.selectBranch('pulse',branch));g._syncEvolutions();const stats=skillStats(g,'pulse');
  assert.equal(branch==='echoes'?stats.echoRadius:stats.radius,200);
}
{
  const g=arena();rank(g,'orbit',5);rank(g,'orbitRadius',2);const stats=weaponStats(g,'orbit');
  assert.equal(stats.radius,90);assert.equal(stats.radius+stats.evolutionRange,140);
  g._clock=.45;g._orbitEvolutionStartedAt=0;g.attacks.updateOrbit();assert(g.orbitals.every(o=>Math.hypot(o.x-g.player.x,o.y-g.player.y)<=140+1e-7));
}
// Sky strikes retain full warnings/feedback at each actual victim. Decorative
// empty strokes also stay within the fixed area at every supported viewport.
for(const [w,h] of [[480,900],[540,985],[600,1100],[1440,900]]){
  const g=arena();g.viewWidth=w;g.viewHeight=h;const inside=enemy(g,0,299),far=enemy(g,0,301),offscreen=enemy(g,290);
  g._castStorm();assert(inside.hp<HP);assert.equal(far.hp,HP);assert.equal(offscreen.hp<HP,w/2>=285);
  assert.equal(g.storm.radius,300);assert.equal(skillStats(g,'storm').radius,300);
  for(const b of getStormGeometry(g.storm).mainBolts)assert(Math.hypot(b.target.x-g.storm.x,b.target.y-g.storm.y)<=300+1e-7);
}
{
  const g=arena(),s=g.superSkills,target=enemy(g,241);target.groundY=s._foot().y;
  assert.equal(s._cast('meteor',1),false);target.x=239;assert(s._cast('meteor',1));assert(s.fields.every(f=>f.x===239));
  assert.equal(s._cast('domain',1),false);assert.equal(s._cast('vortex',1),false,'retired player fields stay retired');
}
{
  const g=arena();assert(g.build.awardRuneArrow());const stats=weaponStats(g,'arrow'),far=enemy(g,300);
  assert.equal(g.superSkills.castRunicVolley(stats),false);assert.equal(g.superSkills.castRunicVolley(stats,far),false,'explicit targets cannot bypass acquisition');
  far.x=250;assert(g.superSkills.castRunicVolley(stats,far));const beyond=enemy(g,340);g.superSkills._updateRunic(.2);
  assert(far.hp<HP);assert.equal(beyond.hp,HP);const ray=g.effects.find(e=>e.type==='superRay');near(Math.hypot(ray.x2-ray.x,ray.y2-ray.y),320,'runic beam length');
}
// All six launch anchors must retain stationary reach at the acquisition edge,
// including the swords that initially fan away and curve back toward the enemy.
for(const direction of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(let index=0;index<6;index++){
  const target={x:Math.cos(direction)*260,y:Math.sin(direction)*260+5.8,r:12,hp:HP};
  const pointOf=e=>({x:e.x,y:e.y+14,lift:14});
  const f=createSwordFlight({id:1,anchor:swordFormationAnchor({x:0,y:0},index,6),groundLift:19.8,target,targetPoint:pointOf(target),damage:188});
  let hits=0;steps(2.5,dt=>advanceSwordFlight(f,dt,{pointOf,blocked:()=>false,onImpact:(_,__,hit)=>{if(hit)hits++;}}));
  assert.equal(f.reason,'arrived',`stationary acquisition edge ${direction}, anchor ${index}`);assert.equal(hits,1);
  assert(f.distance<=SWORD_FLIGHT_RULES.maxTravel);assert(Math.hypot(f.x-f.launch.x,f.y-f.launch.y)<=SWORD_FLIGHT_RULES.maxRange);
}
{
  const target={x:250,y:0,r:12,hp:HP},pointOf=e=>({x:e.x,y:e.y+14,lift:14});
  const f=createSwordFlight({id:1,anchor:swordFormationAnchor({x:0,y:0},0,6),groundLift:19.8,target,targetPoint:pointOf(target),damage:188});
  target.x=2000;steps(2.5,dt=>advanceSwordFlight(f,dt,{pointOf,blocked:()=>false,onImpact:()=>assert.fail('escaped target cannot be hit')}));
  assert.equal(f.reason,'range');assert(f.distance<=480+1e-7);near(Math.hypot(f.x-f.launch.x,f.y-f.launch.y),320,'royal pursuit radial cap');
}
console.log('Player distances: independent acquisition/travel, bounded ricochets and royal pursuit, all formation anchors, pulse/orbit caps, visible lightning and fixed-radius storm passed.');
