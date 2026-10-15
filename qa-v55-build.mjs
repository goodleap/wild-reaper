import assert from 'node:assert/strict';
import { CombatBuild } from './dist/combat-build.js';
import { canTakeUpgrade, ALL_SKILL_DEFS, SKILL_DEFS } from './dist/combat-catalog.js';
import { weaponStats, skillStats } from './dist/combat-stats.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

function arena() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g._spawn=Infinity;g.nextBossAt=Infinity;return g;
}
function reward(g,id) {
  g.regions.rewardPortal={rewardClaimed:false};assert(g.superSkills.offer('region','forest'));g.status='super';
  assert(g.getSuperChoices().every(choice=>!['domain','vortex'].includes(choice.skillId||choice.id)),'the actual player reward menu excludes Boss-only skills');
  const before=g.build.serialize();
  for(const forbidden of ['domain:binding','domain:erosion','vortex'])assert.equal(g.chooseSuper(forbidden),false);
  assert.deepEqual(g.build.serialize(),before,'a forged Boss-only reward cannot mutate player ownership');
  assert(g.getSuperChoices().some(c=>c.id===id),`${id} must appear as a real reward`);
  assert(g.chooseSuper(id));assert.equal(g.status,'playing');
}

const start=arena();
assert.deepEqual(start.weapons.map(w=>[w.id,w.level,w.equipped]),[['sword',1,true]]);
assert.deepEqual(start.skills.map(s=>s.id),['storm']);
assert.equal(start.build.isEquipped('arrow'),false);
for(const id of ['rapid','multishot','arrowPower','arrowRetention','arrowReach','arrowRune'])assert.equal(canTakeUpgrade(start.build,id),false,`${id} cannot precede arrow acquisition`);
assert(start.build.increment('arrow'));assert(start.build.isEquipped('arrow'));assert(canTakeUpgrade(start.build,'rapid'));assert(canTakeUpgrade(start.build,'arrowPower'));
assert.equal(start.build.increment('arrow'),false,'the ranged weapon is acquired once');

// Current legal supers retain pure previews and actual Boss reward ownership.
// Retired player domains stay available only to their authored Boss actors.
const royal=arena(),untouched=royal.build.serialize(),preview=royal.build.previewUpgrade('swords');
assert(preview);assert.deepEqual(royal.build.serialize(),untouched);assert.equal(preview.getSkill('swords').baseRank,1);
assert.equal(royal.build.increment('super:swords'),false,'ordinary upgrades cannot acquire an unearned super skill');
reward(royal,'swords');assert.equal(royal.build.getSkill('swords').baseRank,1);
const earned=royal.build.serialize();
for(const id of ['domain','vortex']) {
  assert.equal(SKILL_DEFS[id],undefined);assert.deepEqual(ALL_SKILL_DEFS[id].allowedActors,['boss']);
  assert.equal(royal.build.getSkill(id),null);assert.equal(canTakeUpgrade(royal.build,`super:${id}`),false);
  assert.equal(royal.build.previewUpgrade(id),null);assert.equal(royal.build.increment(`super:${id}`),false);
  assert.equal(royal.superSkills._cast(id,1),false,'Boss-exclusive ability cannot be cast by a player runtime');
}
assert.equal(royal.build.awardDomain('binding'),false);assert.equal(royal.build.previewUpgrade({id:'domain:erosion',domainBranch:'erosion'}),null);
assert.deepEqual(royal.build.serialize(),earned,'rejected Boss-only grants cannot mutate the earned player build');
reward(royal,'swords');reward(royal,'swords');assert.equal(royal.build.getSkill('swords').baseRank,3);
assert.equal(royal.build.increment('super:swords'),false);assert.equal(royal.build.previewUpgrade('swords'),null,'the legal super cap is enforced in previews too');

// A weapon reward can acquire its required weapon; it cannot override a prior
// exclusive ricochet choice. Ordinary upgrades only strengthen an earned rune.
const runic=arena(),beforeRune=runic.build.serialize(),runePreview=runic.build.previewUpgrade('runeArrow');
assert(runePreview);assert.deepEqual(runic.build.serialize(),beforeRune);assert.equal(runePreview.getWeapon('arrow').branch,'pierce');assert.equal(runePreview.getRank('arrowRune'),1);
reward(runic,'runeArrow');
assert(runic.build.isEquipped('arrow'));assert.equal(runic.build.getWeapon('arrow').branch,'pierce');assert.equal(runic.build.getRank('arrowRune'),1);
assert.equal(runic.skills.some(s=>s.id==='runes'),false,'runes belong to the weapon rather than a duplicate character skill');
const runeOne=weaponStats(runic,'arrow');assert.equal(runeOne.runic,1);assert(runic.build.increment('arrowRune'));assert(runic.build.increment('arrowRune'));
const runeThree=weaponStats(runic,'arrow');assert.equal(runeThree.runic,3);assert(runeThree.runicDamage>runeOne.runicDamage);assert(runeThree.runicInterval<runeOne.runicInterval);assert.equal(runic.build.increment('arrowRune'),false);
const ricochet=new CombatBuild();assert(ricochet.increment('arrow'));for(let n=0;n<3;n++)assert(ricochet.increment('rapid'));assert(ricochet.selectBranch('arrow','ricochet'));
const savedRicochet=ricochet.serialize();assert.equal(ricochet.awardRuneArrow(),false);assert.equal(ricochet.previewUpgrade('runeArrow'),null);assert.deepEqual(ricochet.serialize(),savedRicochet);

// Refinements now improve cadence alongside damage. Both sword paths remain
// mutually exclusive and can be inspected without replacing the active build.
for(const branch of ['sweep','heavy']) {
  const g=arena();for(let i=0;i<3;i++)assert(g.build.increment('sword'));
  const before=g.build.serialize(),projected=g.build.previewUpgrade(`branch:sword:${branch}`);
  assert(projected);assert.deepEqual(g.build.serialize(),before);assert.equal(projected.getWeapon('sword').branch,branch);
  assert(g.build.selectBranch('sword',branch));assert.equal(g.build.selectBranch('sword',branch==='sweep'?'heavy':'sweep'),false);
  const first=weaponStats(g,'sword');assert(g.build.increment('swordMastery'));const refined=weaponStats(g,'sword');
  assert(refined.damage>first.damage);assert(refined.interval<first.interval);
}
for(const [id,branch] of [['pulse','echoes'],['lightning','chain']]) {
  const g=arena();for(let n=0;n<4;n++)assert(g.build.increment(id));assert(g.build.selectBranch(id,branch));g._syncEvolutions(false);
  const first=skillStats(g,id);assert(g.build.increment(`${id}Mastery`));const refined=skillStats(g,id);
  assert(refined.cooldown<first.cooldown);assert(refined.damage>first.damage);if(id==='lightning')assert.equal(refined.targetLimit,first.targetLimit+1);
}

// The current snapshot round-trips its build. Legacy field ownership migrates
// to a legal player replacement plus weapon rune without mutating caller data.
assert.equal(runic.build.serialize().version,3);
assert.deepEqual(CombatBuild.fromSnapshot(structuredClone(runic.build.serialize())).serialize(),runic.build.serialize());
assert.deepEqual(CombatBuild.fromSnapshot(structuredClone(royal.build.serialize())).serialize(),royal.build.serialize());
const legacy=new CombatBuild().serialize();legacy.version=1;delete legacy.weapons.sword;delete legacy.skills.barrier;delete legacy.skills.domain;
legacy.weapons.arrow={baseRank:1,modifiers:{rapid:0,multishot:0,arrowPower:0,arrowRetention:0,arrowReach:0},branch:null,evolved:false,equipped:true};
for(const [id,rank] of [['thorns',1],['miasma',2],['runes',2]])legacy.skills[id]={baseRank:rank,modifiers:{},branch:null,evolved:false,equipped:true};
const originalLegacy=structuredClone(legacy),migrated=CombatBuild.fromSnapshot(legacy);
assert.deepEqual(legacy,originalLegacy);assert.equal(migrated.getSkill('domain'),null);assert.equal(migrated.getSkill('vortex'),null);assert.equal(migrated.getSkill('frostbolt').baseRank,4,'legacy rank-two field converts to a rank-four legal replacement');
assert.equal(migrated.getWeapon('arrow').branch,'pierce');assert.equal(migrated.getRank('arrowRune'),2);assert.equal(migrated.getSkill('runes'),null);
assert.deepEqual(CombatBuild.fromSnapshot(migrated.serialize()).serialize(),migrated.serialize());
const oldRicochet=structuredClone(legacy);oldRicochet.weapons.arrow.branch='ricochet';oldRicochet.weapons.arrow.modifiers.rapid=3;
const migratedRicochet=CombatBuild.fromSnapshot(oldRicochet);assert.equal(migratedRicochet.getWeapon('arrow').branch,'ricochet');assert.equal(migratedRicochet.getRank('arrowRune'),0);assert.equal(migratedRicochet.getRank('arrowPower'),2);
const impossible=structuredClone(runic.build.serialize());impossible.weapons.arrow.branch='ricochet';impossible.weapons.arrow.modifiers.rapid=3;
assert.throws(()=>CombatBuild.fromSnapshot(impossible),/Unavailable combat build modifier: arrowRune/,'a rune cannot be smuggled onto a ricochet snapshot');
console.log('Build compatibility: default sword, acquisition prerequisites, pure legal-super previews, Boss-only ability isolation, exclusive sword branches, weapon rune rewards/refinement, cadence growth and validated legacy migration passed.');
