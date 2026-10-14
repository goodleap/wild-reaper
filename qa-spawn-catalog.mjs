import assert from 'node:assert/strict';
import { ENEMY_DEFS } from './dist/enemy-definitions.js';
import { REGIONS,regionEnemyType } from './dist/regions.js';
import { ENCOUNTER_SEQUENCES,WAVE_PATTERNS,HUT_GUARD_PACKS,CASTLE_GUARD_PACKS,
  validateSpawnCatalog,sequenceEnemyType,waveEnemyType,arenaGuardType,rescueGuardType,
  castleRoomTypes,cappedEncounterType,hutGuardType,treasureGuardianType } from './dist/encounter-definitions.js';

assert.equal(validateSpawnCatalog(REGIONS),true);
assert.throws(()=>validateSpawnCatalog([{id:'invalid',enemyWeights:{missingEnemy:1}}]),RangeError);
assert.throws(()=>validateSpawnCatalog([{id:'invalid',enemyWeights:{slime:-1}}]),TypeError);
const validWeights={...REGIONS[0].enemyWeights};
for(const type of Object.keys(validWeights)) {
  const missing={...validWeights};delete missing[type];
  assert.throws(()=>validateSpawnCatalog([{id:'missing',enemyWeights:missing}]),/Missing enemy weight/);
  for(const invalid of [-1,NaN,Infinity,undefined,'1'])assert.throws(()=>validateSpawnCatalog([{id:'invalid',enemyWeights:{...validWeights,[type]:invalid}}]),/Invalid enemy weight/);
}
const zeroWeights=Object.fromEntries(Object.keys(validWeights).map(type=>[type,0]));
assert.throws(()=>validateSpawnCatalog([{id:'empty',enemyWeights:zeroWeights}]),/weight total/);
assert.throws(()=>validateSpawnCatalog([{id:'empty',enemyWeights:{...zeroWeights,boss:1}}]),/weight total/);
assert.throws(()=>validateSpawnCatalog([{id:'missing'}]),/Missing enemy weights/);
for(const table of [ENCOUNTER_SEQUENCES,WAVE_PATTERNS,HUT_GUARD_PACKS,CASTLE_GUARD_PACKS])assert(Object.isFrozen(table));

// Catalog selection is deterministic: it must not move any caller's RNG stream.
const originalRandom=Math.random;Math.random=()=>{throw new Error('spawn catalog consumed random state');};
try {
  for(const region of REGIONS)for(const time of [0,12,23,30,45,60,61,150,1200])for(let i=0;i<=100;i++)assert(ENEMY_DEFS[regionEnemyType({region,time,enemies:[]},i/100)]);
  for(const definition of Object.values(ENCOUNTER_SEQUENCES))for(let i=0;i<25;i++)assert(ENEMY_DEFS[sequenceEnemyType(definition,i)]);
  assert.deepEqual(Array.from({length:10},(_,i)=>waveEnemyType(0,i,59)),['beetle','slime','slime','beetle','slime','slime','beetle','slime','slime','beetle']);
  assert.equal(waveEnemyType(0,4,60),'brute');
  assert.deepEqual(Array.from({length:5},(_,i)=>waveEnemyType(2,i,45)),['boar','beetle','slime','slime','spore']);
  assert.deepEqual(Array.from({length:9},(_,i)=>arenaGuardType(i)),['brute','slime','slime','beetle','slime','slime','beetle','slime','brute']);
  assert.equal(rescueGuardType(0),'beetle');assert.equal(rescueGuardType(0,true),'brute');
  assert.deepEqual(castleRoomTypes(4,true),['beetle','slime','beetle','bat']);
  assert.deepEqual(castleRoomTypes(5,true),['beetle','slime','beetle','boar']);
  assert.equal(cappedEncounterType('boar',{boar:5},'castle'),'bat');
  assert.equal(cappedEncounterType('spore',{spore:4},'wave'),'beetle');
  assert.equal(cappedEncounterType('boar',{boar:4},'castle'),'boar');
  for(const feature of ['shipwreck','mine'])assert.deepEqual(HUT_GUARD_PACKS[feature].map((_,i)=>hutGuardType(i,feature)),HUT_GUARD_PACKS[feature]);
  assert.equal(hutGuardType(0),'brute');assert.equal(hutGuardType(8),'beetle');
  const boars=Array.from({length:5},()=>({type:'boar',hp:1}));
  assert.equal(treasureGuardianType(2,boars),'brute');boars[0].hp=0;
  assert.equal(treasureGuardianType(2,boars),'boar');assert.equal(treasureGuardianType(3,boars),'brute');
} finally {Math.random=originalRandom;}
console.log('Spawn catalog: registered types, immutable formations, timing, caps and RNG isolation passed.');
