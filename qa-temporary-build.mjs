import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { TemporaryBuild } from './dist/temporary-build.js';
import { CombatBuild } from './dist/combat-build.js';
import { AdventureArchive } from './dist/adventure-archive.js';
import { resolveCharacterStats, defenseReduction } from './dist/combat-stats.js';
import { Terrain } from './dist/terrain.js';

let seed=30221;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function boosted({hero='princess',defense=0}={}) {
  const game=new Game({hero});game.enemies=[];game.build.attributes.defense=defense;game._refreshStats();
  const temporary=new TemporaryBuild(game);game.story={temporary,active:true,step:'burst',rules:{judgmentDamage:9999},guardReduction:0,cleanup:reason=>temporary.stop(reason)};
  return {game,temporary};
}
for(const hero of ['traveler','prince','princess']) {
  const {game:g,temporary:t}=boosted({hero});
  const canonical=g.build;
  assert(canonical.increment('power'));assert(canonical.increment('speed'));
  assert(canonical.increment('arrow'));
  for(let rank=0;rank<3;rank++)assert(canonical.increment('rapid'));
  assert(canonical.selectBranch('arrow','ricochet'));canonical.setEquipped('sword',false);
  g._refreshStats();g._refreshWeapons();
  const saved=canonical.serialize(),archive=new AdventureArchive({storage:null});
  archive.begin(g);const archived=structuredClone(archive.data.entries);
  const debug=new Game({hero,debug:true,debugOptions:{fullLoadout:true},adventure:false,terrain:new Terrain({obstacles:[]})});
  const expected=debug.build.serialize();expected.attributes={...saved.attributes};
  expected.skills.storm={...expected.skills.storm,baseRank:0,equipped:false};
  assert(t.start());
  assert.deepEqual(g.build.serialize(),expected,`${hero}: temporary weapons, skills, modifiers and branches match full debug except storm`);
  assert.deepEqual(CombatBuild.fromSnapshot(g.build.serialize()).serialize(),g.build.serialize(),'temporary full power is a valid build snapshot');
  assert(!g.skills.some(skill=>skill.id==='storm'),'the unavailable skill is absent from the active skill loadout');
  assert.equal(g.build.getSkill('storm').acquired,false);
  assert.deepEqual(canonical.serialize(),saved,'granting full power cannot edit the canonical build');
  archive.checkpoint(g,{force:true});assert.deepEqual(archive.data.entries,archived,'full temporary ranks and discoveries never enter the archive');
  assert(t.stop('exit'));assert.equal(g.build,canonical);assert.deepEqual(canonical.serialize(),saved,'original ranks, branch and equipped choices return');
  archive.finish(g,'exit');assert.deepEqual(archive.data.entries,archived);
}
const {game,temporary}=boosted();
const canonical=game.build,original=canonical.serialize(),speed=game.player.speed;
assert(temporary.start());assert(!temporary.start());near(game.player.speed,speed*2);near(resolveCharacterStats(game).damageReduction,.95);
// Neutral princess makes additive 95 percentage points observable below cap;
// the usual prince's existing armor raises this to the configured 99% ceiling.
game.barrier.cooldown=Infinity;game.player.hp=80;game.player.invuln=0;assert(game._hurtPlayer(100));near(game.player.hp,75);
game.build.attributes.defense=5;near(resolveCharacterStats(game).damageReduction,Math.min(.99,defenseReduction(5)+.95));
game.player.invuln=0;const hp=game.player.hp;assert(game._hurtPlayer(100));near(game.player.hp,hp-1);
// Canonical and transient objects remain distinct, even with active delayed
// attacks and temporary records held by all the ordinary build aliases.
game.bullets.push({damage:10000});game._pulseEchoes.push({damage:10000});game.storm={life:20};
game.superSkills.fields.push({damage:10000});game.superSkills._volleys.push({damage:10000});game.superSkills.swordFlights.push({damage:10000});
game.superSkills._runicShots.push({damage:10000});
game.barrier.remaining=1000;game.barrier.life=20;
const enemy=game._spawnEnemy('slime',1);enemy.bleed={life:20,damage:10000};enemy.shock={life:20,damage:10000};
const hostileEffect={caster:enemy,hostile:true,remaining:20};
game.abilities.effects.push(hostileEffect,{caster:game.player,abilityId:'fireball',hostile:false,remaining:20},{caster:game.player,abilityId:'frostbolt',hostile:false,remaining:20});
Object.assign(game.abilities.statusFor(enemy),{burn:{caster:game.player,damage:10000},slowUntil:20,frozenUntil:20});
game.effects.push({type:'arrowRicochet'},{type:'ring',quake:true},{type:'superRay',skillId:'runeArrow'},{type:'lightning'},{type:'ring',skillId:'fireball'},{type:'heal'});
const wounded=game.player.hp;assert(temporary.stop('exit'));assert(!temporary.stop('exit'));
assert.equal(game.build,canonical);assert.equal(game.canonicalBuild,canonical);assert.deepEqual(canonical.serialize(),original);
assert.equal(game.levels,canonical.levels);assert.equal(game.branches,canonical.branches);assert.equal(game.evolutions,canonical.evolutions);assert.equal(game.superSkills.owned,canonical.superLevels);
near(game.player.hp,wounded);near(game.player.speed,speed);near(resolveCharacterStats(game).damageReduction,0);
assert.equal(game.bullets.length,0);assert.equal(game._pulseEchoes.length,0);assert.equal(game.storm,null);assert.equal(game.superSkills.fields.length,0);assert.equal(game.superSkills.swordFlights.length,0);assert.equal(game.superSkills._volleys.length,0);
assert.equal(game.superSkills._runicShots.length,0);assert.deepEqual(game.abilities.effects,[hostileEffect],'cleanup preserves hostile attacks');
assert.equal(game.abilities.statusFor(enemy).slowUntil,0);assert.equal(game.abilities.statusFor(enemy).frozenUntil,0);
assert(!game.effects.some(effect=>effect.quake||effect.skillId||['arrowRicochet','lightning'].includes(effect.type)));assert(game.effects.some(effect=>effect.type==='heal'));
assert.equal(game.barrier.life,0);assert.equal(game.barrier.remaining,0);assert.equal(enemy.bleed,null);assert.equal(enemy.shock,null);assert.equal(game.abilities.statusFor(enemy).burn,null);assert(!game.abilities.effects.some(effect=>effect.caster===game.player));

const expiry=boosted(),expiryCanonical=expiry.game.build,expiryOriginal=expiryCanonical.serialize();
expiry.game.player.skillCooldown=10;expiry.game.superSkills.cooldowns={meteor:3,swords:.5};expiry.game._abilityCooldowns={fireball:2,frostbolt:.4};
assert(expiry.temporary.start({duration:1}));expiry.game.addExperience(40);expiry.game.addGold(7);expiry.game.addCrystals(9);expiry.game.player.hp-=4;
const earned={level:expiry.game.player.level,xp:expiry.game.player.xp,hp:expiry.game.player.hp,gold:expiry.game.gold,crystals:expiry.game.crystals};
expiry.temporary.update(.8);assert(expiry.temporary.active);expiry.temporary.update(.2);assert(!expiry.temporary.active);
assert.equal(expiry.game.build,expiryCanonical);assert.deepEqual(expiryCanonical.serialize(),expiryOriginal);
assert.deepEqual({level:expiry.game.player.level,xp:expiry.game.player.xp,hp:expiry.game.player.hp,gold:expiry.game.gold,crystals:expiry.game.crystals},earned,'expiration preserves real XP, health and earned resources');
assert.equal(expiry.game.player.skillCooldown,9);assert.deepEqual(expiry.game.superSkills.cooldowns,{meteor:2,swords:0});assert.deepEqual(expiry.game._abilityCooldowns,{fireball:1,frostbolt:0});
for(const reason of ['exit','restart','sceneChange','death']) {
  const {game:g,temporary:t}=boosted({hero:'traveler'});const canonical=g.build;assert(t.start());g.player.hp=0;
  if(reason==='death'){g.player.hp=1;g.barrier.cooldown=Infinity;g.player.invuln=0;g._hurtPlayer(1e9);assert.equal(g.status,'dead');}
  else g.dispose(reason);
  assert(!t.active);assert.equal(g.build,canonical);assert.equal(g.player.hp,0,'cleanup cannot resurrect the hero');assert.equal(g.superSkills.owned,canonical.superLevels);
}
const changed=new Game({mode:'story'}),canonicalChanged=changed.build;
assert(changed.story.temporary.start());changed.terrain=new Terrain({obstacles:[]});
const nextSceneEnemies=[];changed.enemies=nextSceneEnemies;changed.story.update(.05);
assert(!changed.story.temporary.active);assert(changed.story.disposed);assert.equal(changed.build,canonicalChanged);
assert.equal(changed.enemies,nextSceneEnemies,'an unexpected scene change must not copy the old map population into the new terrain');
console.log('Temporary build: shared full debug loadout except storm, valid snapshots, unchanged attributes/archive, additive reduction/cap, movement composition, canonical aliases, complete attack/shield cleanup, preserved XP/HP/resources/cooldowns, expiration, death, exit and restart passed.');
