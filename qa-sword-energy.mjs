import assert from 'node:assert/strict';
import { CombatBuild } from './dist/combat-build.js';
import { canTakeUpgrade, getUpgradeDefinition } from './dist/combat-catalog.js';
import { weaponStats, skillStats } from './dist/combat-stats.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

function arena() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g._spawn=Infinity;g.nextBossAt=Infinity;return g;
}
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} / ${b}`);
const fresh=arena(),base=weaponStats(fresh,'sword');
assert.equal(base.energyRank,0);assert.equal(base.range,92);assert.equal(base.range,base.meleeRange);
assert.equal(base.baseDamage,64);assert.equal(base.interval,.72);
assert.equal(canTakeUpgrade(fresh.build,'swordEnergy'),false);
assert.equal(fresh.build.increment('swordEnergy'),false);
assert.equal(fresh.getUpgradeChoices().some(c=>c.id==='swordEnergy'),false);
assert(fresh.build.increment('sword'));
assert.equal(canTakeUpgrade(fresh.build,'swordEnergy'),false);
assert(fresh.build.increment('sword'));
assert.equal(canTakeUpgrade(fresh.build,'swordEnergy'),true);

const definition=getUpgradeDefinition('swordEnergy');
assert.equal(definition.category,'weapon');assert.equal(definition.ownerId,'sword');
const before=fresh.build.serialize(),projected=fresh.build.previewUpgrade('swordEnergy');
assert.deepEqual(fresh.build.serialize(),before,'preview must not mutate the current build');
assert.equal(projected.getRank('swordEnergy'),1);
assert.equal(projected.getWeapon('sword').baseRank,3);
assert.equal(projected.getSkill('swordEnergy'),null);

// The purchase uses the normal crystal transaction and retains one modifier
// investment under its weapon, rather than granting a second independent skill.
fresh._choices=[{...definition}];fresh.status='upgrade';fresh.crystals=fresh.crystalsNext;
assert(fresh.chooseUpgrade('swordEnergy'));assert.equal(fresh.crystals,0);
assert.equal(fresh.build.getRank('swordEnergy'),1);
assert.equal(fresh.build.getWeapon('sword').level,4);
assert(fresh.build.getWeaponLoadout().find(w=>w.id==='sword').enhancements.some(e=>e.id==='swordEnergy'));
assert.equal(fresh.build.getSkillLoadout().some(s=>s.id==='swordEnergy'),false);

assert(fresh.build.increment('arrow'));assert(fresh.build.increment('pulse'));
const arrow=weaponStats(fresh,'arrow'),pulse=skillStats(fresh,'pulse'),storm=skillStats(fresh,'storm');
for(const [index,range,bonus] of [[1,22,.08],[2,32,.14],[3,42,.20]]) {
  if(index>1)assert(fresh.build.increment('swordEnergy'));
  const s=weaponStats(fresh,'sword');
  assert.equal(s.energyRank,index);assert.equal(s.range,s.meleeRange+range);
  close(s.baseDamage,84*(1+bonus),'sword-only energy bonus');
  assert.deepEqual(weaponStats(fresh,'arrow'),arrow);
  assert.deepEqual(skillStats(fresh,'pulse'),pulse);
  assert.deepEqual(skillStats(fresh,'storm'),storm);
}
assert.equal(fresh.build.increment('swordEnergy'),false);
const saved=fresh.build.serialize();
assert.deepEqual(CombatBuild.fromSnapshot(saved).serialize(),saved);
const old=structuredClone(saved);delete old.weapons.sword.modifiers.swordEnergy;
assert.equal(CombatBuild.fromSnapshot(old).getRank('swordEnergy'),0,'v55 builds load without granting energy');
const impossible=new CombatBuild().serialize();impossible.weapons.sword.modifiers.swordEnergy=1;
assert.throws(()=>CombatBuild.fromSnapshot(impossible),/Unavailable combat build modifier: swordEnergy/);

assert(fresh.build.setEquipped('sword',false));
assert.equal(weaponStats(fresh,'sword').equipped,false);
assert.equal(fresh.build.getRank('swordEnergy'),3);
assert(fresh.build.setEquipped('sword',true));
assert.equal(weaponStats(fresh,'sword').energyRank,3);

for(const branch of ['sweep','heavy']) {
  const g=arena();for(let i=0;i<3;i++)assert(g.build.increment('sword'));
  assert(g.build.selectBranch('sword',branch));
  g._syncEvolutions(false);
  const ordinary=weaponStats(g,'sword');assert.equal(ordinary.energyRank,0);
  assert(g.build.increment('swordEnergy'));const empowered=weaponStats(g,'sword');
  assert.equal(empowered.arc,ordinary.arc);assert.equal(empowered.range,ordinary.range+22);
  assert.equal(empowered.interval,ordinary.interval);close(empowered.damage,ordinary.damage*1.08,'branch energy damage');
  assert(g.build.increment('swordMastery'));assert(g.build.increment('power'));
  close(weaponStats(g,'sword').damage,104*(branch==='heavy'?1.85:1)*1.20*1.25,'local and character bonuses apply once');
  assert.deepEqual(CombatBuild.fromSnapshot(g.build.serialize()).serialize(),g.build.serialize());
}
console.log('Sword energy: zero at spawn, rank gating, crystal purchase, weapon-scoped growth, exclusive branches, equip retention and snapshot compatibility passed.');
