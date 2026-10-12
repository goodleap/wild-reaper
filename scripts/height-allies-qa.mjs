import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { Terrain, groundOffset } from '../dist/terrain.js';
import { ANGEL_RULES } from '../dist/settlements.js';
import { resolveBloomBoss, updateBloomBoss } from '../dist/bosses.js';

const low={id:'fallen-log',type:'log',x:60,y:0,r:10,halfLength:120,angle:Math.PI/2};
const high={...low,id:'tall-barrier',structureType:'castle-wall'};
function arena(obstacles=[]){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.terrain=new Terrain({obstacles});g.enemies=[];g.effects=[];g.events=[];
  g.player.x=0;g.player.y=-groundOffset(g.player,true);g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function enemy(g,x,y=0,type='slime'){
  const e=g._spawnEnemy(type);Object.assign(e,{x,y:y-groundOffset(e),hp:10000,maxHp:10000,speed:0});return e;
}
function ally(g,kind='stormcaller'){
  const a={id:999,kind,isCompanion:true,x:0,y:-groundOffset(g.player,true),r:15,_attack:0,_echoes:[]};
  g.companions.active=a;return a;
}
function angel(g){
  const site={id:'angel:test',type:'angel',x:0,y:0,flying:true,state:'ready',_attack:0};g.settlements.sites=[site];return site;
}

for(const [obstacle,canCross] of [[low,true],[high,false]]){
  const g=arena([obstacle]),mage=ally(g),target=enemy(g,120);
  assert.equal(g.companions._castLightning(mage),canCross);
  assert.equal(target.hp<10000,canCross,'allied lightning follows the same low/high cover rule as the player');
}
const chained=arena([{...high,x:85}]),mage=ally(chained),near=enemy(chained,30),behind=enemy(chained,135);
assert(chained.companions._castLightning(mage));assert(near.hp<10000);assert.equal(behind.hp,10000,'each allied chain hop checks the new origin');
for(const obstacle of [low,high]){
  const g=arena([obstacle]),warden=ally(g,'warden'),clear=enemy(g,-90),shielded=enemy(g,120),flyer=enemy(g,-50,0,'bat');
  assert(g.companions._castQuake(warden));assert(clear.hp<10000);assert.equal(shielded.hp,10000);assert.equal(flyer.hp,10000);
  const echo=warden._echoes[0];warden.x=400;
  g.companions._quake(echo.x,echo.y,echo.r,echo.damage,true,warden.id);
  assert.equal(shielded.hp,10000,'anchored echoes do not leak across low cover');assert.equal(flyer.hp,10000);
}
const onlyFlight=arena(),groundAlly=ally(onlyFlight,'warden');enemy(onlyFlight,60,0,'bat');
assert.equal(onlyFlight.companions._castQuake(groundAlly),false,'a ground spell does not spend its cooldown on flying-only targets');

for(const skill of ['miasma','runes','swords','vortex'])for(const [obstacle,canCross] of [[low,true],[high,false]]){
  const g=arena([obstacle]),target=enemy(g,140);
  assert.equal(g.superSkills._cast(skill,1),canCross,`${skill} acquisition uses its propagation profile`);
  for(let i=0;i<35;i++){g.superSkills._updateFields(.05);g.superSkills._updateVolleys(.05);}
  assert.equal(target.hp<10000,canCross,`${skill} applies its cast only along a reachable route`);
}
const roots=arena(),groundTarget=enemy(roots,100),flyingTarget=enemy(roots,110,0,'bat');
assert(roots.superSkills._cast('thorns',1));assert(groundTarget.hp<10000);assert.equal(flyingTarget.hp,10000);assert.equal(flyingTarget.superRootUntil,undefined);
const blockedRoots=arena([low]);enemy(blockedRoots,140);assert.equal(blockedRoots.superSkills._cast('thorns',1),false);
const swordWall=arena([{...high,x:-20,r:3}]);swordWall.player.x=-100;
const swordVictim=enemy(swordWall,-110);
assert(swordWall.superSkills._cast('swords',1));
// A queued formation follows the player. Its outer blade must not materialize
// on the opposite side of a wall after the player changes position.
swordWall.player.x=0;swordWall.superSkills._updateVolleys(.2);
assert.equal(swordVictim.hp,10000,'a sword release checks the caster-to-formation path before its target path');
assert(!swordWall.effects.some(effect=>effect.type==='superSword'),'a blocked formation slot never emits a sword through the wall');
const falling=arena([{type:'rock',x:60,y:0,r:35,heightBand:'high'}]),meteorTarget=enemy(falling,140);
assert(falling.superSkills._cast('meteor',1),'falling meteors can target across outdoor natural cover');
for(let i=0;i<25;i++)falling.superSkills._updateFields(.05);
assert(meteorTarget.hp<10000);

// Use the real dungeon visibility and wall path, including its ground-origin
// conversion. An outdoor propagation exemption must not bypass this gate.
const castle=arena();assert(castle.dungeon.enter({id:'height-castle',door:{x:0,y:19.8}}));
castle.enemies=[];castle.terrain=new Terrain({obstacles:[high]});castle.dungeon.active.terrain=castle.terrain;
castle.player.x=0;castle.player.y=-groundOffset(castle.player,true);
const hiddenBoss=enemy(castle,140,0,'boss');hiddenBoss.dungeonId=castle.dungeon.active.id;hiddenBoss.guardActive=true;
assert.equal(castle.superSkills._cast('meteor',1),false,'a meteor cannot target a wall-separated castle Boss');
castle.superSkills._field('meteor',{x:0,y:0},220,.01,{stage:'warning',damage:999});
castle.superSkills._updateFields(.05);assert.equal(hiddenBoss.hp,10000,'an existing field also respects interior separation');

for(const [obstacle,heals] of [[low,true],[high,false]]){
  const g=arena([obstacle]);angel(g);g.player.x=120;g.player.hp=50;
  g.settlements._updateAngels(1,{x:120,y:0});assert.equal(g.player.hp>50,heals,'angel healing crosses low cover, while tall solids stop its aura');
}
const guardian=arena([{type:'rock',x:60,y:0,r:35,heightBand:'high'}]);angel(guardian);
const protectedThreat=enemy(guardian,120),otherScene=enemy(guardian,90);otherScene.dungeonId='another-scene';
guardian.settlements._updateAngels(.1,{x:0,y:0});
assert.equal(protectedThreat.hp,10000-ANGEL_RULES.damage,'overhead angel strikes clear outdoor natural cover');
assert.equal(otherScene.hp,10000,'overworld guardians never strike a castle occupant');

for(const flying of [false,true]){
  const g=arena(),boss=enemy(g,200,0,'boss');g.player.flying=flying;
  Object.assign(boss,{bossKind:'bloom',bloomAttack:{kind:'burst',life:0,circles:[{x:0,y:0,r:52}]}});
  assert(resolveBloomBoss(g,boss));assert.equal(g.player.hp<g.player.maxHp,!flying,'ground eruptions affect grounded bodies only');
}
const safe=arena([low]),bloom=enemy(safe,200,0,'boss');safe.player.x=100;
Object.assign(bloom,{bossKind:'bloom',bloomAttack:{kind:'burst',life:0,circles:[{x:20,y:0,r:100}]}});
resolveBloomBoss(safe,bloom);assert.equal(safe.player.hp,safe.player.maxHp,'low cover also blocks an enemy ground eruption');
const isolated=arena([{...low,halfLength:500}]),caster=enemy(isolated,-120,0,'boss');isolated.player.x=120;
Object.assign(caster,{bossKind:'bloom',bloomCooldown:0,bloomNext:'burst'});
updateBloomBoss(isolated,caster,0);
assert.equal(caster.bloomAttack.kind,'fan','blocked ground eruptions fall back to a fully warned ranged fan across low cover');
assert.equal(isolated.effects.some(effect=>effect.type==='bloomBurst'),false);
caster.bloomAttack.life=0;resolveBloomBoss(isolated,caster);
assert(isolated.enemyBullets.length>0);assert.equal(isolated.player.hp,isolated.player.maxHp,'the fallback releases real projectiles rather than an unwarned eruption');
for(const next of ['burst','fan']){
  const g=arena([{...high,halfLength:500}]),boss=enemy(g,-120,0,'boss');g.player.x=120;
  Object.assign(boss,{bossKind:'bloom',bloomCooldown:0,bloomNext:next,speed:42});
  const start={x:boss.x,y:boss.y};updateBloomBoss(g,boss,.05);
  assert(!boss.bloomAttack,'tall cover does not create an unreachable attack warning');
  assert(!g.events.some(event=>event.type==='bloomWindup'));
  assert(Math.hypot(boss.x-start.x,boss.y-start.y)>0,'the Boss seeks an open route instead of holding its preferred firing distance');
}

console.log('Allied height: chain hops, ground-only quake/echoes, super propagation, dungeon meteor isolation, guardian aura/sky strikes and grounded Boss eruptions passed.');
