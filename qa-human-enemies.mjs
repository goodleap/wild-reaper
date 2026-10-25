import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEnemies } from './dist/config-validation/enemies.js';
import { HUMAN_RULES, initializeHuman, initializeHumanBoss, clearHumanBoss, updateHuman, resolveHuman, humanGuardMultiplier } from './dist/enemies/royal.js';
import { enemyDefinition } from './dist/enemy-definitions.js';
import { bossDefinition } from './dist/boss-definitions.js';
import { ENEMY_ART } from './dist/enemy-art/registry.js';
import { enemyVisual } from './dist/enemy-visuals.js';
import { humanAttackCapsules } from './dist/royal-attack-geometry.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

const humans=['royalguard','royallancer','royalarbalist','royalmage'],bosses=['searchcaptain','escortmarshal'];
function fixture(id,distance=70){
  const boss=bosses.includes(id),def=boss?bossDefinition(id):enemyDefinition(id);
  const e={id:1,type:boss?'boss':id,bossKind:boss?id:undefined,x:0,y:-20,groundY:0,r:boss?49:def.r,hp:100,maxHp:100,damage:10,guardActive:true};
  const hits=[],casts=[],g={status:'playing',_id:1,_clock:0,player:{heroId:'traveler',x:distance,y:-20,groundY:0,hp:100,r:14},enemyBullets:[],terrain:{firstBlocker:()=>null},
    _inView:()=>true,_hurtPlayer:(amount)=>{hits.push(amount);return true;},_emit:()=>{},_effect:()=>{},abilities:{cast:(...args)=>{casts.push(args);return true;}}};
  if(boss)initializeHumanBoss(e);else initializeHuman(e);e.humanCooldown=0;
  return {e,g,hits,casts,r:boss?def.parameters:HUMAN_RULES[id],state:()=>boss?e.specialAttack:e.specialist};
}
for(const id of [...humans,...bosses]){
  const {e,g,hits,casts,r,state}=fixture(id);
  assert(ENEMY_ART[id]&&enemyVisual(e),`${id} registered rendering`);
  assert.equal(e.specialist.noContact,true,`${id} never deals an unannounced contact hit`);
  assert.equal(updateHuman(g,e,.01),true);const attack=state();assert.equal(attack.phase,'windup');
  assert.equal(hits.length,0);resolveHuman(g,e);assert.equal(hits.length,0,'cannot resolve before windup');
  const locked={x:attack.x,y:attack.y,angle:attack.angle};g.player.y+=50;g.player.groundY=50;updateHuman(g,e,.1);
  assert.deepEqual({x:attack.x,y:attack.y,angle:attack.angle},locked,'warning cannot track a dodging target');
  g.player.y=-20;g.player.groundY=0;updateHuman(g,e,r.windup);resolveHuman(g,e);
  if(id==='royalarbalist'){assert.equal(g.enemyBullets.length,1);assert.equal(g.enemyBullets[0].type,'royalBolt');}
  else if(id==='royalmage'){assert.equal(casts.length,1);assert.equal(casts[0][0],'fireball');}
  else assert.equal(hits.length,1,`${id} resolves one warned hit`);
  const before=hits.length;resolveHuman(g,e);assert.equal(hits.length,before,'same attack cannot resolve twice');
  assert(e.specialRecovery>0||e.specialist.phase==='recovery');
  if(bosses.includes(id))assert.equal(e.r,defRadius(id));
}
function defRadius(id){return bossDefinition(id).r;}
for(const id of [...humans,...bosses]){
  const f=fixture(id);f.g.terrain.firstBlocker=()=>({id:'wall'});assert.equal(updateHuman(f.g,f.e,.01),false,`${id} cannot begin through a wall`);
  f.g.terrain.firstBlocker=()=>null;f.g._inView=()=>false;assert.equal(updateHuman(f.g,f.e,.01),false,`${id} cannot begin off screen`);
  f.g._inView=()=>true;updateHuman(f.g,f.e,.01);const life=f.state().life;
  f.g.status='paused';updateHuman(f.g,f.e,1);resolveHuman(f.g,f.e);assert.equal(f.state().life,life);assert.equal(f.hits.length,0);
  f.g.status='playing';f.e.hp=0;updateHuman(f.g,f.e,2);resolveHuman(f.g,f.e);assert.equal(f.hits.length,0,'dead attackers cannot damage');
}
for(const id of ['royalguard','royallancer',...bosses]){
  const f=fixture(id);updateHuman(f.g,f.e,.01);f.g.terrain.firstBlocker=()=>({id:'new cover'});updateHuman(f.g,f.e,2);resolveHuman(f.g,f.e);assert.equal(f.hits.length,0,'cover also blocks the release');
}
for(const id of bosses){
  const f=fixture(id);updateHuman(f.g,f.e,.01);const first=f.state().kind;
  updateHuman(f.g,f.e,2);resolveHuman(f.g,f.e);updateHuman(f.g,f.e,5);updateHuman(f.g,f.e,.01);
  assert.notEqual(f.state().kind,first,`${id} alternates two readable patterns`);
  clearHumanBoss(f.e);assert.equal(f.e.specialAttack,null);assert.equal(f.e.specialRecovery,0);assert(f.e.specialist.noContact);
  f.e.specialist=null;f.e.humanCooldown=2;updateHuman(f.g,f.e,.01);assert(f.e.specialist.noContact,'awakening restores contact exclusion');
}
{
  const captain=fixture('searchcaptain',150);assert.equal(updateHuman(captain.g,captain.e,.01),false,'captain approaches until its next sweep can reach');
  captain.e.humanSequence=1;assert.equal(updateHuman(captain.g,captain.e,.01),true,'the longer thrust can engage at the same distance');
  const marshal=fixture('escortmarshal',180);marshal.e.humanSequence=1;assert.equal(updateHuman(marshal.g,marshal.e,.01),false,'marshal cannot waste a short sweep at volley distance');
}
const guard=fixture('royalguard').e;guard.visualFacing=0;
assert(humanGuardMultiplier(guard,{x:100,y:guard.y},'sword')<1);
assert.equal(humanGuardMultiplier(guard,{x:-100,y:guard.y},'sword'),1);
assert.equal(humanGuardMultiplier(guard,{x:100,y:guard.y},'storm'),1);
guard.specialist.phase='windup';assert.equal(humanGuardMultiplier(guard,{x:100,y:guard.y},'sword'),1);
const volley={kind:'royalVolley',x:0,y:0,angle:0,reach:235,width:13};assert.equal(humanAttackCapsules(volley).length,3);

// The shared engine must respect no-contact during a boss's idle cooldown;
// exercising only its bespoke resolver would miss that implicit damage path.
for(const id of bosses){
  const g=new Game({adventure:false,terrain:new Terrain({obstacles:[]})});g.enemies=[];g._spawn=Infinity;g.nextBossAt=Infinity;g.build.setEquipped('sword',false);g._refreshWeapons();
  const e=g._spawnEnemy('boss',1);e.bossKind=id;initializeHumanBoss(e);Object.assign(e,{x:g.player.x,y:g.player.y,guardActive:true,humanCooldown:10});
  g.player.invuln=0;const hp=g.player.hp;g.update(.016);assert.equal(g.player.hp,hp,`${id} idle collision cannot steal a hit`);
}
const sections=Object.fromEntries(['enemies','encounters','difficulty','worlds'].map(id=>[id,JSON.parse(readFileSync(new URL(`./dist/config/${id}.json`,import.meta.url)))]));
validateEnemies(sections);delete sections.enemies.humanRules.royalguard;assert.throws(()=>validateEnemies(sections),/humanRules.royalguard/,'human definitions cannot publish without combat rules');
console.log('Human enemies: 4 troops / 2 bosses, locked warnings, shared hit geometry, cover, cooldowns, non-contact idle, guard exposure, boss cadence and config contracts passed.');
