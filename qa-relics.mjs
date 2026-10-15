import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';
import { RELICS, RELIC_RULES } from './dist/relics.js';
import { defenseDamageMultiplier, resolveCharacterStats, skillStats } from './dist/combat-stats.js';

let seed=108473;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena({owned=[],...options}={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,...options});
  assert(g.build.increment('arrow'));assert(g.build.setEquipped('sword',false));g._refreshWeapons();
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];g._spawn=Infinity;g._shot=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g.relics.owned.push(...owned.filter(id=>id!=='leafWard'));if(owned.includes('leafWard'))assert(g.relics.acquire('leafWard'));
  if(g.elites)g.elites.generation=false;g._refreshStats();return g;
}
function advance(g,seconds,input={}) {for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);}
function monster(g,x=150,y=0,hp=10000) {const e=g._spawnEnemy('slime',1);Object.assign(e,{x,y,speed:0,hp,maxHp:hp});return e;}
function shoot(g) {g._shot=0;g.update(0);g._shot=Infinity;}
function herb(g) {
  g.adventure??=new Adventure(g,{generation:false});
  return g.adventure.dropPickup('herb',g.player.x,g.player.y+groundOffset(g.player,true));
}
const xpTotal=g=>g.player.xp;
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);

assert.equal(RELICS.length,6);assert.equal(new Set(RELICS.map(r=>r.id)).size,6);
const collection=arena();assert.deepEqual(collection.getRelicChoices(),[],'ordinary play does not spontaneously offer relic choices');
for(let i=0;i<6;i++) {
  assert(collection.relics.offer());assert.equal(collection.relics.offer(),false,'multiple reward hooks cannot stack duplicate pending offers');
  const choices=collection.relics.getChoices(),ids=choices.map(c=>c.id);
  assert.equal(choices.length,Math.min(3,6-i));assert.equal(new Set(ids).size,ids.length);
  assert(ids.every(id=>!collection.relics.owned.includes(id)),'already owned relics are excluded');
  for(let n=0;n<8;n++)assert.deepEqual(collection.relics.getChoices().map(c=>c.id),ids,'the pending selection remains stable');
  assert.equal(collection.relics.choose(ids[0]),false,'a relic can only be accepted from its choice state');
  collection.status='relic';assert.equal(collection.relics.choose('invalid'),false);
  assert(collection.relics.choose(ids[0]));assert.equal(collection.relics.choose(ids[0]),false);
  collection.status='playing';assert.equal(collection.relics.owned.length,i+1);assert.equal(collection.player.xp,0);
}
collection.player.hp=10;collection.relics.offer();
const fullCollectionHp=Math.min(collection.player.maxHp,10+collection.player.maxHp*RELIC_RULES.collectionHeal);
assert(collection.relics.completeCollectionReward(),'the legacy full-collection recovery remains independently usable');
assert.equal(collection.player.hp,fullCollectionHp,'the complete-collection reward heals its configured fraction of actual hero maximum once');
assert.equal(collection.relics.completeCollectionReward(),false);assert.equal(collection.player.hp,fullCollectionHp);
assert.equal(collection.relics.owned.length,6);

const storm=arena({owned:['thunderstone']}),stormVictims=[];
const stormRange=skillStats(storm,'storm').radius;
for(let i=0;i<8;i++){const angle=i*Math.PI/4;stormVictims.push(monster(storm,Math.cos(angle)*stormRange*.65,Math.sin(angle)*stormRange*.65,1));}
storm.update(0,{skill:true});
assert.equal(storm.kills,8);assert(Math.abs(storm.player.skillCooldown-(storm.player.skillCooldownMax-1.2))<1e-9,'a real in-range group clear obeys the one-second refund budget');
const refundCooldown=storm.player.skillCooldown;
for(const e of stormVictims)storm.relics.onEnemyKilled(e,'storm');
assert.equal(storm.player.skillCooldown,refundCooldown,'repeat kill notifications cannot refund again');
storm.levels.lightning=1;storm._lightning=0;for(let i=0;i<3;i++)monster(storm,140+i*65,0,1);
storm.update(0);assert.equal(storm.player.skillCooldown,refundCooldown,'another lightning attack shares the same rolling budget');
storm._clock=1.01;storm._lightning=0;for(let i=0;i<3;i++)monster(storm,140+i*65,0,1);
storm.update(0);assert(Math.abs(storm.player.skillCooldown-(refundCooldown-.9))<1e-9,'fresh lightning kills refund again after the rolling window');
assert(storm.relics._thunderKills.length<=4,'the refund history stays bounded');

const ordinary=arena({owned:['thunderstone']});ordinary.player.skillCooldown=8;monster(ordinary,80,0,1);shoot(ordinary);advance(ordinary,.2);
assert.equal(ordinary.kills,1);assert(Math.abs(ordinary.player.skillCooldown-7.8)<1e-9,'an arrow kill cannot claim a lightning refund');
const conducted=arena({owned:['thunderstone']}),source=monster(conducted,100),receiver=monster(conducted,180);
conducted.update(0,{skill:true});receiver.hp=1;
const beforeConduction=conducted.player.skillCooldown;shoot(conducted);advance(conducted,.2);
assert.equal(conducted.kills,1);assert(receiver.hp<=0&&source.hp>0);
assert(Math.abs(conducted.player.skillCooldown-(beforeConduction-.2-.3))<1e-8,'a true single-hop conduction kill counts as lightning damage');
const clamp=arena({owned:['thunderstone']});clamp.player.skillCooldown=.1;const nearDead=monster(clamp,150,0,1);
clamp._hurtEnemy(nearDead,10,0,clamp.player,'lightning');assert.equal(clamp.player.skillCooldown,0,'a refund cannot make cooldown negative');

function arrowDamage(healthFraction,owned=[]) {
  const g=arena({owned}),e=monster(g,80);g.player.hp=g.player.maxHp*healthFraction;const before=e.hp;shoot(g);advance(g,.2);return before-e.hp;
}
const normalArrow=arrowDamage(RELIC_RULES.lowHealthThreshold-.01);
assert.equal(arrowDamage(RELIC_RULES.lowHealthThreshold,['bloodstone']),normalArrow,'exactly the configured health fraction does not activate the low-health effect');
assert.equal(arrowDamage(RELIC_RULES.lowHealthThreshold-.01,['bloodstone']),normalArrow*RELIC_RULES.lowHealthDamage,'a real arrow gains the low-health damage bonus');
assert.equal(arrowDamage(1,['bloodstone']),normalArrow,'healing out of low health removes the conditional bonus');

const fast=arena({hero:'warden',owned:['swiftFeather']}),baseline=arena({hero:'warden'});
fast.levels.speed=2;baseline.levels.speed=2;fast._refreshStats();baseline._refreshStats();
fast.update(.05,{x:1});baseline.update(.05,{x:1});
assert(Math.abs(fast.player.x/baseline.player.x-1.08)<1e-10,'the movement relic combines with hero and ordinary speed upgrades');

const shield=arena({owned:['leafWard']});shield.player.invuln=1;
const shieldFullHp=shield.player.maxHp,shieldCapacity=skillStats(shield,'barrier').capacity,armorMultiplier=defenseDamageMultiplier(resolveCharacterStats(shield).defense);
assert.equal(shield._hurtPlayer(30),false);assert(shield.relics.shieldReady,'existing invulnerability does not consume a shield');
shield.player.invuln=0;assert(shield._hurtPlayer(8));
assert.equal(shield.player.hp,shieldFullHp);assert(!shield.relics.shieldReady);assert.equal(shield.relics.shieldCooldown,12.75);
near(shield.barrier.remaining,shieldCapacity-8*armorMultiplier,'hero armor resolves before the one relic-strengthened shield');
assert(shield.player.invuln>0,'even a fully absorbed hit starts the normal damage grace period');
shield._hurtPlayer(30);assert.equal(shield.player.hp,shieldFullHp,'overlapping hits cannot bypass that grace period');
for(const state of ['upgrade','relic','paused','dead']) {
  shield.status=state;advance(shield,1);shield.relics.update(.05);assert.equal(shield.relics.shieldCooldown,12.75,'shield recovery freezes outside live play');
}
shield.status='playing';advance(shield,12.65);assert(!shield.relics.shieldReady);
const overflowDamage=(shieldCapacity+5.5)/armorMultiplier;
advance(shield,.125);assert(shield.relics.shieldReady);shield.player.invuln=0;shield._hurtPlayer(overflowDamage);
const afterOverflow=shieldFullHp-5.5;assert.equal(shield.barrier.remaining,0);
near(shield.player.hp,afterOverflow,'the replenished barrier absorbs its full boosted capacity after armor and lets excess through');
shield.player.invuln=0;shield._hurtPlayer(10);near(shield.player.hp,afterOverflow-10*armorMultiplier,'an exhausted barrier leaves no second relic shield');

const herbs=arena({owned:['herbalEcho','deepRoot','thunderstone']});herbs.player.skillCooldown=8;
const herbEnemy=monster(herbs,100),farEnemy=monster(herbs,200),drop=herb(herbs);herbs.update(0);
assert(!herbs.adventure.pickups.includes(drop));assert.equal(herbEnemy.hp,10000,'a full-health herb is consumed without triggering an actual-healing relic');
herbs.player.hp=40;herb(herbs);herbs.update(0);
assert.equal(herbs.player.hp,75,'deep root increases actual herb healing to thirty-five');
assert(!herbs.adventure.pickups.includes(drop));assert.equal(herbEnemy.hp,9940);assert.equal(farEnemy.hp,10000);
assert(!herbEnemy.bleed&&!herbEnemy.shock,'the herb wave uses raw damage without applying weapon status reactions');
assert.equal(herbs.player.skillCooldown,8);
const afterHerbHp=herbEnemy.hp;herbs.update(0);assert.equal(herbEnemy.hp,afterHerbHp,'one pickup cannot cast repeatedly');
herbs.player.hp=herbs.player.maxHp-1;herbEnemy.hp=1;const beforeHerbKill={kills:herbs.kills,xp:xpTotal(herbs)};herb(herbs);herbs.update(0);
assert.equal(herbs.player.hp,herbs.player.maxHp,'enhanced herb healing still clamps at the hero maximum health');
assert.equal(herbs.kills,beforeHerbKill.kills+1);assert.equal(xpTotal(herbs),beforeHerbKill.xp+herbEnemy.xp);
assert.equal(herbs.player.skillCooldown,8,'a relic shockwave kill cannot claim a lightning refund');
herbs.update(0);assert.equal(herbs.kills,beforeHerbKill.kills+1,'the herb wave cannot recursively generate another rewarded kill');

console.log('Relic mechanics: unique stable choices, full-collection fallback, source-aware capped refunds, conditional damage, movement, shield and real herb interactions passed.');
