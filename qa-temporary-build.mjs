import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { TemporaryBuild } from './dist/temporary-build.js';
import { resolveCharacterStats, defenseReduction } from './dist/combat-stats.js';
import { Terrain } from './dist/terrain.js';

let seed=30221;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function boosted({hero='princess',defense=0}={}) {
  const game=new Game({hero});game.enemies=[];game.build.attributes.defense=defense;game._refreshStats();
  const temporary=new TemporaryBuild(game);game.story={temporary,active:true,step:'burst',rules:{judgmentDamage:9999},guardReduction:0,cleanup:reason=>temporary.stop(reason)};
  return {game,temporary};
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
game.barrier.remaining=1000;game.barrier.life=20;
const enemy=game._spawnEnemy('slime',1);enemy.bleed={life:20,damage:10000};enemy.shock={life:20,damage:10000};
game.abilities.effects.push({caster:game.player,hostile:false,remaining:20});game.abilities.statusFor(enemy).burn={caster:game.player,damage:10000};
const wounded=game.player.hp;assert(temporary.stop('exit'));assert(!temporary.stop('exit'));
assert.equal(game.build,canonical);assert.equal(game.canonicalBuild,canonical);assert.deepEqual(canonical.serialize(),original);
assert.equal(game.levels,canonical.levels);assert.equal(game.branches,canonical.branches);assert.equal(game.evolutions,canonical.evolutions);assert.equal(game.superSkills.owned,canonical.superLevels);
near(game.player.hp,wounded);near(game.player.speed,speed);near(resolveCharacterStats(game).damageReduction,0);
assert.equal(game.bullets.length,0);assert.equal(game._pulseEchoes.length,0);assert.equal(game.storm,null);assert.equal(game.superSkills.fields.length,0);assert.equal(game.superSkills.swordFlights.length,0);assert.equal(game.superSkills._volleys.length,0);
assert.equal(game.barrier.life,0);assert.equal(game.barrier.remaining,0);assert.equal(enemy.bleed,null);assert.equal(enemy.shock,null);assert.equal(game.abilities.statusFor(enemy).burn,null);assert(!game.abilities.effects.some(effect=>effect.caster===game.player));

const expiry=boosted();assert(expiry.temporary.start({duration:1}));expiry.game.addExperience(40);const grown=expiry.game.player.level;
expiry.temporary.update(.8);assert(expiry.temporary.active);expiry.temporary.update(.2);assert(!expiry.temporary.active);assert.equal(expiry.game.player.level,grown,'temporary cleanup never reverts XP');
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
console.log('Temporary build: whitelist, additive reduction/cap, movement composition, canonical aliases, delayed attack/shield cleanup, preserved XP/HP, expiration, death, exit and restart passed.');
