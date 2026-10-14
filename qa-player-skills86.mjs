import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { CombatBuild } from './dist/combat-build.js';
import { SKILL_DEFS, ALL_SKILL_DEFS, SUPER_SKILL_DEFS, getUpgradeDefinition, canTakeUpgrade } from './dist/combat-catalog.js';
import { skillStats } from './dist/combat-stats.js';
import { presentUpgrade, upgradeCardHTML } from './dist/upgrade-presentation.js';
import { characterPanelHTML } from './dist/character-panel.js';
import { ARCHIVE_ENTRIES, ARCHIVE_ENTRY_BY_ID } from './dist/archive-catalog.js';
import { AdventureArchive, ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { applyFullDebugBuild } from './dist/debug-training.js';

const arena=()=>new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
const playerIds=['barrier','pulse','lightning','storm','fireball','frostbolt','meteor','swords'];
assert.deepEqual(Object.keys(SKILL_DEFS).sort(),playerIds.sort());
assert.deepEqual(SUPER_SKILL_DEFS.map(def=>def.id),['meteor','swords']);
for(const id of ['domain','vortex']) {
  assert.equal(SKILL_DEFS[id],undefined);assert.equal(ALL_SKILL_DEFS[id].family,'exclusive');
  assert.deepEqual(ALL_SKILL_DEFS[id].allowedActors,['boss']);
  assert.equal(ARCHIVE_ENTRIES.some(entry=>entry.id===`skill:${id}`),false);
  assert.equal(ARCHIVE_ENTRY_BY_ID.get(`skill:${id}`).legacy,true);
}
assert.equal(getUpgradeDefinition('swordEnergy').family,'weapon');
assert.equal(getUpgradeDefinition('arrowRune').id,'arrowRune','metadata cannot rename canonical upgrades');
assert.equal(getUpgradeDefinition('arrowRune').family,'weapon');

for(const id of ['fireball','frostbolt']) {
  const game=arena();let previous=null;
  assert.equal(skillStats(game,id).owned,false);
  for(let rank=1;rank<=5;rank++) {
    const choice=getUpgradeDefinition(id),before=game.build.serialize(),model=presentUpgrade(choice,game);
    assert.deepEqual(game.build.serialize(),before,'preview is non-mutating');
    assert.equal(model.family,'general');assert.equal(model.action,rank===1?'新获得':'升级');
    assert.equal(canTakeUpgrade(game.build,id),true);assert(game.build.increment(id));
    const stats=skillStats(game,id);assert.equal(stats.level,rank);assert.equal(stats.owned,true);
    assert.equal(Number(model.rows[0].after),stats.baseDamage,'preview matches actual granted base damage');
    assert(!/NaN|undefined/.test(upgradeCardHTML(model)));assert.match(upgradeCardHTML(model),/通用技能/);
    if(previous){assert(stats.damage>previous.damage);assert(stats.cooldown<previous.cooldown);}
    if(id==='fireball'){assert(stats.burnDamage>0);assert(stats.burnDuration>=stats.burnInterval);}
    else {assert(stats.slowMultiplier>0&&stats.slowMultiplier<1);assert.equal(stats.freezeChance>0,rank>=3);assert(stats.bossFreezeImmunity>stats.freezeImmunity);}
    previous=stats;
  }
  assert.equal(game.build.increment(id),false);assert.equal(canTakeUpgrade(game.build,id),false);
  const damage=skillStats(game,id).damage;game.levels.power=1;
  assert(Math.abs(skillStats(game,id).damage/damage-1.25)<1e-10,'hero attack scales skill once');
  const html=characterPanelHTML(game,'skills');assert(html.includes(SKILL_DEFS[id].name));assert(!/NaN|undefined/.test(html));
  assert(!html.includes('荒野领域')&&!html.includes('虚空漩涡'));
}
for(const source of ['region','castle']) {
  const game=arena();assert(game.superSkills.offer(source,'forest'));
  const choices=game.superSkills.getChoices();assert(choices.some(choice=>choice.id==='meteor'));assert(choices.some(choice=>choice.id==='swords'));
  assert(choices.every(choice=>!['domain','vortex'].includes(choice.skillId||choice.id)));
  game.status='super';assert.equal(game.superSkills.choose('domain:binding'),false);assert.equal(game.superSkills.choose('vortex'),false);
  assert(game.superSkills.choose('swords'));assert.equal(game.build.getSkill('swords').baseRank,1);
}
const full=arena();full.debug=true;full.debugFull=true;assert(applyFullDebugBuild(full));
assert.equal(full.build.getRank('fireball'),5);assert.equal(full.build.getRank('frostbolt'),5);
assert.equal(full.build.getSkill('domain'),null);assert.equal(full.build.getSkill('vortex'),null);
assert.equal(full.build.awardDomain('binding'),false);
assert.equal(full.superSkills._cast('domain',1),false);assert.equal(full.superSkills._cast('vortex',1),false);
assert.deepEqual(CombatBuild.fromSnapshot(full.build.serialize()).serialize(),full.build.serialize());
const old=new CombatBuild().serialize();old.version=2;delete old.heroId;
old.skills.domain={baseRank:2,modifiers:{},branch:'binding',evolved:false,equipped:true};
old.skills.vortex={baseRank:3,modifiers:{},branch:null,evolved:false,equipped:true};
delete old.skills.fireball;delete old.skills.frostbolt;
const migrated=CombatBuild.fromSnapshot(old);
assert.equal(migrated.getRank('frostbolt'),4);assert.equal(migrated.getRank('fireball'),5);assert.equal(migrated.getSkill('domain'),null);
assert.equal(old.skills.frostbolt,undefined,'migration never mutates its input');
assert.equal(migrated.serialize().version,3);
const save={version:2,entries:{'skill:domain':{seen:true,acquisitions:8,maxLevel:3,branches:['binding']},'skill:vortex':{seen:true,acquisitions:4,maxLevel:2}}};
let raw=JSON.stringify(save);const archive=new AdventureArchive({storage:{getItem:key=>key===ARCHIVE_STORAGE_KEY?raw:null,setItem:(key,value)=>{raw=value;}}});
assert.equal(archive.data.entries['skill:domain'].acquisitions,8);assert.equal(archive.data.entries['skill:vortex'].maxLevel,2);
archive.begin(arena());assert.equal(JSON.parse(raw).entries['skill:domain'].acquisitions,8,'new saves retain retired observations');
console.log('Player skills: taxonomy, five-rank fire/frost progression, truthful previews, allowed Boss rewards, debug-full grants, snapshot and historical archive migration passed.');
