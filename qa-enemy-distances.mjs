import assert from 'node:assert/strict';
import { AbilityRuntime } from './dist/ability-runtime.js';
import { Game } from './dist/engine.js';
import { enemyDefinition } from './dist/enemy-definitions.js';
import { friendlyFoot } from './dist/friendly-combat.js';
import { BOAR_RULES, updateBoar } from './dist/enemies/boar.js';
import { SPORE_RULES, updateSpore, resolveSpore } from './dist/enemies/spore.js';
import { SPECIALIST_RULES, initializeSpecialist, updateSpecialist } from './dist/enemies/specialists.js';

function fixture(type){
  const def=enemyDefinition(type),enemy={id:1,type,x:0,y:0,groundOffset:0,r:def.r,speed:def.baseSpeed,damage:def.damage,hp:1000};
  const game={status:'playing',_clock:0,_id:1,player:{id:0,heroId:'traveler',x:150,y:0,groundOffset:0,r:16,hp:1000},enemies:[enemy],enemyBullets:[],companions:{members:[]},
    terrain:{firstBlocker:()=>null,query:()=>[]},_inView:()=>true,_branchMovementMultiplier:()=>1,
    _moveEntity(e,dx,dy){e.x+=dx;e.y+=dy;return {blocked:false};},_effect(){},_emit(){},
    _hurtPlayer(amount){game.player.hp-=amount;return true;}};
  game.abilities=new AbilityRuntime(game);
  if(def.behavior==='specialist'){initializeSpecialist(enemy);enemy.specialist.cooldown=0;}
  return {game,enemy};
}
function positionTarget({game,enemy},distance,angle=0){
  const from=friendlyFoot(enemy),offset=friendlyFoot(game.player).y-game.player.y;
  game.player.x=from.x+Math.cos(angle)*distance;game.player.y=from.y+Math.sin(angle)*distance-offset;
}
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);

// Acquisition and execution have separate distances. All directions use the
// same ground positions, including units with different body heights.
for(const [type,rule] of Object.entries(SPECIALIST_RULES))for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  for(const inside of [true,false]){
    const f=fixture(type);f.enemy.groundOffset=23;f.game.player.groundOffset=7;
    positionTarget(f,rule.range+(inside?-.01:.01),angle);
    updateSpecialist(f.game,f.enemy,0);
    assert.equal(f.enemy.specialist.phase,inside?'windup':'idle',`${type}: foot-distance acquisition ${inside?'inside':'outside'} at ${angle}`);
    if(inside&&['cast','fan'].includes(rule.mode))assert.equal(f.game.abilities.effects.length,rule.mode==='fan'?rule.count:1,`${type}: accepted real cast`);
  }
}
for(const type of ['rootbinder','stoneape']){
  const f=fixture(type),rule=SPECIALIST_RULES[type];positionTarget(f,rule.range-.01);
  f.game.player.vx=200;updateSpecialist(f.game,f.enemy,0);
  const effect=f.game.abilities.effects[0];assert(effect,`${type} executes a bounded placement`);
  assert(Math.hypot(effect.x-effect.origin.x,effect.y+effect.groundOffset-effect.origin.groundY)<=rule.abilityRange+1e-7);
  const point={x:effect.x,y:effect.y};f.game.player.x+=300;f.game.abilities.update(rule.windup-.001);
  assert.equal(f.game.player.hp,1000,`${type} retains the complete warning`);assert.deepEqual({x:effect.x,y:effect.y},point,`${type} keeps its warned landing point`);
}
for(let degrees=0;degrees<360;degrees++){
  const f=fixture('stoneape'),angle=degrees*Math.PI/180;f.enemy.groundOffset=22;f.game.player.groundOffset=7;
  positionTarget(f,249,angle);f.game.player.vx=Math.cos(angle)*300;f.game.player.vy=Math.sin(angle)*300;
  updateSpecialist(f.game,f.enemy,0);
  assert.equal(f.game.abilities.effects.length,1,`clamped prediction remains valid at ${degrees} degrees despite rounding`);
  const effect=f.game.abilities.effects[0];close(Math.hypot(effect.x-effect.origin.x,effect.y+effect.groundOffset-effect.origin.groundY),250,'predicted landing cap');
}
for(const id of ['vineTrap','stoneLob','domain','vortex']){
  const f=fixture('stoneape');f.enemy.type='boss';f.enemy.bossKind='broodmother';f.enemy.groundOffset=35;f.game.player.groundOffset=5;
  for(const angle of [Math.PI/2,-Math.PI/2]){
    f.game.abilities.clearScene();positionTarget(f,169,angle);
    assert(f.game.abilities.cast(id,f.enemy,{target:f.game.player,range:170}),`${id} accepts declared range override with foot offsets`);
    f.game.abilities.clearScene();positionTarget(f,171,angle);
    assert(!f.game.abilities.cast(id,f.enemy,{target:f.game.player,range:170}),`${id} rejects out-of-range placement`);
  }
  // Longer future profiles remain supported; the camera standard is no cap.
  positionTarget(f,600);assert(f.game.abilities.cast(id,f.enemy,{target:f.game.player,range:700}),`${id} permits an explicit long-range profile`);
}
for(const [type,expected] of [['tidepriest',290],['frostmage',280],['windhunter',300]]){
  const f=fixture(type),rule=SPECIALIST_RULES[type];positionTarget(f,rule.range-1);updateSpecialist(f.game,f.enemy,0);
  if(rule.mode==='strafe'){updateSpecialist(f.game,f.enemy,rule.windup);updateSpecialist(f.game,f.enemy,rule.duration);}
  const effects=[...f.game.abilities.effects];assert(effects.length,`${type}: real projectile released`);
  f.game.player.x=5000;
  for(let i=0;i<40&&f.game.abilities.effects.length;i++)f.game.abilities.update(.137);
  for(const effect of effects){close(effect.distance,expected,`${type} actual flight`);close(effect.parameters.speed*effect.parameters.duration,expected,`${type} lifetime and range agree`);}
  assert.equal(f.game.abilities.effects.length,0);
}
{
  const f=fixture('prismguard');positionTarget(f,249);updateSpecialist(f.game,f.enemy,0);
  assert.equal(f.game.abilities.effects[0].parameters.range,300);
  f.game.player.x=299;f.game.abilities.update(SPECIALIST_RULES.prismguard.windup-.001);assert.equal(f.game.player.hp,1000);
  f.game.abilities.update(.002);assert(f.game.player.hp<1000,'beam reaches past acquisition distance after its warning');
  const touching=fixture('prismguard');positionTarget(touching,249);updateSpecialist(touching.game,touching.enemy,0);touching.game.player.x=300+touching.game.player.r-.01;
  touching.game.abilities.update(2);assert(touching.game.player.hp<1000,'a body overlapping the rounded beam tip is hit');
  const outside=fixture('prismguard');positionTarget(outside,249);updateSpecialist(outside.game,outside.enemy,0);outside.game.player.x=300+outside.game.player.r+.01;
  outside.game.abilities.update(2);assert.equal(outside.game.player.hp,1000,'a body wholly beyond the beam endpoint is safe');
}
{
  const f=fixture('flamelizard');positionTarget(f,179);updateSpecialist(f.game,f.enemy,0);
  assert.equal(f.game.abilities.effects[0].parameters.range,190);
  f.game.player.x=191+f.game.player.r;f.game.abilities.update(2);assert.equal(f.game.player.hp,1000,'flame cannot hit beyond its length plus body radius');
}
for(const [type,range,update] of [['boar',220,updateBoar],['spore',220,updateSpore]]){
  for(const inside of [true,false]){
    const f=fixture(type);positionTarget(f,range+(inside?-.01:.01));update(f.game,f.enemy,0);
    assert.equal(!!(f.enemy.charge||f.enemy.cast),inside,`${type} acquisition boundary`);
  }
  const hidden=fixture(type);hidden.game._inView=()=>false;update(hidden.game,hidden.enemy,0);
  assert(!hidden.enemy.charge&&!hidden.enemy.cast,`${type} retains its current visibility check`);
}
for(const boost of [1,2]){
  const f=fixture('boar');positionTarget(f,220);f.game.environment={movementMultiplier:()=>boost};updateBoar(f.game,f.enemy,0);
  assert.equal(f.enemy.charge.length,220,'charge warning has the travel distance');
  updateBoar(f.game,f.enemy,BOAR_RULES.windup);f.game.player.x=5000;
  for(let i=0;i<10&&f.enemy.charge;i++)updateBoar(f.game,f.enemy,.37);
  close(f.enemy.x,220,'boar actual charge, including partial final frame');
}
{
  const f=fixture('boglurker'),rule=SPECIALIST_RULES.boglurker;positionTarget(f,210);updateSpecialist(f.game,f.enemy,0);
  updateSpecialist(f.game,f.enemy,rule.windup);f.game.player.x=5000;
  for(let i=0;i<10&&f.enemy.specialist.phase==='active';i++)updateSpecialist(f.game,f.enemy,.137);
  close(f.enemy.x,210,'locked pounce stops at its travel limit');assert.equal(f.enemy.specialist.phase,'recovery');
}
{
  const f=fixture('spore');positionTarget(f,219);updateSpore(f.game,f.enemy,0);updateSpore(f.game,f.enemy,SPORE_RULES.windup);
  resolveSpore(f.game,f.enemy,{px:f.game.player.x,py:f.game.player.y,maxEnemyBullets:60});
  const bullet=f.game.enemyBullets[0];assert(bullet);f.game.player.x=5000;
  for(let i=0;i<10&&f.game.enemyBullets.length;i++)Game.prototype._resolveEnemyAttacks.call(f.game,.37);
  close(bullet.x,280,'spore flight includes only its remaining lifetime');assert.equal(f.game.enemyBullets.length,0);
}
console.log('Enemy distances: four-direction foot boundaries, explicit placement overrides, locked warnings, bounded predictions, actual flight/rush endpoints and future long-range profiles passed.');
