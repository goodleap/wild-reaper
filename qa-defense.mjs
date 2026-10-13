import assert from 'node:assert/strict';
import { Game, xpCost } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { CombatBuild } from './dist/combat-build.js';
import { LEVEL_CAPS, canTakeUpgrade, getUpgradeDefinition } from './dist/combat-catalog.js';
import { resolveCharacterStats, defenseDamageMultiplier, defenseReduction, weaponStats, skillStats } from './dist/combat-stats.js';

let seed=520613;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,`${message}: expected ${expected}, received ${actual}`);
function arena() {
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false});
  game.enemies=[];game.events=[];game.effects=[];
  game._spawn=Infinity;game._shot=Infinity;game._pulse=Infinity;game._lightning=Infinity;game.nextBossAt=Infinity;
  return game;
}
function advance(game,seconds) {for(let left=seconds;left>1e-8;left-=.025)game.update(Math.min(.025,left));}
function fund(game) {
  assert.equal(game.status,'playing');
  const cost=game.crystalsNext;
  game.addCrystals(cost-game.crystals);
  assert(game.progression.tryUpgrade());
  return cost;
}
// Tests may resample a legitimate eligible pool to select one specific card;
// production still caches its three-card offer until a purchase is committed.
function offerContaining(game,id) {
  for(let i=0;i<256;i++) {
    game._choices=null;
    const choices=game.getUpgradeChoices();
    if(choices.some(choice=>choice.id===id))return choices;
  }
  assert.fail(`eligible card never offered: ${id}`);
}
function purchase(game,id) {
  const cost=fund(game),tier=game.progressionTier;
  const choices=offerContaining(game,id);
  assert.equal(game.getUpgradeChoices(),choices,'inspection cannot reroll an active offer');
  assert(game.chooseUpgrade(id));
  assert.equal(game.progressionTier,tier+1);
  assert.equal(game.crystals,0,`${id} spends the full tier cost ${cost} once`);
  assert.equal(game.status,'playing');
  assert.equal(game.chooseUpgrade(id),false,'a completed transaction cannot be repeated');
}
function capRegularUpgrades(game) {
  Object.assign(game.branches,{sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});
  Object.assign(game.levels,LEVEL_CAPS);
  game._syncEvolutions(false);game._refreshStats();game._refreshWeapons();
}

// XP grants only the natural +1 defense per character level. Crystal ranks
// remain separate, and derived-stat refreshes never apply growth twice.
const growth=arena(),buildBefore=growth.build.serialize();
assert.equal(growth.player.defense,0);
const xpTo20=Array.from({length:19},(_,i)=>xpCost(i+1)).reduce((sum,xp)=>sum+xp,0);
assert(growth.addExperience(xpTo20));
assert.equal(growth.player.level,20);assert.equal(growth.player.xp,0);
assert.equal(growth.player.defense,19);assert.equal(growth.stats.defense,19);
assert.equal(growth.crystals,0);assert.equal(growth.progressionTier,1);assert.equal(growth.status,'playing');
assert.deepEqual(growth.build.serialize(),buildBefore,'character XP does not grant crystal investments or ability slots');
growth.build.attributes.defense=7;
for(let i=0;i<20;i++)growth._refreshStats();
assert.equal(growth.player.defense,26,'legacy defense remains additive without absorbing natural level growth');
assert.equal(growth.build.attributes.defense,7);

// Defense is an ordinary paid attribute choice, with the same offer and
// payment guards as other upgrades; it neither heals nor increases attacks.
const normal=arena();normal.player.hp=53;
fund(normal);
const opening=normal.getUpgradeChoices();
assert.equal(opening.length,3);assert(opening.some(choice=>choice.id==='arrow'));assert(opening.some(choice=>choice.id==='barrier'));
const openingAttack=opening.find(choice=>['orbit','pulse','lightning'].includes(choice.id));assert(openingAttack);
assert.equal(normal.chooseUpgrade('toughness'),false,'defense cannot bypass the opening acquisition offer');
assert(normal.chooseUpgrade(openingAttack.id));
const loadoutBefore={weapons:normal.build.getWeaponLoadout(),skills:normal.build.getSkillLoadout()};
const offenseBefore={arrow:weaponStats(normal,'arrow').damage,storm:skillStats(normal,'storm').damage,attack:resolveCharacterStats(normal).attack};
for(let rank=1;rank<=5;rank++) {
  const cost=fund(normal),offer=offerContaining(normal,'toughness');
  const card=offer.find(choice=>choice.id==='toughness');
  assert.equal(card.category,'attribute');assert.equal(card.ownerId,'defense');
  normal.crystals=cost-1;
  assert.equal(normal.chooseUpgrade('toughness'),false,'one missing crystal prevents the defense purchase');
  assert.equal(normal.build.getRank('toughness'),rank-1);
  normal.addCrystals(1);assert(normal.chooseUpgrade('toughness'));
  assert.equal(normal.crystals,0);assert.equal(normal.build.getRank('toughness'),rank);
  assert.equal(normal.player.defense,rank*20);assert.equal(normal.player.hp,53);
  assert.equal(normal.player.maxHp,100);assert.equal(normal.player.level,1);
  assert.equal(normal.build.attributes.defense,0,'paid defense is stored as its own investment, not baked into legacy base');
  assert.deepEqual({arrow:weaponStats(normal,'arrow').damage,storm:skillStats(normal,'storm').damage,attack:resolveCharacterStats(normal).attack},offenseBefore);
  assert.deepEqual({weapons:normal.build.getWeaponLoadout(),skills:normal.build.getSkillLoadout()},loadoutBefore);
  for(let refresh=0;refresh<4;refresh++)normal._refreshStats();
  assert.equal(normal.player.defense,rank*20);
}
assert.equal(canTakeUpgrade(normal.build,'toughness'),false);assert.equal(normal.build.increment('toughness'),false);
const stale=arena();stale.progressionTier=2;fund(stale);offerContaining(stale,'toughness');
stale.levels.toughness=5;
assert.equal(stale.chooseUpgrade('toughness'),false,'cached offers revalidate the cap before accepting payment');
assert.equal(stale.crystals,stale.crystalsNext);

// Endless defense is earned after normal defense and only joins the existing
// late-game fallback pool. Four choices compete for three displayed cards.
assert.equal(canTakeUpgrade(new CombatBuild(),'endlessToughness'),false);
assert.equal(getUpgradeDefinition('endlessToughness').cap,Infinity);
fund(normal);
for(let i=0;i<32;i++) {
  normal._choices=null;
  assert(!normal.getUpgradeChoices().some(choice=>choice.id==='endlessToughness'),'finishing defense alone does not unlock late fallback offers');
}
const late=arena();capRegularUpgrades(late);late.player.hp=57;
const lateAttack=resolveCharacterStats(late).attack,seen=new Set();
fund(late);
for(let i=0;i<48;i++) {
  late._choices=null;const choices=late.getUpgradeChoices();
  assert.equal(choices.length,3);assert.equal(new Set(choices.map(choice=>choice.id)).size,3);
  assert(choices.every(choice=>choice.kind==='无尽属性强化'));
  for(const choice of choices)seen.add(choice.id);
}
assert.deepEqual([...seen].sort(),['endlessPower','endlessRegen','endlessToughness','endlessVitality']);
offerContaining(late,'endlessToughness');assert(late.chooseUpgrade('endlessToughness'));
for(let rank=2;rank<=32;rank++)purchase(late,'endlessToughness');
assert.equal(late.build.getRank('toughness'),5);assert.equal(late.build.getRank('endlessToughness'),32);
assert.equal(late.player.defense,420);assert.equal(late.player.hp,57);
assert.equal(resolveCharacterStats(late).attack,lateAttack,'endless defense has no damage conversion');

// Snapshot restoration preserves paid growth; old snapshots without the new
// fields load with zero investments, and impossible ranks are rejected.
late.build.attributes.defense=9;
const snapshot=late.build.serialize(),restored=CombatBuild.fromSnapshot(JSON.parse(JSON.stringify(snapshot)));
assert.deepEqual(restored.serialize(),snapshot);
near(resolveCharacterStats({...late,build:restored}).defense,429,'restored defense matches its paid and legacy sources');
const oldSnapshot=new CombatBuild().serialize();delete oldSnapshot.attributes.toughness;delete oldSnapshot.attributes.endlessToughness;
oldSnapshot.attributes.defense=11;
const oldBuild=CombatBuild.fromSnapshot(oldSnapshot);
assert.equal(oldBuild.getRank('toughness'),0);assert.equal(oldBuild.getRank('endlessToughness'),0);
near(resolveCharacterStats({...growth,build:oldBuild}).defense,30,'old build inherits current character level independently');
for(const [id,value] of [['toughness',6],['toughness',-1],['toughness',1.5],['endlessToughness',-1],['endlessToughness',NaN]]) {
  const corrupt=structuredClone(snapshot);corrupt.attributes[id]=value;
  assert.throws(()=>CombatBuild.fromSnapshot(corrupt),`reject invalid ${id} rank ${value}`);
}
const impossible=structuredClone(snapshot);impossible.attributes.toughness=4;
assert.throws(()=>CombatBuild.fromSnapshot(impossible),'endless defense cannot be restored without its prerequisite');

// Actual hit resolution uses the shared formula for level and card sources.
for(const defense of [0,20,100,119]) {
  const game=arena();game.levels.toughness=defense===20?1:defense>=100?5:0;
  if(defense===119)game.addExperience(xpTo20);
  game._refreshStats();const hp=game.player.hp;
  assert.equal(game.player.defense,defense);
  near(defenseDamageMultiplier(defense),100/(100+defense),'damage multiplier');
  near(defenseReduction(defense),defense/(100+defense),'displayed reduction');
  assert(game._hurtPlayer(40));near(hp-game.player.hp,40*100/(100+defense),`actual damage at defense ${defense}`);
  assert.equal(game.player.hurtFlash,.8,'actual health loss starts a separate hurt blink');
  assert.equal(game.player.invuln,.8);const afterHit=game.player.hp;
  assert.equal(game._hurtPlayer(40),false);assert.equal(game.player.hp,afterHit);
  advance(game,.75);assert.equal(game._hurtPlayer(40),false,'existing invulnerability persists for 0.8 seconds');
  advance(game,.06);assert(game._hurtPlayer(40),'a later hit still works after invulnerability expires');
}
const shielded=arena();shielded.levels.toughness=5;shielded._refreshStats();
assert(shielded.relics.acquire('leafWard'));assert(shielded.relics.grantWard(18));
assert(shielded._hurtPlayer(100));near(shielded.player.hp,100,'100 raw damage halves before 18 ward and the 34.5-capacity barrier absorb it');
near(shielded.barrier.remaining,2.5,'the same active barrier retains unused capacity');
assert.equal(shielded.relics.wardAmount,0);assert.equal(shielded.relics.shieldReady,false);
assert.equal(shielded.relics.shieldCooldown,12.75);assert.equal(shielded.player.invuln,.8);
const blocked=arena();blocked.levels.toughness=5;blocked._refreshStats();
assert(blocked.relics.acquire('leafWard'));assert(blocked.relics.grantWard(18));
assert(blocked._hurtPlayer(30));assert.equal(blocked.player.hp,100);
assert.equal(blocked.player.hurtFlash,0,'a fully absorbed hit does not blink like health damage');
assert.equal(blocked.relics.wardAmount,0);assert.equal(blocked.relics.shieldReady,true,'a ward that absorbs the reduced hit preserves the automatic barrier');
assert.equal(blocked.player.invuln,.8);

console.log('Defense: paid normal and endless growth, character XP separation, snapshots, shared damage formula, shield ordering and invulnerability passed.');
