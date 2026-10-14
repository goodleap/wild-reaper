import assert from 'node:assert/strict';
import { Game, BALANCE } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { ENEMY_DEFS, ENEMY_IDS, ENEMY_CODEX_IDS, enemyDefinition } from './dist/enemy-definitions.js';
import { ENEMY_BEHAVIORS, enemyBehavior } from './dist/enemy-behaviors.js';
import { BOSS_DEFS, BOSS_ROTATION, bossDefinition, bossKindFor } from './dist/boss-definitions.js';
import { BOSS_BEHAVIORS, bossBehavior, initBoss } from './dist/bosses.js';
import { SPECIAL_ENEMY_CAPS } from './dist/encounter-definitions.js';
import { enemyVisual, enemyArtId } from './dist/enemy-visuals.js';
import { ENEMY_ART } from './dist/enemy-art/registry.js';

// Validate the data/behavior registration boundary before content is spawned.
for(const id of ENEMY_IDS){
  const def=enemyDefinition(id);
  assert.equal(def.id,id);assert(Object.isFrozen(def));
  for(const key of ['r','baseHp','baseSpeed','damage'])assert(def[key]>0,`${id}.${key}`);
  assert(def.xp>=0,`${id}.xp`);
  assert(['ground','air'].includes(def.movement));
  assert.equal(enemyBehavior(id),ENEMY_BEHAVIORS[def.behavior]);
  const entity={type:id};
  assert(enemyVisual(entity)&&ENEMY_ART[enemyArtId(entity)],`${id}: registered enemy must have body metadata and artwork`);
}
for(const id of ENEMY_CODEX_IDS)assert(ENEMY_DEFS[id].codex?.name);
for(const id of BOSS_ROTATION){
  assert.equal(bossBehavior(id),BOSS_BEHAVIORS[bossDefinition(id).behavior]);
  assert(Object.isFrozen(BOSS_DEFS[id]));
  const entity={type:'boss',bossKind:id};
  assert(enemyVisual(entity)&&ENEMY_ART[enemyArtId(entity)],`${id}: registered Boss must have body metadata and artwork`);
}
assert.throws(()=>enemyDefinition('missing-enemy'),RangeError);
assert.throws(()=>enemyBehavior('missing-enemy'),RangeError);
assert.throws(()=>bossDefinition('missing-boss'),RangeError);
assert.throws(()=>bossBehavior('missing-boss'),RangeError);
assert.equal(BALANCE.boarCap,SPECIAL_ENEMY_CAPS.boar);
assert.equal(BALANCE.sporeCap,SPECIAL_ENEMY_CAPS.spore);
assert.deepEqual([1,2,3,4].map(bossKindFor),['ancient','bloom','ancient','bloom']);

let seed=197283;
const random=Math.random;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
try{
  const g=new Game({adventure:false,terrain:new Terrain({obstacles:[]})});
  g.enemies=[];g.events=[];g._spawn=Infinity;g.nextBossAt=Infinity;
  g.crystalsNext=Infinity;g.player.xpNext=Infinity;
  g.build.setEquipped('sword',false);g._refreshWeapons();
  g.player.baseMaxHp=10000;g.player.hp=10000;
  let bossCount=0;
  for(const [type,x,y] of [['slime',220,30],['beetle',210,-110],['bat',320,-100],['brute',360,140],['boar',-180,0],['spore',0,-260],['boss',-90,-85],['boss',-260,110]]){
    if(type==='boss')g.bossCount=++bossCount;
    const enemy=g._spawnEnemy(type,1);
    Object.assign(enemy,{x,y:y+groundOffset(g.player,true)-groundOffset(enemy),hp:10000,maxHp:10000,chargeCooldown:0,castCooldown:0});
    if(enemy.bossKind==='bloom')enemy.bloomCooldown=0;
  }
  const observed={};
  for(let frame=0;frame<260;frame++){
    g.update(.025);
    for(const event of g.events)observed[event.type]=(observed[event.type]||0)+1;
    g.events=[];
  }
  // A single mixed encounter exercises registry dispatch, shared damage grace,
  // both Boss resolution phases, and normal projectile movement together.
  assert.deepEqual(observed,{boarWindup:1,sporeWindup:2,bossWindup:1,bloomWindup:2,sporeShot:2,bossSlam:1,hurt:7,bloomShot:1,bloomBurst:1});
  assert(g.enemies.every(enemy=>Number.isFinite(enemy.x)&&Number.isFinite(enemy.y)));
  const ordinary={type:'slime',marker:1};assert.equal(initBoss(ordinary),ordinary);
  assert.deepEqual(ordinary,{type:'slime',marker:1});
  assert.throws(()=>g._spawnEnemy('missing-enemy',1),RangeError);
}finally{Math.random=random;}
console.log('Enemy modules: registered definitions, explicit unknown IDs, preserved Boss selection and mixed-encounter attack order passed.');
