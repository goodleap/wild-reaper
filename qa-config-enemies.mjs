import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateEnemies} from './dist/config-validation/enemies.js';
import {getConfigSection} from './dist/content-config.js';
import {ENEMY_DEFS,ENEMY_CODEX_IDS} from './dist/enemy-definitions.js';
import {BOSS_DEFS,BOSS_ROTATION} from './dist/boss-definitions.js';
import {BOAR_RULES} from './dist/enemies/boar.js';
import {SPORE_RULES} from './dist/enemies/spore.js';
import {ELITE_RULES,ELITE_AFFIXES} from './dist/elites.js';
import {SPECIAL_ENEMY_CAPS,ENCOUNTER_CAPS,ORDINARY_SPAWN_RULES,ENCOUNTER_SEQUENCES,sequenceEnemyType,ordinaryEnemyType} from './dist/encounter-definitions.js';
import {WAVE_RULES} from './dist/wave-director.js';
import {ARENA_ACTIVATION_RULES} from './dist/encounters.js';
import {OBJECTIVE_RULES} from './dist/event-scheduling.js';

const sections=Object.fromEntries(await Promise.all(['enemies','encounters','difficulty'].map(async id=>[id,JSON.parse(await readFile(new URL(`./dist/config/${id}.json`,import.meta.url),'utf8'))])));
assert.equal(validateEnemies(sections),true);
const invalid=(mutate,pattern)=>{const data=structuredClone(sections);mutate(data);assert.throws(()=>validateEnemies(data),pattern);};
invalid(c=>c.enemies.definitions.slime.behavior='remoteScript',/unknown reference/);
invalid(c=>c.enemies.definitions.slime.visual='unknownArt',/unknown reference/);
invalid(c=>c.enemies.definitions.slime.baseHp=-1,/finite number/);
invalid(c=>c.enemies.bosses.ancient.parameters.cooldown=0,/finite number/);
invalid(c=>c.enemies.bossRotation.push('missingBoss'),/unknown reference/);
invalid(c=>c.enemies.bosses.bloom.parameters.fanCount=4,/odd/);
invalid(c=>c.enemies.elite.rules.chance=1.1,/finite number/);
invalid(c=>c.encounters.sequences.arena.rules[0].every=0,/finite number/);
invalid(c=>c.encounters.sequences.arena.rules[0].remainder=8,/finite number/);
invalid(c=>c.encounters.sequences.arena.rules[0].type='missing',/unknown reference/);
invalid(c=>c.encounters.caps.wave.limits.push('missing'),/unknown reference/);
invalid(c=>delete c.encounters.ordinarySpawnRules.specials[1].rollThrough,/finite number|required/);
invalid(c=>c.encounters.ordinarySpawnRules.specials[1].rollThrough=Infinity,/finite number/);
invalid(c=>c.encounters.waveRules.batchInterval=0,/finite number/);
invalid(c=>c.encounters.eventRules.rewards.relicHunt.gold=-1,/finite number/);
invalid(c=>c.difficulty.enemyGrowth.minute=0,/finite number/);
invalid(c=>c.difficulty.explorationSpawn.initialType='missing',/unknown reference/);
const config=getConfigSection('enemies'),encounters=getConfigSection('encounters');
assert.strictEqual(ENEMY_DEFS,config.definitions);assert.strictEqual(ENEMY_CODEX_IDS,config.codexIds);
assert.strictEqual(BOSS_ROTATION,config.bossRotation);assert.strictEqual(BOAR_RULES,config.behaviorRules.boar);assert.strictEqual(SPORE_RULES,config.behaviorRules.spore);
assert.strictEqual(ELITE_RULES,config.elite.rules);assert.strictEqual(ELITE_AFFIXES,config.elite.affixes);assert.strictEqual(ARENA_ACTIVATION_RULES,encounters.arenaRules);assert.strictEqual(OBJECTIVE_RULES,encounters.objectiveRules);
for(const [id,boss] of Object.entries(BOSS_DEFS)){assert.equal(boss.parameters.name,config.bosses[id].name);assert(Object.isFrozen(boss.parameters));}
assert.throws(()=>{ENEMY_DEFS.slime.baseHp=1;},TypeError);assert.throws(()=>{ORDINARY_SPAWN_RULES.specials[0].cap=999;},TypeError);
for(const [id,cap] of Object.entries(SPECIAL_ENEMY_CAPS)){
  for(const profile of Object.values(ENCOUNTER_CAPS))if(Object.hasOwn(profile.limits,id))assert.equal(profile.limits[id],cap);
  for(const special of ORDINARY_SPAWN_RULES.specials)if(special.type===id)assert.equal(special.cap,cap);
  if(Object.hasOwn(WAVE_RULES,`${id}Cap`))assert.equal(WAVE_RULES[`${id}Cap`],cap);
}
assert.equal(ORDINARY_SPAWN_RULES.specials.find(r=>r.rollThrough===Infinity).type,'spore');
// Authored rules never consume randomness, and nullable upper bounds retain the
// original exact-roll behavior even at 1. Enemy caps include only living units.
const originalRandom=Math.random;Math.random=()=>{throw new Error('configuration changed RNG ordering');};
try{
 const game={time:60,region:{id:'forest'},enemies:[]};
 assert.equal(ordinaryEnemyType(game,1),'spore');
 game.enemies=Array.from({length:SPECIAL_ENEMY_CAPS.spore},()=>({type:'spore',hp:1}));
 assert.notEqual(ordinaryEnemyType(game,1),'spore');game.enemies[0].hp=0;assert.equal(ordinaryEnemyType(game,1),'spore');
 for(const sequence of Object.values(ENCOUNTER_SEQUENCES))for(let i=0;i<30;i++)assert(ENEMY_DEFS[sequenceEnemyType(sequence,i)]);
}finally{Math.random=originalRandom;}
console.log('Enemy config: data adapters, immutable values, caps, nullable bounds, RNG ordering, and invalid-reference rejection passed.');
