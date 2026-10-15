import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { skillStats } from './dist/combat-stats.js';
import { RELIC_RULES } from './dist/relics.js';

const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-8,`${label}: expected ${expected}, received ${actual}`);
function arena({barrier=true}={}) {
  // The princess has neutral health/defense, keeping these absorption examples
  // independent of the prince's permanent health and armor bonuses.
  const g=new Game({hero:'princess',terrain:new Terrain({obstacles:[]}),adventure:false});
  g.enemies=[];g.effects=[];g.events=[];
  g._spawn=Infinity;g._shot=Infinity;g._sword=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;
  if(barrier){assert(g.build.increment('barrier'));g._refreshStats();g._refreshWeapons();}
  return g;
}
function advance(g,seconds){for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left));}

const unlearned=arena({barrier:false});
assert(!unlearned.barrier.ready);assert(!unlearned.barrier.active);
assert(unlearned._hurtPlayer(20));assert.equal(unlearned.player.hp,80);
assert.equal(unlearned.barrier.cooldown,0,'unlearned protection cannot trigger');
assert(unlearned.build.increment('barrier'));
assert(unlearned.barrier.ready,'acquisition becomes ready immediately without a timer update');

const first=arena();
assert(first.barrier.ready);assert.equal(first.barrier.capacity,30);
advance(first,2);assert(first.barrier.ready);assert.equal(first.barrier.cooldown,0,'safe travel never spends a ready shield');
first.events=[];first.effects=[];
assert(first._hurtPlayer(8));assert.equal(first.player.hp,100);
assert.equal(first.barrier.remaining,22);assert.equal(first.barrier.life,2);assert.equal(first.barrier.cooldown,15);
assert(first.barrier.active);assert(!first.barrier.ready);assert.equal(first.player.invuln,.8);
assert(first.events.some(event=>event.type==='barrierTriggered'));
assert(!first.events.some(event=>event.type==='hurt'),'a fully absorbed attack has protective rather than health-loss feedback');
assert(!first.effects.some(effect=>effect.type==='ring'&&effect.color==='#e48d78'));
assert.equal(first._hurtPlayer(100),false,'overlapping hits retain the existing grace period');
assert.equal(first.barrier.remaining,22);
advance(first,.81);assert(first._hurtPlayer(12));assert.equal(first.player.hp,100);near(first.barrier.remaining,10,'one activation absorbs several attacks');
advance(first,.81);assert(first._hurtPlayer(25));near(first.player.hp,85,'only damage exceeding remaining capacity reaches HP');
assert(!first.barrier.active);assert.equal(first.barrier.remaining,0);assert.equal(first.barrier.life,0);
assert(first.events.some(event=>event.type==='barrierBroken'));assert(first.events.some(event=>event.type==='hurt'));
near(first.barrier.cooldown,13.38,'additional hits do not restart cooldown');

const defenses=arena();defenses.levels.toughness=5;defenses._refreshStats();
assert(defenses.relics.grantWard(18));assert(defenses._hurtPlayer(100));
near(defenses.player.hp,98,'defense halves 100 before a temporary ward absorbs 18 and barrier absorbs 30');
assert.equal(defenses.relics.wardAmount,0);assert(!defenses.barrier.active);
const ward=arena();ward.levels.toughness=5;ward._refreshStats();assert(ward.relics.grantWard(18));
assert(ward._hurtPlayer(30));assert.equal(ward.player.hp,100);
assert.equal(ward.relics.wardAmount,0);assert(ward.barrier.ready,'temporary ward absorbing all damage preserves standby barrier');

const guarded=arena();guarded.player.invuln=1;
assert.equal(guarded._hurtPlayer(100),false);assert(guarded.barrier.ready);assert.equal(guarded.barrier.cooldown,0);
guarded.player.invuln=0;
for(const amount of [0,-1,NaN,Infinity])assert.equal(guarded._hurtPlayer(amount),false);
assert(guarded.barrier.ready,'invalid or ineffective attacks never spend the shield');
assert(guarded._hurtPlayer(1));
const frozen=guarded.barrier.snapshot();
for(const status of ['paused','upgrade','relic','shop','super','dead']) {
  guarded.status=status;guarded.barrier.update(10);guarded.update(.05);
  assert.deepEqual(guarded.barrier.snapshot(),frozen,`${status} freezes cooldown and duration`);
  assert.equal(guarded.barrier.absorbDamage(10),10);
}
guarded.status='playing';
for(const dt of [0,-1,NaN,Infinity])guarded.barrier.update(dt);
assert.deepEqual(guarded.barrier.snapshot(),frozen);
advance(guarded,2.01);assert(!guarded.barrier.active);assert.equal(guarded.barrier.remaining,0);
near(guarded.barrier.cooldown,12.99,'expiration does not restart cooldown');
advance(guarded,13.01);assert(guarded.barrier.ready);assert.equal(guarded.barrier.cooldown,0);

const scene=arena();assert(scene._hurtPlayer(5));const beforeScene=scene.barrier.cooldown;
scene.barrier.clearScene();assert.equal(scene.barrier.life,0);assert.equal(scene.barrier.remaining,0);
assert.equal(scene.barrier.cooldown,beforeScene);assert(!scene.barrier.ready,'crossing a scene cannot refill protection');
scene.barrier.clearScene();assert.equal(scene.barrier.cooldown,beforeScene,'repeated entrance hooks are idempotent');
const fresh=arena();assert(fresh.barrier.ready);assert.equal(fresh.barrier.cooldown,0,'new run owns fresh state');

const relic=arena({barrier:false});
assert(relic.relics.acquire('leafWard'));assert.equal(relic.build.getSkill('barrier').baseRank,1);
assert(relic.skills.some(skill=>skill.id==='barrier'));assert(relic.barrier.ready);
assert(relic.events.some(event=>event.type==='skillAcquired'&&event.skillId==='barrier'));
near(skillStats(relic,'barrier').capacity,30*RELIC_RULES.barrierCapacityMultiplier,'relic capacity bonus');
near(skillStats(relic,'barrier').cooldown,15*RELIC_RULES.barrierCooldownMultiplier,'relic cooldown bonus');
for(let i=0;i<20;i++){relic._refreshStats();relic._refreshWeapons();}
near(skillStats(relic,'barrier').capacity,34.5,'derived refreshes do not compound the relic');
assert.equal(relic.relics.acquire('leafWard'),false);assert.equal(relic.build.getSkill('barrier').baseRank,1);
assert(relic._hurtPlayer(40));near(relic.player.hp,94.5,'relic has no additional legacy one-shot absorption');
near(relic.barrier.cooldown,12.75,'relic modifies one real cooldown');
near(relic.relics.shieldCooldown,relic.barrier.cooldown,'legacy read views share the same timer');

const existing=arena();assert(existing.build.increment('barrier'));assert(existing.build.increment('barrier'));
assert(existing.relics.acquire('leafWard'));assert.equal(existing.build.getSkill('barrier').baseRank,3,'relic does not grant a free rank to an already learned skill');
near(skillStats(existing,'barrier').capacity,51.75,'level three with relic');
near(skillStats(existing,'barrier').cooldown,10.2,'level three recharge with relic');
assert(existing._hurtPlayer(10));const captured={remaining:existing.barrier.remaining,capacity:existing.barrier.capacity,life:existing.barrier.life,cooldown:existing.barrier.cooldown};
existing.player.maxHp=200;existing._refreshStats();
assert.equal(existing.barrier.capacity,captured.capacity);assert.equal(existing.barrier.remaining,captured.remaining,'in-flight protection is not refilled by a health upgrade');
assert.equal(existing.barrier.life,captured.life);assert.equal(existing.barrier.cooldown,captured.cooldown);

console.log('Guardian barrier: standby acquisition, first-hit absorption, defense/ward ordering, overflow, grace periods, frozen timers, scene cleanup and single relic bonuses passed.');
