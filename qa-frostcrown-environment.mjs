import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { Environment, ENVIRONMENT_BALANCE } from './dist/environment.js';
import { initBoss } from './dist/bosses.js';
import { getConfigSection } from './dist/content-config.js';
import { frostcrownGroundContact } from './dist/enemy-body-geometry.js';

const mushroomRules=getConfigSection('geography').environmentRules.mushroom;
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} / ${b}`);
function arena(deer=true,obstacles=[]){
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.player.x=g.player.y=-1000;g.environment=new Environment(g,{generation:false});
  const e=g._spawnEnemy(deer?'boss':'slime');if(deer)initBoss(e,'frostcrown');
  Object.assign(e,{x:0,y:0,r:49,groundOffset:40,hp:10000,maxHp:10000,defense:0,visualFacing:0,walkPhase:0,moving:false,guardActive:true,specialCooldown:Infinity});
  return {g,e,env:g.environment};
}
function mushroom(x,y=36){return {id:'frostcrown-environment-fixture',type:'mushroom',x,y,r:17,state:'idle'};}
const radius=ENVIRONMENT_BALANCE.blastRadius;

// Invoke the real explosion: the old circle's empty outer strip must not
// receive damage, while an overlapping footprint keeps the configured hit.
for(const deer of [true,false])for(const [x,footHit] of [[radius+43,false],[radius+28,true]]){
  const {g,e,env}=arena(deer),prop=mushroom(x),before=e.hp;
  if(deer)assert.equal(!!frostcrownGroundContact(e,prop.x,prop.y,radius),footHit);
  env._arm(prop,'sword');assert.equal(prop.blastRadius,radius);
  env._explode(prop);
  const damage=mushroomRules.enemyDamage*(1+Math.min(Math.max(g.time,0),mushroomRules.growthTimeCap)/mushroomRules.growthTimePeriod);
  close(before-e.hp,deer&&!footHit?0:damage,'real explosion uses the deer footprint and unchanged ordinary circle/damage');
  assert.equal(prop.state,'spent');assert.equal(g.events.filter(event=>event.type==='mushroomBlast').length,1);
}

// Real contact uses the same ground plane; the ordinary r49 control retains
// its original trigger. A trigger is still one full fuse, never instant damage.
for(const deer of [true,false])for(const [x,footHit] of [[60,false],[48,true]]){
  const {g,e,env}=arena(deer),prop=mushroom(x),before=e.hp;env.props=[prop];
  if(deer)assert.equal(!!frostcrownGroundContact(e,prop.x,prop.y,prop.r),footHit);
  env._contactMushrooms(.025);
  assert.equal(prop.state,deer&&!footHit?'idle':'armed');close(e.hp,before,'contact itself deals no damage');
  if(prop.state==='armed'){
    assert.equal(prop.source,'contact');assert.equal(prop.fuse,ENVIRONMENT_BALANCE.mushroomFuse);
    env._contactMushrooms(.025);env.hitAt(prop.x,prop.y,prop.r,'arrow');
    assert.equal(g.events.filter(event=>event.type==='mushroomArmed').length,1,'contact and weapon hits share the existing fuse');
    assert.equal(prop.fuse,ENVIRONMENT_BALANCE.mushroomFuse);
  }
}

// An ordinary short resolved movement can graze the footprint between two
// non-contact endpoints; a debug teleport across the same prop leaves no trail.
for(const teleport of [false,true]){
  const {e,env}=arena(),prop=mushroom(0,62);env.props=[prop];
  e.x=teleport?-400:-45;assert(!frostcrownGroundContact(e,prop.x,prop.y,prop.r));env._contactMushrooms(.05);
  assert.equal(prop.state,'idle');e.x=teleport?400:45;assert(!frostcrownGroundContact(e,prop.x,prop.y,prop.r));env._contactMushrooms(.05);
  assert.equal(prop.state,teleport?'idle':'armed','swept footprint preserves real crossings and teleport suppression');
}

// Shared contact geometry must not bypass either existing terrain gate.
const wall={id:'frostcrown-mushroom-wall',type:'log',heightBand:'high',x:30,y:36,r:3,halfLength:100,angle:Math.PI/2};
{
  const {e,env}=arena(true,[wall]),prop=mushroom(48);env.props=[prop];
  assert(frostcrownGroundContact(e,prop.x,prop.y,prop.r));env._contactMushrooms(.025);assert.equal(prop.state,'idle');
}
{
  const {e,env}=arena(true,[wall]),before=e.hp,prop=mushroom(radius+28);
  assert(frostcrownGroundContact(e,prop.x,prop.y,radius));env._arm(prop,'sword');env._explode(prop);close(e.hp,before,'wall still blocks the real explosion');
}
console.log('Frostcrown environment: real mushroom footprint triggers/explosions, configured fuse/range/damage, swept grazes, teleport/wall rejection and unchanged ordinary-enemy controls passed.');
