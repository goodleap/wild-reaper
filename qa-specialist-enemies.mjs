import assert from 'node:assert/strict';
import { getConfigSection } from './dist/content-config.js';
import { enemyDefinition } from './dist/enemy-definitions.js';
import { ordinaryEnemyType, SPECIAL_ENEMY_CAPS, SPECIALIST_SPAWN_RULES } from './dist/encounter-definitions.js';
import { initializeSpecialist, updateSpecialist, resolveSpecialist, specialistDamageMultiplier, SPECIALIST_RULES } from './dist/enemies/specialists.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { friendlyFoot } from './dist/friendly-combat.js';

const worlds=getConfigSection('worlds').definitions;
for(const world of worlds){
  const game={time:120,region:world,enemies:[]};
  const seen=new Set();let specialists=0;
  for(let i=0;i<1000;i++){
    const type=ordinaryEnemyType(game,(i+.5)/1000);seen.add(type);
    if(enemyDefinition(type).behavior==='specialist'){
      specialists++;assert(world.enemyWeights[type]>0,`${world.id} rejects off-theme ${type}`);
    }
  }
  assert(specialists>0&&specialists<=SPECIALIST_SPAWN_RULES.maxChance*1000+1,world.id);
  for(const entry of SPECIALIST_SPAWN_RULES.entries)if(world.enemyWeights[entry.type]>0)assert(seen.has(entry.type),`${world.id}/${entry.type} can actually spawn`);
  game.time=0;
  for(let i=0;i<100;i++)assert.notEqual(enemyDefinition(ordinaryEnemyType(game,(i+.5)/100)).behavior,'specialist','opening grace');
  game.time=120;
  game.enemies=SPECIALIST_SPAWN_RULES.entries.flatMap(entry=>Array.from({length:SPECIAL_ENEMY_CAPS[entry.type]},()=>({type:entry.type,hp:1})));
  for(let i=0;i<100;i++)assert.notEqual(enemyDefinition(ordinaryEnemyType(game,(i+.5)/100)).behavior,'specialist','global cap');
  for(const type of Object.keys(SPECIALIST_RULES)){
    game.enemies=Array.from({length:SPECIAL_ENEMY_CAPS[type]},()=>({type,hp:1}));
    for(let i=0;i<100;i++)assert.notEqual(ordinaryEnemyType(game,(i+.5)/100),type,'per-type cap');
  }
}
function fixture(type){
  const def=enemyDefinition(type),enemy={id:1,type,x:0,y:0,r:def.r,speed:def.baseSpeed,damage:def.damage,hp:100};
  const casts=[],hits=[];
  const game={status:'playing',_clock:0,player:{id:0,x:180,y:0,r:16,hp:100,heroId:'traveler'},enemies:[enemy],terrain:{firstBlocker:()=>null},
    _inView:()=>true,_moveEntity(e,dx,dy){e.x+=dx;e.y+=dy;return {blocked:false};},_branchMovementMultiplier:()=>1,
    abilities:{cast(id,caster,options){casts.push({id,caster,options});return true;}},_hurtPlayer(amount){hits.push(amount);return true;}};
  game.player.y+=friendlyFoot(enemy).y-friendlyFoot(game.player).y;
  initializeSpecialist(enemy);enemy.specialist.cooldown=0;
  return {game,enemy,casts,hits};
}
for(const [type,rule]of Object.entries(SPECIALIST_RULES)){
  const {game,enemy,casts}=fixture(type);
  assert(updateSpecialist(game,enemy,.01));assert.equal(enemy.specialist.phase,'windup');assert.equal(enemy.x,0,'no teleport at activation');
  assert.equal(enemy.specialist.noContact,true,'windup never applies surprise body damage');
  if(['cast','fan'].includes(rule.mode)){
    assert.equal(casts.length,rule.mode==='fan'?rule.count:1);
    assert(casts.every(c=>c.id===rule.abilityId&&c.options.windup>0&&c.options.damage===enemy.damage*rule.damageMultiplier));
    const points=casts.map(c=>({...c.options.point}));game.player.x=500;
    assert.deepEqual(casts.map(c=>c.options.point),points,'telegraph points are value snapshots');
    if(rule.mode==='fan')assert.equal(new Set(casts.map(c=>c.options.angle)).size,rule.count,'fan has real gaps');
  }
  const hidden=fixture(type);hidden.game._inView=()=>false;updateSpecialist(hidden.game,hidden.enemy,.1);
  assert.equal(hidden.casts.length,0);assert.equal(hidden.enemy.specialist.phase,'idle');
  const covered=fixture(type);covered.game.terrain.firstBlocker=()=>({id:'wall'});updateSpecialist(covered.game,covered.enemy,.1);
  assert.equal(covered.casts.length,0);assert.equal(covered.enemy.specialist.phase,'idle');
}
{
  const {game,enemy,hits}=fixture('boglurker'),rule=SPECIALIST_RULES.boglurker;
  updateSpecialist(game,enemy,.01);const lockedX=enemy.specialist.aimX;
  game.player.x=500;updateSpecialist(game,enemy,rule.windup);
  updateSpecialist(game,enemy,.1);assert(enemy.x>0&&enemy.x<lockedX);assert.equal(enemy.specialist.aimX,lockedX);
  resolveSpecialist(game,enemy,{targets:[game.player]});assert.equal(hits.length,0,'moving off the locked path avoids rush');
  for(let i=0;i<10;i++)updateSpecialist(game,enemy,.1);
  assert.equal(enemy.specialist.phase,'recovery');assert(enemy.x<=lockedX+1,'rush does not chase new target position');
  assert(enemy.specialist.noContact,'missed pounce leaves a counterattack window');
}
{
  const {game,enemy}=fixture('shieldguard'),rule=SPECIALIST_RULES.shieldguard;
  updateSpecialist(game,enemy,.01);updateSpecialist(game,enemy,rule.windup);
  assert.equal(specialistDamageMultiplier(enemy,{x:100,y:0},'sword'),rule.frontDamageMultiplier);
  assert.equal(specialistDamageMultiplier(enemy,{x:-100,y:0},'sword'),1);
  assert.equal(specialistDamageMultiplier(enemy,{x:100,y:0},'burn'),1);
  updateSpecialist(game,enemy,rule.duration);
  assert.equal(enemy.specialist.phase,'recovery');assert.equal(specialistDamageMultiplier(enemy,{x:100,y:0},'sword'),1);
}
for(const[type,rule]of Object.entries(SPECIALIST_RULES)){
  const g=new Game({adventure:false,terrain:new Terrain({obstacles:[]})});
  g.enemies=[];g._spawn=Infinity;g.nextBossAt=Infinity;g.crystalsNext=Infinity;g.player.xpNext=Infinity;
  g.build.setEquipped('sword',false);g._refreshWeapons();g.player.baseMaxHp=10000;g.player.hp=10000;
  const e=g._spawnEnemy(type,1);Object.assign(e,{x:170,y:0,hp:10000,maxHp:10000});e.specialist.cooldown=0;
  const accepted=[],cast=g.abilities.cast.bind(g.abilities);
  g.abilities.cast=(id,caster,options)=>{const ok=cast(id,caster,options);if(ok)accepted.push(id);return ok;};
  for(let frame=0;frame<240;frame++)g.update(.025);
  assert(Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(g.player.hp),type+' finite runtime');
  if(rule.abilityId)assert(accepted.includes(rule.abilityId),type+' is authorized and executes its configured ability');
}
console.log('Specialist enemies: eight themed pools, opening grace, global/type caps, telegraphs, cover, locked pounce, fan gaps and directional shield passed.');
